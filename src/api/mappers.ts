import type { IconName } from "../components/Icons";
import type { Session } from "../data/mock";
import { withOrchestrator, type WfEdge, type WfNode, type Workflow } from "../data/workflows";
import type { AfBootstrapDto, TaskSummaryDto, WorkflowDefinitionDto } from "./types";

const profileRole: Record<string, WfNode["role"]> = {
  "requirements-analyst": "requirement",
  "solution-architect": "architecture",
  "implementation-agent": "development",
  "test-analyst": "testing",
  "independent-reviewer": "review",
};

function toSession(task: TaskSummaryDto): Session {
  const repository = task.repositoryRef.split("/").pop() ?? task.repositoryRef;
  return { id: task.taskId, title: task.title, repo: repository, branch: task.targetBranch, state: task.state, time: task.updatedAt, bucket: "今天", diff: task.diff, turns: task.turns, workflow: task.workflowId };
}

function toWorkflow(dto: WorkflowDefinitionDto): Workflow {
  const nodes: WfNode[] = dto.nodes.map((node, index) => {
    const role = node.agentProfileRef ? profileRole[node.agentProfileRef.profileId] ?? "development" : node.kind === "git" ? "delivery" : "testing";
    return { id: node.nodeId, name: node.nodeId, role, col: index, lane: 0, desc: node.outputSchemaVersion, gate: node.gatePolicy?.gateId, approval: node.kind === "approval" };
  });
  const edges: WfEdge[] = dto.edges.map((edge) => ({ id: edge.edgeId, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label }));
  const presentation = dto.presentation;
  return withOrchestrator({ id: dto.workflowId, name: presentation?.name ?? dto.workflowId, glyph: (presentation?.glyph ?? "Nodes") as IconName, tint: (presentation?.tint ?? "accent") as Workflow["tint"], builtin: presentation?.builtin ?? false, summary: presentation?.summary ?? "来自 AF API 的版本化工作流", scene: presentation?.scene ?? "阶段 1.6", nodes, edges, maxRetry: presentation?.maxRetry ?? 1, onExhaust: presentation?.onExhaust ?? "人工接管" });
}

export interface UiBootstrap { executorMode: AfBootstrapDto["executorMode"]; tasks: Session[]; workflows: Workflow[]; }
export function toUiBootstrap(dto: AfBootstrapDto): UiBootstrap { return { executorMode: dto.executorMode, tasks: dto.tasks.map(toSession), workflows: dto.workflows.map(toWorkflow) }; }

export function toWorkflowDto(workflow: Workflow): WorkflowDefinitionDto {
  const nodes: WorkflowDefinitionDto["nodes"] = workflow.nodes.map((node) => {
    const kind = node.role === "testing" ? "skill" : node.role === "delivery" ? "git" : "ai";
    const profileId = Object.entries(profileRole).find(([, role]) => role === node.role)?.[0];
    return { nodeId: node.id, kind, ...(kind === "ai" && profileId ? { agentProfileRef: { profileId, profileVersion: "1.0.0" } } : {}), ...(kind === "skill" ? { skillRef: { skillId: node.id, skillVersion: "1.0.0" } } : {}), inputRefs: [], outputSchemaVersion: "UI.WorkflowNode@1", timeoutMs: 300000, retryPolicy: { maxAttempts: workflow.maxRetry + 1, onExhaust: "human-takeover" as const }, ...(node.gate ? { gatePolicy: { gateId: node.gate, evaluatorVersion: "1.0.0" } } : {}) };
  });
  return { contractVersion: "1.0", workflowId: workflow.id, workflowVersion: 1, nodes, edges: workflow.edges.map((edge) => ({ edgeId: edge.id, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label })), entryNodeIds: workflow.nodes.filter((node) => !workflow.edges.some((edge) => edge.kind === "flow" && edge.to === node.id)).map((node) => node.id), exitNodeIds: workflow.nodes.filter((node) => !workflow.edges.some((edge) => edge.kind === "flow" && edge.from === node.id)).map((node) => node.id), policyVersion: "1.0.0", nodeSpecDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", presentation: { name: workflow.name, glyph: workflow.glyph, tint: workflow.tint, builtin: workflow.builtin, summary: workflow.summary, scene: workflow.scene, maxRetry: workflow.maxRetry, onExhaust: workflow.onExhaust } };
}

