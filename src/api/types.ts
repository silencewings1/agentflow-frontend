export type ExecutorMode = "fresh-spawn" | "demo-deterministic";
export type TaskState = "created" | "running" | "blocked_unavailable" | "needs_reconcile" | "awaiting_human" | "completed" | "failed" | "cancelled";

export interface AfErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface AfSuccess<T> { ok: true; data: T; }
export interface AfFailure { ok: false; error: AfErrorPayload; }
export type AfResponse<T> = AfSuccess<T> | AfFailure;

/** W0 AgentProfile 公共 DTO。 */
export interface AgentProfileDto {
  contractVersion: "1.0";
  profileId: string;
  profileVersion: string;
  name: string;
  responsibilities: string[];
  nonResponsibilities: string[];
  promptRef: { promptId: string; promptVersion: string };
  modelPolicy: { provider: string; model: string; allowRuntimeSwitch: false };
  toolPolicy: { version: string; allow: string[]; deny: string[] };
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  independent: boolean;
  profileDigest: string;
}

/** UI 只读投影；只在 api/mappers.ts 从 AgentProfileDto 生成。 */
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

/** W0 SkillManifest 公共 DTO。 */
export interface SkillManifestDto {
  contractVersion: "1.0";
  skillId: string;
  skillVersion: string;
  name: string;
  allowedCommands: string[];
  workingDirectoryPolicy: string;
  timeoutMs: number;
  writesEvidence: true;
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
  mcpCapabilitiesDigest?: string;
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
  provider: "github" | "gitlab";
  mcpServerRef: string;
  state: TaskState;
  blockedReason: string | null;
  workflowId: string;
  workflowVersion: number;
  nodeSpecDigest: string;
  executorMode: ExecutorMode | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface AfBootstrapDto {
  contractVersion: "1.0";
  executorMode: ExecutorMode;
  tasks: TaskSummaryDto[];
  workflows: WorkflowDefinitionDto[];
  agentProfiles: AgentProfileDto[];
  skills: SkillManifestDto[];
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

export interface WorkflowValidationIssue { code: string; path: string; message: string; nodeId?: string; edgeId?: string; relatedNodeIds?: string[]; }
export interface WorkflowValidation {
  valid: boolean;
  errors: WorkflowValidationIssue[];
  warnings?: WorkflowValidationIssue[];
  analysis?: {
    topologicalOrder: string[];
    topologicalStages: string[][];
    parallelGroups: Array<{ forkNodeId: string; mergeNodeId: string | null; branchNodeIds: string[][] }>;
    mergeNodeIds: string[];
    entryNodeIds: string[];
    exitNodeIds: string[];
    frozen: boolean;
  };
}
export interface WorkflowVersion { workflowId: string; workflowVersion: number; nodeSpecDigest: string; frozen: boolean; frozenAt?: string; }
export interface ApproveTaskNodeResult { taskId: string; nodeId: string; state: TaskState; revision: number; }
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

export interface GitOperationDto {
  contractVersion: "1.1";
  operationId: string;
  idempotencyKey: string;
  taskId: string;
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
  executorMode?: ExecutorMode;
  createdAt: string;
  updatedAt?: string;
}

export interface AfNodeDetailDto {
  nodeId: string;
  kind: WorkflowNodeDto["kind"];
  status: "pending" | "running" | "accepted" | "rejected" | "blocked" | "invalidated" | "awaiting_approval";
  requiredUpstream: string[];
  optionalUpstream: string[];
  inputRefs: string[];
  requiresApproval: boolean;
  failTarget: string | null;
  outputSchemaVersion: string;
  maxAttempts: number;
  onExhaust: "human-takeover" | "degrade" | "terminate";
  agentProfileRef: WorkflowNodeDto["agentProfileRef"] | null;
  actualProfile: { profileId: string | null; profileVersion: string | null; profileDigest: string | null } | null;
  skillRef: WorkflowNodeDto["skillRef"] | null;
  gatePolicy: { gateId: string; evaluatorVersion: string } | null;
  currentAttemptId: string | null;
  acceptedAttemptId: string | null;
  acceptedDeliverableId: string | null;
  attemptOrdinal: number;
  lastOutcome: "pass" | "fail" | "unavailable" | null;
  lastFailureCode: string | null;
}

export interface AttemptDetailDto {
  attemptId: string;
  nodeId: string;
  ordinal: number;
  status: string;
  inputDigest: string | null;
  outputDigest: string | null;
  sessionId: string | null;
  stopReason: string | null;
  executorMode: ExecutorMode | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  executionMeta: { profileId: string | null; profileVersion: string | null; profileDigest: string | null; promptId: string | null; promptVersion: string | null; provider: string | null; model: string | null; toolPolicyVersion: string | null; outputSchemaVersion: string } | null;
}

export interface AfGateDetailDto {
  gateId: string;
  nodeId: string;
  attemptId: string;
  gateType: string;
  outcome: "pass" | "fail" | "unavailable";
  inputDigest: string;
  evaluatorVersion: string;
  threshold: Record<string, unknown>;
  actual: Record<string, unknown>;
  failureCode: string | null;
  evidenceRef: string;
  artifactDigest?: string | null;
  createdAt: string;
}

export interface AfDeliverableDto {
  deliverableId: string;
  nodeId: string;
  attemptId: string;
  digest: string;
  mediaType: string;
  schemaVersion: string;
  status: "current" | "superseded" | "invalidated";
  byteLength: number;
  createdAt: string;
}

export interface PreparedDeliveryRefDto {
  sourceRevision: string;
  targetBranch: string;
  changeSet: {
    digest: string;
    files: Array<{ path: string; action: "create" | "update"; contentDigest: string }>;
  };
}

/** W0.2 TaskDetail 公共 DTO。 */
export interface AfTaskDetailDto {
  taskId: string;
  title: string;
  repositoryRef: string;
  baseBranch: string;
  baseRevision: string | null;
  targetBranch: string;
  provider: "github" | "gitlab";
  mcpServerRef: string;
  state: TaskState;
  blockedReason: string | null;
  workflowId: string;
  workflowVersion: number;
  contractDigest: string;
  nodeSpecDigest: string;
  policyVersion: string;
  executorMode: ExecutorMode | null;
  createdAt: string;
  updatedAt: string;
  nodes: AfNodeDetailDto[];
  attempts: AttemptDetailDto[];
  gates: AfGateDetailDto[];
  deliverables: AfDeliverableDto[];
  preparedDelivery: PreparedDeliveryRefDto | null;
  gitOperations: GitOperationDto[];
  revision: number;
}

/** 以下类型均为 UI view model，只能由 api/mappers.ts 产生。 */
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
  threshold: Record<string, unknown>;
  actual: Record<string, unknown>;
  failureCode?: string;
  evidenceRef: string;
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

export interface DeliverableDto {
  deliverableId: string;
  nodeId: string;
  digest: string;
  mediaType: string;
  schemaVersion: string;
  status: "current" | "superseded" | "invalidated";
}

export interface TaskDetailDto {
  taskId: string;
  title: string;
  status: TaskState;
  executorMode: ExecutorMode | null;
  repositoryRef: string;
  baseBranch: string;
  baseRevision?: string;
  targetBranch: string;
  provider: "github" | "gitlab";
  mcpServerRef: string;
  contractDigest: string;
  workflow: { workflowId: string; workflowVersion: number; nodeSpecDigest: string; frozen: boolean; policyVersion: string };
  currentNodeId?: string;
  nodes: NodeRuntimeDto[];
  gates: GateResultDto[];
  skills: SkillResultDto[];
  preparedDelivery: PreparedDeliveryRefDto | null;
  gitOperations: GitOperationDto[];
  deliverables: DeliverableDto[];
  updatedAt: string;
}

export interface AfTrajectoryEventDto { eventId: string; revision: number; eventType: string; actor: string; occurredAt: string; payload: unknown; }
export interface AfTrajectoryDto { taskId: string; events: AfTrajectoryEventDto[]; }
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
  startTask(taskId: string, signal?: AbortSignal): Promise<{ taskId: string; state: TaskState }>;
  approveTaskNode(taskId: string, nodeId: string, signal?: AbortSignal): Promise<ApproveTaskNodeResult>;
  getTrajectory(taskId: string, signal?: AbortSignal): Promise<TrajectoryEventDto[]>;
  createPushOperation(taskId: string, input: PushOperationInput, signal?: AbortSignal): Promise<GitOperationDto>;
  confirmPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
  getPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
  reconcilePushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
}
