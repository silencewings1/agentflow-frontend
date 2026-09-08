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

/* ---------------------------------------------------------------------------
 * 模型供应商目录（GET /model-providers）
 *
 * 只读事实：模型路由由服务端按任务与节点画像决定（af-api 用构造期注入的
 * modelRoute 创建 agent），前端没有逐任务模型覆盖的写入口。因此这里只读取
 * 「服务端配了哪些供应商、默认模型是谁」，用于诚实地展示，不承载任何切换。
 * ------------------------------------------------------------------------- */
export interface ModelInfoDto { id: string; name: string; description?: string; }
export interface ModelProviderInfoDto {
  id: string;
  name: string;
  models: ModelInfoDto[];
  /** 以下字段来自服务端 settings，用于回显；缺失即不渲染。 */
  baseURL?: string;
  api?: string;
  apiKeyEnv?: string;
}
export interface DefaultModelRefDto { provider: string; model: string; }
export interface ModelProvidersDto {
  providers: ModelProviderInfoDto[];
  /** 服务端未配置默认模型时为 null —— 界面必须呈现「未配置」，不得编造。 */
  defaultModel: DefaultModelRefDto | null;
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
  /** 仅表示「从默认列表隐藏」；任务事实、审计与证据仍可查询，不是删除。 */
  archived?: boolean;
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

export interface ClarificationAnswerDto {
  questionId?: string;
  question: string;
  answer: string;
  category?: "external-write" | "authorization" | "acceptance-conflict" | "scope" | "security";
}

export interface RequirementsClarificationInput {
  schemaVersion: 1;
  expectedRevision: number;
  clarificationId: string;
  sourceAttemptId: string;
  answers: ClarificationAnswerDto[];
  reason: string;
  workSpecPatch?: Record<string, unknown>;
}

export interface ClarificationDecisionDto {
  schemaVersion: 1;
  clarificationId: string;
  taskId: string;
  sourceAttemptId: string;
  sourceWorkSpecDigest: string;
  resultingWorkSpecId: string;
  resultingWorkSpecRevision: number;
  resultingWorkSpecDigest: string;
  answers: ClarificationAnswerDto[];
  reason: string;
  actor: string;
  createdAt: string;
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

/* ---------------------------------------------------------------------------
 * Proposal / Plan payload 正文
 *
 * 审批计划只给 digest 等于盲签：治理事实能证明「这份计划没被改过」，但不能证明
 * 「人看懂了要批准什么」。下面这些类型描述服务端 payload 里真正可核验的正文，
 * 让 PlanDecision 从签名变成审阅。字段一律按 AF API 实际返回值建模，缺失即不渲染。
 * ------------------------------------------------------------------------- */
export interface ProfileRef {
  profileId?: string;
  profileVersion?: string;
}
export interface SkillRef {
  skillId?: string;
  skillVersion?: string;
}
export interface GateRef {
  gateId?: string;
  evaluatorVersion?: string;
}
export interface ProposalBudget {
  maxNodes?: number;
  maxAttempts?: number;
  maxWallTimeMs?: number;
}
/** Proposal payload 的槽位绑定：一个槽位描述「谁在什么依赖下产出什么」。 */
export interface ProposalSlotBinding {
  slotId?: string;
  workItems?: string[];
  inputRefs?: string[];
  deliverableExpectation?: string;
  profileRef?: ProfileRef;
  skillRef?: SkillRef;
  gateRef?: GateRef;
  parallelHint?: string[];
}
export interface ProposalPayload {
  schemaVersion?: number;
  proposalId?: string;
  proposalDigest?: string;
  status?: string;
  workSpecRevision?: number;
  workSpecDigest?: string;
  governanceDigest?: string;
  slotBindings?: ProposalSlotBinding[];
  budget?: ProposalBudget;
  risks?: string[];
  evidenceRefs?: string[];
}
/** Plan payload 的槽位绑定：在 Proposal 的基础上把槽位落到具体节点与声明路径。 */
export interface PlanSlotBinding {
  slotId?: string;
  nodeId?: string;
  profileRef?: ProfileRef;
  skillRef?: SkillRef;
  gateRef?: GateRef;
  declaredPaths?: string[];
  declaredCommands?: string[];
  bindingDigest?: string;
}
/** 完成判定到节点的绑定：判定由谁核验、是否必填。 */
export interface CriterionBinding {
  criterionId?: string;
  nodeId?: string;
  verifierId?: string;
  verifierVersion?: string;
  required?: boolean;
}
export interface PlanPayload {
  schemaVersion?: number;
  planRevisionId?: string;
  planVersion?: number;
  taskId?: string;
  workSpecRevision?: number;
  workSpecDigest?: string;
  governanceWorkflowRef?: string;
  governanceDigest?: string;
  proposalRef?: string;
  proposalDigest?: string;
  frozenWorkflowRef?: string;
  readonlyPlanRef?: string;
  slotBindings?: PlanSlotBinding[];
  criterionBindings?: CriterionBinding[];
  catalogDigest?: string;
  policyVersion?: string;
  capabilitySnapshotDigest?: string;
  compilationReportRef?: string;
  createdAt?: string;
  planDigest?: string;
}

/* 归一化只做两件事：确认容器是可解析的对象，丢弃无法核验的字段类型。
   不做补全、不做推断——payload 缺失就返回 null，由调用方呈现诚实的降级态。 */
function asPayloadRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function asPayloadString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function asPayloadNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function asPayloadBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
function asPayloadStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function asPayloadRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asPayloadRecord).filter((item): item is Record<string, unknown> => item !== null) : [];
}
function asProfileRef(value: unknown): ProfileRef | undefined {
  const record = asPayloadRecord(value);
  if (!record) return undefined;
  const profileId = asPayloadString(record.profileId);
  const profileVersion = asPayloadString(record.profileVersion);
  return profileId || profileVersion ? { profileId, profileVersion } : undefined;
}
function asSkillRef(value: unknown): SkillRef | undefined {
  const record = asPayloadRecord(value);
  if (!record) return undefined;
  const skillId = asPayloadString(record.skillId);
  const skillVersion = asPayloadString(record.skillVersion);
  return skillId || skillVersion ? { skillId, skillVersion } : undefined;
}
function asGateRef(value: unknown): GateRef | undefined {
  const record = asPayloadRecord(value);
  if (!record) return undefined;
  const gateId = asPayloadString(record.gateId);
  const evaluatorVersion = asPayloadString(record.evaluatorVersion);
  return gateId || evaluatorVersion ? { gateId, evaluatorVersion } : undefined;
}
function asBudget(value: unknown): ProposalBudget | undefined {
  const record = asPayloadRecord(value);
  if (!record) return undefined;
  const budget: ProposalBudget = {
    maxNodes: asPayloadNumber(record.maxNodes),
    maxAttempts: asPayloadNumber(record.maxAttempts),
    maxWallTimeMs: asPayloadNumber(record.maxWallTimeMs),
  };
  return budget.maxNodes !== undefined || budget.maxAttempts !== undefined || budget.maxWallTimeMs !== undefined ? budget : undefined;
}

/** 解析 Proposal.payload；非对象或缺失返回 null（调用方必须呈现降级态）。 */
export function normalizeProposalPayload(payload: unknown): ProposalPayload | null {
  const record = asPayloadRecord(payload);
  if (!record) return null;
  return {
    schemaVersion: asPayloadNumber(record.schemaVersion),
    proposalId: asPayloadString(record.proposalId),
    proposalDigest: asPayloadString(record.proposalDigest),
    status: asPayloadString(record.status),
    workSpecRevision: asPayloadNumber(record.workSpecRevision),
    workSpecDigest: asPayloadString(record.workSpecDigest),
    governanceDigest: asPayloadString(record.governanceDigest),
    slotBindings: asPayloadRecords(record.slotBindings).map((slot) => ({
      slotId: asPayloadString(slot.slotId),
      workItems: asPayloadStringList(slot.workItems),
      inputRefs: asPayloadStringList(slot.inputRefs),
      deliverableExpectation: asPayloadString(slot.deliverableExpectation),
      profileRef: asProfileRef(slot.profileRef),
      skillRef: asSkillRef(slot.skillRef),
      gateRef: asGateRef(slot.gateRef),
      parallelHint: asPayloadStringList(slot.parallelHint),
    })),
    budget: asBudget(record.budget),
    risks: asPayloadStringList(record.risks),
    evidenceRefs: asPayloadStringList(record.evidenceRefs),
  };
}

/** 解析 Plan.payload；非对象或缺失返回 null（调用方必须呈现降级态）。 */
export function normalizePlanPayload(payload: unknown): PlanPayload | null {
  const record = asPayloadRecord(payload);
  if (!record) return null;
  return {
    schemaVersion: asPayloadNumber(record.schemaVersion),
    planRevisionId: asPayloadString(record.planRevisionId),
    planVersion: asPayloadNumber(record.planVersion),
    taskId: asPayloadString(record.taskId),
    workSpecRevision: asPayloadNumber(record.workSpecRevision),
    workSpecDigest: asPayloadString(record.workSpecDigest),
    governanceWorkflowRef: asPayloadString(record.governanceWorkflowRef),
    governanceDigest: asPayloadString(record.governanceDigest),
    proposalRef: asPayloadString(record.proposalRef),
    proposalDigest: asPayloadString(record.proposalDigest),
    frozenWorkflowRef: asPayloadString(record.frozenWorkflowRef),
    readonlyPlanRef: asPayloadString(record.readonlyPlanRef),
    slotBindings: asPayloadRecords(record.slotBindings).map((slot) => ({
      slotId: asPayloadString(slot.slotId),
      nodeId: asPayloadString(slot.nodeId),
      profileRef: asProfileRef(slot.profileRef),
      skillRef: asSkillRef(slot.skillRef),
      gateRef: asGateRef(slot.gateRef),
      declaredPaths: asPayloadStringList(slot.declaredPaths),
      declaredCommands: asPayloadStringList(slot.declaredCommands),
      bindingDigest: asPayloadString(slot.bindingDigest),
    })),
    criterionBindings: asPayloadRecords(record.criterionBindings).map((criterion) => ({
      criterionId: asPayloadString(criterion.criterionId),
      nodeId: asPayloadString(criterion.nodeId),
      verifierId: asPayloadString(criterion.verifierId),
      verifierVersion: asPayloadString(criterion.verifierVersion),
      required: asPayloadBoolean(criterion.required),
    })),
    catalogDigest: asPayloadString(record.catalogDigest),
    policyVersion: asPayloadString(record.policyVersion),
    capabilitySnapshotDigest: asPayloadString(record.capabilitySnapshotDigest),
    compilationReportRef: asPayloadString(record.compilationReportRef),
    createdAt: asPayloadString(record.createdAt),
    planDigest: asPayloadString(record.planDigest),
  };
}

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
  /** 让出原因（服务端返回）：awaiting_human / awaiting_plan_approval / needs_reconcile / limits_reached 等。 */
  yieldedReason?: string;
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

/** 服务端登记的模型供应商与默认路由（只读）。模型路由由服务端按任务决定，
    前端不得据此改写执行模型，只用于如实展示当前生效的默认模型。 */
export interface ModelInfoDto { id: string; name: string; description?: string; }
export interface ModelProviderInfoDto {
  id: string;
  name: string;
  models: ModelInfoDto[];
  baseURL?: string;
  api?: string;
  apiKeyEnv?: string;
}
export interface ModelProvidersDto {
  providers: ModelProviderInfoDto[];
  defaultModel: { provider: string; model: string } | null;
}
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
  revision: number;
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

/** 任务补丁：真实 `git diff <base> <source>` 文本；available=false 时必须由 reason 说明原因，不得伪造。 */
export interface TaskPatchFileDto { path: string; action: string; patch: string }
export interface TaskPatchDto {
  taskId: string;
  baseRevision: string | null;
  sourceRevision: string | null;
  available: boolean;
  /** 不可用原因；可用时为 null */
  reason: string | null;
  /** patch 为原始 unified diff 文本 */
  files: TaskPatchFileDto[];
}

/* ---------------------------------------------------------------------------
 * Attempt 执行诊断轨迹（交互重构阶段 B2）
 *
 * 与治理事实严格区分：`kind: "diagnostic"` 是一条只读诊断通道，不参与状态机、
 * 门禁、CAS/revision，也不写入 `task_events`。内容来自 DSH 会话日志（模型推理、
 * 工具调用/结果、token 用量），可能缺失、截断或被服务端脱敏。因此下面的归一化
 * 只做「丢弃无法核验的字段」，绝不补造内容，也绝不让对象渲染成 [object Object]。
 * 后端权威定义见 packages/af/af-api/src/dto/trace.ts。
 * ------------------------------------------------------------------------- */
export type TraceUnavailableReason =
  | "session-id-missing"
  | "session-log-not-found"
  | "session-query-unavailable"
  | "session-read-failed";

export interface AttemptTraceUsageDto { inputTokens: number; outputTokens: number; cacheReadTokens: number }

export type TraceEventDto =
  | { seq: number; time: string; type: "assistant-text"; text: string }
  | { seq: number; time: string; type: "tool-call"; callId: string; name: string; argumentsPreview: string }
  | { seq: number; time: string; type: "tool-result"; callId: string; preview: string; isError: boolean }
  | { seq: number; time: string; type: "user-message"; preview: string }
  | { seq: number; time: string; type: "step"; turn: number; step: number };

export interface AttemptTraceDto {
  schemaVersion: 1;
  /** 显式声明：诊断通道，非治理事实。 */
  kind: "diagnostic";
  taskId: string;
  attemptId: string;
  nodeId: string;
  sessionId: string | null;
  available: boolean;
  unavailableReason: TraceUnavailableReason | null;
  capturedThroughSeq: number | null;
  truncated: boolean;
  usage: AttemptTraceUsageDto | null;
  events: TraceEventDto[];
}

const TRACE_UNAVAILABLE_REASONS: readonly TraceUnavailableReason[] = [
  "session-id-missing",
  "session-log-not-found",
  "session-query-unavailable",
  "session-read-failed",
];

function isTraceUnavailableReason(value: unknown): value is TraceUnavailableReason {
  return typeof value === "string" && (TRACE_UNAVAILABLE_REASONS as readonly string[]).includes(value);
}

/* 诊断文本一律收口成字符串：对象/数组直接丢弃，避免渲染出 [object Object] */
function asTraceText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

function asTraceCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asTraceUsage(value: unknown): AttemptTraceUsageDto | null {
  const record = asPayloadRecord(value);
  if (!record) return null;
  return {
    inputTokens: asTraceCount(record.inputTokens) ?? 0,
    outputTokens: asTraceCount(record.outputTokens) ?? 0,
    cacheReadTokens: asTraceCount(record.cacheReadTokens) ?? 0,
  };
}

/* 只接受五种已知事件；未知 type 或缺失关键字段的事件被丢弃，不猜测语义 */
function asTraceEvent(value: unknown): TraceEventDto | null {
  const record = asPayloadRecord(value);
  if (!record) return null;
  const seq = asTraceCount(record.seq);
  if (seq === undefined) return null;
  const time = asTraceText(record.time);
  switch (record.type) {
    case "assistant-text":
      return { seq, time, type: "assistant-text", text: asTraceText(record.text) };
    case "tool-call":
      return { seq, time, type: "tool-call", callId: asTraceText(record.callId), name: asTraceText(record.name), argumentsPreview: asTraceText(record.argumentsPreview) };
    case "tool-result":
      return { seq, time, type: "tool-result", callId: asTraceText(record.callId), preview: asTraceText(record.preview), isError: record.isError === true };
    case "user-message":
      return { seq, time, type: "user-message", preview: asTraceText(record.preview) };
    case "step": {
      const turn = asTraceCount(record.turn);
      const step = asTraceCount(record.step);
      if (turn === undefined || step === undefined) return null;
      return { seq, time, type: "step", turn, step };
    }
    default:
      return null;
  }
}

/**
 * 归一化 AttemptTraceDto；非对象、schemaVersion/kind 不符时返回 null。
 * 不可用时 events 恒为空，缺 reason 时退化为 `session-read-failed`（读不到就是读不到）。
 */
export function normalizeAttemptTrace(value: unknown): AttemptTraceDto | null {
  const record = asPayloadRecord(value);
  if (!record) return null;
  if (record.schemaVersion !== 1 || record.kind !== "diagnostic") return null;
  const available = record.available === true;
  const unavailableReason: TraceUnavailableReason | null = available
    ? null
    : (isTraceUnavailableReason(record.unavailableReason) ? record.unavailableReason : "session-read-failed");
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : null;
  const capturedThroughSeq = asTraceCount(record.capturedThroughSeq);
  return {
    schemaVersion: 1,
    kind: "diagnostic",
    taskId: asTraceText(record.taskId),
    attemptId: asTraceText(record.attemptId),
    nodeId: asTraceText(record.nodeId),
    sessionId,
    available,
    unavailableReason,
    capturedThroughSeq: capturedThroughSeq === undefined ? null : capturedThroughSeq,
    truncated: record.truncated === true,
    usage: available ? asTraceUsage(record.usage) : null,
    events: available ? (Array.isArray(record.events) ? record.events.map(asTraceEvent).filter((event): event is TraceEventDto => event !== null) : []) : [],
  };
}

export interface ApproveResultDto { taskId: string; nodeId: string; state: TaskSummaryDto["state"]; revision: number; }
export interface EvidenceMaterializationDto { evidenceMatrix: EvidenceMatrixDto; trustedDelivery: TrustedDeliveryDto; }

export interface AfApiClient {
  readonly mode: "http" | "fixture";
  bootstrap(signal?: AbortSignal): Promise<AfBootstrapDto>;
  /** 只读模型供应商目录：模型路由由服务端决定，前端不提供逐任务覆盖。 */
  listModelProviders(signal?: AbortSignal): Promise<ModelProvidersDto>;
  listTasks(signal?: AbortSignal): Promise<TaskSummaryDto[]>;
  getTask(taskId: string, signal?: AbortSignal): Promise<TaskDetailDto>;
  validateWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowValidation>;
  saveWorkflow(workflow: WorkflowDefinitionDto, signal?: AbortSignal): Promise<WorkflowVersion>;
  createTask(input: CreateTaskInput, signal?: AbortSignal): Promise<{ taskId: string; summary?: TaskSummaryDto; idempotent?: boolean }>;
  startTask(taskId: string, signal?: AbortSignal, runMode?: RunMode, faultInjection?: FaultInjectionDto): Promise<StartResultDto>;
  continueTask(taskId: string, signal?: AbortSignal, runMode?: RunMode, faultInjection?: FaultInjectionDto): Promise<StartResultDto>;
  /** 终止非终态任务：取消其活动 RunIntent 并释放租约，任务状态置为 cancelled。 */
  cancelTask(taskId: string, signal?: AbortSignal): Promise<TaskSummaryDto>;
  /** 仅改变「是否从默认列表隐藏」；不删除任何事实、审计或证据。 */
  setTaskArchived(taskId: string, archived: boolean, signal?: AbortSignal): Promise<TaskSummaryDto>;
  approveTaskNode(taskId: string, nodeId: string, signal?: AbortSignal): Promise<ApproveTaskNodeResult>;
  getTrajectory(taskId: string, signal?: AbortSignal): Promise<TrajectoryEventDto[]>;
  getTaskPatch(taskId: string, signal?: AbortSignal): Promise<TaskPatchDto>;
  /** 单个 attempt 的模型执行诊断轨迹（只读诊断，非治理事实）。 */
  getAttemptTrace(taskId: string, attemptId: string, window?: number, signal?: AbortSignal): Promise<AttemptTraceDto>;
  listWorkSpecs(taskId: string, signal?: AbortSignal): Promise<WorkSpecDto[]>;
  getWorkSpec(taskId: string, revision?: number, signal?: AbortSignal): Promise<WorkSpecDto>;
  saveWorkSpec(taskId: string, input: WorkSpecDraftInput, signal?: AbortSignal): Promise<WorkSpecDto>;
  applyRequirementsClarification(taskId: string, input: RequirementsClarificationInput, signal?: AbortSignal): Promise<ClarificationDecisionDto>;
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
  /** 读取服务端登记的模型供应商与默认模型（只读；模型路由由服务端决定）。 */
  listModelProviders(signal?: AbortSignal): Promise<ModelProvidersDto>;
  createPushOperation(taskId: string, input: PushOperationInput, signal?: AbortSignal): Promise<GitOperationDto>;
  confirmPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
  getPushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
  reconcilePushOperation(operationId: string, signal?: AbortSignal): Promise<GitOperationDto>;
}
