/* 把真实 TaskDetail 的 attempts[].structured 归一化为统一的阶段卡片模型。
   纯函数：不触碰 React、不发请求、不读全局状态，可独立测试。
   真实字段名以 packages/af/af-api/src/runtime/profile-runtime.ts 与
   experiments/phase1.6/contracts/agent-profiles.md 的 output schema 为准；
   这里的每个分支只消费真实字段，字段缺失即省略，绝不补造内容。 */
import type {
  AfGateDetailDto,
  AttemptDetailDto,
  CriterionAssessmentDto,
  GateResultDto,
  NodeRuntimeDto,
  TaskDetailDto,
} from "./types";
import type {
  StageCardModel,
  StageDiffFile,
  StageFact,
  StageFinding,
  StageGate,
  StageKind,
  StageList,
  StageStatus,
} from "./stageModel";

/* 角色中文标签与 src/data/settings.ts 的 roleLabel 保持一致；
   此处本地定义，避免 api 层反向依赖 data 层 fixture。 */
const ROLE_BY_KIND: Record<StageKind, string> = {
  requirements: "需求",
  design: "架构",
  implementation: "开发",
  skill: "测试",
  gate: "门禁",
  review: "审查",
  "git-change-set": "交付",
  "git-publish": "交付",
};

const EMPTY_SUMMARY = "该节点暂无结构化交付物";

type Structured = Record<string, unknown>;
type NodeLike = NodeRuntimeDto & {
  acceptedAttemptId?: string | null;
  currentAttemptId?: string | null;
  outputSchemaVersion?: string;
  attemptOrdinal?: number;
};

function isPlainObject(value: unknown): value is Structured {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Structured | undefined {
  return isPlainObject(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string" && item.length > 0);
}

function scalarToString(value: unknown): string | undefined {
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

function pushFact(facts: StageFact[], label: string, value: string | undefined, mono?: boolean): void {
  if (value === undefined || value.length === 0) return;
  facts.push(mono === undefined ? { label, value } : { label, value, mono });
}

function pushList(lists: StageList[], label: string, items: string[]): void {
  const clean = items.filter((item) => item.length > 0);
  if (clean.length === 0) return;
  lists.push({ label, items: clean });
}

function joinParts(parts: Array<string | undefined>, separator: string): string {
  return parts.filter((part): part is string => part !== undefined && part.length > 0).join(separator);
}

function flattenScalars(source: Structured | undefined): string[] {
  if (source === undefined) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      const items = value.map(scalarToString).filter((item): item is string => item !== undefined);
      if (items.length > 0) out.push(key + ": " + items.join("; "));
    } else {
      const text = scalarToString(value);
      if (text !== undefined) out.push(key + ": " + text);
    }
  }
  return out;
}

function durationMs(skill: Structured): string | undefined {
  const started = asString(skill.startedAt);
  const finished = asString(skill.finishedAt);
  if (started === undefined || finished === undefined) return undefined;
  const delta = Date.parse(finished) - Date.parse(started);
  if (!Number.isFinite(delta) || delta < 0) return undefined;
  return delta + " ms";
}

/* --------------------------- kind / status --------------------------- */

function gitKind(structured: Structured | null): StageKind {
  const changeSet = structured === null ? undefined : asObject(structured.changeSet);
  if (changeSet === undefined) return "git-publish";
  const hasRemote = asString(structured?.remoteRevision) !== undefined;
  const hasOperation = asString(structured?.operationId) !== undefined;
  return !hasRemote && !hasOperation ? "git-change-set" : "git-publish";
}

function fallbackKind(nodeKind: NodeRuntimeDto["kind"], nodeId: string): StageKind {
  if (nodeKind === "skill") return "skill";
  if (nodeKind === "gate") return "gate";
  if (nodeKind === "git") return "git-publish";
  if (nodeKind === "approval") return "review";
  if (/requirement/i.test(nodeId)) return "requirements";
  if (/design|arch/i.test(nodeId)) return "design";
  if (/review|audit/i.test(nodeId)) return "review";
  return "implementation";
}

function resolveKind(schemaVersion: string, node: NodeRuntimeDto, structured: Structured | null): StageKind {
  const base = schemaVersion.split("@")[0];
  switch (base) {
    case "RequirementsDeliverable": return "requirements";
    case "SolutionDesignDeliverable": return "design";
    case "ImplementationDeliverable": return "implementation";
    case "SkillResult": return "skill";
    case "GateResult": return "gate";
    case "ReviewDeliverable": return "review";
    case "GitOperation": return gitKind(structured);
    default: return fallbackKind(node.kind, node.nodeId);
  }
}

function toStageStatus(status: NodeRuntimeDto["status"]): StageStatus {
  switch (status) {
    case "accepted": return "accepted";
    case "rejected": return "rejected";
    case "running": return "running";
    case "pending": return "pending";
    case "blocked_unavailable": return "blocked";
    default: return "pending";
  }
}

/* ------------------------------- gate -------------------------------- */

function passFromActual(actual: unknown, threshold: unknown): boolean {
  if (typeof actual === "number") {
    if (typeof threshold === "number") return actual >= threshold;
    return actual > 0;
  }
  if (typeof actual === "boolean") return actual;
  if (typeof actual === "string") return actual === "pass" || actual === "passed" || actual === "ok";
  return Boolean(actual);
}

function dimensionsFromActual(actual: unknown, threshold: unknown): StageGate["dimensions"] {
  const actualObj = asObject(actual);
  if (actualObj === undefined) return [];
  const thresholdObj = asObject(threshold);
  return Object.entries(actualObj)
    .filter(([, value]) => scalarToString(value) !== undefined)
    .map(([name, value]) => ({
      name,
      passed: passFromActual(value, thresholdObj?.[name]),
      note: scalarToString(value),
    }));
}

function resolveGate(detail: TaskDetailDto, node: NodeRuntimeDto, attemptId: string | undefined, structured: Structured | null): StageGate | undefined {
  const rawGates: AfGateDetailDto[] = detail.rawGates ?? [];
  const raw = rawGates.find((gate) => attemptId !== undefined && gate.attemptId === attemptId)
    ?? rawGates.find((gate) => gate.nodeId === node.nodeId);
  const summaryGates: GateResultDto[] = detail.gates ?? [];
  const summary = summaryGates.find((gate) => gate.nodeId === node.nodeId);

  const gateId = raw?.gateId ?? summary?.gateId;
  const outcome = raw?.outcome ?? summary?.outcome;
  if (gateId === undefined && outcome === undefined) return undefined;

  const dimensions: StageGate["dimensions"] = [];
  if (structured !== null) {
    if (typeof structured.unitStatus === "string") {
      dimensions.push({ name: "unit-tests", passed: structured.unitStatus === "passed", note: structured.unitStatus });
    }
    if (typeof structured.integrationStatus === "string") {
      dimensions.push({ name: "integration-tests", passed: structured.integrationStatus === "passed", note: structured.integrationStatus });
    }
  }
  if (dimensions.length === 0) {
    dimensions.push(...dimensionsFromActual(raw?.actual, raw?.threshold));
  }
  if (dimensions.length === 0) {
    dimensions.push(...dimensionsFromActual(summary?.actual, summary?.threshold));
  }
  return { gateId: gateId ?? node.nodeId, outcome: outcome ?? "unavailable", dimensions };
}

/* --------------------------- change sets ----------------------------- */

function collectChangeSetFiles(detail: TaskDetailDto): Map<string, StageDiffFile> {
  const byPath = new Map<string, StageDiffFile>();
  const record = (files: unknown): void => {
    for (const item of asArray(files)) {
      const file = asObject(item);
      const path = file === undefined ? undefined : asString(file.path);
      if (file === undefined || path === undefined || byPath.has(path)) continue;
      byPath.set(path, {
        path,
        action: asString(file.action) ?? "unknown",
        contentDigest: asString(file.contentDigest) ?? "",
      });
    }
  };
  record(detail.preparedDelivery?.changeSet?.files);
  for (const operation of detail.gitOperations ?? []) record(operation.changeSet?.files);
  for (const node of detail.nodes ?? []) {
    const structured = asObject((node as NodeLike).structured);
    if (structured !== undefined) record(asObject(structured.changeSet)?.files);
  }
  return byPath;
}

/* --------------------------- per-kind maps --------------------------- */

function mapRequirements(structured: Structured, summaryRef: { value: string }, lists: StageList[]): void {
  summaryRef.value = asString(structured.summary) ?? "";
  pushList(lists, "范围内", asStringArray(structured.scopeIn));
  pushList(lists, "范围外", asStringArray(structured.scopeOut));
  pushList(lists, "假设", asStringArray(structured.assumptions));
  pushList(lists, "风险", asArray(structured.riskFlags).flatMap((item) => {
    const risk = asObject(item);
    if (risk === undefined) return [];
    const level = asString(risk.level);
    const description = asString(risk.description);
    const mitigation = asString(risk.mitigation);
    const head = joinParts([level === undefined ? undefined : "[" + level + "]", description], " ");
    const text = mitigation === undefined ? head : joinParts([head, "—", mitigation], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushList(lists, "建议节点调整", asArray(structured.recommendedNodeChanges).flatMap((item) => {
    const change = asObject(item);
    if (change === undefined) return [];
    const nodeId = asString(change.nodeId);
    const reason = asString(change.reason);
    const text = joinParts([nodeId, reason === undefined ? undefined : "：" + reason], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushList(lists, "待确认问题", asArray(structured.openQuestions).flatMap((item) => {
    const question = asObject(item);
    if (question === undefined) return [];
    const text = asString(question.question);
    if (text === undefined) return [];
    return [question.blocking === true ? "[阻塞] " + text : text];
  }));
  pushList(lists, "验收条件", asArray(structured.acceptanceCriteria).flatMap((item) => {
    const criterion = asObject(item);
    if (criterion === undefined) return [];
    const id = asString(criterion.id);
    const statement = asString(criterion.statement);
    const verification = asString(criterion.verification);
    const head = joinParts([id, statement], " ");
    const text = verification === undefined ? head : joinParts([head, "— 验证：" + verification], " ");
    return text.length > 0 ? [text] : [];
  }));
}

function mapDesign(structured: Structured, summaryRef: { value: string }, facts: StageFact[], lists: StageList[]): void {
  summaryRef.value = asString(structured.designSummary) ?? "";
  pushList(lists, "影响范围", asArray(structured.impactedAreas).flatMap((item) => {
    const area = asObject(item);
    if (area === undefined) return [];
    const path = asString(area.path);
    const changeType = asString(area.changeType);
    const reason = asString(area.reason);
    const head = joinParts([path, changeType === undefined ? undefined : "（" + changeType + "）"], " ");
    const text = reason === undefined ? head : joinParts([head, "—", reason], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushList(lists, "实施步骤", asArray(structured.implementationSteps).flatMap((item) => {
    const step = asObject(item);
    if (step === undefined) return [];
    const id = asString(step.id);
    const description = asString(step.description);
    const dependency = asString(step.dependency);
    const head = joinParts([id, description], " ");
    const text = dependency === undefined ? head : joinParts([head, "（依赖：" + dependency + "）"], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushList(lists, "接口变更", asArray(structured.interfaceChanges).flatMap((item) => {
    const change = asObject(item);
    if (change === undefined) return [];
    const component = asString(change.component);
    const detail = asString(change.change);
    const compatibility = asString(change.compatibility);
    const head = joinParts([component, detail], "：");
    const text = compatibility === undefined ? head : joinParts([head, "（兼容性：" + compatibility + "）"], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushList(lists, "数据与状态影响", asStringArray(structured.dataAndStateImpact));
  pushList(lists, "测试策略", asArray(structured.testStrategy).flatMap((item) => {
    const strategy = asObject(item);
    if (strategy === undefined) return [];
    const level = asString(strategy.level);
    const method = asString(strategy.commandOrMethod);
    const evidence = asString(strategy.expectedEvidence);
    const head = joinParts([level, method], "：");
    const text = evidence === undefined ? head : joinParts([head, "— 期望证据：" + evidence], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushFact(facts, "回滚方案", asString(structured.rollbackPlan));
  pushList(lists, "风险登记", asArray(structured.riskRegister).flatMap((item) => {
    const risk = asObject(item);
    if (risk === undefined) return [];
    const id = asString(risk.id);
    const level = asString(risk.level);
    const description = asString(risk.description);
    const mitigation = asString(risk.mitigation);
    const head = joinParts([id, level === undefined ? undefined : "[" + level + "]", description], " ");
    const text = mitigation === undefined ? head : joinParts([head, "—", mitigation], " ");
    return text.length > 0 ? [text] : [];
  }));
}

function mapImplementation(structured: Structured, summaryRef: { value: string }, facts: StageFact[], lists: StageList[], diffByPath: Map<string, StageDiffFile>, diffFiles: StageDiffFile[]): void {
  summaryRef.value = asString(structured.changeSummary) ?? "";
  const changedFiles = asArray(structured.changedFiles).flatMap((item) => {
    const file = asObject(item);
    if (file === undefined) return [];
    const path = asString(file.path);
    const changeType = asString(file.changeType);
    const reason = asString(file.reason);
    const head = joinParts([path, changeType === undefined ? undefined : "（" + changeType + "）"], " ");
    const text = reason === undefined ? head : joinParts([head, "—", reason], " ");
    if (path !== undefined) {
      const matched = diffByPath.get(path);
      if (matched !== undefined) diffFiles.push(matched);
    }
    return text.length > 0 ? [text] : [];
  });
  pushList(lists, "变更文件", changedFiles);
  pushList(lists, "自检", asArray(structured.selfChecks).flatMap((item) => {
    const check = asObject(item);
    if (check === undefined) return [];
    const id = asString(check.id);
    const command = asString(check.command);
    const outcome = asString(check.outcome);
    const evidence = asString(check.evidenceRef);
    const head = joinParts([id, command], "：");
    const withOutcome = outcome === undefined ? head : joinParts([head, "→", outcome], " ");
    const text = evidence === undefined ? withOutcome : joinParts([withOutcome, "（" + evidence + "）"], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushList(lists, "已知问题", asArray(structured.knownIssues).flatMap((item) => {
    const issue = asObject(item);
    if (issue === undefined) return [];
    const id = asString(issue.id);
    const level = asString(issue.level);
    const description = asString(issue.description);
    const text = joinParts([id, level === undefined ? undefined : "[" + level + "]", description], " ");
    return text.length > 0 ? [text] : [];
  }));
  const metrics = asObject(structured.metrics);
  if (metrics !== undefined) {
    for (const [key, value] of Object.entries(metrics)) {
      pushFact(facts, key, scalarToString(value));
    }
  }
}

function mapSkill(structured: Structured, summaryRef: { value: string }, facts: StageFact[], evidenceRefs: Set<string>): void {
  const skill = asObject(structured.skill);
  if (skill === undefined) return;
  const skillId = asString(skill.skillId);
  const status = asString(skill.status);
  summaryRef.value = joinParts([skillId === undefined ? undefined : "技能 " + skillId, status === undefined ? undefined : "状态：" + status], " ");
  pushFact(facts, "技能", skillId, true);
  pushFact(facts, "版本", asString(skill.skillVersion), true);
  pushFact(facts, "状态", status);
  const exitCode = scalarToString(skill.exitCode);
  pushFact(facts, "退出码", exitCode, true);
  pushFact(facts, "耗时", durationMs(skill));
  const evidenceRef = asString(skill.evidenceRef);
  if (evidenceRef !== undefined) evidenceRefs.add(evidenceRef);
  const metrics = asObject(structured.metrics);
  if (metrics !== undefined) pushFact(facts, "通过", scalarToString(metrics.passed));
}

function mapGate(structured: Structured, summaryRef: { value: string }, facts: StageFact[], evidenceRefs: Set<string>): void {
  summaryRef.value = asString(structured.testSummary) ?? "";
  pushFact(facts, "单元测试", asString(structured.unitStatus));
  pushFact(facts, "集成测试", asString(structured.integrationStatus));
  pushFact(facts, "放行建议", asString(structured.releaseRecommendation));
  for (const ref of asStringArray(structured.evidenceRefs)) evidenceRefs.add(ref);
}

function mapReview(structured: Structured, summaryRef: { value: string }, facts: StageFact[], lists: StageList[]): StageFinding[] | undefined {
  summaryRef.value = asString(structured.reviewSummary) ?? "";
  const findings = asArray(structured.findings).flatMap((item, index) => {
    const finding = asObject(item);
    if (finding === undefined) return [];
    const mapped: StageFinding = {
      id: asString(finding.id) ?? "finding-" + String(index + 1),
      severity: asString(finding.severity) ?? "unknown",
      description: asString(finding.description) ?? "",
    };
    const category = asString(finding.category);
    const path = asString(finding.path);
    const requiredAction = asString(finding.requiredAction);
    const evidenceRef = asString(finding.evidenceRef);
    if (category !== undefined) mapped.category = category;
    if (path !== undefined) mapped.path = path;
    if (requiredAction !== undefined) mapped.requiredAction = requiredAction;
    if (evidenceRef !== undefined) mapped.evidenceRef = evidenceRef;
    return [mapped];
  });
  pushList(lists, "范围评估", flattenScalars(asObject(structured.scopeAssessment)));
  pushList(lists, "安全评估", flattenScalars(asObject(structured.securityAssessment)));
  pushList(lists, "测试评估", asArray(structured.testAssessment).flatMap((item) => {
    const assessment = asObject(item);
    if (assessment === undefined) return [];
    const criterionId = asString(assessment.criterionId);
    const status = asString(assessment.status);
    const evidenceRef = asString(assessment.evidenceRef);
    const head = joinParts([criterionId, status], "：");
    const text = evidenceRef === undefined ? head : joinParts([head, "（" + evidenceRef + "）"], " ");
    return text.length > 0 ? [text] : [];
  }));
  pushFact(facts, "审查结论", asString(structured.verdict));
  pushList(lists, "剩余风险", asArray(structured.residualRisks).flatMap((item) => {
    const risk = asObject(item);
    if (risk === undefined) return [];
    const id = asString(risk.id);
    const level = asString(risk.level);
    const description = asString(risk.description);
    const text = joinParts([id, level === undefined ? undefined : "[" + level + "]", description], " ");
    return text.length > 0 ? [text] : [];
  }));
  const metrics = asObject(structured.metrics);
  if (metrics !== undefined) {
    for (const [key, value] of Object.entries(metrics)) {
      pushFact(facts, key, scalarToString(value));
    }
  }
  return findings.length > 0 ? findings : undefined;
}

function mapGit(structured: Structured, kind: StageKind, summaryRef: { value: string }, facts: StageFact[], diffFiles: StageDiffFile[]): void {
  const changeSet = asObject(structured.changeSet);
  const files = asArray(changeSet?.files).flatMap((item) => {
    const file = asObject(item);
    const path = file === undefined ? undefined : asString(file.path);
    if (path === undefined) return [];
    const mapped: StageDiffFile = {
      path,
      action: asString(file?.action) ?? "unknown",
      contentDigest: asString(file?.contentDigest) ?? "",
    };
    diffFiles.push(mapped);
    return [mapped];
  });
  const status = asString(structured.status);
  const sourceRevision = asString(structured.sourceRevision);
  const remoteRevision = asString(structured.remoteRevision);
  const digest = changeSet === undefined ? undefined : asString(changeSet.digest);
  summaryRef.value = kind === "git-change-set"
    ? "变更集：" + String(files.length) + " 个文件"
    : joinParts(["远端提交", remoteRevision === undefined ? undefined : remoteRevision.slice(0, 12)], " ");
  pushFact(facts, "状态", status);
  pushFact(facts, "本地 revision", sourceRevision, true);
  pushFact(facts, "远端 revision", remoteRevision, true);
  pushFact(facts, "变更集 digest", digest, true);
}

/* ------------------------------ main --------------------------------- */

/**
 * 把真实 TaskDetail 归一化为按工作流顺序排列的阶段卡片。
 * 纯函数：detail 为 null 时返回空数组；任何字段缺失都只省略、不抛错。
 */
export function buildStageCards(detail: TaskDetailDto | null, assessments: CriterionAssessmentDto[]): StageCardModel[] {
  if (detail === null) return [];
  const attemptById = new Map<string, AttemptDetailDto>();
  for (const attempt of detail.attempts ?? []) attemptById.set(attempt.attemptId, attempt);
  const diffByPath = collectChangeSetFiles(detail);
  const assessmentList = assessments ?? [];

  return (detail.nodes ?? []).map((node, index) => {
    const like = node as NodeLike;
    const attemptId = like.acceptedAttemptId ?? like.currentAttemptId ?? node.attemptId ?? undefined;
    const attempt = attemptId === undefined ? undefined : attemptById.get(attemptId);
    const structured = asObject(attempt?.structured) ?? asObject(node.structured) ?? null;
    const schemaVersion = attempt?.executionMeta?.outputSchemaVersion ?? asString(like.outputSchemaVersion) ?? "";
    const kind = resolveKind(schemaVersion, node, structured);

    const summaryRef = { value: "" };
    const facts: StageFact[] = [];
    const lists: StageList[] = [];
    const evidenceRefs = new Set<string>(node.evidenceRefs ?? []);
    const diffFiles: StageDiffFile[] = [];
    let findings: StageFinding[] | undefined;

    if (structured !== null) {
      switch (kind) {
        case "requirements": mapRequirements(structured, summaryRef, lists); break;
        case "design": mapDesign(structured, summaryRef, facts, lists); break;
        case "implementation": mapImplementation(structured, summaryRef, facts, lists, diffByPath, diffFiles); break;
        case "skill": mapSkill(structured, summaryRef, facts, evidenceRefs); break;
        case "gate": mapGate(structured, summaryRef, facts, evidenceRefs); break;
        case "review": findings = mapReview(structured, summaryRef, facts, lists); break;
        case "git-change-set":
        case "git-publish": mapGit(structured, kind, summaryRef, facts, diffFiles); break;
      }
    }

    if (summaryRef.value.length === 0 && structured !== null) {
      summaryRef.value = asString(structured.note) ?? "";
    }
    const summary = summaryRef.value.length > 0 ? summaryRef.value : EMPTY_SUMMARY;

    const gate = resolveGate(detail, node, attemptId, structured);
    if (gate !== undefined) {
      const raw = (detail.rawGates ?? []).find((item) => item.gateId === gate.gateId);
      const ref = asString(raw?.evidenceRef);
      if (ref !== undefined) evidenceRefs.add(ref);
    }

    const card: StageCardModel = {
      nodeId: node.nodeId,
      index,
      name: node.nodeId,
      role: ROLE_BY_KIND[kind],
      kind,
      schemaVersion,
      status: toStageStatus(node.status),
      attemptOrdinal: attempt?.ordinal ?? like.attemptOrdinal ?? null,
      summary,
      facts,
      lists,
      criteria: attemptId === undefined ? [] : assessmentList.filter((assessment) => assessment.attemptId === attemptId),
      evidenceRefs: [...evidenceRefs],
    };
    /* attemptId 是可选增补字段：缺失即省略，让卡片如实呈现「无执行诊断可拉取」 */
    if (attemptId !== undefined) card.attemptId = attemptId;
    if (findings !== undefined) card.findings = findings;
    if (gate !== undefined) card.gate = gate;
    if (diffFiles.length > 0) card.diffFiles = diffFiles;
    return card;
  });
}
