import type { IconName } from "../components/Icons";
import type { Session } from "../data/mock";
import { withOrchestrator, type WfEdge, type WfNode, type Workflow } from "../data/workflows";
import type {
  AfBootstrapDto,
  AfTaskDetailDto,
  AfTrajectoryDto,
  AgentProfileDto,
  AgentProfileSummaryDto,
  ScmProviderDto,
  SkillManifestDto,
  SkillSummaryDto,
  TaskDetailDto,
  TaskSummaryDto,
  TrajectoryEventDto,
  WorkflowDefinitionDto,
} from "./types";

const profileRole: Record<string, WfNode["role"]> = {
  "requirements-analyst": "requirement",
  "solution-architect": "architecture",
  "implementation-agent": "development",
  "test-analyst": "testing",
  "independent-reviewer": "review",
};

function toSession(task: TaskSummaryDto): Session {
  const repository = task.repositoryRef.split("/").pop() ?? task.repositoryRef;
  const state: Session["state"] = task.state === "completed" ? "done"
    : task.state === "created" || task.state === "awaiting_human" ? "review"
      : task.state === "blocked_unavailable" || task.state === "needs_reconcile" || task.state === "failed" ? "failed"
        : task.state === "cancelled" ? "idle" : "running";
  return { id: task.taskId, title: task.title, repo: repository, branch: task.targetBranch, state, time: task.updatedAt, bucket: "今天", workflow: task.workflowId };
}

function toWorkflow(dto: WorkflowDefinitionDto): Workflow {
  const levels = new Map(dto.nodes.map((node) => [node.nodeId, 0]));
  for (let pass = 0; pass < dto.nodes.length; pass += 1) {
    dto.nodes.forEach((node) => {
      const upstream = dto.edges.filter((edge) => edge.kind !== "fail" && edge.to === node.nodeId).map((edge) => levels.get(edge.from) ?? 0);
      if (upstream.length) levels.set(node.nodeId, Math.max(...upstream) + 1);
    });
  }
  const lanes = new Map<number, number>();
  const nodes: WfNode[] = dto.nodes.map((node, index) => {
    const role = node.agentProfileRef ? profileRole[node.agentProfileRef.profileId] ?? "development" : node.kind === "git" ? "delivery" : "testing";
    const col = levels.get(node.nodeId) ?? index;
    const lane = lanes.get(col) ?? 0;
    lanes.set(col, lane + 1);
    const approval = node.kind === "approval" || dto.edges.some((edge) => edge.kind === "approve" && edge.to === node.nodeId);
    return { id: node.nodeId, name: node.nodeId, role, col, lane, desc: node.outputSchemaVersion, gate: node.gatePolicy?.gateId, approval, kind: node.kind, agentProfileRef: node.agentProfileRef, skillRef: node.skillRef, outputSchemaVersion: node.outputSchemaVersion };
  });
  const edges: WfEdge[] = dto.edges.map((edge) => ({ id: edge.edgeId, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label }));
  const presentation = dto.presentation;
  return withOrchestrator({ id: dto.workflowId, name: presentation?.name ?? dto.workflowId, glyph: (presentation?.glyph ?? "Nodes") as IconName, tint: (presentation?.tint ?? "accent") as Workflow["tint"], builtin: presentation?.builtin ?? false, summary: presentation?.summary ?? "来自 AF API 的版本化工作流", scene: presentation?.scene ?? "阶段 1.6", nodes, edges, maxRetry: presentation?.maxRetry ?? 1, onExhaust: presentation?.onExhaust ?? "人工接管", workflowVersion: dto.workflowVersion, nodeSpecDigest: dto.nodeSpecDigest, frozen: dto.frozenAt !== undefined });
}

function toProfile(profile: AgentProfileDto): AgentProfileSummaryDto {
  return {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    name: profile.name,
    independent: profile.independent,
    promptId: profile.promptRef.promptId,
    promptVersion: profile.promptRef.promptVersion,
    responsibilities: profile.responsibilities,
    nonResponsibilities: profile.nonResponsibilities,
    modelPolicy: { provider: profile.modelPolicy.provider, model: profile.modelPolicy.model },
    toolPolicyVersion: profile.toolPolicy.version,
    tools: profile.toolPolicy.allow,
    inputSchemaVersion: profile.inputSchemaVersion,
    outputSchemaVersion: profile.outputSchemaVersion,
  };
}

function toSkill(skill: SkillManifestDto): SkillSummaryDto {
  return { skillId: skill.skillId, skillVersion: skill.skillVersion, name: skill.name, allowedCommands: skill.allowedCommands };
}

export interface UiBootstrap { executorMode: AfBootstrapDto["executorMode"]; tasks: Session[]; workflows: Workflow[]; agentProfiles: AgentProfileSummaryDto[]; skills: SkillSummaryDto[]; scmProviders: ScmProviderDto[]; }
export function toUiBootstrap(dto: AfBootstrapDto): UiBootstrap {
  return {
    executorMode: dto.executorMode,
    tasks: dto.tasks.map(toSession),
    workflows: dto.workflows.map(toWorkflow),
    agentProfiles: dto.agentProfiles.map(toProfile),
    skills: dto.skills.map(toSkill),
    scmProviders: dto.scmProviders,
  };
}

function attemptStatus(status: string): "completed" | "failed" | "timed_out" | "rejected" {
  if (status === "accepted") return "completed";
  if (status === "expired") return "timed_out";
  if (status === "rejected") return "rejected";
  return "failed";
}

/** 唯一的 TaskDetail 公共 DTO → UI 投影入口。 */
export function toTaskDetail(dto: AfTaskDetailDto): TaskDetailDto {
  const attempts = new Map(dto.attempts.map((attempt) => [attempt.attemptId, attempt]));
  const gatesByAttempt = new Map(dto.gates.map((gate) => [gate.attemptId, gate]));
  const deliverablesByAttempt = new Map(dto.deliverables.map((deliverable) => [deliverable.attemptId, deliverable]));
  const nodes: TaskDetailDto["nodes"] = dto.nodes.map((node) => {
    const attemptId = node.acceptedAttemptId ?? node.currentAttemptId;
    const attempt = attemptId ? attempts.get(attemptId) : undefined;
    const gate = attemptId ? gatesByAttempt.get(attemptId) : undefined;
    const deliverable = attemptId ? deliverablesByAttempt.get(attemptId) : undefined;
    const evidenceRefs = [gate?.evidenceRef, deliverable?.digest].filter((value): value is string => Boolean(value));
    const status = node.status === "blocked" ? "blocked_unavailable" : node.status === "invalidated" ? "pending" : node.status;
    return {
      nodeId: node.nodeId,
      kind: node.kind,
      status,
      ...(attemptId ? { attemptId } : {}),
      ...(attempt?.inputDigest ? { inputDigest: attempt.inputDigest } : {}),
      ...(attempt?.outputDigest ? { outputDigest: attempt.outputDigest } : {}),
      ...(node.agentProfileRef ? { agentProfileRef: node.agentProfileRef } : {}),
      ...(node.skillRef ? { skillRef: node.skillRef } : {}),
      ...(attempt?.executorMode ? { executorMode: attempt.executorMode } : {}),
      ...(attempt?.executionMeta?.provider ? { provider: attempt.executionMeta.provider } : {}),
      ...(attempt?.executionMeta?.model ? { model: attempt.executionMeta.model } : {}),
      evidenceRefs,
      ...(node.lastFailureCode ? { failureCode: node.lastFailureCode } : {}),
      ...(node.lastFailureCode && node.failTarget ? { reworkTargetNodeId: node.failTarget } : {}),
    };
  });
  const skills: TaskDetailDto["skills"] = dto.nodes.flatMap((node) => {
    if (!node.skillRef) return [];
    const attemptId = node.acceptedAttemptId ?? node.currentAttemptId;
    const attempt = attemptId ? attempts.get(attemptId) : undefined;
    if (!attempt) return [];
    const durationMs = attempt.finishedAt ? Math.max(0, Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt)) : 0;
    const evidenceRef = (attemptId ? gatesByAttempt.get(attemptId)?.evidenceRef : undefined) ?? attempt.outputDigest ?? attempt.inputDigest;
    if (!evidenceRef) return [];
    return [{
      nodeId: node.nodeId,
      skillId: node.skillRef.skillId,
      skillVersion: node.skillRef.skillVersion,
      status: attemptStatus(attempt.status),
      durationMs,
      evidenceRef,
    }];
  });
  const currentNodeId = nodes.find((node) => ["running", "rejected", "awaiting_approval", "blocked_unavailable", "needs_reconcile"].includes(node.status))?.nodeId;
  return {
    taskId: dto.taskId,
    title: dto.title,
    status: dto.state,
    executorMode: dto.executorMode,
    repositoryRef: dto.repositoryRef,
    baseBranch: dto.baseBranch,
    ...(dto.baseRevision === null ? {} : { baseRevision: dto.baseRevision }),
    targetBranch: dto.targetBranch,
    provider: dto.provider,
    mcpServerRef: dto.mcpServerRef,
    contractDigest: dto.contractDigest,
    workflow: { workflowId: dto.workflowId, workflowVersion: dto.workflowVersion, nodeSpecDigest: dto.nodeSpecDigest, frozen: true, policyVersion: dto.policyVersion },
    ...(currentNodeId ? { currentNodeId } : {}),
    nodes,
    gates: dto.gates.map((gate) => ({ gateId: gate.gateId, nodeId: gate.nodeId, outcome: gate.outcome, evaluatorVersion: gate.evaluatorVersion, threshold: gate.threshold, actual: gate.actual, ...(gate.failureCode ? { failureCode: gate.failureCode } : {}), evidenceRef: gate.evidenceRef })),
    skills,
    preparedDelivery: dto.preparedDelivery,
    gitOperations: dto.gitOperations,
    deliverables: dto.deliverables.map((item) => ({ deliverableId: item.deliverableId, nodeId: item.nodeId, digest: item.digest, mediaType: item.mediaType, schemaVersion: item.schemaVersion, status: item.status })),
    updatedAt: dto.updatedAt,
  };
}

function eventPayload(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

/** API 轨迹只提供事实字段；摘要是确定性的 UI 表达。 */
export function toTrajectory(dto: AfTrajectoryDto): TrajectoryEventDto[] {
  return dto.events.map((event) => {
    const payload = eventPayload(event.payload);
    const summary = Object.keys(payload).length === 0 ? event.eventType : JSON.stringify(payload);
    return {
      eventId: event.eventId,
      seq: event.revision,
      eventType: event.eventType,
      actor: event.actor,
      ...(typeof payload.nodeId === "string" ? { nodeId: payload.nodeId } : {}),
      ...(typeof payload.operationId === "string" ? { operationId: payload.operationId } : {}),
      occurredAt: event.occurredAt,
      summary,
    };
  });
}

export function toWorkflowDto(workflow: Workflow): WorkflowDefinitionDto {
  const nodes: WorkflowDefinitionDto["nodes"] = workflow.nodes.map((node) => {
    const kind = node.kind ?? (node.role === "testing" ? "skill" : node.role === "delivery" ? "git" : "ai");
    const profileId = Object.entries(profileRole).find(([, role]) => role === node.role)?.[0];
    return { nodeId: node.id, kind, ...(kind === "ai" && (node.agentProfileRef || profileId) ? { agentProfileRef: node.agentProfileRef ?? { profileId: profileId!, profileVersion: "1.0.0" } } : {}), ...(kind === "skill" ? { skillRef: node.skillRef ?? { skillId: node.id, skillVersion: "1.0.0" } } : {}), inputRefs: workflow.edges.filter((edge) => edge.kind !== "fail" && edge.to === node.id).map((edge) => edge.from), outputSchemaVersion: node.outputSchemaVersion ?? "UI.WorkflowNode@1", timeoutMs: 300000, retryPolicy: { maxAttempts: workflow.maxRetry + 1, onExhaust: "human-takeover" as const }, ...(node.gate ? { gatePolicy: { gateId: node.gate, evaluatorVersion: "1.0.0" } } : {}) };
  });
  // presentation 是 bootstrap 的只读 UI 投影，不属于严格的
  // WorkflowDefinition 写入契约；保存/校验时不能回传。
  return { contractVersion: "1.0", workflowId: workflow.id, workflowVersion: workflow.workflowVersion ?? 1, nodes, edges: workflow.edges.map((edge) => ({ edgeId: edge.id, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label })), entryNodeIds: workflow.nodes.filter((node) => !workflow.edges.some((edge) => edge.kind !== "fail" && edge.to === node.id)).map((node) => node.id), exitNodeIds: workflow.nodes.filter((node) => !workflow.edges.some((edge) => edge.kind !== "fail" && edge.from === node.id)).map((node) => node.id), policyVersion: "1.0.0", nodeSpecDigest: workflow.nodeSpecDigest ?? "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
}
