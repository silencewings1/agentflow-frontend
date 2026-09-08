export type ExecutorMode = "fresh-spawn" | "demo-deterministic";
export type RunMode = "real" | "rehearsal-real" | "fault-injection" | "fixture/test-double";
export interface FaultInjectionDto { kind: string; label?: string; appliedAt?: string; }
export type TaskState = "created" | "draft" | "planning" | "awaiting_plan_approval" | "ready" | "queued" | "running" | "blocked_unavailable" | "needs_reconcile" | "compiler_rejected" | "stale" | "awaiting_human" | "completed" | "failed" | "cancelled";

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
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface AfBootstrapDto {
  contractVersion: "1.0";
  executorMode: ExecutorMode;
  runMode?: RunMode;
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
  credentialRef?: string;
  provider?: "github" | "gitlab";
  mcpServerRef?: string;
  workflowId: string;
  workflowVersion: number;
  contractDigest?: string;
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
}

/** Phase 1.7 immutable WorkSpec snapshot and draft input. */
export interface WorkSpecArtifactRefDto { digest: string; mediaType: string; byteLength: number; }
export interface WorkSpecScopeDto { included: string[]; excluded: string[]; }
export interface WorkSpecInputDto { ref: string; description: string; artifactRef?: WorkSpecArtifactRefDto; }
export interface WorkSpecEvidencePolicyDto { evidenceTypes: string[]; minCount: number; retention: string; }
export interface WorkSpecCriterionDto {
  criterionId: string;
  required: boolean;
  description: string;
  verifierId: string;
  verifierVersion: string;
  expected: string;
  evidencePolicy: WorkSpecEvidencePolicyDto;
}
export interface WorkSpecDeliverableSpecDto { deliverableId: string; kind: string; description: string; criterionIds?: string[]; }
export interface WorkSpecRepositoryDto { provider: "github" | "gitlab"; mcpServerRef: string; repositoryRef: string; baseBranch: string; targetBranch: string; credentialRef: string; }
export interface WorkSpecSkillRefDto { skillId: string; skillVersion: string; }
export interface WorkSpecConstraintsDto {
  allowedPaths: string[];
  forbiddenPaths: string[];
  allowedCommands: string[];
  skillRefs?: WorkSpecSkillRefDto[];
  maxNodes: number;
  maxAttempts: number;
  maxWallTimeMs: number;
  workspaceWriteConcurrency: 1;
  externalWrite: { requiresApproval: boolean; allowedBranches: string[]; forbiddenBranches?: string[] };
}
export interface WorkSpecPoliciesDto { policyVersion: string; approval?: string; rework?: string; }
export interface WorkSpecTemplateRefDto { templateId: string; templateVersion: string; }
export interface WorkSpecDto {
  schemaVersion: 1;
  workSpecId: string;
  workSpecRevision: number;
  taskId: string;
  workSpecDigest: string;
  payload?: unknown;
  artifactRef?: WorkSpecArtifactRefDto | null;
  createdAt: string;
  createdBy?: string;
  title?: string;
  objective?: string;
  background?: string;
  scope?: WorkSpecScopeDto;
  inputs?: WorkSpecInputDto[];
  doneCriteria?: WorkSpecCriterionDto[];
  deliverables?: WorkSpecDeliverableSpecDto[];
  repository?: WorkSpecRepositoryDto;
  constraints?: WorkSpecConstraintsDto;
  policies?: WorkSpecPoliciesDto;
  templateRef?: WorkSpecTemplateRefDto;
}
export type WorkSpecDraftInput = Omit<WorkSpecDto, "schemaVersion" | "workSpecId" | "workSpecRevision" | "taskId" | "workSpecDigest" | "createdAt" | "createdBy" | "payload" | "artifactRef"> & { schemaVersion?: 1; payload?: unknown; artifactRef?: WorkSpecArtifactRefDto | null; };

/** Phase 1.7 Supervisor proposal and deterministic compilation facts. */
export interface ProposalDto {
  schemaVersion: 1;
  proposalId: string;
  taskId: string;
  proposalDigest: string;
  status: "proposed" | "modified" | "accepted" | "rejected" | "expired";
  workSpecRevision: number;
  workSpecDigest: string;
  governanceDigest: string;
  payload?: unknown;
  artifactRef?: WorkSpecArtifactRefDto | null;
  createdAt?: string;
  [key: string]: unknown;
}
export interface CompilationCheckDto { checkId: string; version: string; outcome: "pass" | "fail"; actual: string; expected: string; reason: string; evidenceRef?: string; }
export interface CompilationReportDto {
  schemaVersion: 1;
  reportId: string;
  reportDigest: string;
  taskId: string;
  workSpecDigest: string;
  proposalDigest: string;
  outcome: "pass" | "rejected";
  checks: CompilationCheckDto[];
  createdAt: string;
}
export interface PlanSlotBindingDto { slotId: string; nodeId: string; bindingDigest: string; profileRef?: { profileId: string; profileVersion: string }; skillRef?: { skillId: string; skillVersion: string }; gateRef?: { gateId: string; evaluatorVersion: string }; declaredPaths?: string[]; declaredCommands?: string[]; }
export interface PlanCriterionBindingDto { criterionId: string; nodeId: string; verifierId: string; verifierVersion: string; required: boolean; }
export interface PlanDto {
  schemaVersion: 1;
  planRevisionId: string;
  taskId: string;
  planVersion: number;
  planDigest: string;
  workSpecRevision: number;
  workSpecDigest: string;
  proposalRef: string;
  proposalDigest: string;
  status?: "draft" | "ready" | "rejected" | "superseded";
  governanceWorkflowRef?: string;
  governanceDigest?: string;
  frozenWorkflowRef?: string;
  readonlyPlanRef?: string;
  slotBindings?: PlanSlotBindingDto[];
  criterionBindings?: PlanCriterionBindingDto[];
  catalogDigest?: string;
  policyVersion?: string;
  capabilitySnapshotDigest?: string;
  compilationReportRef?: string;
  payload?: unknown;
  artifactRef?: WorkSpecArtifactRefDto | null;
  createdAt: string;
  [key: string]: unknown;
}
export interface CompilePlanInput { proposalId?: string; proposalDigest?: string; [key: string]: unknown; }
export interface CompilePlanResultDto { report: CompilationReportDto; plan: PlanDto | null; readonlyPlan?: unknown; }
export interface PlanDecisionDto {
  schemaVersion: 1;
  factType?: "PlanDecision";
  decisionId: string;
  taskId: string;
  workSpecDigest: string;
  governanceDigest: string;
  proposalDigest: string;
  actor: string;
  decision: "pending" | "approved" | "rejected" | "superseded";
  reason: string;
  createdAt: string;
}
export type PlanDecisionInput = Pick<PlanDecisionDto, "schemaVersion" | "decisionId" | "governanceDigest" | "decision" | "reason"> & Partial<Pick<PlanDecisionDto, "factType" | "proposalDigest" | "workSpecDigest" | "taskId" | "actor" | "createdAt">>;
export interface RunIntentDto {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  planRevisionId: string;
  workSpecDigest: string;
  kind: "start" | "continue" | "reconcile" | "cancel";
  idempotencyKey: string;
  requestedBy: string;
  requestedAt: string;
  status: "queued" | "claimed" | "running" | "yielded" | "completed" | "failed" | "cancelled";
  notBefore?: string;
  leaseGeneration: number;
  lastError?: string;
  lastAdvanceAt?: string;
  createdAt: string;
  updatedAt: string;
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
}
export interface StartResultDto { taskId: string; state: TaskState; terminal?: boolean; steps?: string[]; blockedReason?: string | null; approvableNodeIds?: string[]; revision?: number; runId?: string; accepted?: boolean; }
export interface CriterionAssessmentDto {
  schemaVersion: 1;
  assessmentId: string;
  taskId: string;
  criterionId: string;
  workSpecDigest: string;
  verifierId: string;
  verifierVersion: string;
  expected: string;
  actual: string;
  outcome: "pending" | "pass" | "fail" | "unavailable" | "pending-human";
  attemptId?: string;
  gateId?: string;
  operationId?: string;
  evidenceRefs: string[];
  reason: string;
  actor: string;
  assessedAt: string;
  supersededBy?: string;
}
export type CriterionAssessmentInput = Omit<CriterionAssessmentDto, "taskId" | "workSpecDigest" | "actor" | "assessedAt"> & Partial<Pick<CriterionAssessmentDto, "taskId" | "workSpecDigest" | "actor" | "assessedAt">>;
export interface EvidenceMatrixRowDto { criterionId: string; outcome: string; evidenceRefs: string[]; [key: string]: unknown; }
export interface EvidenceMatrixDto { schemaVersion: 1; matrixId: string; taskId: string; workSpecDigest?: string; rows: EvidenceMatrixRowDto[]; generatedAt: string; }
export type ApprovalDecision = "approved" | "rejected";
export interface NodeApprovalDto { approvalId: string; taskId: string; nodeId: string; decision: "approved"; actor: string; occurredAt: string; createdAt?: string; sourceEventId: string; attemptId?: string | null; inputDigest?: string | null; policyVersion?: string | null; reason?: string; }
export interface GitOperationConfirmationDto { confirmationId: string; taskId: string; operationId: string; decision: "confirmed" | "rejected" | "unknown"; actor: string | null; occurredAt: string; createdAt?: string; status: GitOperationDto["status"]; inputDigest?: string | null; policyVersion?: string | null; reason?: string; }
export interface ApprovalQueryDto { taskId: string; nodeApprovals: NodeApprovalDto[]; gitOperationConfirmations: GitOperationConfirmationDto[]; }
export type TrustedDeliveryEvidenceKind = "task" | "node" | "work-spec" | "proposal" | "plan" | "attempt" | "deliverable" | "gate" | "criterion-assessment" | "approval" | "git-operation" | "task-event";
export interface TrustedDeliveryEvidenceRefDto { evidenceId: string; kind: TrustedDeliveryEvidenceKind; recordId: string; nodeId: string | null; attemptId: string | null; criterionId?: string | null; digest: string | null; operationId: string | null; }
export interface TrustedDeliveryEventDto { eventId: string; revision: number; eventType: string; actor: string; occurredAt: string; payload: unknown; }
export interface TrustedDeliveryDto {
  schemaVersion?: 1;
  taskId: string;
  contractVersion: string;
  workSpecDigest?: string;
  proposalDigest?: string;
  planDigest?: string;
  frozenWorkflow: { workflowId: string; workflowVersion: number; policyVersion: string; nodeSpecDigest: string; frozenAt: string | null };
  acceptedExitNodes: string[];
  acceptedAttempts: AttemptDetailDto[];
  deliverables: AfDeliverableDto[];
  gates: AfGateDetailDto[];
  gitOperations: GitOperationDto[];
  events: Array<TrustedDeliveryEventDto | TrajectoryEventDto>;
  evidenceRefs: TrustedDeliveryEvidenceRefDto[];
  generatedAt: string;
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
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
  runMode?: RunMode;
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
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  executionMeta: { profileId: string | null; profileVersion: string | null; profileDigest: string | null; promptId: string | null; promptVersion: string | null; provider: string | null; model: string | null; toolPolicyVersion: string | null; outputSchemaVersion: string } | null;
  structured?: Record<string, unknown> | null;
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
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
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
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
  provider?: string;
  model?: string;
  evidenceRefs: string[];
  failureCode?: string;
  reworkTargetNodeId?: string;
  requiresApproval?: boolean;
  /** 节点结构化产出（changeSet/gate/test/gitWrite/approval），由真实 detail 的 attempts[].structured 归一化而来，供前端渲染参考站形态。 */
  structured?: Record<string, unknown>;
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
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
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
  attempts?: AttemptDetailDto[];
  rawGates?: AfGateDetailDto[];
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

export interface ApproveResultDto { taskId: string; nodeId: string; state: TaskSummaryDto["state"]; revision: number; }
export interface EvidenceMaterializationDto { evidenceMatrix: EvidenceMatrixDto; trustedDelivery: TrustedDeliveryDto; }

export interface AfApiClient {
  readonly mode: "http" | "fixture";
  bootstrap(signal?: AbortSignal): Promise<AfBootstrapDto>;
  listTasks(signal?: AbortSignal): Promise<TaskSummaryDto[]>;
  getTask(taskId: string, signal?: AbortSignal): Promise<TaskDetailDto>;
  validateWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowValidation>;
  saveWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowVersion>;
  createTask(input: CreateTaskInput, signal?: AbortSignal): Promise<{ taskId: string; summary?: TaskSummaryDto; idempotent?: boolean }>;
  startTask(taskId: string, signal?: AbortSignal, runMode?: RunMode, faultInjection?: FaultInjectionDto): Promise<StartResultDto>;
  continueTask(taskId: string, signal?: AbortSignal, runMode?: RunMode, faultInjection?: FaultInjectionDto): Promise<StartResultDto>;
  approveTaskNode(taskId: string, nodeId: string, signal?: AbortSignal): Promise<ApproveTaskNodeResult>;
  getTrajectory(taskId: string, signal?: AbortSignal): Promise<TrajectoryEventDto[]>;
  listWorkSpecs(taskId: string, signal?: AbortSignal): Promise<WorkSpecDto[]>;
  getWorkSpec(taskId: string, revision?: number, signal?: AbortSignal): Promise<WorkSpecDto>;
  saveWorkSpec(taskId: string, input: WorkSpecDraftInput, signal?: AbortSignal): Promise<WorkSpecDto>;
  requestSupervisor(taskId: string, kind: "intake" | "initial-plan" | "context-brief" | "rework-advice" | "final-summary", input: Record<string, unknown>, signal?: AbortSignal): Promise<{ supervisor: unknown; proposal?: ProposalDto | null; persistenceError?: AfErrorPayload | null }>;
  listProposals(taskId: string, signal?: AbortSignal): Promise<ProposalDto[]>;
  getProposal(taskId: string, proposalId: string, signal?: AbortSignal): Promise<ProposalDto>;
  saveProposal(taskId: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<ProposalDto>;
  compilePlan(taskId: string, input?: CompilePlanInput, signal?: AbortSignal): Promise<CompilePlanResultDto>;
  listCompilationReports(taskId: string, signal?: AbortSignal): Promise<CompilationReportDto[]>;
  listPlans(taskId: string, signal?: AbortSignal): Promise<PlanDto[]>;
  getPlan(taskId: string, planRevisionId: string, signal?: AbortSignal): Promise<PlanDto>;
  savePlan(taskId: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<PlanDto>;
  listPlanDecisions(taskId: string, signal?: AbortSignal): Promise<PlanDecisionDto[]>;
  getPlanDecision(taskId: string, decisionId: string, signal?: AbortSignal): Promise<PlanDecisionDto>;
  savePlanDecision(taskId: string, input: PlanDecisionInput, signal?: AbortSignal): Promise<PlanDecisionDto>;
  listRunIntents(taskId: string, signal?: AbortSignal): Promise<RunIntentDto[]>;
  getRunIntent(taskId: string, runId: string, signal?: AbortSignal): Promise<RunIntentDto>;
  listCriterionAssessments(taskId: string, signal?: AbortSignal): Promise<CriterionAssessmentDto[]>;
  getCriterionAssessment(taskId: string, assessmentId: string, signal?: AbortSignal): Promise<CriterionAssessmentDto>;
  saveCriterionAssessment(taskId: string, input: CriterionAssessmentInput, signal?: AbortSignal): Promise<CriterionAssessmentDto>;
  getEvidenceMatrix(taskId: string, signal?: AbortSignal): Promise<EvidenceMatrixDto>;
  getTrustedDelivery(taskId: string, signal?: AbortSignal): Promise<TrustedDeliveryDto>;
  materializeEvidence(taskId: string, signal?: AbortSignal): Promise<EvidenceMaterializationDto>;
  getApprovals(taskId: string, signal?: AbortSignal): Promise<ApprovalQueryDto>;
  createPushOperation(taskId: string, input: PushOperationInput, signal?: AbortSignal): Promise<GitOperationDto>;
  confirmPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
  getPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
  reconcilePushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
}
