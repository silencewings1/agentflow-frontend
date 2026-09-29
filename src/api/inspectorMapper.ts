import type { TaskDetailDto, TaskPatchDto, TrajectoryEventDto } from "./types";
import { parseUnifiedDiff } from "./diffParser";
import type { DiffLine, FileNode } from "../data/mock";
import type { EvidenceItem, ReplayStep } from "../data/settings";
import type { InspectorBundle } from "../data/inspector";

/* 把真实 detail 的节点结构化产出（changeSet.files / gate / test / gitWrite / approval）归一化为
   检查面板所需现场（文件树 + diff + 证据链 + 回放），供 http 模式右栏渲染。
   改动行一律来自后端 /tasks/{id}/patch 的真实 unified diff；拿不到就显式不可用，不合成。 */

interface AfFile { path: string; action: string; added: number; removed: number; }

function actionToStatus(a: string): FileNode["status"] {
  const value = a.trim().toLowerCase();
  if (value === "a" || value === "create" || value === "add" || value === "added") return "added";
  if (value === "d" || value === "delete" || value === "remove" || value === "removed") return "removed";
  return "modified";
}

function buildFileTree(files: AfFile[]): FileNode[] {
  const root: FileNode[] = [];
  for (const f of files) {
    const parts = f.path.split("/");
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1;
      const name = parts[i];
      let node = level.find((n) => n.name === name);
      if (!node) {
        node = isFile ? { name, kind: "file", status: actionToStatus(f.action), lines: f.added + f.removed || undefined } : { name, kind: "dir", children: [] };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    }
  }
  return root;
}

/* 真实改动文件的多来源汇总。
   节点 structured 的字段名并不统一：实现节点给 changedFiles（changeType/reason），
   prepare-change-set 给 changeSet.files（action/contentDigest），交付补丁给
   patch.files。此前只读 structured.files —— 没有节点产出该字段，于是文件页签
   永远是空的。这里按优先级合并，先出现的来源优先。 */
function collectChangedFiles(t: TaskDetailDto | null, patch?: TaskPatchDto | null): AfFile[] {
  const byPath = new Map<string, AfFile>();
  const record = (path: unknown, action: unknown, added?: unknown, removed?: unknown): void => {
    if (typeof path !== "string" || path.length === 0 || byPath.has(path)) return;
    byPath.set(path, {
      path,
      action: typeof action === "string" ? action : "update",
      added: typeof added === "number" ? added : 0,
      removed: typeof removed === "number" ? removed : 0,
    });
  };
  /* 1. 真实补丁：改动行数只有这里能给出，且它在实现节点完成后即可用。 */
  for (const file of patch?.files ?? []) {
    const parsed = parseUnifiedDiff(file.patch);
    record(file.path, file.action, parsed.filter((line) => line.type === "add").length, parsed.filter((line) => line.type === "del").length);
  }
  /* 2. 已冻结的交付 change set。 */
  for (const file of t?.preparedDelivery?.changeSet?.files ?? []) record(file.path, file.action);
  for (const operation of t?.gitOperations ?? []) {
    for (const file of operation.changeSet?.files ?? []) record(file.path, file.action);
  }
  /* 3. 节点结构化产出。 */
  for (const node of t?.nodes ?? []) {
    const structured = (node.structured ?? {}) as Record<string, unknown>;
    for (const item of Array.isArray(structured.files) ? structured.files : []) {
      const file = item as Record<string, unknown>;
      record(file.path, file.action ?? file.changeType, file.added, file.removed);
    }
    for (const item of Array.isArray(structured.changedFiles) ? structured.changedFiles : []) {
      const file = item as Record<string, unknown>;
      record(file.path, file.action ?? file.changeType);
    }
    const changeSet = structured.changeSet as Record<string, unknown> | undefined;
    for (const item of Array.isArray(changeSet?.files) ? changeSet.files : []) {
      const file = item as Record<string, unknown>;
      record(file.path, file.action);
    }
  }
  return [...byPath.values()];
}

/* 证据链只由**后端真实事实**生成，六类证据各取自己的事实源：
     gates[]（门禁裁决）、skills[]（技能执行）、deliverables[]（交付物摘要）、
     gitOperations[]（远端写入）、节点 requiresApproval + structured.approved（人工审批）。
   此前实现按 `structured.kind` 分支匹配 gate/skill/gitWrite/approval —— 真实 structured
   里没有 kind 字段（实测 11/11 节点该字段不存在），于是 evidence 恒为空数组，
   右栏长期显示「证据链 0/0」。形状臆造是这里唯一的根因。 */
function buildEvidence(t: TaskDetailDto | null): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];
  const shortDigest = (value: string | null | undefined): string => {
    const text = value ?? "";
    const hex = text.includes(":") ? text.slice(text.indexOf(":") + 1) : text;
    return hex.length > 12 ? hex.slice(0, 12) : hex;
  };
  const stamp = (value: string | null | undefined): string => {
    if (!value) return "";
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleTimeString() : "";
  };

  /* 1. 门禁裁决：outcome 是确定性程序的判定，evidenceRef 是它依据的摘要。 */
  for (const gate of t?.rawGates ?? []) {
    const isTestGate = gate.gateType.includes("test");
    evidence.push({
      id: "ev:gate:" + gate.gateId,
      kind: isTestGate ? "test" : "review",
      title: `门禁 ${gate.gateType} 判定 ${gate.outcome}`,
      source: "af/gates evaluator " + gate.evaluatorVersion,
      version: "evidence:" + shortDigest(gate.evidenceRef),
      at: stamp(gate.createdAt),
      actor: "确定性程序",
      confirmed: gate.outcome === "pass",
      required: true,
    });
  }

  /* 2. 技能执行：退出码是唯一能证明「命令真的跑过」的事实。 */
  for (const skill of t?.skills ?? []) {
    evidence.push({
      id: "ev:skill:" + skill.nodeId + ":" + skill.skillId,
      kind: "test",
      title: `${skill.skillId} ${skill.status}${skill.exitCode === undefined ? "" : `（exit ${skill.exitCode}）`}`,
      source: "af/skill " + skill.skillVersion,
      version: "evidence:" + shortDigest(skill.evidenceRef),
      at: "",
      actor: "Skill 执行器",
      confirmed: skill.status === "completed",
      required: true,
    });
  }

  /* 3. 交付物摘要：digest 是「产物确实生成过」的凭据。 */
  for (const item of t?.deliverables ?? []) {
    evidence.push({
      id: "ev:deliverable:" + item.deliverableId,
      kind: "change",
      title: `${item.nodeId} 交付物 ${item.status}`,
      source: "af/deliverable " + item.schemaVersion,
      version: shortDigest(item.digest),
      at: "",
      actor: item.nodeId,
      confirmed: item.status === "current",
      required: true,
    });
  }

  /* 4. 远端写入：只有真发生过的外部写操作才进证据链。 */
  for (const operation of t?.gitOperations ?? []) {
    evidence.push({
      id: "ev:git:" + operation.operationId,
      kind: "change",
      title: `远端写入 ${operation.status}`,
      source: "af/connector-git",
      version: "changeset:" + shortDigest(operation.changeSet?.digest),
      at: "",
      actor: "连接层",
      confirmed: operation.status === "committed",
      required: true,
    });
  }

  /* 5. 人工审批：structured.approved 是审批节点的真实裁决位。 */
  for (const node of t?.nodes ?? []) {
    if (!node.requiresApproval) continue;
    const structured = (node.structured ?? {}) as Record<string, unknown>;
    const approved = structured.approved;
    evidence.push({
      id: "ev:approval:" + node.nodeId,
      kind: "approval",
      title: `人工检查点 ${node.nodeId}`,
      source: "af/governance approval",
      version: "decision:" + (approved === true ? "approved" : approved === false ? "rejected" : "pending"),
      at: "",
      actor: "人工",
      confirmed: approved === true,
      required: true,
    });
  }

  return evidence;
}

export function realInspectorBundle(t: TaskDetailDto | null, trajectory: TrajectoryEventDto[], patch?: TaskPatchDto | null): InspectorBundle {
  const evidence = buildEvidence(t);

  /* diffs 只来自真实补丁：key 必须与文件树路径完全一致，供 DiffView 的切换芯片与
     shownFile 回退逻辑使用。available=false 时保持空对象。 */
  const diffs: Record<string, DiffLine[]> = {};
  if (patch?.available) {
    for (const file of patch.files) diffs[file.path] = parseUnifiedDiff(file.patch);
  }

  const replay: ReplayStep[] = (trajectory ?? []).slice(-20).map((ev) => ({
    id: ev.eventId, stage: ev.eventType, actor: ev.actor, action: ev.summary, materials: "", tier: "write", result: "ok", at: new Date(ev.occurredAt).toLocaleTimeString(),
  }));

  return {
    files: buildFileTree(collectChangedFiles(t, patch)),
    diffs,
    evidence,
    replay,
    terminal: [],
    patchStatus: { available: !!patch?.available, reason: patch?.available ? null : (patch?.reason ?? "未取到真实补丁") },
  };
}
