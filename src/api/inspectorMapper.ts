import type { TaskDetailDto, TrajectoryEventDto } from "./types";
import type { DiffLine, FileNode } from "../data/mock";
import type { EvidenceItem, ReplayStep } from "../data/settings";
import type { InspectorBundle } from "../data/inspector";

/* 把真实 detail 的节点结构化产出（changeSet.files / gate / test / gitWrite / approval）归一化为
   检查面板所需现场（文件树 + diff + 证据链 + 回放），供 http 模式右栏渲染。 */

interface AfFile { path: string; action: string; added: number; removed: number; }

function actionToStatus(a: string): FileNode["status"] {
  return a === "A" ? "added" : a === "D" ? "removed" : "modified";
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

function synthDiff(f: AfFile): DiffLine[] {
  const lines: DiffLine[] = [{ type: "hunk", text: "@@ -1 +1 @@" }];
  if (f.action === "A") for (let i = 0; i < Math.min(f.added, 8); i++) lines.push({ type: "add", n: i + 1, text: "+ " + f.path.split("/").pop() });
  else if (f.action === "D") for (let i = 0; i < Math.min(f.removed, 8); i++) lines.push({ type: "del", n: i + 1, text: "− " + f.path.split("/").pop() });
  else { lines.push({ type: "del", n: 1, text: "− " + f.path.split("/").pop() }); lines.push({ type: "add", n: 2, text: "+ " + f.path.split("/").pop() }); }
  return lines;
}

export function realInspectorBundle(t: TaskDetailDto | null, trajectory: TrajectoryEventDto[]): InspectorBundle {
  const files: AfFile[] = [];
  const evidence: EvidenceItem[] = [];
  for (const n of t?.nodes ?? []) {
    const s = (n.structured ?? {}) as Record<string, any>;
    if (Array.isArray(s.files)) for (const f of s.files) files.push({ path: f.path, action: f.action, added: f.added ?? 0, removed: f.removed ?? 0 });
    if (s.kind === "gate" && s.gate) evidence.push({ id: "ev:" + n.nodeId, kind: "review", title: "门禁 " + (s.gate.gateId ?? n.nodeId), source: "af/api", version: "gate:" + (s.gate.verdict ?? ""), at: "", actor: s.agent ?? "af", confirmed: s.gate.outcome === "pass", required: true });
    else if (s.kind === "skill" && s.test) evidence.push({ id: "ev:" + n.nodeId, kind: "test", title: (s.test.passed ?? 0) + " 项测试通过", source: "af/api", version: "test", at: "", actor: "skill", confirmed: (s.test.failed ?? 0) === 0, required: true });
    else if (s.kind === "git" && s.gitWrite) evidence.push({ id: "ev:" + n.nodeId, kind: "change", title: "写入 " + (s.gitWrite.repositoryRef ?? "") + " " + (s.gitWrite.targetBranch ?? ""), source: "af/api", version: "git:" + (s.gitWrite.changeSetDigest ?? "").slice(0, 8), at: "", actor: "af", confirmed: true, required: true });
    else if (s.kind === "git" && s.approval) evidence.push({ id: "ev:" + n.nodeId, kind: "approval", title: "人工检查点 " + (s.approval.prompt ?? ""), source: "af/api", version: "approve:" + (s.approval.decision ?? ""), at: "", actor: "me@agentflow.dev", confirmed: !!s.approval.decision, required: true });
  }
  const diffs: Record<string, DiffLine[]> = {};
  for (const f of files) diffs[f.path] = synthDiff(f);

  const replay: ReplayStep[] = (trajectory ?? []).slice(-20).map((ev) => ({
    id: ev.eventId, stage: ev.eventType, actor: ev.actor, action: ev.summary, materials: "", tier: "write", result: "ok", at: new Date(ev.occurredAt).toLocaleTimeString(),
  }));

  return { files: buildFileTree(files), diffs, evidence, replay, terminal: [] };
}
