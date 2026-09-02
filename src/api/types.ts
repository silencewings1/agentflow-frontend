export type ExecutorMode = "fresh-spawn" | "demo-deterministic";

export interface AfErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface AfSuccess<T> { ok: true; data: T; }
export interface AfFailure { ok: false; error: AfErrorPayload; }
export type AfResponse<T> = AfSuccess<T> | AfFailure;

export interface AgentProfileSummaryDto {
  profileId: string;
  profileVersion: string;
  name: string;
  independent: boolean;
  promptId: string;
  promptVersion: string;
  responsibilities: string[];
  nonResponsibilities: string[];
  modelPolicy: { provider: string; model: string };
  toolPolicyVersion: string;
  tools: string[];
  inputSchemaVersion: string;
  outputSchemaVersion: string;
}

export interface SkillSummaryDto {
  skillId: string;
  skillVersion: string;
  name: string;
  allowedCommands: string[];
}

export interface ScmProviderDto {
  provider: "github" | "gitlab";
  mcpServerRef: string;
  credentialRef: string;
  available: boolean;
  serverVersion?: string;
  capabilitiesDigest?: string;
  tools: string[];
  allowedRepositoryNamespaces: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface WorkflowNodeDto {
  nodeId: string;
  kind: "ai" | "skill" | "gate" | "git" | "approval";
  agentProfileRef?: { profileId: string; profileVersion: string };
  skillRef?: { skillId: string; skillVersion: string };
  inputRefs: string[];
  outputSchemaVersion: string;
  timeoutMs: number;
  retryPolicy: { maxAttempts: number; onExhaust: "human-takeover" | "degrade" | "terminate" };
  gatePolicy?: { gateId: string; evaluatorVersion: string };
  declaredPaths?: string[];
  declaredCommands?: string[];
}

export interface WorkflowEdgeDto {
  edgeId: string;
  from: string;
  to: string;
  kind: "flow" | "fail" | "approve";
  required?: boolean;
  label?: string;
}

export interface WorkflowDefinitionDto {
  contractVersion: "1.0";
  workflowId: string;
  workflowVersion: number;
  nodes: WorkflowNodeDto[];
  edges: WorkflowEdgeDto[];
  entryNodeIds: string[];
  exitNodeIds: string[];
  policyVersion: string;
  nodeSpecDigest: string;
  frozenAt?: string;
  presentation?: {
    name: string;
    glyph: string;
    tint: string;
    builtin: boolean;
    summary: string;
    scene: string;
    maxRetry: number;
    onExhaust: "人工接管" | "降级处理" | "终止任务";
  };
}

export interface TaskSummaryDto {
  taskId: string;
  title: string;
  repositoryRef: string;
  baseBranch: string;
  targetBranch: string;
  state: "created" | "running" | "blocked_unavailable" | "needs_reconcile" | "completed" | "failed" | "cancelled" | "review" | "done" | "idle";
  updatedAt: string;
  workflowId: string;
  diff: { added: number; removed: number; files: number };
  turns: number;
}

export interface AfBootstrapDto {
  contractVersion: "1.0";
  executorMode: ExecutorMode;
  tasks: TaskSummaryDto[];
  workflows: WorkflowDefinitionDto[];
  agentProfiles: AgentProfileSummaryDto[];
  skills: SkillSummaryDto[];
  scmProviders: ScmProviderDto[];
}

export interface CreateTaskInput {
  idempotencyKey: string;
  title: string;
  problem: string;
  repositoryRef: string;
  baseBranch: string;
  targetBranch: string;
  credentialRef: string;
  provider: "github" | "gitlab";
  mcpServerRef: string;
  workflowId: string;
  workflowVersion: number;
  contractDigest: string;
}

export interface WorkflowValidation { valid: boolean; errors: Array<{ code: string; path: string; message: string }>; }
export interface WorkflowVersion { workflowId: string; workflowVersion: number; nodeSpecDigest: string; frozen: boolean; }
export interface PushOperationInput {
  idempotencyKey: string;
  provider: "github" | "gitlab";
  mcpServerRef: string;
  credentialRef: string;
  targetBranch: string;
  sourceRevision: string;
  changeSetDigest: string;
  commitMessage: string;
}

export interface NodeRuntimeDto {
  nodeId: string;
  kind: WorkflowNodeDto["kind"];
  status: "pending" | "running" | "accepted" | "rejected" | "blocked_unavailable" | "awaiting_approval" | "needs_reconcile";
  attemptId?: string;
  inputDigest?: string;
  outputDigest?: string;
  agentProfileRef?: WorkflowNodeDto["agentProfileRef"];
  skillRef?: WorkflowNodeDto["skillRef"];
  executorMode?: ExecutorMode;
  provider?: string;
  model?: string;
  evidenceRefs: string[];
  failureCode?: string;
  reworkTargetNodeId?: string;
}

export interface GateResultDto {
  gateId: string;
  nodeId: string;
  outcome: "pass" | "fail" | "unavailable";
  evaluatorVersion: string;
  threshold?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  failureCode?: string;
  evidenceRef?: string;
}

export interface SkillResultDto {
  nodeId: string;
  skillId: string;
  skillVersion: string;
  status: "completed" | "failed" | "timed_out" | "rejected";
  exitCode?: number;
  durationMs: number;
  evidenceRef: string;
}

export interface GitOperationDto {
  contractVersion: "1.1";
  operationId: string;
  provider: "github" | "gitlab";
  mcpServerRef: string;
  mcpServerVersion?: string;
  mcpCapabilitiesDigest: string;
  repositoryRef: string;
  credentialRef: string;
  baseBranch: string;
  baseRevision: string;
  expectedRemoteRevision: string;
  sourceRevision: string;
  targetBranch: string;
  changeSet: { digest: string; files: Array<{ path: string; action: "create" | "update"; contentDigest: string }> };
  commit: { message: string };
  status: "planned" | "confirmation" | "executing" | "committed" | "failed" | "unknown";
  remoteRevision?: string;
  reconcileQueryRef?: string;
  errorCode?: string;
  errorMessage?: string;
  actor: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DeliverableDto {
  deliverableId: string;
  nodeId: string;
  digest: string;
  mediaType: string;
  version: number;
  status: "current" | "superseded" | "invalidated";
}

export interface TaskDetailDto {
  taskId: string;
  title: string;
  status: TaskSummaryDto["state"];
  executorMode: ExecutorMode;
  repositoryRef: string;
  baseBranch: string;
  baseRevision?: string;
  targetBranch: string;
  workflow: { workflowId: string; workflowVersion: number; nodeSpecDigest: string; frozen: boolean; policyVersion: string };
  currentNodeId?: string;
  nodes: NodeRuntimeDto[];
  gates: GateResultDto[];
  skills: SkillResultDto[];
  gitOperations: GitOperationDto[];
  deliverables: DeliverableDto[];
  updatedAt: string;
}

export interface TrajectoryEventDto {
  eventId: string;
  seq: number;
  eventType: string;
  actor: string;
  nodeId?: string;
  operationId?: string;
  occurredAt: string;
  summary: string;
  evidenceRefs?: string[];
}

export interface AfApiClient {
  readonly mode: "http" | "fixture";
  bootstrap(signal?: AbortSignal): Promise<AfBootstrapDto>;
  listTasks(signal?: AbortSignal): Promise<TaskSummaryDto[]>;
  getTask(taskId: string, signal?: AbortSignal): Promise<TaskDetailDto>;
  validateWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowValidation>;
  saveWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowVersion>;
  createTask(input: CreateTaskInput, signal?: AbortSignal): Promise<{ taskId: string }>;
  startTask(taskId: string, signal?: AbortSignal): Promise<{ taskId: string; status: string }>;
  getTrajectory(taskId: string, signal?: AbortSignal): Promise<TrajectoryEventDto[]>;
  createPushOperation(taskId: string, input: PushOperationInput, signal?: AbortSignal): Promise<GitOperationDto>;
  confirmPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
  getPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
}
