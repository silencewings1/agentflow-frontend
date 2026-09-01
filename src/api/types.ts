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
}

export interface SkillSummaryDto {
  skillId: string;
  skillVersion: string;
  name: string;
  allowedCommands: string[];
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
  state: "running" | "review" | "done" | "failed" | "idle";
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
}

export interface CreateTaskInput {
  idempotencyKey: string;
  title: string;
  problem: string;
  repositoryRef: string;
  baseBranch: string;
  targetBranch: string;
  credentialRef: string;
  workflowId: string;
  workflowVersion: number;
  contractDigest: string;
}

export interface WorkflowValidation { valid: boolean; errors: Array<{ code: string; path: string; message: string }>; }
export interface WorkflowVersion { workflowId: string; workflowVersion: number; nodeSpecDigest: string; frozen: boolean; }
export interface PushOperationInput { targetBranch: string; commitSha: string; idempotencyKey: string; }

export interface AfApiClient {
  readonly mode: "http" | "fixture";
  bootstrap(signal?: AbortSignal): Promise<AfBootstrapDto>;
  listTasks(signal?: AbortSignal): Promise<TaskSummaryDto[]>;
  getTask(taskId: string, signal?: AbortSignal): Promise<unknown>;
  validateWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowValidation>;
  saveWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowVersion>;
  createTask(input: CreateTaskInput, signal?: AbortSignal): Promise<{ taskId: string }>;
  startTask(taskId: string, signal?: AbortSignal): Promise<{ taskId: string; status: string }>;
  getTrajectory(taskId: string, signal?: AbortSignal): Promise<unknown[]>;
  createPushOperation(taskId: string, input: PushOperationInput, signal?: AbortSignal): Promise<unknown>;
  confirmPushOperation(operationId: string, signal?: AbortSignal): Promise<unknown>;
  getPushOperation(operationId: string, signal?: AbortSignal): Promise<unknown>;
}

