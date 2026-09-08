import { sessions } from "../data/mock";
import { workflowTemplates } from "../data/workflows";
import { toTaskDetail, toTrajectory, toWorkflowDto } from "./mappers";
import type {
  AfApiClient,
  AfBootstrapDto,
  AfErrorPayload,
  AfResponse,
  AfTaskDetailDto,
  AfTrajectoryDto,
  ApprovalQueryDto,
  ClarificationDecisionDto,
  CompilePlanInput,
  CompilePlanResultDto,
  CompilationReportDto,
  CriterionAssessmentDto,
  CriterionAssessmentInput,
  EvidenceMatrixDto,
  EvidenceMaterializationDto,
  CreateTaskInput,
  GitOperationDto,
  PlanDecisionDto,
  PlanDecisionInput,
  PlanDto,
  ProposalDto,
  PushOperationInput,
  RunIntentDto,
  RequirementsClarificationInput,
  StartResultDto,
  TaskDetailDto,
  TaskPatchDto,
  TaskSummaryDto,
  TrajectoryEventDto,
  TrustedDeliveryDto,
  WorkSpecDto,
  WorkSpecDraftInput,
  WorkflowDefinitionDto,
  WorkflowValidation,
  WorkflowVersion,
} from "./types";

const FIXTURE_TIME = "2026-09-02T08:00:00.000Z";
const FIXTURE_DIGEST = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function taskState(state: import("../data/mock").SessionState): TaskSummaryDto["state"] {
  if (state === "done") return "completed";
  if (state === "failed") return "failed";
  if (state === "idle") return "created";
  if (state === "review") return "awaiting_human";
  return "running";
}

function fixtureTaskSummary(task: import("../data/mock").Session): TaskSummaryDto {
  return {
    taskId: task.id,
    title: task.title,
    repositoryRef: task.repo,
    baseBranch: "main",
    targetBranch: task.branch,
    provider: "github",
    mcpServerRef: "github-official",
    state: taskState(task.state),
    blockedReason: null,
    workflowId: task.workflow,
    workflowVersion: 1,
    nodeSpecDigest: FIXTURE_DIGEST,
    executorMode: "demo-deterministic",
    runMode: "fixture/test-double",
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    revision: 1,
  };
}

function requestKey(prefix: string, value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) hash = Math.imul(hash ^ json.charCodeAt(index), 16777619);
  return `${prefix}:${(hash >>> 0).toString(16)}`;
}

const profiles = [
  ["requirements-analyst", "需求分析智能体", false, "af.agent.requirements.v1"],
  ["solution-architect", "方案设计智能体", false, "af.agent.solution-architect.v1"],
  ["implementation-agent", "代码实现智能体", false, "af.agent.implementation.v1"],
  ["test-analyst", "测试分析智能体", false, "af.agent.test-analyst.v1"],
  ["independent-reviewer", "独立审查智能体", true, "af.agent.independent-review.v1"],
] as const;

const profilePolicy = {
  "requirements-analyst": { responsibilities: ["澄清范围、假设与可验证验收条件"], nonResponsibilities: ["不修改代码、不批准外部写入"], tools: ["workspace.read", "git.read", "artifact.read", "shell.readonly"], output: "RequirementsDeliverable@1" },
  "solution-architect": { responsibilities: ["形成最小方案、接口影响、测试与回滚策略"], nonResponsibilities: ["不修改代码、不代替独立审查"], tools: ["workspace.read", "git.read", "artifact.read", "shell.readonly"], output: "SolutionDesignDeliverable@1" },
  "implementation-agent": { responsibilities: ["在隔离工作区实施声明范围内的变更"], nonResponsibilities: ["不 push/merge/release，不宣布门禁通过"], tools: ["workspace.read", "workspace.write", "git.read", "shell.declared", "artifact.read"], output: "ImplementationDeliverable@1" },
  "test-analyst": { responsibilities: ["解释真实 Skill 结果、覆盖范围和复测建议"], nonResponsibilities: ["不伪造或直接执行测试命令"], tools: ["workspace.read", "git.read", "artifact.read", "shell.readonly"], output: "TestAnalysisDeliverable@1" },
  "independent-reviewer": { responsibilities: ["在独立上下文核对 diff、范围、测试和安全证据"], nonResponsibilities: ["不修改文件、不生成 commit、不批准 SCM 写入"], tools: ["workspace.read", "git.read", "artifact.read", "shell.readonly"], output: "ReviewDeliverable@1" },
} as const;

const skills = [
  ["run-unit-tests", "单元测试"],
  ["run-integration-tests", "集成测试"],
  ["run-lint", "Lint"],
  ["run-build", "Build"],
  ["review-diff", "审查 Diff"],
] as const;

function standardCodeChangeWorkflow(): WorkflowDefinitionDto {
  const retry = { maxAttempts: 2, onExhaust: "human-takeover" as const };
  return {
    contractVersion: "1.0",
    workflowId: "standard-code-change",
    workflowVersion: 1,
    nodes: [
      { nodeId: "requirements", kind: "ai", agentProfileRef: { profileId: "requirements-analyst", profileVersion: "1.0.0" }, inputRefs: [], outputSchemaVersion: "RequirementsDeliverable@1", timeoutMs: 300000, retryPolicy: retry, gatePolicy: { gateId: "requirements-contract-v1", evaluatorVersion: "1.0.0" } },
      { nodeId: "design", kind: "ai", agentProfileRef: { profileId: "solution-architect", profileVersion: "1.0.0" }, inputRefs: ["requirements"], outputSchemaVersion: "SolutionDesignDeliverable@1", timeoutMs: 300000, retryPolicy: retry, gatePolicy: { gateId: "solution-design-v1", evaluatorVersion: "1.0.0" } },
      { nodeId: "implementation", kind: "ai", agentProfileRef: { profileId: "implementation-agent", profileVersion: "1.0.0" }, inputRefs: ["requirements", "design"], outputSchemaVersion: "ImplementationDeliverable@1", timeoutMs: 900000, retryPolicy: { maxAttempts: 3, onExhaust: "human-takeover" }, declaredPaths: ["src/**", "test/**", "docs/**"] },
      { nodeId: "unit-tests", kind: "skill", skillRef: { skillId: "run-unit-tests", skillVersion: "1.0.0" }, inputRefs: ["implementation"], outputSchemaVersion: "SkillResult@1.0", timeoutMs: 600000, retryPolicy: { maxAttempts: 1, onExhaust: "terminate" } },
      { nodeId: "integration-tests", kind: "skill", skillRef: { skillId: "run-integration-tests", skillVersion: "1.0.0" }, inputRefs: ["implementation"], outputSchemaVersion: "SkillResult@1.0", timeoutMs: 900000, retryPolicy: { maxAttempts: 1, onExhaust: "terminate" } },
      { nodeId: "test-merge", kind: "gate", inputRefs: ["unit-tests", "integration-tests"], outputSchemaVersion: "GateResult@1", timeoutMs: 60000, retryPolicy: { maxAttempts: 1, onExhaust: "human-takeover" }, gatePolicy: { gateId: "test-analysis-v1", evaluatorVersion: "1.0.0" } },
      { nodeId: "review", kind: "ai", agentProfileRef: { profileId: "independent-reviewer", profileVersion: "1.0.0" }, inputRefs: ["test-merge"], outputSchemaVersion: "ReviewDeliverable@1", timeoutMs: 300000, retryPolicy: retry, gatePolicy: { gateId: "independent-review-v1", evaluatorVersion: "1.0.0" } },
      { nodeId: "prepare-change-set", kind: "git", inputRefs: ["implementation", "review"], outputSchemaVersion: "GitOperation@1.1", timeoutMs: 120000, retryPolicy: { maxAttempts: 1, onExhaust: "human-takeover" } },
      { nodeId: "publish-via-mcp", kind: "git", inputRefs: ["prepare-change-set"], outputSchemaVersion: "GitOperation@1.1", timeoutMs: 120000, retryPolicy: { maxAttempts: 1, onExhaust: "human-takeover" } },
    ],
    edges: [
      { edgeId: "e1", from: "requirements", to: "design", kind: "flow", required: true },
      { edgeId: "e2", from: "design", to: "implementation", kind: "flow", required: true },
      { edgeId: "e3", from: "implementation", to: "unit-tests", kind: "flow", required: true },
      { edgeId: "e4", from: "implementation", to: "integration-tests", kind: "flow", required: true },
      { edgeId: "e5", from: "unit-tests", to: "test-merge", kind: "flow", required: true },
      { edgeId: "e6", from: "integration-tests", to: "test-merge", kind: "flow", required: true },
      { edgeId: "e7", from: "test-merge", to: "review", kind: "flow", required: true },
      { edgeId: "e8", from: "review", to: "prepare-change-set", kind: "flow", required: true },
      { edgeId: "e9", from: "prepare-change-set", to: "publish-via-mcp", kind: "approve", required: true },
      { edgeId: "fail-tests", from: "test-merge", to: "implementation", kind: "fail", label: "定向返工", required: false },
    ],
    entryNodeIds: ["requirements"],
    exitNodeIds: ["publish-via-mcp"],
    policyVersion: "1.0.0",
    nodeSpecDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    presentation: { name: "标准代码变更", glyph: "Nodes", tint: "accent", builtin: true, summary: "需求与方案 → 实现 → 单元/集成并行 → 汇合门禁 → 独立审查 → source change set → MCP 确认写入", scene: "阶段 1.6 可信代码交付", maxRetry: 2, onExhaust: "人工接管" },
  };
}

function fixtureBootstrap(tasks: TaskSummaryDto[] = sessions.map(fixtureTaskSummary)): AfBootstrapDto {
  return {
    contractVersion: "1.0",
    executorMode: "demo-deterministic",
    runMode: "fixture/test-double",
    tasks,
    workflows: [standardCodeChangeWorkflow(), ...workflowTemplates.map(toWorkflowDto)],
    agentProfiles: profiles.map(([profileId, name, independent, promptId]) => ({
      contractVersion: "1.0",
      profileId,
      profileVersion: "1.0.0",
      name,
      independent,
      promptRef: { promptId, promptVersion: "1.0.0" },
      responsibilities: [...profilePolicy[profileId].responsibilities],
      nonResponsibilities: [...profilePolicy[profileId].nonResponsibilities],
      modelPolicy: { provider: "task-default", model: "task-default", allowRuntimeSwitch: false },
      toolPolicy: { version: "1.0.0", allow: [...profilePolicy[profileId].tools], deny: ["git.push", "git.merge", "release.publish"] },
      inputSchemaVersion: "AcceptedUpstreamDeliverables@1",
      outputSchemaVersion: profilePolicy[profileId].output,
      profileDigest: FIXTURE_DIGEST,
    })),
    skills: skills.map(([skillId, name]) => ({
      contractVersion: "1.0",
      skillId,
      skillVersion: "1.0.0",
      name,
      allowedCommands: [skillId],
      workingDirectoryPolicy: "workspace-relative-existing-directory-no-symlink-escape",
      timeoutMs: 600_000,
      writesEvidence: true,
      outputSchemaVersion: "SkillResult@1",
    })),
    scmProviders: [
      {
        provider: "github",
        mcpServerRef: "github-official",
        credentialRef: "GITHUB_AGENTFLOW_TOKEN",
        available: true,
        serverVersion: "hosted",
        mcpCapabilitiesDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        tools: ["get_file_contents", "list_branches", "get_commit", "create_branch", "push_files"],
        allowedRepositoryNamespaces: ["demo-org"],
      },
      {
        provider: "gitlab",
        mcpServerRef: "gitlab-development",
        credentialRef: "GITLAB_AGENTFLOW_TOKEN",
        available: false,
        serverVersion: "2.1.56",
        tools: ["get_file_contents", "get_branch", "get_commit", "create_branch", "push_files"],
        allowedRepositoryNamespaces: ["demo-group"],
        errorCode: "AF_CREDENTIAL_REF_INVALID",
        errorMessage: "fixture 环境未配置自托管 GitLab 测试凭据",
      },
    ],
  };
}

function fixtureDetail(task: TaskSummaryDto, bootstrap: AfBootstrapDto): TaskDetailDto {
  const workflow = bootstrap.workflows.find((item) => item.workflowId === task.workflowId) ?? bootstrap.workflows[0]!;
  const def = workflow;
  const terminal = task.state === "completed";
  const failed = task.state === "failed";
  const review = task.state === "awaiting_human";
  const created = task.state === "created";
  const activeIndex = created ? -1 : failed ? Math.min(2, def.nodes.length - 1) : review ? def.nodes.length - 1 : Math.min(1, def.nodes.length - 1);
  const nodes = def.nodes.map((node, index) => ({
    nodeId: node.nodeId,
    kind: node.kind,
    status: (terminal || index < activeIndex ? "accepted" : index === activeIndex ? failed ? "rejected" : review && node.kind === "git" ? "awaiting_approval" : "running" : "pending") as TaskDetailDto["nodes"][number]["status"],
    ...(index <= activeIndex ? { attemptId: `${task.taskId}.${node.nodeId}.r1`, inputDigest: FIXTURE_DIGEST, executorMode: "demo-deterministic" as const } : {}),
    ...(node.agentProfileRef ? { agentProfileRef: node.agentProfileRef, provider: "fixture", model: "fixture-deterministic" } : {}),
    ...(node.skillRef ? { skillRef: node.skillRef } : {}),
    evidenceRefs: index <= activeIndex ? [`evidence://fixture/${task.taskId}/${node.nodeId}`] : [],
    ...(failed && index === activeIndex ? { failureCode: "FIXTURE_INTEGRATION_TEST_FAILED", reworkTargetNodeId: def.nodes[Math.max(0, index - 1)]?.nodeId } : {}),
  }));
  const gitOperations: GitOperationDto[] = review || terminal ? [{
    contractVersion: "1.1",
    operationId: `${task.taskId}.git.publish.r1`,
    idempotencyKey: `${task.taskId}:git:publish:1`,
    taskId: task.taskId,
    provider: "github",
    mcpServerRef: "github-official",
    mcpServerVersion: "hosted",
    mcpCapabilitiesDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    repositoryRef: task.repositoryRef,
    credentialRef: "GITHUB_AGENTFLOW_TOKEN",
    baseBranch: "main",
    baseRevision: "1111111111111111111111111111111111111111",
    expectedRemoteRevision: "1111111111111111111111111111111111111111",
    sourceRevision: "2222222222222222222222222222222222222222",
    targetBranch: task.targetBranch,
    changeSet: { digest: FIXTURE_DIGEST, files: [{ path: "src/example.ts", action: "update", contentDigest: FIXTURE_DIGEST }] },
    commit: { message: "feat: fixture controlled delivery" },
    status: terminal ? "committed" : "confirmation",
    ...(terminal ? { remoteRevision: "3333333333333333333333333333333333333333" } : {}),
    actor: "fixture-user",
    createdAt: "2026-09-02T08:00:00.000Z",
  }] : [];
  const currentNodeId = nodes.find((node) => node.status === "running" || node.status === "rejected" || node.status === "awaiting_approval")?.nodeId;
  return {
    taskId: task.taskId,
    title: task.title,
    status: task.state,
    executorMode: "demo-deterministic",
    runMode: "fixture/test-double",
    repositoryRef: task.repositoryRef,
    baseBranch: "main",
    baseRevision: "1111111111111111111111111111111111111111",
    targetBranch: task.targetBranch,
    provider: task.provider,
    mcpServerRef: task.mcpServerRef,
    contractDigest: FIXTURE_DIGEST,
    workflow: { workflowId: workflow.workflowId, workflowVersion: workflow.workflowVersion, nodeSpecDigest: workflow.nodeSpecDigest, frozen: true, policyVersion: workflow.policyVersion },
    ...(currentNodeId ? { currentNodeId } : {}),
    nodes,
    gates: nodes.filter((node) => node.status === "accepted" || node.status === "rejected").map((node) => ({ gateId: `${node.nodeId}.gate`, nodeId: node.nodeId, outcome: node.status === "rejected" ? "fail" as const : "pass" as const, evaluatorVersion: "fixture-1.0.0", threshold: { passed: 1 }, actual: { passed: node.status === "rejected" ? 0 : 1 }, ...(node.status === "rejected" ? { failureCode: node.failureCode } : {}), evidenceRef: node.evidenceRefs[0] ?? `evidence://fixture/${task.taskId}/${node.nodeId}` })),
    skills: nodes.filter((node) => node.skillRef && node.status !== "pending").map((node) => ({ nodeId: node.nodeId, skillId: node.skillRef!.skillId, skillVersion: node.skillRef!.skillVersion, status: node.status === "rejected" ? "failed" as const : "completed" as const, exitCode: node.status === "rejected" ? 1 : 0, durationMs: 1380, evidenceRef: node.evidenceRefs[0]! })),
    preparedDelivery: null,
    gitOperations,
    deliverables: nodes.filter((node) => node.status === "accepted").map((node, index) => ({ deliverableId: `${task.taskId}.${node.nodeId}.d1`, nodeId: node.nodeId, digest: FIXTURE_DIGEST, mediaType: "application/json", schemaVersion: "FixtureDeliverable@1", status: index === 0 && failed ? "superseded" as const : "current" as const })),
    updatedAt: task.updatedAt,
    revision: task.revision,
  };
}

function fixtureTrajectory(detail: TaskDetailDto): TrajectoryEventDto[] {
  return detail.nodes.filter((node) => node.status !== "pending").map((node, index) => ({
    eventId: `${detail.taskId}.event.${index + 1}`,
    seq: index + 1,
    eventType: `node.${node.status}`,
    actor: node.agentProfileRef?.profileId ?? node.skillRef?.skillId ?? "af-control-plane",
    nodeId: node.nodeId,
    occurredAt: "2026-09-02T08:00:00.000Z",
    summary: `${node.nodeId} · ${node.status}`,
    evidenceRefs: node.evidenceRefs,
  }));
}

function validateWorkflowDto(workflow: WorkflowDefinitionDto): WorkflowValidation {
  const errors: WorkflowValidation["errors"] = [];
  const nodes = new Set(workflow.nodes.map((node) => node.nodeId));
  const progression = workflow.edges.filter((edge) => edge.kind !== "fail");
  workflow.nodes.forEach((node, index) => {
    if (workflow.nodes.findIndex((candidate) => candidate.nodeId === node.nodeId) !== index) errors.push({ code: "DUPLICATE_NODE", path: `nodes[${index}]`, message: `节点 ID 重复：${node.nodeId}` });
    if (node.kind === "ai" && !node.agentProfileRef) errors.push({ code: "AGENT_PROFILE_REQUIRED", path: `nodes[${index}].agentProfileRef`, message: `AI 节点 ${node.nodeId} 必须绑定版本化 Profile` });
    if (node.kind === "skill" && !node.skillRef) errors.push({ code: "SKILL_REF_REQUIRED", path: `nodes[${index}].skillRef`, message: `Skill 节点 ${node.nodeId} 必须绑定版本化 Skill` });
  });
  workflow.edges.forEach((edge, index) => {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) errors.push({ code: "EDGE_ENDPOINT_MISSING", path: `edges[${index}]`, message: "边引用了不存在的节点" });
    if (edge.from === edge.to) errors.push({ code: "SELF_EDGE", path: `edges[${index}]`, message: "节点不能连接到自身" });
    if (workflow.edges.findIndex((candidate) => candidate.kind === edge.kind && candidate.from === edge.from && candidate.to === edge.to) !== index) errors.push({ code: "DUPLICATE_EDGE", path: `edges[${index}]`, message: "存在重复边" });
  });
  const entries = workflow.nodes.filter((node) => !progression.some((edge) => edge.to === node.nodeId));
  if (entries.length !== 1) errors.push({ code: "ILLEGAL_ENTRY", path: "entryNodeIds", message: `必须有且仅有一个入口，当前为 ${entries.length} 个` });
  const reached = new Set<string>();
  const queue = entries.map((node) => node.nodeId);
  while (queue.length) {
    const id = queue.shift()!;
    if (reached.has(id)) continue;
    reached.add(id);
    progression.filter((edge) => edge.from === id).forEach((edge) => queue.push(edge.to));
  }
  workflow.nodes.filter((node) => !reached.has(node.nodeId)).forEach((node) => errors.push({ code: "UNREACHABLE_NODE", path: `nodes.${node.nodeId}`, message: `节点不可达：${node.nodeId}` }));
  const indegree = new Map(workflow.nodes.map((node) => [node.nodeId, 0]));
  progression.forEach((edge) => indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1));
  const topo = workflow.nodes.filter((node) => indegree.get(node.nodeId) === 0).map((node) => node.nodeId);
  let visited = 0;
  while (topo.length) {
    const id = topo.shift()!;
    visited += 1;
    progression.filter((edge) => edge.from === id).forEach((edge) => {
      indegree.set(edge.to, (indegree.get(edge.to) ?? 1) - 1);
      if (indegree.get(edge.to) === 0) topo.push(edge.to);
    });
  }
  if (visited !== workflow.nodes.length) errors.push({ code: "FLOW_CYCLE", path: "edges", message: "流转/审批边形成环" });
  return { valid: errors.length === 0, errors };
}

function fixtureWorkSpec(task: TaskSummaryDto): WorkSpecDto {
  return {
    schemaVersion: 1,
    workSpecId: `${task.taskId}:work-spec:1`,
    workSpecRevision: 1,
    taskId: task.taskId,
    workSpecDigest: FIXTURE_DIGEST,
    title: task.title,
    objective: task.title,
    scope: { included: ["src/**", "test/**"], excluded: [".git/**"] },
    doneCriteria: [{ criterionId: "fixture-criterion", required: true, description: "fixture criteria", verifierId: "fixture-verifier", verifierVersion: "1.0.0", expected: "fixture pass", evidencePolicy: { evidenceTypes: ["test"], minCount: 1, retention: "task" } }],
    deliverables: [{ deliverableId: "fixture-deliverable", kind: "change-set", description: "fixture change set", criterionIds: ["fixture-criterion"] }],
    repository: { provider: task.provider, mcpServerRef: task.mcpServerRef, repositoryRef: task.repositoryRef, baseBranch: task.baseBranch, targetBranch: task.targetBranch, credentialRef: "fixture-credential" },
    constraints: { allowedPaths: ["src/**", "test/**"], forbiddenPaths: [".git/**"], allowedCommands: ["npm test"], maxNodes: 10, maxAttempts: 3, maxWallTimeMs: 60_000, workspaceWriteConcurrency: 1, externalWrite: { requiresApproval: true, allowedBranches: [task.targetBranch] } },
    policies: { policyVersion: "fixture-1.0.0" },
    templateRef: { templateId: "standard-code-change", templateVersion: "2.0" },
    createdAt: FIXTURE_TIME,
    createdBy: "fixture-user",
  };
}

function fixtureProposal(task: TaskSummaryDto): ProposalDto {
  return { schemaVersion: 1, proposalId: `${task.taskId}:proposal:1`, taskId: task.taskId, proposalDigest: FIXTURE_DIGEST, status: "proposed", workSpecRevision: 1, workSpecDigest: FIXTURE_DIGEST, governanceDigest: FIXTURE_DIGEST, payload: { slotBindings: [] }, createdAt: FIXTURE_TIME };
}

function fixturePlan(task: TaskSummaryDto): PlanDto {
  return { schemaVersion: 1, planRevisionId: `${task.taskId}:plan:1`, taskId: task.taskId, planVersion: 1, planDigest: FIXTURE_DIGEST, workSpecRevision: 1, workSpecDigest: FIXTURE_DIGEST, proposalRef: `${task.taskId}:proposal:1`, proposalDigest: FIXTURE_DIGEST, status: "ready", createdAt: FIXTURE_TIME };
}

function fixtureRun(task: TaskSummaryDto): RunIntentDto {
  return { schemaVersion: 1, runId: `${task.taskId}:run:1`, taskId: task.taskId, planRevisionId: `${task.taskId}:plan:1`, workSpecDigest: FIXTURE_DIGEST, kind: "start", idempotencyKey: `${task.taskId}:start:1`, requestedBy: "fixture-user", requestedAt: FIXTURE_TIME, status: task.state === "running" ? "running" : "completed", leaseGeneration: 1, createdAt: FIXTURE_TIME, updatedAt: task.updatedAt, runMode: "fixture/test-double" };
}

function fixtureAssessment(task: TaskSummaryDto): CriterionAssessmentDto {
  return { schemaVersion: 1, assessmentId: `${task.taskId}:assessment:1`, taskId: task.taskId, criterionId: "fixture-criterion", workSpecDigest: FIXTURE_DIGEST, verifierId: "fixture-verifier", verifierVersion: "1.0.0", expected: "fixture pass", actual: "fixture pass", outcome: task.state === "failed" ? "fail" : "pass", evidenceRefs: [`evidence://fixture/${task.taskId}/criterion`], reason: "fixture assessment", actor: "fixture-verifier", assessedAt: task.updatedAt };
}

function fixtureTrustedDelivery(detail: TaskDetailDto): TrustedDeliveryDto {
  return { schemaVersion: 1, taskId: detail.taskId, contractVersion: "1.7", workSpecDigest: FIXTURE_DIGEST, planDigest: FIXTURE_DIGEST, frozenWorkflow: { workflowId: detail.workflow.workflowId, workflowVersion: detail.workflow.workflowVersion, policyVersion: detail.workflow.policyVersion, nodeSpecDigest: detail.workflow.nodeSpecDigest, frozenAt: FIXTURE_TIME }, acceptedExitNodes: detail.nodes.filter((node) => node.status === "accepted").map((node) => node.nodeId), acceptedAttempts: [], deliverables: detail.deliverables.map((item) => ({ deliverableId: item.deliverableId, nodeId: item.nodeId, attemptId: `${item.nodeId}:r1`, digest: item.digest, mediaType: item.mediaType, schemaVersion: item.schemaVersion, status: item.status, byteLength: 0, createdAt: FIXTURE_TIME })), gates: detail.gates.map((gate) => ({ gateId: gate.gateId, nodeId: gate.nodeId, outcome: gate.outcome, evaluatorVersion: gate.evaluatorVersion, threshold: gate.threshold, actual: gate.actual, failureCode: gate.failureCode ?? null, evidenceRef: gate.evidenceRef, attemptId: `${gate.nodeId}:r1`, inputDigest: FIXTURE_DIGEST, gateType: "fixture", artifactDigest: null, createdAt: FIXTURE_TIME })), gitOperations: detail.gitOperations, events: [], evidenceRefs: [], generatedAt: detail.updatedAt, runMode: "fixture/test-double" };
}

function fixtureClient(): AfApiClient {
  const tasks: TaskSummaryDto[] = sessions.map(fixtureTaskSummary);
  const operations = new Map<string, GitOperationDto>();
  const details = new Map<string, TaskDetailDto>();
  const workSpecs = new Map<string, WorkSpecDto>();
  const proposals = new Map<string, ProposalDto>();
  const plans = new Map<string, PlanDto>();
  const decisions = new Map<string, PlanDecisionDto>();
  const runs = new Map<string, RunIntentDto>();
  const assessments = new Map<string, CriterionAssessmentDto>();
  const currentBootstrap = () => fixtureBootstrap(tasks);
  const taskOrThrow = (taskId: string) => {
    const task = tasks.find((item) => item.taskId === taskId);
    if (!task) throw new AfApiError({ code: "AF_TASK_NOT_FOUND", message: "fixture 任务不存在", retryable: false });
    return task;
  };
  const ensureWorkSpec = (taskId: string) => {
    const task = taskOrThrow(taskId);
    const existing = workSpecs.get(taskId);
    if (existing) return existing;
    const value = fixtureWorkSpec(task);
    workSpecs.set(taskId, value);
    return value;
  };
  const ensureProposal = (taskId: string) => {
    const task = taskOrThrow(taskId);
    const existing = proposals.get(taskId);
    if (existing) return existing;
    const value = fixtureProposal(task);
    proposals.set(taskId, value);
    return value;
  };
  const ensurePlan = (taskId: string) => {
    const task = taskOrThrow(taskId);
    const existing = plans.get(taskId);
    if (existing) return existing;
    const value = fixturePlan(task);
    plans.set(taskId, value);
    return value;
  };
  const ensureRun = (taskId: string) => {
    const task = taskOrThrow(taskId);
    const existing = runs.get(taskId);
    if (existing) return existing;
    const value = fixtureRun(task);
    runs.set(taskId, value);
    return value;
  };
  const ensureAssessment = (taskId: string) => {
    const task = taskOrThrow(taskId);
    const existing = assessments.get(taskId);
    if (existing) return existing;
    const value = fixtureAssessment(task);
    assessments.set(taskId, value);
    return value;
  };
  return {
    mode: "fixture",
    async bootstrap() { return currentBootstrap(); },
    async listTasks() { return tasks; },
    async getTask(taskId) {
      const task = tasks.find((item) => item.taskId === taskId);
      if (!task) throw new AfApiError({ code: "AF_TASK_NOT_FOUND", message: "fixture 任务不存在", retryable: false });
      const detail = details.get(taskId) ?? fixtureDetail(task, currentBootstrap());
      details.set(taskId, detail);
      return detail;
    },
    async validateWorkflow(workflow) { return validateWorkflowDto(workflow); },
    async saveWorkflow(workflow) {
      const validation = validateWorkflowDto(workflow);
      if (!validation.valid) throw new AfApiError({ code: "AF_WORKFLOW_INVALID", message: validation.errors[0]?.message ?? "工作流无效", retryable: false, details: { errors: validation.errors } });
      return { workflowId: workflow.workflowId, workflowVersion: workflow.workflowVersion, nodeSpecDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", frozen: true };
    },
    async createTask(input) {
      const taskId = `fixture-${Date.now()}`;
      tasks.unshift({ taskId, title: input.title, repositoryRef: input.repositoryRef, baseBranch: input.baseBranch, targetBranch: input.targetBranch, provider: input.provider ?? "github", mcpServerRef: input.mcpServerRef ?? "github-official", state: "created", blockedReason: null, workflowId: input.workflowId, workflowVersion: input.workflowVersion, nodeSpecDigest: FIXTURE_DIGEST, executorMode: "demo-deterministic", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 1 });
      return { taskId };
    },
    async startTask(taskId) {
      const task = taskOrThrow(taskId);
      task.state = "running";
      details.delete(taskId);
      const run = { ...ensureRun(taskId), status: "running" as const, updatedAt: new Date().toISOString() };
      runs.set(taskId, run);
      return { taskId, state: "running", runId: run.runId, accepted: true, terminal: false, revision: task.revision };
    },
    async continueTask(taskId) {
      return this.startTask(taskId);
    },
    /* 取消与归档只改 fixture 内存事实，不抛错：取消把任务置为终态，
       归档只切换「是否从默认列表隐藏」，两者都不删除任何记录。 */
    async cancelTask(taskId) {
      const task = taskOrThrow(taskId);
      task.state = "cancelled";
      task.updatedAt = new Date().toISOString();
      const run = runs.get(taskId);
      if (run) runs.set(taskId, { ...run, status: "cancelled", updatedAt: task.updatedAt });
      details.delete(taskId);
      return task;
    },
    async setTaskArchived(taskId, archived) {
      const task = taskOrThrow(taskId);
      if (archived) task.archived = true;
      else delete task.archived;
      return task;
    },
    async materializeEvidence(taskId) {
      taskOrThrow(taskId);
      return { evidenceMatrix: await this.getEvidenceMatrix(taskId), trustedDelivery: fixtureTrustedDelivery(await this.getTask(taskId)) };
    },
    async approveTaskNode(taskId, nodeId) {
      const task = tasks.find((item) => item.taskId === taskId);
      if (!task) throw new AfApiError({ code: "AF_TASK_NOT_FOUND", message: "fixture 任务不存在", retryable: false });
      return { taskId, nodeId, state: task.state, revision: task.revision + 1 };
    },
    async getTrajectory(taskId) { return fixtureTrajectory(await this.getTask(taskId)); },
    /* fixture 没有真实工作区，不得伪造补丁；显式声明不可用并给出原因。 */
    async getTaskPatch(taskId) {
      return { taskId, baseRevision: null, sourceRevision: null, available: false, reason: "fixture 模式无真实补丁", files: [] };
    },
    async listWorkSpecs(taskId) { return [ensureWorkSpec(taskId)]; },
    async getWorkSpec(taskId) { return ensureWorkSpec(taskId); },
    async saveWorkSpec(taskId, input) {
      taskOrThrow(taskId);
      const previous = ensureWorkSpec(taskId);
      const value: WorkSpecDto = { ...previous, ...input, schemaVersion: 1, taskId, workSpecId: `${taskId}:work-spec:${previous.workSpecRevision + 1}`, workSpecRevision: previous.workSpecRevision + 1, workSpecDigest: FIXTURE_DIGEST, createdAt: new Date().toISOString(), createdBy: "fixture-user" };
      workSpecs.set(taskId, value);
      return value;
    },
    async applyRequirementsClarification() {
      throw new AfApiError({ code: "AF_CLARIFICATION_UNSUPPORTED", message: "fixture/test-double 不支持持久化需求澄清；请切换到 HTTP AF API。", retryable: false });
    },
    async requestSupervisor(taskId, kind, input) {
      taskOrThrow(taskId);
      if (kind === "initial-plan") ensureWorkSpec(taskId);
      const proposal = kind === "initial-plan" ? ensureProposal(taskId) : null;
      return { supervisor: { schemaVersion: 1, kind, taskId, facts: input }, proposal };
    },
    async listProposals(taskId) { return [ensureProposal(taskId)]; },
    async getProposal(taskId) { return ensureProposal(taskId); },
    async saveProposal(taskId, input) {
      const current = ensureProposal(taskId);
      const value = { ...current, ...input, taskId, proposalDigest: FIXTURE_DIGEST, status: "proposed" as const };
      proposals.set(taskId, value);
      return value;
    },
    async compilePlan(taskId) {
      const plan = ensurePlan(taskId);
      return { report: { schemaVersion: 1, reportId: `${taskId}:report:1`, reportDigest: FIXTURE_DIGEST, taskId, workSpecDigest: FIXTURE_DIGEST, proposalDigest: FIXTURE_DIGEST, outcome: "pass" as const, checks: [], createdAt: FIXTURE_TIME }, plan };
    },
    async listCompilationReports(taskId) { return [(await this.compilePlan(taskId)).report]; },
    async listPlans(taskId) { return [ensurePlan(taskId)]; },
    async getPlan(taskId) { return ensurePlan(taskId); },
    async savePlan(taskId, input) {
      const current = ensurePlan(taskId);
      const value = { ...current, ...input, taskId, planDigest: FIXTURE_DIGEST };
      plans.set(taskId, value);
      return value;
    },
    async listPlanDecisions(taskId) { return decisions.has(taskId) ? [decisions.get(taskId)!] : []; },
    async getPlanDecision(taskId) {
      const value = decisions.get(taskId);
      if (value) return value;
      throw new AfApiError({ code: "AF_TASK_NOT_FOUND", message: "fixture PlanDecision 不存在", retryable: false });
    },
    async savePlanDecision(taskId, input) {
      taskOrThrow(taskId);
      const value: PlanDecisionDto = { schemaVersion: 1, factType: "PlanDecision", decisionId: input.decisionId, taskId, workSpecDigest: FIXTURE_DIGEST, governanceDigest: input.governanceDigest, proposalDigest: input.proposalDigest ?? FIXTURE_DIGEST, actor: input.actor ?? "fixture-user", decision: input.decision, reason: input.reason, createdAt: new Date().toISOString() };
      decisions.set(taskId, value);
      return value;
    },
    async listRunIntents(taskId) { return [ensureRun(taskId)]; },
    async getRunIntent(taskId) { return ensureRun(taskId); },
    async listCriterionAssessments(taskId) { return [ensureAssessment(taskId)]; },
    async getCriterionAssessment(taskId) { return ensureAssessment(taskId); },
    async saveCriterionAssessment(taskId, input) {
      const current = ensureAssessment(taskId);
      const value: CriterionAssessmentDto = { ...current, ...input, taskId, workSpecDigest: FIXTURE_DIGEST, actor: input.actor ?? "fixture-user", assessedAt: new Date().toISOString() };
      assessments.set(taskId, value);
      return value;
    },
    async getEvidenceMatrix(taskId) {
      const assessment = ensureAssessment(taskId);
      return { schemaVersion: 1, matrixId: `${taskId}:evidence-matrix`, taskId, workSpecDigest: FIXTURE_DIGEST, rows: [{ criterionId: assessment.criterionId, outcome: assessment.outcome, evidenceRefs: assessment.evidenceRefs }], generatedAt: new Date().toISOString() };
    },
    async getTrustedDelivery(taskId) { return fixtureTrustedDelivery(await this.getTask(taskId)); },
    async getApprovals(taskId) { taskOrThrow(taskId); return { taskId, nodeApprovals: [], gitOperationConfirmations: [] }; },
    async createPushOperation(taskId, input) {
      const task = tasks.find((item) => item.taskId === taskId);
      if (!task) throw new AfApiError({ code: "AF_TASK_NOT_FOUND", message: "fixture 任务不存在", retryable: false });
      const operation: GitOperationDto = { contractVersion: "1.1", operationId: `${taskId}.git.${Date.now()}`, idempotencyKey: input.idempotencyKey, taskId, provider: input.provider, mcpServerRef: input.mcpServerRef, mcpCapabilitiesDigest: FIXTURE_DIGEST, repositoryRef: task.repositoryRef, credentialRef: input.credentialRef, baseBranch: task.baseBranch, baseRevision: "1111111111111111111111111111111111111111", expectedRemoteRevision: "1111111111111111111111111111111111111111", sourceRevision: input.sourceRevision, targetBranch: input.targetBranch, changeSet: { digest: input.changeSetDigest, files: [{ path: ".agentflow/fixture.txt", action: "create", contentDigest: FIXTURE_DIGEST }] }, commit: { message: input.commitMessage }, status: "confirmation", actor: "fixture-user", createdAt: new Date().toISOString() };
      operations.set(operation.operationId, operation);
      return operation;
    },
    async confirmPushOperation(operationId) {
      const operation = operations.get(operationId) ?? [...details.values()].flatMap((detail) => detail.gitOperations).find((item) => item.operationId === operationId);
      if (!operation) throw new AfApiError({ code: "AF_INVALID_REQUEST", message: "fixture Git operation 不存在", retryable: false });
      const committed = { ...operation, status: "committed" as const, remoteRevision: "3333333333333333333333333333333333333333", updatedAt: new Date().toISOString() };
      operations.set(operationId, committed);
      for (const detail of details.values()) detail.gitOperations = detail.gitOperations.map((item) => item.operationId === operationId ? committed : item);
      return committed;
    },
    async getPushOperation(operationId) {
      const operation = operations.get(operationId) ?? [...details.values()].flatMap((detail) => detail.gitOperations).find((item) => item.operationId === operationId);
      if (!operation) throw new AfApiError({ code: "AF_INVALID_REQUEST", message: "fixture Git operation 不存在", retryable: false });
      return operation;
    },
    async reconcilePushOperation(operationId) { return this.getPushOperation(operationId); },
  };
}

class HttpAfApiClient implements AfApiClient {
  readonly mode = "http" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl?: typeof fetch) {
    this.baseUrl = baseUrl;
    // Chromium 的原生 fetch 依赖 Window receiver。直接保存后再以
    // this.fetchImpl(...) 调用会把 HttpAfApiClient 误当 receiver，触发
    // `Illegal invocation`；注入的测试实现则应保持原样。
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
    if (!this.baseUrl) {
      throw new AfApiError({ code: "AF_API_NOT_CONFIGURED", message: "AF API 地址未配置；当前环境已 fail-closed，请显式启用 fixture/test-double 适配器。", retryable: false });
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}${path}`, { ...init, signal, headers: { "content-type": "application/json", ...init?.headers } });
    } catch (error) {
      throw new AfApiError({
        code: "AF_NETWORK_ERROR",
        message: error instanceof Error ? error.message : "无法连接 AF API",
        retryable: true,
      });
    }
    let body: AfResponse<T>;
    try {
      body = (await response.json()) as AfResponse<T>;
    } catch {
      throw new AfApiError({
        code: "AF_RESPONSE_INVALID",
        message: `AF API 返回的不是有效 JSON（HTTP ${response.status}）`,
        retryable: response.status >= 500,
      }, response.status);
    }
    if (!response.ok || !body.ok) {
      const payload: AfErrorPayload = body.ok ? { code: `AF_HTTP_${response.status}`, message: `AF API 请求失败（HTTP ${response.status}）`, retryable: response.status >= 500 } : body.error;
      throw new AfApiError(payload, response.status);
    }
    return body.data;
  }

  bootstrap(signal?: AbortSignal) { return this.request<AfBootstrapDto>("/bootstrap", undefined, signal); }
  listTasks(signal?: AbortSignal) { return this.request<AfBootstrapDto>("/bootstrap", undefined, signal).then((data) => data.tasks); }
  getTask(taskId: string, signal?: AbortSignal) { return this.request<AfTaskDetailDto>(`/tasks/${encodeURIComponent(taskId)}`, undefined, signal).then(toTaskDetail); }
  validateWorkflow(workflow: import("./types").WorkflowDefinitionDto, signal?: AbortSignal) { return this.request<WorkflowValidation>("/workflows/validate", { method: "POST", body: JSON.stringify({ draft: workflow }) }, signal); }
  saveWorkflow(workflow: import("./types").WorkflowDefinitionDto, signal?: AbortSignal) { return this.request<WorkflowVersion>("/workflows", { method: "POST", body: JSON.stringify({ workflowId: workflow.workflowId, draft: workflow, idempotencyKey: requestKey("workflow-save", workflow) }) }, signal); }
  createTask(input: CreateTaskInput, signal?: AbortSignal) { return this.request<{ taskId: string }>("/tasks", { method: "POST", body: JSON.stringify(input) }, signal); }
  startTask(taskId: string, signal?: AbortSignal, runMode?: import("./types").RunMode, faultInjection?: import("./types").FaultInjectionDto) { return this.request<StartResultDto>(`/tasks/${encodeURIComponent(taskId)}/start`, { method: "POST", body: JSON.stringify({ ...(runMode === undefined ? {} : { runMode }), ...(faultInjection === undefined ? {} : { faultInjection }) }) }, signal); }
  continueTask(taskId: string, signal?: AbortSignal, runMode?: import("./types").RunMode, faultInjection?: import("./types").FaultInjectionDto) { return this.request<StartResultDto>(`/tasks/${encodeURIComponent(taskId)}/continue`, { method: "POST", body: JSON.stringify({ ...(runMode === undefined ? {} : { runMode }), ...(faultInjection === undefined ? {} : { faultInjection }) }) }, signal); }
  approveTaskNode(taskId: string, nodeId: string, signal?: AbortSignal) { return this.request<import("./types").ApproveTaskNodeResult>(`/tasks/${encodeURIComponent(taskId)}/approve`, { method: "POST", body: JSON.stringify({ nodeId }) }, signal); }
  cancelTask(taskId: string, signal?: AbortSignal) { return this.request<TaskSummaryDto>(`/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST", body: "{}" }, signal); }
  setTaskArchived(taskId: string, archived: boolean, signal?: AbortSignal) { return this.request<TaskSummaryDto>(`/tasks/${encodeURIComponent(taskId)}/${archived ? "archive" : "unarchive"}`, { method: "POST", body: "{}" }, signal); }
  getTrajectory(taskId: string, signal?: AbortSignal) { return this.request<AfTrajectoryDto>(`/tasks/${encodeURIComponent(taskId)}/trajectory`, undefined, signal).then(toTrajectory); }
  getTaskPatch(taskId: string, signal?: AbortSignal) { return this.request<TaskPatchDto>(`/tasks/${encodeURIComponent(taskId)}/patch`, undefined, signal); }
  listWorkSpecs(taskId: string, signal?: AbortSignal) { return this.request<WorkSpecDto[]>(`/tasks/${encodeURIComponent(taskId)}/work-specs`, undefined, signal); }
  getWorkSpec(taskId: string, revision?: number, signal?: AbortSignal) { return this.request<WorkSpecDto>(`/tasks/${encodeURIComponent(taskId)}/work-specs${revision === undefined ? "" : `/${revision}`}`, undefined, signal); }
  saveWorkSpec(taskId: string, input: WorkSpecDraftInput, signal?: AbortSignal) { return this.request<WorkSpecDto>(`/tasks/${encodeURIComponent(taskId)}/work-specs`, { method: "POST", body: JSON.stringify(input) }, signal); }
  applyRequirementsClarification(taskId: string, input: RequirementsClarificationInput, signal?: AbortSignal) { return this.request<ClarificationDecisionDto>(`/tasks/${encodeURIComponent(taskId)}/clarifications`, { method: "POST", body: JSON.stringify(input) }, signal); }
  requestSupervisor(taskId: string, kind: "intake" | "initial-plan" | "context-brief" | "rework-advice" | "final-summary", input: Record<string, unknown>, signal?: AbortSignal) {
    // Initial-plan facts and digests are assembled by the AF API; never trust
    // browser-supplied inputSnapshot/catalog identities for this operation.
    const body = kind === "initial-plan" ? { schemaVersion: 1 } : input;
    return this.request<{ supervisor: unknown; proposal?: ProposalDto | null; persistenceError?: AfErrorPayload | null }>(`/tasks/${encodeURIComponent(taskId)}/supervisor/${kind}`, { method: "POST", body: JSON.stringify(body) }, signal);
  }
  listProposals(taskId: string, signal?: AbortSignal) { return this.request<ProposalDto[]>(`/tasks/${encodeURIComponent(taskId)}/proposals`, undefined, signal); }
  getProposal(taskId: string, proposalId: string, signal?: AbortSignal) { return this.request<ProposalDto>(`/tasks/${encodeURIComponent(taskId)}/proposals/${encodeURIComponent(proposalId)}`, undefined, signal); }
  saveProposal(taskId: string, input: Record<string, unknown>, signal?: AbortSignal) { return this.request<ProposalDto>(`/tasks/${encodeURIComponent(taskId)}/proposals`, { method: "POST", body: JSON.stringify(input) }, signal); }
  compilePlan(taskId: string, input: CompilePlanInput = {}, signal?: AbortSignal) { return this.request<CompilePlanResultDto>(`/tasks/${encodeURIComponent(taskId)}/compile`, { method: "POST", body: JSON.stringify(input) }, signal); }
  listCompilationReports(taskId: string, signal?: AbortSignal) { return this.request<CompilationReportDto[]>(`/tasks/${encodeURIComponent(taskId)}/compilation-reports`, undefined, signal); }
  listPlans(taskId: string, signal?: AbortSignal) { return this.request<PlanDto[]>(`/tasks/${encodeURIComponent(taskId)}/plans`, undefined, signal); }
  getPlan(taskId: string, planRevisionId: string, signal?: AbortSignal) { return this.request<PlanDto>(`/tasks/${encodeURIComponent(taskId)}/plans/${encodeURIComponent(planRevisionId)}`, undefined, signal); }
  savePlan(taskId: string, input: Record<string, unknown>, signal?: AbortSignal) { return this.request<PlanDto>(`/tasks/${encodeURIComponent(taskId)}/plans`, { method: "POST", body: JSON.stringify(input) }, signal); }
  listPlanDecisions(taskId: string, signal?: AbortSignal) { return this.request<PlanDecisionDto[]>(`/tasks/${encodeURIComponent(taskId)}/plan-decisions`, undefined, signal); }
  getPlanDecision(taskId: string, decisionId: string, signal?: AbortSignal) { return this.request<PlanDecisionDto>(`/tasks/${encodeURIComponent(taskId)}/plan-decisions/${encodeURIComponent(decisionId)}`, undefined, signal); }
  savePlanDecision(taskId: string, input: PlanDecisionInput, signal?: AbortSignal) { return this.request<PlanDecisionDto>(`/tasks/${encodeURIComponent(taskId)}/plan-decisions`, { method: "POST", body: JSON.stringify(input) }, signal); }
  listRunIntents(taskId: string, signal?: AbortSignal) { return this.request<RunIntentDto[]>(`/tasks/${encodeURIComponent(taskId)}/runs`, undefined, signal); }
  getRunIntent(taskId: string, runId: string, signal?: AbortSignal) { return this.request<RunIntentDto>(`/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}`, undefined, signal); }
  listCriterionAssessments(taskId: string, signal?: AbortSignal) { return this.request<CriterionAssessmentDto[]>(`/tasks/${encodeURIComponent(taskId)}/criterion-assessments`, undefined, signal); }
  getCriterionAssessment(taskId: string, assessmentId: string, signal?: AbortSignal) { return this.request<CriterionAssessmentDto>(`/tasks/${encodeURIComponent(taskId)}/criterion-assessments/${encodeURIComponent(assessmentId)}`, undefined, signal); }
  saveCriterionAssessment(taskId: string, input: CriterionAssessmentInput, signal?: AbortSignal) { return this.request<CriterionAssessmentDto>(`/tasks/${encodeURIComponent(taskId)}/criterion-assessments`, { method: "POST", body: JSON.stringify(input) }, signal); }
  getEvidenceMatrix(taskId: string, signal?: AbortSignal) { return this.request<EvidenceMatrixDto>(`/tasks/${encodeURIComponent(taskId)}/evidence-matrix`, undefined, signal); }
  getTrustedDelivery(taskId: string, signal?: AbortSignal) { return this.request<TrustedDeliveryDto>(`/tasks/${encodeURIComponent(taskId)}/trusted-delivery`, undefined, signal); }
  materializeEvidence(taskId: string, signal?: AbortSignal) { return this.request<EvidenceMaterializationDto>(`/tasks/${encodeURIComponent(taskId)}/evidence/materialize`, { method: "POST", body: "{}" }, signal); }
  getApprovals(taskId: string, signal?: AbortSignal) { return this.request<ApprovalQueryDto>(`/tasks/${encodeURIComponent(taskId)}/approvals`, undefined, signal); }
  createPushOperation(taskId: string, input: PushOperationInput, signal?: AbortSignal) { return this.request<GitOperationDto>(`/tasks/${encodeURIComponent(taskId)}/git-operations`, { method: "POST", body: JSON.stringify(input) }, signal); }
  confirmPushOperation(operationId: string, signal?: AbortSignal) { return this.request<GitOperationDto>(`/git-operations/${encodeURIComponent(operationId)}/confirm`, { method: "POST", body: JSON.stringify({ idempotencyKey: requestKey("git-confirm", operationId) }) }, signal); }
  getPushOperation(operationId: string, signal?: AbortSignal) { return this.request<GitOperationDto>(`/git-operations/${encodeURIComponent(operationId)}`, undefined, signal); }
  reconcilePushOperation(operationId: string, signal?: AbortSignal) { return this.request<GitOperationDto>(`/git-operations/${encodeURIComponent(operationId)}/reconcile`, { method: "POST", body: JSON.stringify({ idempotencyKey: requestKey("git-reconcile", operationId) }) }, signal); }
}

export class AfApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly status?: number;

  constructor(payload: AfErrorPayload, status?: number) {
    super(payload.message);
    this.name = "AfApiError";
    this.code = payload.code;
    this.retryable = payload.retryable;
    this.details = payload.details;
    this.status = status;
  }
}

export function createAfApiClient(options: { baseUrl?: string; fetchImpl?: typeof fetch; mode?: "http" | "fixture" } = {}): AfApiClient {
  const baseUrl = options.baseUrl ?? import.meta.env.VITE_AF_API_BASE_URL;
  const requestedMode = options.mode ?? import.meta.env.VITE_AF_API_MODE;
  // Fixture is a deliberate development/test adapter. Production builds with
  // no API URL return a fail-closed HTTP client instead of silently presenting
  // test-double facts as governance truth.
  if (!baseUrl && (requestedMode === "fixture" || import.meta.env.DEV)) return fixtureClient();
  return new HttpAfApiClient(baseUrl ?? "", options.fetchImpl);
}

export const afApi = createAfApiClient();
