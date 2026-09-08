/* WP2 阶段映射层自检脚本。
   前端没有测试运行器（package.json 无 test 脚本，也无 vitest/jest 配置），
   因此本文件是一个自包含的 Node 断言脚本，不新增任何依赖：
     node --experimental-strip-types scripts/stageMapper.test.ts
   stageMapper.ts / stageModel.ts 的 import 全部是 `import type`，会被
   Node 的类型擦除去掉，所以运行时不存在无扩展名导入解析问题。
   真实字段名以 packages/af/af-api/src/runtime/profile-runtime.ts 与
   experiments/phase1.6/contracts/agent-profiles.md 的 output schema 为准。 */
import assert from "node:assert/strict";
import { buildStageCards } from "../src/api/stageMapper.ts";
import type { TaskDetailDto, AttemptDetailDto, CriterionAssessmentDto, AfGateDetailDto } from "../src/api/types.ts";

const DIGEST = "sha256:" + "a".repeat(64);
const REV = "1".repeat(40);

function attempt(nodeId: string, schemaVersion: string, structured: Record<string, unknown> | null): AttemptDetailDto {
  return {
    attemptId: "task-t1." + nodeId + ".a0",
    nodeId,
    ordinal: 0,
    status: "accepted",
    inputDigest: DIGEST,
    outputDigest: DIGEST,
    sessionId: "session-" + nodeId,
    stopReason: "completed",
    executorMode: "fresh-spawn",
    startedAt: "2026-09-07T00:00:00.000Z",
    finishedAt: "2026-09-07T00:00:01.000Z",
    error: null,
    executionMeta: {
      profileId: "profile-" + nodeId,
      profileVersion: "1.0.0",
      profileDigest: DIGEST,
      promptId: "af.agent." + nodeId + ".v1",
      promptVersion: "1.0.0",
      provider: "deepseek",
      model: "deepseek-chat",
      toolPolicyVersion: "1.0.0",
      outputSchemaVersion: schemaVersion,
    },
    structured,
  };
}

function nodeRuntime(nodeId: string, kind: "ai" | "skill" | "gate" | "git", attemptId: string) {
  return {
    nodeId,
    kind,
    status: "accepted" as const,
    attemptId,
    evidenceRefs: [] as string[],
  };
}

const requirementsStructured = {
  summary: "明确本次任务的范围、假设与验收条件。",
  scopeIn: ["补充构建版本号输出", "更新 README"],
  scopeOut: ["不改动发布流水线"],
  assumptions: ["构建脚本已存在"],
  openQuestions: [
    { id: "q1", question: "版本号格式是否沿用语义化版本？", blocking: false },
    { id: "q2", question: "是否允许改动生产配置？", blocking: true },
  ],
  acceptanceCriteria: [
    { id: "ac1", statement: "构建产物包含版本号", verification: "读取 dist/version.json" },
  ],
  riskFlags: [
    { id: "r1", level: "medium", description: "版本号来源不稳定", mitigation: "固定到 CI 变量" },
  ],
  recommendedNodeChanges: [{ nodeId: "design", reason: "补充版本号来源说明" }],
};

const designStructured = {
  designSummary: "在构建脚本中注入版本号，并补充回滚说明。",
  impactedAreas: [{ path: "scripts/build.ts", reason: "注入版本号", changeType: "update" }],
  implementationSteps: [{ id: "s1", description: "读取 CI 版本变量", dependency: null }],
  interfaceChanges: [{ component: "build.ts", change: "新增 --version 参数", compatibility: "向后兼容" }],
  dataAndStateImpact: ["dist/version.json 新增字段"],
  testStrategy: [{ level: "unit", commandOrMethod: "vitest run", expectedEvidence: "测试报告" }],
  rollbackPlan: "还原构建脚本并删除 version.json。",
  riskRegister: [{ id: "d1", level: "low", description: "变量缺失", mitigation: "回退默认值" }],
};

const implementationStructured = {
  changeSummary: "在构建脚本中写入版本号。",
  changedFiles: [
    { path: "scripts/build.ts", changeType: "update", reason: "写入版本号" },
    { path: "dist/version.json", changeType: "create", reason: "产物" },
  ],
  workspaceRevision: { revision: REV, treeDigest: DIGEST },
  selfChecks: [{ id: "sc1", command: "npm run build", outcome: "passed", evidenceRef: "artifact://selfcheck/1" }],
  knownIssues: [{ id: "ki1", level: "low", description: "未覆盖 Windows 路径" }],
  metrics: { scopeCompliant: true, secretScanPass: true, selfCheckPass: true, changedFilesRecorded: true },
};

const skillStructured = (skillId: string, status: string, exitCode: number) => ({
  skill: {
    contractVersion: "1.0",
    skillId,
    skillVersion: "1.0.0",
    status,
    exitCode,
    stdoutRef: "artifact://stdout/1",
    stderrRef: "artifact://stderr/1",
    evidenceRef: "artifact://evidence/" + skillId,
    startedAt: "2026-09-07T00:00:00.000Z",
    finishedAt: "2026-09-07T00:00:00.285Z",
  },
  metrics: { passed: status === "passed" ? 1 : 0 },
});

const gateStructured = {
  testSummary: "unit=passed; integration=passed",
  unitStatus: "passed",
  integrationStatus: "passed",
  evidenceRefs: ["artifact://evidence/run-unit-tests", "artifact://evidence/run-integration-tests"],
  releaseRecommendation: "ready-for-review",
};

const reviewStructured = {
  reviewSummary: "变更与需求范围一致，无阻塞问题。",
  findings: [
    { id: "f1", severity: "minor", category: "docs", path: "README.md", description: "文档未更新", evidenceRef: "artifact://f1", requiredAction: "补充 README" },
  ],
  scopeAssessment: { inScope: true, outOfScopeChanges: [], evidenceRef: "artifact://scope" },
  testAssessment: [{ criterionId: "ac1", status: "pass", evidenceRef: "artifact://test" }],
  securityAssessment: { secretScan: "pass", unsafeOperation: "none", evidenceRef: "artifact://sec" },
  verdict: "approve-for-commit",
  residualRisks: [{ id: "rr1", level: "low", description: "文档滞后" }],
  metrics: { blockerFindingsAbsent: true, scopeMatch: true, evidenceComplete: true, reviewIndependent: true },
};

const changeSetStructured = {
  contractVersion: "1.1",
  status: "prepared",
  sourceRevision: REV,
  changeSet: {
    digest: DIGEST,
    files: [
      { path: "scripts/build.ts", action: "update", contentDigest: DIGEST },
      { path: "dist/version.json", action: "create", contentDigest: DIGEST },
    ],
  },
};

const publishStructured = {
  operationId: "op-0001",
  status: "committed",
  sourceRevision: REV,
  remoteRevision: "2".repeat(40),
  changeSet: {
    digest: DIGEST,
    files: [
      { path: "scripts/build.ts", action: "update", contentDigest: DIGEST },
      { path: "dist/version.json", action: "create", contentDigest: DIGEST },
    ],
  },
};

const rawGates: AfGateDetailDto[] = [
  {
    gateId: "task-t1:test-merge:gate",
    nodeId: "test-merge",
    attemptId: "task-t1.test-merge.a0",
    gateType: "tests",
    outcome: "pass",
    inputDigest: DIGEST,
    evaluatorVersion: "1.0.0",
    threshold: { testsPassed: 1 },
    actual: { testsPassed: 1 },
    failureCode: null,
    evidenceRef: "artifact://gate/1",
    createdAt: "2026-09-07T00:00:02.000Z",
  },
];

const assessments: CriterionAssessmentDto[] = [
  {
    schemaVersion: 1,
    assessmentId: "as-1",
    taskId: "task-t1",
    criterionId: "ac1",
    workSpecDigest: DIGEST,
    verifierId: "unit-integration-tests",
    verifierVersion: "1.0.0",
    expected: "全部测试通过",
    actual: "unit=passed; integration=passed",
    outcome: "pass",
    attemptId: "task-t1.test-merge.a0",
    gateId: "task-t1:test-merge:gate",
    evidenceRefs: ["artifact://gate/1"],
    reason: "真实测试证据齐全",
    actor: "af",
    assessedAt: "2026-09-07T00:00:02.000Z",
  },
];

const detail: TaskDetailDto = {
  taskId: "task-t1",
  title: "构建版本号",
  status: "completed",
  executorMode: "fresh-spawn",
  repositoryRef: "acme/demo",
  baseBranch: "main",
  baseRevision: REV,
  targetBranch: "feature/version",
  provider: "github",
  mcpServerRef: "github-official",
  contractDigest: DIGEST,
  workflow: { workflowId: "standard-code-change", workflowVersion: 1, nodeSpecDigest: DIGEST, frozen: true, policyVersion: "1.0.0" },
  nodes: [
    nodeRuntime("requirements", "ai", "task-t1.requirements.a0"),
    nodeRuntime("design", "ai", "task-t1.design.a0"),
    nodeRuntime("implementation", "ai", "task-t1.implementation.a0"),
    nodeRuntime("unit-tests", "skill", "task-t1.unit-tests.a0"),
    nodeRuntime("integration-tests", "skill", "task-t1.integration-tests.a0"),
    nodeRuntime("test-merge", "gate", "task-t1.test-merge.a0"),
    nodeRuntime("review", "ai", "task-t1.review.a0"),
    nodeRuntime("prepare-change-set", "git", "task-t1.prepare-change-set.a0"),
    nodeRuntime("publish-via-mcp", "git", "task-t1.publish-via-mcp.a0"),
  ],
  attempts: [
    attempt("requirements", "RequirementsDeliverable@1", requirementsStructured),
    attempt("design", "SolutionDesignDeliverable@1", designStructured),
    attempt("implementation", "ImplementationDeliverable@1", implementationStructured),
    attempt("unit-tests", "SkillResult@1", skillStructured("run-unit-tests", "passed", 0)),
    attempt("integration-tests", "SkillResult@1", skillStructured("run-integration-tests", "passed", 0)),
    attempt("test-merge", "GateResult@1", gateStructured),
    attempt("review", "ReviewDeliverable@1", reviewStructured),
    attempt("prepare-change-set", "GitOperation@1.1", changeSetStructured),
    attempt("publish-via-mcp", "GitOperation@1.1", publishStructured),
  ],
  rawGates,
  gates: rawGates.map((g) => ({ gateId: g.gateId, nodeId: g.nodeId, outcome: g.outcome, evaluatorVersion: g.evaluatorVersion, threshold: g.threshold, actual: g.actual, evidenceRef: g.evidenceRef })),
  skills: [],
  preparedDelivery: {
    sourceRevision: REV,
    targetBranch: "feature/version",
    changeSet: { digest: DIGEST, files: changeSetStructured.changeSet.files as Array<{ path: string; action: "create" | "update"; contentDigest: string }> },
  },
  gitOperations: [],
  deliverables: [],
  updatedAt: "2026-09-07T00:00:03.000Z",
  revision: 7,
};

const cards = buildStageCards(detail, assessments);
const expected: Array<{ nodeId: string; kind: string }> = [
  { nodeId: "requirements", kind: "requirements" },
  { nodeId: "design", kind: "design" },
  { nodeId: "implementation", kind: "implementation" },
  { nodeId: "unit-tests", kind: "skill" },
  { nodeId: "integration-tests", kind: "skill" },
  { nodeId: "test-merge", kind: "gate" },
  { nodeId: "review", kind: "review" },
  { nodeId: "prepare-change-set", kind: "git-change-set" },
  { nodeId: "publish-via-mcp", kind: "git-publish" },
];

assert.equal(cards.length, 9, "应产出 9 张阶段卡片");
assert.equal(buildStageCards(null, []).length, 0, "null detail 应返回空数组");

const rows: string[][] = [];
for (let i = 0; i < expected.length; i += 1) {
  const card = cards[i];
  const want = expected[i];
  assert.equal(card.nodeId, want.nodeId, "顺序应与工作流一致");
  assert.equal(card.index, i, "index 应为工作流序号");
  assert.equal(card.kind, want.kind, want.nodeId + " 的 kind 应为 " + want.kind);
  assert.equal(card.status, "accepted", want.nodeId + " 的状态应为 accepted");
  assert.equal(card.attemptOrdinal, 0, want.nodeId + " 的 attemptOrdinal 应为 0");
  assert.ok(card.summary.length > 0, want.nodeId + " 的 summary 不应为空");
  assert.notEqual(card.summary, "该节点暂无结构化交付物", want.nodeId + " 不应退化为空态");
  assert.ok(card.facts.length + card.lists.length > 0, want.nodeId + " 应有事实或列表");
  assert.ok(card.role.length > 0, want.nodeId + " 应有中文角色标签");
  assert.equal(card.schemaVersion.endsWith("@1") || card.schemaVersion.endsWith("@1.1"), true, want.nodeId + " 应带 schemaVersion");
  rows.push([card.nodeId, card.kind, card.role, String(card.summary.length), String(card.facts.length), String(card.lists.length)]);
}

assert.equal(cards[3].facts.find((f) => f.label === "技能")?.value, "run-unit-tests");
assert.equal(cards[3].evidenceRefs.includes("artifact://evidence/run-unit-tests"), true, "skill 证据引用应并入 evidenceRefs");
assert.equal(cards[5].facts.find((f) => f.label === "放行建议")?.value, "ready-for-review");
assert.equal(cards[5].gate?.outcome, "pass", "gate 应读取 rawGates");
assert.equal(cards[5].gate?.dimensions.length, 2, "gate 维度应来自 unit/integration");
assert.equal(cards[5].criteria.length, 1, "criteria 应按 attemptId 关联");
assert.equal(cards[6].findings?.length, 1, "review findings 应映射");
assert.equal(cards[6].findings?.[0].severity, "minor");
assert.equal(cards[7].kind, "git-change-set", "只有 changeSet 无 remote/operation 应为 git-change-set");
assert.equal(cards[7].diffFiles?.length, 2, "git-change-set 应带 diffFiles");
assert.equal(cards[8].kind, "git-publish", "带 remoteRevision/operationId 应为 git-publish");
assert.equal(cards[8].facts.find((f) => f.label === "远端 revision")?.value, "2".repeat(40));
assert.equal(cards[2].diffFiles?.length, 2, "implementation changedFiles 应匹配 changeSet diffFiles");

/* acceptedAttemptId 优先于 currentAttemptId 的解析规则 */
const precedence = buildStageCards(
  {
    ...detail,
    nodes: [{
      ...nodeRuntime("requirements", "ai", "task-t1.requirements.a0"),
      currentAttemptId: "task-t1.requirements.a0",
      acceptedAttemptId: "task-t1.requirements.a0",
      outputSchemaVersion: "RequirementsDeliverable@1",
    }],
    attempts: [attempt("requirements", "RequirementsDeliverable@1", requirementsStructured)],
  } as unknown as TaskDetailDto,
  [],
);
assert.equal(precedence.length, 1);
assert.equal(precedence[0].kind, "requirements");

/* 空 structured 必须优雅降级，绝不抛错 */
const degraded = buildStageCards(
  {
    ...detail,
    nodes: [nodeRuntime("design", "ai", "task-t1.design.a0")],
    attempts: [attempt("design", "SolutionDesignDeliverable@1", null)],
    rawGates: [],
    gates: [],
  },
  [],
);
assert.equal(degraded.length, 1);
assert.equal(degraded[0].summary, "该节点暂无结构化交付物");
assert.equal(degraded[0].facts.length, 0);
assert.equal(degraded[0].lists.length, 0);
assert.equal(degraded[0].kind, "design", "schemaVersion 决定 kind，即使 structured 为空");

/* 缺字段的 structured 也不能抛错 */
const partial = buildStageCards(
  {
    ...detail,
    nodes: [nodeRuntime("review", "ai", "task-t1.review.a0")],
    attempts: [attempt("review", "ReviewDeliverable@1", { reviewSummary: "只有摘要" })],
    rawGates: [],
    gates: [],
  },
  [],
);
assert.equal(partial[0].summary, "只有摘要");
assert.equal(partial[0].findings, undefined, "缺 findings 时应省略而不是造空数组");

console.log("node".padEnd(22) + "kind".padEnd(18) + "role".padEnd(6) + "sum".padEnd(5) + "facts".padEnd(6) + "lists");
for (const row of rows) console.log(row[0].padEnd(22) + row[1].padEnd(18) + row[2].padEnd(6) + row[3].padEnd(5) + row[4].padEnd(6) + row[5]);
console.log("\nstageMapper.test.ts: all assertions passed");
