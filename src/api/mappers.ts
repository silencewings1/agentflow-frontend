import type { IconName } from "../components/Icons";
import type { Session } from "../data/mock";
import { withOrchestrator, type WfEdge, type WfNode, type Workflow } from "../data/workflows";
import type { AfBootstrapDto, AgentProfileSummaryDto, ScmProviderDto, SkillSummaryDto, TaskSummaryDto, WorkflowDefinitionDto } from "./types";

const profileRole: Record<string, WfNode["role"]> = {
  "requirements-analyst": "requirement",
  "solution-architect": "architecture",
  "implementation-agent": "development",
  "test-analyst": "testing",
  "independent-reviewer": "review",
};

function toSession(task: TaskSummaryDto): Session {
  const repository = task.repositoryRef.split("/").pop() ?? task.repositoryRef;
  const state: Session["state"] = task.state === "completed" || task.state === "done" ? "done"
    : task.state === "created" || task.state === "review" ? "review"
      : task.state === "blocked_unavailable" || task.state === "needs_reconcile" || task.state === "failed" ? "failed"
        : task.state === "cancelled" || task.state === "idle" ? "idle" : "running";
  return { id: task.taskId, title: task.title, repo: repository, branch: task.targetBranch, state, time: task.updatedAt, bucket: "今天", diff: task.diff, turns: task.turns, workflow: task.workflowId };
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
    return { id: node.nodeId, name: node.nodeId, role, col, lane, desc: node.outputSchemaVersion, gate: node.gatePolicy?.gateId, approval: node.kind === "approval", kind: node.kind, agentProfileRef: node.agentProfileRef, skillRef: node.skillRef, outputSchemaVersion: node.outputSchemaVersion };
  });
  const edges: WfEdge[] = dto.edges.map((edge) => ({ id: edge.edgeId, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label }));
  const presentation = dto.presentation;
  return withOrchestrator({ id: dto.workflowId, name: presentation?.name ?? dto.workflowId, glyph: (presentation?.glyph ?? "Nodes") as IconName, tint: (presentation?.tint ?? "accent") as Workflow["tint"], builtin: presentation?.builtin ?? false, summary: presentation?.summary ?? "来自 AF API 的版本化工作流", scene: presentation?.scene ?? "阶段 1.6", nodes, edges, maxRetry: presentation?.maxRetry ?? 1, onExhaust: presentation?.onExhaust ?? "人工接管", workflowVersion: dto.workflowVersion, nodeSpecDigest: dto.nodeSpecDigest, frozen: dto.frozenAt !== undefined });
}

export interface UiBootstrap { executorMode: AfBootstrapDto["executorMode"]; tasks: Session[]; workflows: Workflow[]; agentProfiles: AgentProfileSummaryDto[]; skills: SkillSummaryDto[]; scmProviders: ScmProviderDto[]; }
export function toUiBootstrap(dto: AfBootstrapDto): UiBootstrap { return { executorMode: dto.executorMode, tasks: dto.tasks.map(toSession), workflows: dto.workflows.map(toWorkflow), agentProfiles: dto.agentProfiles, skills: dto.skills, scmProviders: dto.scmProviders }; }

export function toWorkflowDto(workflow: Workflow): WorkflowDefinitionDto {
  const nodes: WorkflowDefinitionDto["nodes"] = workflow.nodes.map((node) => {
    const kind = node.kind ?? (node.role === "testing" ? "skill" : node.role === "delivery" ? "git" : "ai");
    const profileId = Object.entries(profileRole).find(([, role]) => role === node.role)?.[0];
    return { nodeId: node.id, kind, ...(kind === "ai" && (node.agentProfileRef || profileId) ? { agentProfileRef: node.agentProfileRef ?? { profileId: profileId!, profileVersion: "1.0.0" } } : {}), ...(kind === "skill" ? { skillRef: node.skillRef ?? { skillId: node.id, skillVersion: "1.0.0" } } : {}), inputRefs: workflow.edges.filter((edge) => edge.kind !== "fail" && edge.to === node.id).map((edge) => edge.from), outputSchemaVersion: node.outputSchemaVersion ?? "UI.WorkflowNode@1", timeoutMs: 300000, retryPolicy: { maxAttempts: workflow.maxRetry + 1, onExhaust: "human-takeover" as const }, ...(node.gate ? { gatePolicy: { gateId: node.gate, evaluatorVersion: "1.0.0" } } : {}) };
  });
  return { contractVersion: "1.0", workflowId: workflow.id, workflowVersion: workflow.workflowVersion ?? 1, nodes, edges: workflow.edges.map((edge) => ({ edgeId: edge.id, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label })), entryNodeIds: workflow.nodes.filter((node) => !workflow.edges.some((edge) => edge.kind !== "fail" && edge.to === node.id)).map((node) => node.id), exitNodeIds: workflow.nodes.filter((node) => !workflow.edges.some((edge) => edge.kind !== "fail" && edge.from === node.id)).map((node) => node.id), policyVersion: "1.0.0", nodeSpecDigest: workflow.nodeSpecDigest ?? "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", presentation: { name: workflow.name, glyph: workflow.glyph, tint: workflow.tint, builtin: workflow.builtin, summary: workflow.summary, scene: workflow.scene, maxRetry: workflow.maxRetry, onExhaust: workflow.onExhaust } };
}
