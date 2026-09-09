import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  type AgentEvent,
  type Session,
  type Theme,
} from "./data/mock";
import { afApi, AfApiError, normalizePlanPayload, structuredToEvents, toUiBootstrap, toWorkflowDto } from "./api";
import { realInspectorBundle } from "./api/inspectorMapper";
import { buildStageCards } from "./api/stageMapper";
import type { AgentProfileSummaryDto, ApprovalQueryDto, AttemptTraceDto, CompilationReportDto, CriterionAssessmentDto, EvidenceMatrixDto, ExecutorMode, FaultInjectionDto, ModelProvidersDto, PlanDecisionDto, PlanDto, ProposalDto, RunIntentDto, RunMode, ScmProviderDto, SkillSummaryDto, TaskDetailDto, TaskPatchDto, TrajectoryEventDto, TrustedDeliveryDto, WorkSpecDraftInput, WorkSpecDto, WorkflowValidation } from "./api";
import type { StageTraceView } from "./components/StageCard";
import { conversationOf } from "./data/streams";
import { inspectorOf } from "./data/inspector";
import { Rail } from "./components/Rail";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Stream } from "./components/Stream";
import { Composer } from "./components/Composer";
import { Inspector, type InspectorTab } from "./components/Inspector";
import { Palette } from "./components/Palette";
import { Toasts, type Toast } from "./components/Toasts";
import { Welcome } from "./components/Welcome";
import { SettingsOverlay, type ArchJump, type SettingsPane } from "./components/Settings";
import { NewTaskDialog, type NewTaskScmDraft } from "./components/NewTask";
import { WorkflowStrip } from "./components/Workflow";
import { RuntimeConsole, type RuntimeLoadState } from "./components/RuntimeConsole";
import { GovernanceView } from "./components/GovernanceView";
import { Waterfall } from "./components/Waterfall";
import {
  buildOrchestratorPlan,
  runOf,
  workflowTemplates,
  type OrchestratorPlanEvent,
  type WfRunStates,
  type Workflow,
} from "./data/workflows";

type ApiLoadState = { status: "loading" } | { status: "ready" } | { status: "error"; code: string; message: string; retryable: boolean };
type GovernanceLoadState = { status: "idle" | "loading" | "ready" } | { status: "error"; code: string; message: string; retryable: boolean };
type GovernanceSnapshot = {
  workSpec: WorkSpecDto | null;
  proposal: ProposalDto | null;
  compilationReport: CompilationReportDto | null;
  plan: PlanDto | null;
  planDecision: PlanDecisionDto | null;
  runIntent: RunIntentDto | null;
  assessments: CriterionAssessmentDto[];
  evidenceMatrix: EvidenceMatrixDto | null;
  approvals: ApprovalQueryDto | null;
  trustedDelivery: TrustedDeliveryDto | null;
  runMode?: RunMode;
  faultInjection?: FaultInjectionDto;
};

const standardCriterionDefaults = [
  {
    criterionId: "health-build-version",
    verifierId: "health-contract-v1",
    verifierVersion: "1.0.0",
    expected: "可验证的构建/版本或接口结果符合任务约定",
    evidenceTypes: ["test-report", "api-schema"],
  },
  {
    criterionId: "unit-integration-tests",
    verifierId: "test-suite-v1",
    verifierVersion: "1.0.0",
    expected: "单元测试与集成测试均由真实 Skill 执行并通过",
    evidenceTypes: ["skill-result", "test-log"],
  },
  {
    criterionId: "remote-digest-match",
    verifierId: "scm-reconcile-v1",
    verifierVersion: "1.0.0",
    expected: "source changeSet.digest 与远端回读 digest 对账通过",
    evidenceTypes: ["git-operation", "remote-revision"],
  },
] as const;

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "item";
}

function isPathPattern(value: string): boolean {
  return /[/*\\]/.test(value.trim());
}

function criterionDefaultFor(text: string, index: number) {
  if (index < standardCriterionDefaults.length) return standardCriterionDefaults[index]!;
  const lower = text.toLowerCase();
  if (lower.includes("test") || lower.includes("测试") || lower.includes("覆盖")) return standardCriterionDefaults[1];
  if (lower.includes("remote") || lower.includes("远端") || lower.includes("远程") || lower.includes("digest") || lower.includes("提交") || lower.includes("分支")) return standardCriterionDefaults[2];
  if (lower.includes("health") || lower.includes("build") || lower.includes("version") || lower.includes("构建") || lower.includes("版本") || lower.includes("接口")) return standardCriterionDefaults[0];
  return standardCriterionDefaults[index] ?? { ...standardCriterionDefaults[0], criterionId: `criterion-${index + 1}` };
}

function workSpecFromContract(prompt: string, contract: AgentEvent, scm: NewTaskScmDraft): WorkSpecDraftInput {
  const contractData = contract.kind === "contract" ? contract : undefined;
  const scopeText = contractData?.scope ?? [];
  const scopeItems = scopeText?.map((item) => item.trim()).filter(Boolean) ?? [];
  const pathItems = scopeItems.filter(isPathPattern);
  const included = Array.from(new Set([...(pathItems.length ? pathItems : []), "src/**", "test/**", "docs/**"]));
  const criterionText = contractData?.doneCriteria?.length
    ? contractData.doneCriteria
    : [
      "任务目标与实现范围可由审查证据复核",
      "单元测试与集成测试均通过",
      "变更已在目标功能分支完成远端对账",
    ];
  const criteria = criterionText.map((text, index) => {
    const preset = criterionDefaultFor(text, index);
    return {
      criterionId: preset.criterionId,
      required: true,
      description: text.trim(),
      verifierId: preset.verifierId,
      verifierVersion: preset.verifierVersion,
      expected: preset.expected,
      evidencePolicy: { evidenceTypes: [...preset.evidenceTypes], minCount: 1, retention: "task-lifetime" },
    };
  });
  const uniqueCriteria = criteria.map((criterion, index, all) => {
    const duplicate = all.slice(0, index).some((item) => item.criterionId === criterion.criterionId);
    return duplicate ? { ...criterion, required: false, criterionId: `criterion-optional-${index + 1}-${slug(criterion.description)}` } : criterion;
  });
  const materials = contractData?.materials ?? [];
  const approvals = contractData?.approvals ?? [];
  const tools = contractData?.tools ?? [];
  const repository = {
    provider: scm.provider ?? "github",
    mcpServerRef: scm.mcpServerRef ?? "github-official",
    repositoryRef: scm.repositoryRef,
    baseBranch: scm.baseBranch,
    targetBranch: scm.targetBranch,
    credentialRef: scm.credentialRef ?? "GITHUB_AGENTFLOW_TOKEN",
  } as const;
  return {
    schemaVersion: 1,
    title: contractData?.title ?? (prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt),
    objective: prompt,
    background: [
      scopeItems.length ? `原始改动范围：${scopeItems.join("；")}` : "",
      materials.length ? `输入资料：${materials.join("；")}` : "",
      approvals.length ? `需人工放行：${approvals.join("；")}` : "",
      tools.length ? `可用工具：${tools.join("；")}` : "",
    ].filter(Boolean).join("\n"),
    scope: { included, excluded: [".git/**"] },
    inputs: materials.map((item) => ({ ref: `input-${slug(item)}`, description: item })),
    doneCriteria: uniqueCriteria,
    deliverables: (contractData?.deliverables?.length ? contractData.deliverables : ["源码、测试与审查交付物"]).map((item, index) => ({ deliverableId: `deliverable-${index + 1}-${slug(item)}`, kind: "artifact", description: item, criterionIds: uniqueCriteria.map((criterion) => criterion.criterionId) })),
    repository,
    constraints: {
      allowedPaths: included,
      forbiddenPaths: [".git/**"],
      allowedCommands: [],
      maxNodes: 9,
      maxAttempts: 3,
      maxWallTimeMs: 3_600_000,
      workspaceWriteConcurrency: 1,
      externalWrite: { requiresApproval: true, allowedBranches: [repository.targetBranch], forbiddenBranches: ["main", "master", "release/**"] },
    },
    policies: { policyVersion: "1.0.0", approval: "plan-plus-external-write", rework: "frozen-fail-target-only" },
    templateRef: { templateId: "standard-code-change", templateVersion: "2.0" },
  };
}

function apiFailure(error: unknown, fallbackMessage: string): Omit<Extract<ApiLoadState, { status: "error" }>, "status"> {
  if (error instanceof AfApiError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: "AF_CLIENT_RESPONSE_INVALID",
    message: error instanceof Error ? error.message : fallbackMessage,
    retryable: true,
  };
}

/* 会话 → 编排：每条会话记着自己走哪条流水线，切换会话时顶部要跟着换。
   找不到时回落到第一套，保证界面不会因为数据缺字段而空掉。 */
function wfOf(id: string | undefined, catalog: Workflow[] = workflowTemplates): Workflow {
  return catalog.find((w) => w.id === id) ?? catalog[0] ?? workflowTemplates[0]!;
}

/* 任务状态 → 中文标签与语气。只服务于常驻治理动作条这一处；
   完整状态轨仍由 GovernanceView 的 .govStatusRail 呈现。 */
const taskStatusLabels: Record<string, string> = {
  created: "任务壳",
  draft: "草稿",
  planning: "规划中",
  awaiting_plan_approval: "等待计划审批",
  ready: "已就绪",
  queued: "排队中",
  running: "执行中",
  yielded: "等待人工",
  claimed: "执行中",
  blocked_unavailable: "能力不可用",
  needs_reconcile: "等待对账",
  compiler_rejected: "编译拒绝",
  stale: "已过期",
  awaiting_human: "等待人工",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function taskStatusLabel(value: string | undefined): string {
  return value ? (taskStatusLabels[value] ?? value) : "未声明";
}

/* 状态语气映射：通过=sage、失败/拒绝=rose、受阻/待人工=gold，其余中性 */
function taskStatusTone(value: string | undefined): string {
  if (!value) return "unknown";
  if (value === "completed") return "completed";
  if (value === "failed" || value === "compiler_rejected" || value === "cancelled") return "failed";
  if (value === "awaiting_human" || value === "blocked_unavailable" || value === "needs_reconcile") return "warn";
  if (value === "running" || value === "queued" || value === "planning") return "running";
  return "draft";
}

/* 运行停滞阈值：90 秒。
   依据是这条链路的观测节奏——前端每 2 秒轮询，单个节点内的模型调用通常
   数十秒；连续 90 秒 lastAdvanceAt 不更新，意味着既没有节点推进也没有租约
   续期，大概率在等待外部系统（模型 / SCM / CI）或已停滞。阈值取太小会把
   正常的长节点误报成故障，取太大则失去「一眼看出卡住」的意义。 */
const RUN_STALL_THRESHOLD_MS = 90_000;

/* 执行诊断轮询：只跟随当前运行中的节点。
   窗口 200 足够覆盖一个节点的近期活动；1500ms 让「实时跟随」有肉眼可见的
   推进感，又不至于把会话日志读成压力源。诊断只读，绝不写任务状态。 */
const TRACE_WINDOW = 200;
const TRACE_POLL_MS = 1500;
/* 终态任务不再跟随：控制面已经结束，诊断通道也停止轮询 */
const TERMINAL_TASK_STATES = new Set<TaskDetailDto["status"]>(["completed", "failed", "cancelled"]);

/* 单个节点的执行诊断展示态。attemptId 用于识别「卡片换了 attempt」需重新拉取。 */
type TraceEntry = { attemptId: string; status: "loading" | "ready" | "error"; trace: AttemptTraceDto | null; error: { code: string; message: string } | null };

/* 运行活性：把 lastAdvanceAt 换算成中文相对时间。
   页面每 2 秒轮询一次并重渲染，这个值随轮询自然刷新，不需要额外定时器；
   缺失或不可解析时返回「未知」，绝不猜一个时间出来。 */
function relativeTimeLabel(iso: string | undefined, nowMs: number): string {
  if (!iso) return "未知";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "未知";
  const seconds = Math.max(0, Math.round((nowMs - at) / 1000));
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

let toastSeq = 0;

export default function App() {
  const [theme, setTheme] = useState<Theme>("lumen");
  const [activeId, setActiveId] = useState<string>("");
  /* 任务列表由 AF API bootstrap 注入；fixture 只由 api/client.ts 作为兜底适配器提供。 */
  const [sessionList, setSessionList] = useState<Session[]>([]);
  /* 已归档会话默认隐藏，但完整列表仍留在 state 里（归档只是展示层隐藏，
     事实与证据必须继续可查）；过滤只发生在传给 Sidebar 的渲染边界。 */
  const [showArchived, setShowArchived] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("files");
  const [activeFile, setActiveFile] = useState<string>("src/main/java/com/sse/vote/qfii/collect/CollectWindowService.java");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  /* 初始编排取首条会话自己的编排，而不是写死第一套模板 */
  const [workflowCatalog, setWorkflowCatalog] = useState<Workflow[]>(workflowTemplates);
  const [workflow, setWorkflow] = useState<Workflow>(() => workflowTemplates[0]!);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfileSummaryDto[]>([]);
  const [skillCatalog, setSkillCatalog] = useState<SkillSummaryDto[]>([]);
  const [scmProviders, setScmProviders] = useState<ScmProviderDto[]>([]);
  const [executorMode, setExecutorMode] = useState<ExecutorMode>("demo-deterministic");
  const [apiLoad, setApiLoad] = useState<ApiLoadState>({ status: "loading" });
  const [taskRuntime, setTaskRuntime] = useState<TaskDetailDto | null>(null);
  const [trajectory, setTrajectory] = useState<TrajectoryEventDto[]>([]);
  /* 真实 unified diff：拿不到时保持 null，检查面板会显式声明补丁不可用，
     不合成假 diff。取补丁失败不能拖垮整页，故单独容错。 */
  const [patch, setPatch] = useState<TaskPatchDto | null>(null);
  const [runtimeLoad, setRuntimeLoad] = useState<RuntimeLoadState>({ status: "idle" });
  const [governanceLoad, setGovernanceLoad] = useState<GovernanceLoadState>({ status: "idle" });
  const [governance, setGovernance] = useState<GovernanceSnapshot>({ workSpec: null, proposal: null, compilationReport: null, plan: null, planDecision: null, runIntent: null, assessments: [], evidenceMatrix: null, approvals: null, trustedDelivery: null });
  const [workSpecDraft, setWorkSpecDraft] = useState<WorkSpecDraftInput | undefined>(undefined);
  const [workSpecRevisionEditing, setWorkSpecRevisionEditing] = useState(false);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [approvingNodeId, setApprovingNodeId] = useState<string | null>(null);
  const [planningOperation, setPlanningOperation] = useState(false);
  const [clarificationSubmitting, setClarificationSubmitting] = useState(false);
  const [confirmingOperationId, setConfirmingOperationId] = useState<string | null>(null);
  const [wfStep, setWfStep] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /* 模型路由由服务端按任务决定；前端只读取并展示默认路由，不提供改写入口。
     读取失败时保持 null，由 Composer 显示「模型路由未登记」。 */
  const [modelProviders, setModelProviders] = useState<ModelProvidersDto | null>(null);
  const [mode, setMode] = useState<"session" | "welcome">("welcome");

  /* --- streamed event window --------------------------------------------- */
  const [visible, setVisible] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);
  const [extra, setExtra] = useState<AgentEvent[]>([]);

  /* --- 两阶段流水线 --------------------------------------------------------
     阶段一：主控出规划方案，planPending 期间流水线不动、输入框转为「提修改意见」 */
  const [planEvent, setPlanEvent] = useState<OrchestratorPlanEvent | null>(null);
  const [planPending, setPlanPending] = useState(false);

  /* --- 单列瀑布：阶段卡片展开态与两个折叠事实区 ---------------------------
     展开态由 App 持有（子组件不持有跨组件状态）。卡片默认全开，让用户一进
     任务就看到真实节点产出——这正是本次重构要解决的问题；首次加载后允许逐张
     收起，切任务时按 taskId 重置。两个事实区默认折叠（动作留在 .govBar）。 */
  const [openStages, setOpenStages] = useState<Set<string>>(new Set());
  const [factsOpen, setFactsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  /* 执行诊断：按 nodeId 存放展示态。它是只读诊断通道，与治理状态严格分开；
     轮询只作用于当前运行中的节点，且任何定时器都不写任务事实。 */
  const [traces, setTraces] = useState<Record<string, TraceEntry>>({});
  /* planPending 的同步镜像：acceptPlan 内紧接着要调 runTurn，
     而此时 setPlanPending(false) 尚未生效，闭包里读到的仍是旧值，
     会导致确认动作被误判为「又一轮修改意见」。用 ref 做同步判据。 */
  const planPendingRef = useRef(false);

  const timers = useRef<number[]>([]);
  /* 流水线节点推进的定时器单独存放：runTurn / startTask 会清空 timers 以
     中断上一轮脚本播放，若与推进共用一个数组，推进会被连带清掉（表现为
     流水线卡在中途不动）。两者生命周期不同，就该分开管。 */
  const stepTimers = useRef<number[]>([]);
  /* 执行诊断轮询定时器：只跟随当前运行中的节点，单独存放以免被演示流的
     清理逻辑误伤；同样在卸载时统一清除。诊断只读展示，定时器绝不写任务状态。 */
  const traceTimers = useRef<number[]>([]);
  /* 已按需拉取过的 task:node:attempt 组合；展开卡片只拉一次，去重防止重复请求 */
  const traceRequestedRef = useRef<Set<string>>(new Set());
  const currentActiveRef = useRef("");
  const preferredActiveRef = useRef<string | null>(null);

  useEffect(() => { currentActiveRef.current = activeId; }, [activeId]);

  /* 首屏只依赖 AF API。未配置后端时，client 会显式走 fixture adapter，
     但组件仍通过同一套 API 契约工作，接入真实服务无需改页面状态模型。
     返回服务端最新列表，供取消/归档这类「以服务端为准」的动作在
     refresh 之后据此决定是否要切换当前会话；拉取失败返回 null，
     让调用方知道「没拿到事实」而不是「事实为空」。 */
  const loadBootstrap = useCallback((): Promise<Session[] | null> => {
    setApiLoad({ status: "loading" });
    let disposed = false;
    return afApi.bootstrap().then((data) => {
      if (disposed) return null;
      const ui = toUiBootstrap(data);
      setWorkflowCatalog(ui.workflows);
      setSessionList(ui.tasks);
      setExecutorMode(ui.executorMode);
      setAgentProfiles(ui.agentProfiles);
      setSkillCatalog(ui.skills);
      setScmProviders(ui.scmProviders);
      /* 模型路由是只读展示项，失败不影响首屏：保持 null 由 Composer 如实降级。 */
      void afApi.listModelProviders().then(setModelProviders).catch(() => setModelProviders(null));
      setApiLoad({ status: "ready" });
      const requestedId = preferredActiveRef.current ?? currentActiveRef.current;
      const first = ui.tasks.find((task) => task.id === requestedId) ?? ui.tasks[0];
      preferredActiveRef.current = null;
      if (!first) {
        setMode("welcome");
        return ui.tasks;
      }
      setActiveId(first.id);
      setWorkflow(wfOf(first.workflow, ui.workflows));
      setVisible(conversationOf(first.workflow).length);
      setMode("session");
      return ui.tasks;
    }).catch((error: unknown) => {
      if (disposed) return null;
      setApiLoad({ status: "error", ...apiFailure(error, "无法读取 AF API 首屏数据") });
      setMode("welcome");
      return null;
    });
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const fetchTaskRuntime = useCallback(async (taskId: string, signal?: AbortSignal, quiet = false) => {
    if (!taskId) return;
    if (!quiet) setRuntimeLoad({ status: "loading" });
    try {
      const [detail, events] = await Promise.all([
        afApi.getTask(taskId, signal),
        afApi.getTrajectory(taskId, signal),
      ]);
      setTaskRuntime(detail);
      setTrajectory(events);
      /* 补丁独立容错：失败只让 Inspector 显示「补丁不可用」，不影响任务事实。
         available=false 时把 DTO 原样传下去，让面板如实说明原因而不是空白。 */
      try {
        setPatch(await afApi.getTaskPatch(taskId, signal));
      } catch {
        if (signal?.aborted) return;
        setPatch(null);
      }
      if (detail.executorMode) setExecutorMode(detail.executorMode);
      // 完成态首次出现时请求服务端物化不可变证据；重复轮询由后端幂等收敛。
      if (afApi.mode === "http" && detail.status === "completed") {
        try { await afApi.materializeEvidence(taskId, signal); } catch { /* 事实未齐时由治理面板如实显示受阻 */ }
      }
      setRuntimeLoad({ status: "ready" });
      setSessionList((items) => items.map((item) => item.id === taskId ? {
        ...item,
        state: detail.status === "completed" ? "done"
          : detail.status === "failed" || detail.status === "blocked_unavailable" || detail.status === "needs_reconcile" ? "failed"
            : detail.status === "created" ? "draft"
              : detail.status === "awaiting_human" ? "review"
              : detail.status === "cancelled" ? "idle" : "running",
      } : item));
    } catch (error: unknown) {
      if (signal?.aborted) return;
      setRuntimeLoad({ status: "error", ...apiFailure(error, "无法读取任务状态") });
    }
  }, []);

  const fetchGovernance = useCallback(async (taskId: string, signal?: AbortSignal, quiet = false) => {
    if (!taskId) return;
    if (!quiet) setGovernanceLoad({ status: "loading" });
    const optional = async <T,>(load: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await load(); } catch { return fallback; }
    };
    try {
      // Core governance facts are required. Swallowing failures here would
      // turn an unavailable API into an apparently empty task, which breaks
      // the trusted-display contract. Only facts that are legitimately not
      // generated yet use an explicit empty/null fallback.
      const [workSpecs, proposals, reports, plans, decisions, runs, assessments, evidenceMatrix, approvals, trustedDelivery] = await Promise.all([
        afApi.listWorkSpecs(taskId, signal),
        afApi.listProposals(taskId, signal),
        afApi.listCompilationReports(taskId, signal),
        afApi.listPlans(taskId, signal),
        afApi.listPlanDecisions(taskId, signal),
        afApi.listRunIntents(taskId, signal),
        optional(() => afApi.listCriterionAssessments(taskId, signal), []),
        optional(() => afApi.getEvidenceMatrix(taskId, signal), null),
        optional(() => afApi.getApprovals(taskId, signal), null),
        optional(() => afApi.getTrustedDelivery(taskId, signal), null),
      ]);
      const latest = <T,>(items: T[]): T | null => items.length ? items[items.length - 1]! : null;
      const currentWorkSpec = latest(workSpecs);
      const currentProposal = latest(proposals.filter((item) => !currentWorkSpec || (item.workSpecRevision === currentWorkSpec.workSpecRevision && item.workSpecDigest === currentWorkSpec.workSpecDigest)));
      const currentReport = latest(reports.filter((item) => (!currentWorkSpec || item.workSpecDigest === currentWorkSpec.workSpecDigest) && (!currentProposal || item.proposalDigest === currentProposal.proposalDigest)));
      const currentPlan = latest(plans.filter((item) => (!currentWorkSpec || (item.workSpecRevision === currentWorkSpec.workSpecRevision && item.workSpecDigest === currentWorkSpec.workSpecDigest)) && (!currentProposal || item.proposalDigest === currentProposal.proposalDigest)));
      const currentDecision = latest(decisions.filter((item) => (!currentWorkSpec || item.workSpecDigest === currentWorkSpec.workSpecDigest) && (!currentProposal || item.proposalDigest === currentProposal.proposalDigest)));
      setGovernance({
        workSpec: currentWorkSpec,
        proposal: currentProposal,
        compilationReport: currentReport,
        plan: currentPlan,
        planDecision: currentDecision,
        runIntent: latest(runs),
        assessments,
        evidenceMatrix,
        approvals,
        trustedDelivery,
      });
      setGovernanceLoad({ status: "ready" });
    } catch (error: unknown) {
      if (signal?.aborted) return;
      setGovernanceLoad({ status: "error", ...apiFailure(error, "无法读取 1.7 治理事实") });
    }
  }, []);

  useEffect(() => {
    if (!activeId) {
      setTaskRuntime(null);
      setTrajectory([]);
      setRuntimeLoad({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setTaskRuntime(null);
    setTrajectory([]);
    /* 诊断态属于单条任务：切换任务必须清空，避免把上一条任务的轨迹带到新卡片上 */
    setTraces({});
    traceRequestedRef.current = new Set();
    void fetchTaskRuntime(activeId, controller.signal);
    void fetchGovernance(activeId, controller.signal);
    const interval = window.setInterval(() => {
      if (afApi.mode === "http") {
        void fetchTaskRuntime(activeId, controller.signal, true);
        void fetchGovernance(activeId, controller.signal, true);
      }
    }, 2_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [activeId, fetchGovernance, fetchTaskRuntime]);

  /* 会话可能被删空：此时没有「当前会话」，类型上必须如实反映为可空，
     否则 TopBar 里读 active.repo 会在空态下崩掉（sessionList[0] 也是 undefined） */
  const active = useMemo(
    (): Session | undefined => sessionList.find((s) => s.id === activeId) ?? sessionList[0],
    [activeId, sessionList],
  );

  /* 事件流的开场随会话所属编排变化：缺陷修复的会话不该显示需求开发的契约。
     执行细节（e2 起）沿用共享演示流。 */
  const baseConversation = useMemo(
    () => conversationOf(active?.workflow),
    [active?.workflow],
  );

  /* 检查面板现场同样按会话取：文件树、改动、证据链、回放、终端成套替换 */
  const inspectorBundle = useMemo(
    () => inspectorOf(active?.workflow),
    [active?.workflow],
  );

  /* http 模式：检查面板用真实 detail/trajectory/patch 归一化出的现场
     （文件树/diff/证据/回放）。补丁是 diff 的唯一来源，拿不到就显式不可用。 */
  const realBundle = useMemo(
    () => realInspectorBundle(taskRuntime, trajectory, patch),
    [taskRuntime, trajectory, patch],
  );

  /* 阶段卡片：把各节点 attempts[].structured 的真实交付物归一化成统一卡片。
     assessments 由 fetchGovernance 拉取，此前未被消费，这里首次用于逐条验收。 */
  const stageCards = useMemo(
    () => buildStageCards(taskRuntime, governance.assessments),
    [taskRuntime, governance.assessments],
  );

  /* 默认全开：用户一进任务就应看到真实节点产出，而不是再点一遍。
     只在 taskId 变化时重置，避免 2 秒轮询刷新 detail 时把用户的收起状态顶开；
     也避免把上一条任务的展开态带到新任务上（nodeId 可能重名）。 */
  const openStagesTaskRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (openStagesTaskRef.current === taskRuntime?.taskId) return;
    openStagesTaskRef.current = taskRuntime?.taskId;
    setOpenStages(new Set(stageCards.map((card) => card.nodeId)));
  }, [taskRuntime?.taskId, stageCards]);

  const toggleStage = useCallback((nodeId: string) => {
    setOpenStages((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  /* 编排条点击节点 → 展开该阶段卡片并滚动到它。跨面板跳转一次到位，
     不让用户自己去找。 */
  const selectNode = useCallback((id: string | null) => {
    if (!id) return;
    setOpenStages((prev) => new Set(prev).add(id));
    window.requestAnimationFrame(() => {
      document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  /* --- 执行诊断（阶段 B2）：只读跟随，绝不写任务状态 ----------------------
     拉取单个 attempt 的模型执行轨迹。成功/失败都只写 traces 展示态；
     任务事实、门禁、交付物一律不受影响。 */
  const fetchTrace = useCallback(async (taskId: string, nodeId: string, attemptId: string, signal?: AbortSignal) => {
    try {
      const trace = await afApi.getAttemptTrace(taskId, attemptId, TRACE_WINDOW, signal);
      if (signal?.aborted) return;
      setTraces((prev) => ({ ...prev, [nodeId]: { attemptId, status: "ready", trace, error: null } }));
    } catch (error: unknown) {
      if (signal?.aborted) return;
      const failure = apiFailure(error, "无法读取执行诊断");
      setTraces((prev) => ({ ...prev, [nodeId]: { attemptId, status: "error", trace: null, error: { code: failure.code, message: failure.message } } }));
    }
  }, []);

  /* 当前唯一运行中的卡片：只有它会被轮询跟随。终态任务或没有 running 节点时为空，
     轮询随之停止——诊断通道的节奏必须跟着控制面，而不是自己空转。 */
  const runningCard = useMemo(
    () => (taskRuntime !== null && !TERMINAL_TASK_STATES.has(taskRuntime.status)
      ? stageCards.find((card) => card.status === "running" && card.attemptId !== undefined) ?? null
      : null),
    [stageCards, taskRuntime],
  );
  const runningNodeId = runningCard?.nodeId;
  const runningAttemptId = runningCard?.attemptId;
  const runningTaskId = taskRuntime?.taskId;

  /* 轮询：只跟随当前运行节点，每 1500ms 一次、窗口 200。
     依赖全部是原始值，避免 2 秒任务轮询刷新 detail 时把定时器反复重建。 */
  useEffect(() => {
    if (!runningTaskId || !runningNodeId || !runningAttemptId) return;
    const controller = new AbortController();
    void fetchTrace(runningTaskId, runningNodeId, runningAttemptId, controller.signal);
    const timer = window.setInterval(() => {
      void fetchTrace(runningTaskId, runningNodeId, runningAttemptId, controller.signal);
    }, TRACE_POLL_MS);
    traceTimers.current.push(timer);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      traceTimers.current = traceTimers.current.filter((item) => item !== timer);
    };
  }, [fetchTrace, runningAttemptId, runningNodeId, runningTaskId]);

  /* 展开卡片时按需拉取一次（不是轮询）：让历史节点在事后仍可复核。
     用 requestedRef 去重，避免同一 attempt 反复请求；失败不自动重试，
     由用户收起再展开触发。

     注意：这里刻意不返回 abort 清理函数。依赖里的 stageCards 会随 2 秒任务
     轮询重建，若在清理时 abort，会把尚未完成的按需请求连同 requestedRef 标记
     一起作废，导致历史节点永远拉不到轨迹。改为在任务切换时整体重置
     （见 activeId effect 中的 traces 清理）。 */
  useEffect(() => {
    if (!runningTaskId) return;
    for (const card of stageCards) {
      const attemptId = card.attemptId;
      /* 运行中的节点由上面的轮询 effect 负责，这里跳过，避免首次重复请求 */
      if (attemptId === undefined || card.nodeId === runningNodeId || !openStages.has(card.nodeId)) continue;
      const key = `${runningTaskId}:${card.nodeId}:${attemptId}`;
      if (traceRequestedRef.current.has(key)) continue;
      traceRequestedRef.current.add(key);
      void fetchTrace(runningTaskId, card.nodeId, attemptId);
    }
  }, [fetchTrace, openStages, runningNodeId, runningTaskId, stageCards]);

  /* 传给卡片的诊断视图：live 仅当该节点正是当前被轮询跟随的运行节点 */
  const traceOf = useCallback((nodeId: string): StageTraceView | undefined => {
    const entry = traces[nodeId];
    if (entry === undefined) return undefined;
    return { status: entry.status, trace: entry.trace, error: entry.error, live: runningNodeId === nodeId };
  }, [runningNodeId, traces]);

  /* 检查面板实际渲染的现场：http 模式是真实归一化结果，fixture 才是演示数据。
     两者必须用同一份，否则文件树与 diff 会各说各话。 */
  const inspectorBundleShown = afApi.mode === "http" ? realBundle : inspectorBundle;

  /* 当前查看的文件必须属于当前会话：切换会话后原路径往往不在新现场里，
     此时回落到该会话改动的第一个文件，而不是让「改动」页空白。 */
  const shownFile = useMemo(() => {
    const paths = Object.keys(inspectorBundleShown.diffs);
    return paths.includes(activeFile) ? activeFile : (paths[0] ?? activeFile);
  }, [activeFile, inspectorBundleShown]);

  const events = useMemo(
    () => afApi.mode === "http"
      /* 真实模式下阶段卡已完整承载各节点产出；这里只保留需要人操作的检查点
         （节点审批）。tests/gate 等只读卡片与阶段卡重复，且信息更少，
         不再进入主区，避免同一事实在瀑布底部二次出现。 */
      ? structuredToEvents(taskRuntime).filter((e) => e.kind === "checkpoint")
      : [...baseConversation.slice(0, visible), ...extra],
    [baseConversation, visible, extra, taskRuntime],
  );

  /* 当前模板的模拟运行现场：换编排即换整套消息与最终态 */
  const wfRun = useMemo(() => runOf(workflow.id), [workflow.id]);

  /* 节点运行态：由当前进度推导，保证换工作流或改编排后仍然自洽。
     wfStep 之前的节点已完成，当前节点在跑，其后未开始。
     wfStep < 0 表示规划待确认、流水线尚未开跑，全部节点为未开始。
     推进到末尾后交给模板的最终态 —— 只有它知道这次是收尾还是被阻断，
     这是 wfStep 推导不出来的（推导只会一路 running 到底）。 */
  const runStates = useMemo<WfRunStates>(() => {
    if (afApi.mode === "http" && taskRuntime) {
      const live: WfRunStates = {};
      taskRuntime.nodes.forEach((node) => {
        live[node.nodeId] = node.status === "accepted" ? "done"
          : node.status === "rejected" || node.status === "blocked_unavailable" || node.status === "needs_reconcile" ? "blocked"
            : node.status === "pending" ? "todo" : "running";
      });
      return live;
    }
    const last = workflow.nodes.length - 1;
    if (wfStep >= last && Object.keys(wfRun.states).length) return wfRun.states;
    const m: WfRunStates = {};
    workflow.nodes.forEach((n, i) => {
      m[n.id] =
        wfStep < 0 ? "todo" : i < wfStep ? "done" : i === wfStep ? "running" : "todo";
    });
    return m;
  }, [workflow, wfStep, wfRun, taskRuntime]);

  /* 五层架构的运行时切面：让「总体架构」显示当前会话在每层的实时状态 */
  const archRuntime = useMemo(
    () => ({
      workflowName: workflow.name,
      wfStep,
      wfTotal: workflow.nodes.length,
      currentNode: taskRuntime?.currentNodeId ?? workflow.nodes[Math.min(wfStep, workflow.nodes.length - 1)]?.name ?? "",
      eventCount: events.length,
      streaming,
      awaitingApproval: pendingApproval !== null,
    }),
    [workflow, wfStep, events.length, streaming, pendingApproval, taskRuntime?.currentNodeId],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      stepTimers.current.forEach(clearTimeout);
      traceTimers.current.forEach(clearInterval);
    },
    [],
  );

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = `t${++toastSeq}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(
      () => setToasts((prev) => prev.filter((x) => x.id !== id)),
      3600,
    );
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "lumen" ? "ink" : "lumen"));
  }, []);

  /* --- keyboard ----------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (meta && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleTheme();
      } else if (meta && e.key === "\\") {
        e.preventDefault();
        setInspectorOpen((v) => !v);
      } else if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheme]);

  /* --- 阶段一：主控规划的修改与确认 ---------------------------------------- */

  /** 用户提交修改意见 → 主控重新规划。
      新一轮追加而非替换：保留历史让人能对比主控这轮改了什么。 */
  const revisePlan = useCallback(
    (feedback: string) => {
      if (!planEvent) return;
      const next = buildOrchestratorPlan(
        workflow,
        planEvent.task,
        feedback,
        planEvent.round + 1,
      );
      setPlanEvent(next);
      setExtra((prev) => [
        /* 旧轮次标记为已被取代，视觉上弱化但不删除 */
        ...prev.map((e) =>
          e.kind === "orchestrator-plan" && !e.confirmed
            ? { ...e, superseded: true }
            : e,
        ),
        { id: `${next.id}-fb`, kind: "user", text: feedback } as AgentEvent,
        next,
      ]);
      push({
        tone: "info",
        title: `已重新规划（第 ${next.round} 轮）`,
        body: "主控已纳入你的修改意见，请确认新方案。",
      });
    },
    [planEvent, workflow, push],
  );

  /* --- simulated agent turn ---------------------------------------------- */
  const runTurn = useCallback(
    (prompt: string, contract?: AgentEvent, keepHistory?: boolean) => {
      if (afApi.mode === "http") {
        push({ tone: "info", title: "真实模式由工作流节点驱动", body: "当前 AF API 未声明自由对话路由；请通过任务创建、启动、确认与返工入口操作，页面不会伪造一轮智能体执行。" });
        return;
      }
      /* 规划待确认期间，输入框的语义变为「提交修改意见」而非普通对话 */
      if (planPendingRef.current) {
        revisePlan(prompt);
        return;
      }
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setMode("session");

      const uid = `u${Date.now()}`;
      const script: AgentEvent[] = [
        /* 从规划确认进入执行时，用户诉求已在上文，不必重复一条用户气泡 */
        ...(keepHistory
          ? []
          : [{ id: `${uid}-a`, kind: "user", text: prompt } as AgentEvent]),
        ...(contract ? [contract] : []),
        {
          id: `${uid}-b`,
          kind: "reasoning",
          title: "已思考 6 秒",
          body: "先确认改动范围是否会触及对外报送接口。仓库根目录的 AGENTS.md 要求征集规则的判定必须与源仓库语义逐条对齐，并且改动需附带对应的测试。据此拟定最小步骤集。",
          ms: 6100,
        },
        {
          id: `${uid}-c`,
          kind: "plan",
          steps: [
            { label: "在源仓库定位征集规则实现与调用点", status: "done" },
            { label: "在目标仓库按最小改动落地重构", status: "active" },
            { label: "补 JUnit 用例并跑通 mvn 编译", status: "todo" },
          ],
        },
        {
          id: `${uid}-d`,
          kind: "tool",
          tool: "search",
          label: "grep",
          meta: "checkCollectWindow — 2 files, 3 matches",
          status: "ok",
          lines: [
            "src/main/java/com/sse/vote/collect/CollectWindowService.java:31   checkCollectWindow(meetingId, tradeDate)",
            "src/main/java/com/sse/vote/collect/DuplicateVoteChecker.java:12   public boolean isDuplicateVote(holderId, channel)",
          ],
        },
        {
          id: `${uid}-e`,
          kind: "approval",
          command: "mvn -q compile && mvn -pl collect test",
          rationale: "需要在沙箱内执行编译与测试，确认征集时间窗与重复投票判定没有偏离源仓库语义。",
          risk: "low",
        },
      ];

      /* keepHistory：保留规划卡片等上文，仅追加执行脚本 */
      if (!keepHistory) setExtra([]);
      setStreaming(true);
      let delay = 260;
      script.forEach((ev, i) => {
        const t = window.setTimeout(() => {
          setExtra((prev) => [...prev, ev]);
          if (ev.kind === "approval") {
            setPendingApproval(ev.id);
            setStreaming(false);
          }
          if (i === script.length - 1 && ev.kind !== "approval") setStreaming(false);
        }, delay);
        timers.current.push(t);
        delay += ev.kind === "reasoning" ? 900 : ev.kind === "plan" ? 760 : 620;
      });
    },
    /* 判据走 planPendingRef（同步），故不依赖 planPending */
    [push, revisePlan],
  );

  const startTask = useCallback(
    async (prompt: string, wf: Workflow, contract: AgentEvent, scm: NewTaskScmDraft) => {
      /* 所有任务创建都先经过 AF API；fixture adapter 也走同一请求契约。 */
      const sid = `s-${Date.now()}`;
      let createdTask: { taskId: string };
      let versionedWorkflow = wf;
      try {
        // bootstrap 返回的 frozen 版本已经由服务端校验并持久化。创建任务应
        // 直接引用它；只有 UI 草稿才保存新版本，避免把有损的画布投影重存。
        const version = wf.frozen && wf.workflowVersion !== undefined && wf.nodeSpecDigest
          ? { workflowId: wf.id, workflowVersion: wf.workflowVersion, nodeSpecDigest: wf.nodeSpecDigest, frozen: true }
          : await afApi.saveWorkflow(toWorkflowDto(wf));
        versionedWorkflow = { ...wf, workflowVersion: version.workflowVersion, nodeSpecDigest: version.nodeSpecDigest, frozen: version.frozen };
        createdTask = await afApi.createTask({
          idempotencyKey: `task-create:${sid}`,
          title: prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt,
          problem: prompt,
          repositoryRef: scm.repositoryRef,
          baseBranch: scm.baseBranch,
          targetBranch: scm.targetBranch,
          credentialRef: scm.credentialRef,
          provider: scm.provider,
          mcpServerRef: scm.mcpServerRef,
          workflowId: version.workflowId,
          workflowVersion: version.workflowVersion,
        });
      } catch (error: unknown) {
        const apiError = error instanceof AfApiError ? error : undefined;
        push({ tone: "warn", title: "任务创建失败", body: `${apiError?.code ?? "AF_NETWORK_ERROR"} · ${apiError?.message ?? "无法连接 AF API"}` });
        return;
      }
      timers.current.forEach(clearTimeout);
      timers.current = [];
      /* 上一条任务的推进也要停掉，否则会继续改写新任务的 wfStep。 */
      stepTimers.current.forEach(clearTimeout);
      stepTimers.current = [];
      setWorkflow(versionedWorkflow);
      /* -1 表示流水线尚未开跑：规划待确认，DAG 全部节点为未开始。 */
      setWfStep(-1);
      setVisible(0);
      setMode("session");
      setPendingApproval(null);
      setStreaming(false);
      setNewTaskOpen(false);
      if (afApi.mode === "http") {
        preferredActiveRef.current = createdTask.taskId;
        setActiveId(createdTask.taskId);
        setMode("session");
        const workSpecPayload = workSpecFromContract(prompt, contract, scm);
        setWorkSpecDraft(workSpecPayload);
        setWorkSpecRevisionEditing(false);
        try {
          await afApi.saveWorkSpec(createdTask.taskId, workSpecPayload);
          push({ tone: "ok", title: "任务已创建，WorkSpec 已自动冻结", body: `任务 ${createdTask.taskId} 已保存契约并生成 revision。现在可以请求 Proposal。` });
        } catch (error: unknown) {
          const failure = apiFailure(error, "无法保存新任务 WorkSpec");
          push({ tone: "warn", title: "任务已创建，但 WorkSpec 冻结失败", body: `${failure.code} · ${failure.message}。可在治理面板修正后重试。` });
        }
        loadBootstrap();
        await fetchTaskRuntime(createdTask.taskId);
        await fetchGovernance(createdTask.taskId);
        return;
      }
      const taskId = createdTask.taskId;
      const newSession: Session = {
        id: taskId,
        title: prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt,
        repo: scm.repositoryRef.split("/").pop() ?? scm.repositoryRef,
        branch: scm.targetBranch,
        /* 规划待确认，尚未进入执行 */
        state: "review",
        time: "刚刚",
        bucket: "今天",
        diff: { added: 0, removed: 0, files: 0 },
        turns: 1,
        /* 记住这条任务选的编排，之后切回来仍能显示对应流水线 */
        workflow: wf.id,
      };
      setSessionList((prev) => [newSession, ...prev.filter((s) => s.id !== taskId)]);
      setActiveId(taskId);

      /* 第一步只出规划方案，不推进流水线 —— 等用户确认 */
      const plan = buildOrchestratorPlan(wf, prompt);
      setPlanEvent(plan);
      setPlanPending(true);
      planPendingRef.current = true;
      setExtra([
        { id: `${taskId}-u`, kind: "user", text: prompt } as AgentEvent,
        contract,
        plan,
      ]);
      push({
        tone: "info",
        title: "主控已完成规划",
        body: `${wf.nodes.length} 个节点的契约与增强提示词待你确认`,
      });
    },
    [fetchGovernance, fetchTaskRuntime, loadBootstrap, push],
  );

  /** 用户确认规划 → 正式推进流水线（原 startTask 尾部的推进逻辑迁移至此） */
  const acceptPlan = useCallback(() => {
    if (!planEvent) return;
    const wf = workflow;
    setPlanPending(false);
    /* 先落 ref，确保随后的 runTurn 不再被当作修改意见拦截 */
    planPendingRef.current = false;
    setExtra((prev) =>
      prev.map((e) =>
        e.kind === "orchestrator-plan" && e.id === planEvent.id
          ? { ...e, confirmed: true, superseded: false }
          : e,
      ),
    );
    setSessionList((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, state: "running" } : s)),
    );
    void afApi.startTask(activeId).then(async () => {
      await fetchTaskRuntime(activeId);
      if (afApi.mode === "http") await loadBootstrap();
    }).catch((error: unknown) => {
        const apiError = error instanceof AfApiError ? error : undefined;
        push({ tone: "warn", title: "任务启动失败", body: `${apiError?.code ?? "AF_NETWORK_ERROR"} · ${apiError?.message ?? "无法连接 AF API"}` });
    });
    if (afApi.mode === "http") {
      return;
    }
    setWfStep(0);
    /* 顺序要紧：runTurn 开头会清空 timers 以中断上一轮播放，
       若先注册推进定时器再调它，刚注册的会被一并清掉（表现为流水线卡在首个
       节点不动）。故先让它清理并铺好执行脚本，再注册节点推进。 */
    runTurn(planEvent.task, undefined, true);
    wf.nodes.forEach((_, i) => {
      if (i === 0) return;
      const t = window.setTimeout(() => setWfStep(i), 1400 + i * 1600);
      stepTimers.current.push(t);
    });
    push({
      tone: "ok",
      title: `规划已确认 · 按「${wf.name}」启动`,
      body: `${wf.nodes.length} 个节点 · ${wf.edges.filter((e) => e.kind === "fail").length} 条失败回退边`,
    });
  }, [planEvent, workflow, activeId, runTurn, push, loadBootstrap, fetchTaskRuntime]);

  /* 取消/归档/恢复都先落服务端事实，再以服务端返回的列表为准刷新界面。
     本地只读缓存绝不伪造删除：调用失败时列表保持不变，并如实提示错误码。 */

  /* 被操作的任务若离开可见列表（归档后隐藏、或被取消后仍隐藏），
     当前会话要落到刷新后列表里的第一条，或回到空态。判据来自
     loadBootstrap 返回的服务端列表，而不是本地过滤出来的数组。 */
  const fallbackFromHidden = useCallback(
    (refreshed: Session[] | null, hiddenId: string, archivedOnly: boolean) => {
      /* 没拿到服务端事实时不做任何切换：宁可留在原任务，也不凭猜测跳走。 */
      if (!refreshed || hiddenId !== activeId) return;
      const stillVisible = refreshed.some(
        (s) => s.id === hiddenId && (!archivedOnly || s.archived !== true),
      );
      if (stillVisible) return;
      const next = refreshed.find((s) => !archivedOnly || s.archived !== true);
      setPlanEvent(null);
      setPlanPending(false);
      planPendingRef.current = false;
      if (next) {
        setActiveId(next.id);
        setMode("session");
        setExtra([]);
        setVisible(conversationOf(next.workflow).length);
        setPendingApproval(null);
        setStreaming(next.state === "running");
        setWorkflow(wfOf(next.workflow, workflowCatalog));
        setWfStep(1);
      } else {
        setActiveId("");
        setMode("welcome");
        setStreaming(false);
        setPendingApproval(null);
      }
    },
    [activeId, workflowCatalog],
  );

  const cancelRun = useCallback(
    async (id: string) => {
      try {
        await afApi.cancelTask(id);
      } catch (error: unknown) {
        const failure = apiFailure(error, "无法取消运行");
        push({ tone: "warn", title: "取消运行失败", body: `${failure.code} · ${failure.message}` });
        return;
      }
      const [refreshed] = await Promise.all([
        loadBootstrap(),
        fetchTaskRuntime(id),
        fetchGovernance(id),
      ]);
      /* 取消把任务置为终态，但不会隐藏它：只要服务端仍返回该任务，就留在原位。 */
      fallbackFromHidden(refreshed, id, false);
      push({ tone: "ok", title: "运行已取消", body: "该任务已终止；已完成的节点事实与证据仍然保留。" });
    },
    [fallbackFromHidden, fetchGovernance, fetchTaskRuntime, loadBootstrap, push],
  );

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      try {
        await afApi.setTaskArchived(id, archived);
      } catch (error: unknown) {
        const failure = apiFailure(error, archived ? "无法归档任务" : "无法恢复任务");
        push({ tone: "warn", title: archived ? "归档失败" : "恢复失败", body: `${failure.code} · ${failure.message}` });
        return;
      }
      const refreshed = await loadBootstrap();
      /* 只有「归档且归档列表当前不可见」才需要让出当前会话；开着
         「显示已归档」时它仍留在原位。 */
      fallbackFromHidden(refreshed, id, archived && !showArchived);
      push(
        archived
          ? { tone: "info", title: "已归档", body: "已从默认列表隐藏；任务事实、审计与证据仍可查询。" }
          : { tone: "ok", title: "已恢复", body: "该任务已重新出现在默认列表中。" },
      );
    },
    [fallbackFromHidden, loadBootstrap, push, showArchived],
  );

  const archiveTask = useCallback((id: string) => void setArchived(id, true), [setArchived]);
  const unarchiveTask = useCallback((id: string) => void setArchived(id, false), [setArchived]);

  /* 侧栏渲染边界：已归档会话默认不显示，但完整列表保留在 state 中。 */
  const visibleSessions = useMemo(
    () => (showArchived ? sessionList : sessionList.filter((s) => s.archived !== true)),
    [sessionList, showArchived],
  );

  /* 关闭「显示已归档」时，若当前会话正是被隐藏的归档任务，
     同样要让位给仍在列表里的第一条，避免主区与侧栏失去对应关系。 */
  const toggleShowArchived = useCallback(
    (next: boolean) => {
      setShowArchived(next);
      if (!next) fallbackFromHidden(sessionList, activeId, true);
    },
    [activeId, fallbackFromHidden, sessionList],
  );

  const resolveApproval = useCallback(
    (id: string, ok: boolean) => {
      setPendingApproval(null);
      setExtra((prev) =>
        prev.map((e) =>
          e.id === id && e.kind === "approval"
            ? ({ ...e, risk: e.risk } as AgentEvent)
            : e,
        ),
      );
      if (!ok) {
        push({ tone: "warn", title: "已拒绝命令", body: "代理将跳过该步骤继续。" });
        setExtra((prev) => [
          ...prev,
          {
            id: `${id}-skip`,
            kind: "text",
            body: "好的，我跳过命令执行。改动已经落盘，你可以稍后自行运行测试；需要我把验证步骤写进 `AGENTS.md` 吗？",
          },
        ]);
        return;
      }
      push({ tone: "ok", title: "已批准", body: "在沙箱中执行命令…" });
      setStreaming(true);
      setInspectorTab("terminal");
      const tail: AgentEvent[] = [
        {
          id: `${id}-sh`,
          kind: "tool",
          tool: "shell",
          label: "shell",
          meta: "mvn -q compile && mvn -pl collect test",
          status: "ok",
          lines: [
            "$ mvn -q compile",
            "> mvn -q verify -DskipTests",
            "✔ 0 errors · 312 files · 4.1s",
            "",
            "$ mvn -pl collect test",
            " ✓ src/test/java/com/sse/vote/qfii/collect/CollectWindowServiceTest.java (9 tests) 208ms",
            " ✓ src/test/java/com/sse/vote/qfii/collect/DuplicateVoteCheckerTest.java (14 tests) 322ms",
            " Tests  23 passed (23)",
          ],
        },
        { id: `${id}-t`, kind: "tests", passed: 23, failed: 0, skipped: 1, ms: 1380 },
        {
          id: `${id}-w`,
          kind: "text",
          body: "编译与测试全部通过，征集时间窗（投票起始日前一交易日 9:15–15:00）与「时间优先」去重规则已覆盖；报送字段已与 `src/main/resources/vote-org-api.yaml` 契约比对一致。可以开 PR 了。",
        },
      ];
      let delay = 420;
      tail.forEach((ev, i) => {
        const t = window.setTimeout(() => {
          setExtra((prev) => [...prev, ev]);
          if (i === tail.length - 1) {
            setStreaming(false);
            push({ tone: "ok", title: "23 项测试通过", body: "耗时 1.38s · 覆盖率 96.4%" });
          }
        }, delay);
        timers.current.push(t);
        delay += 900;
      });
    },
    [push],
  );

  /** 真实审批：人工检查点判定 → approve 节点 → 推进 + 刷新。 */
  const handleCheckpoint = useCallback(async (nodeId: string, option: string) => {
    if (!activeId) return;
    try {
      await afApi.approveTaskNode(activeId, nodeId);
      push({ tone: "ok", title: "已批准", body: `节点 ${nodeId} 已批准（${option}）` });
      if (afApi.mode === "http") {
        await afApi.startTask(activeId).catch(() => {});
        await fetchTaskRuntime(activeId);
      }
    } catch (error: unknown) {
      const apiError = error instanceof AfApiError ? error : undefined;
      push({ tone: "warn", title: "审批失败", body: `${apiError?.code ?? "AF_NETWORK_ERROR"} · ${apiError?.message ?? "无法连接 AF API"}` });
    }
  }, [activeId, fetchTaskRuntime, push]);

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    /* 中断意味着流水线也停下，否则点了停止节点还在自己往前推进 */
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    setStreaming(false);
    push({ tone: "warn", title: "已中断", body: "代理停在当前步骤。" });
  }, [push]);

  const selectSession = useCallback((s: Session) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    setActiveId(s.id);
    setWorkSpecDraft(undefined);
    setWorkSpecRevisionEditing(false);
    setMode("session");
    setExtra([]);
    setVisible(conversationOf(s.workflow).length);
    setPendingApproval(null);
    setStreaming(s.state === "running");
    /* 规划态属于单条会话，切换时必须清掉，否则会串台 */
    setPlanEvent(null);
    setPlanPending(false);
    planPendingRef.current = false;
    setWfStep(1);
    /* 编排随会话切换：这条任务是缺陷修复就该显示缺陷修复的流水线 */
    setWorkflow(wfOf(s.workflow, workflowCatalog));
  }, [workflowCatalog]);

  /* 架构层 → 承载该层证据的界面，一次点击到位，不让用户自己去找 */
  const archJump = useCallback(
    (target: ArchJump) => {
      if (target === "agents") {
        setSettingsPane("agents");
        return;
      }
      setSettingsPane(null);
      if (target === "workflow") {
        setMode("session");
        push({
          tone: "info",
          title: "编排进度",
          body: "已定位到会话顶部的编排进度条。",
        });
        return;
      }
      if (target === "replay") {
        setInspectorTab("replay");
        setInspectorOpen(true);
        return;
      }
      if (target === "evidence") {
        setInspectorTab("evidence");
        setInspectorOpen(true);
        return;
      }
      /* 人工检查点：回到事件流，待放行的决策就在其中 */
      setMode("session");
      push({
        tone: "warn",
        title: "等待人工决策",
        body: "人工检查点在事件流中，AI 只能请求、不能代替签批。",
      });
    },
    [push],
  );

  const paletteAction = useCallback(
    (label: string) => {
      setPaletteOpen(false);
      if (label.includes("主题")) return toggleTheme();
      if (label.includes("新任务")) {
        setNewTaskOpen(true);
        return;
      }
      if (label.includes("检查面板")) return setInspectorOpen((v) => !v);
      if (label.includes("终端") || label.includes("重跑")) {
        setInspectorTab("terminal");
        setInspectorOpen(true);
        return;
      }
      push({ tone: "ok", title: label, body: "演示动作已触发。" });
    },
    [push, toggleTheme],
  );

  const validateWorkflow = useCallback(async (candidate: Workflow): Promise<WorkflowValidation> => {
    // 冻结版本来自当前 bootstrap，服务端已经校验；UI 只是在选择该版本，
    // 并未提交一个需要重新验证的草稿。
    if (candidate.frozen && candidate.workflowVersion !== undefined && candidate.nodeSpecDigest) {
      return { valid: true, errors: [] };
    }
    return afApi.validateWorkflow(toWorkflowDto(candidate));
  }, []);

  const startLiveTask = useCallback(async () => {
    if (!activeId) return;
    setStartingTaskId(activeId);
    try {
      await afApi.startTask(activeId, undefined, taskRuntime?.runMode ?? "real", taskRuntime?.faultInjection);
      await Promise.all([fetchTaskRuntime(activeId), fetchGovernance(activeId)]);
      loadBootstrap();
      push({ tone: "info", title: "运行请求已提交", body: "任务已进入后台队列，Requirements 和后续节点会异步执行；请等待状态刷新，不要重复点击执行。" });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法启动任务");
      push({ tone: "warn", title: "任务启动失败", body: `${failure.code} · ${failure.message}` });
    } finally {
      setStartingTaskId(null);
    }
  }, [activeId, fetchGovernance, fetchTaskRuntime, loadBootstrap, push, taskRuntime]);

  const approveAndContinueTask = useCallback(async (nodeId: string) => {
    if (!activeId) return;
    setApprovingNodeId(nodeId);
    try {
      await afApi.approveTaskNode(activeId, nodeId);
      await afApi.continueTask(activeId, undefined, taskRuntime?.runMode ?? "real", taskRuntime?.faultInjection);
      await Promise.all([fetchTaskRuntime(activeId), fetchGovernance(activeId)]);
      loadBootstrap();
      push({ tone: "ok", title: "人工检查点已批准", body: `${nodeId} 已继续推进，控制面状态已刷新。` });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法批准任务节点");
      push({ tone: "warn", title: "人工检查点批准失败", body: `${failure.code} · ${failure.message}` });
    } finally {
      setApprovingNodeId(null);
    }
  }, [activeId, fetchGovernance, fetchTaskRuntime, loadBootstrap, push, taskRuntime]);

  const confirmGitOperation = useCallback(async (operationId: string) => {
    setConfirmingOperationId(operationId);
    try {
      const operation = await afApi.confirmPushOperation(operationId);
      push({
        tone: operation.status === "committed" ? "ok" : operation.status === "unknown" ? "warn" : "info",
        title: operation.status === "committed" ? "SCM MCP 写入已核验" : `Git operation · ${operation.status}`,
        body: operation.status === "committed"
          ? `remote ${operation.remoteRevision?.slice(0, 12)} · source ${operation.sourceRevision.slice(0, 12)}`
          : operation.errorMessage ?? "操作状态已由控制面更新。",
      });
      if (activeId) await fetchTaskRuntime(activeId);
    } catch (error: unknown) {
      const apiError = error instanceof AfApiError ? error : undefined;
      push({ tone: "warn", title: "Git operation 确认失败", body: `${apiError?.code ?? "AF_NETWORK_ERROR"} · ${apiError?.message ?? "无法确认外部写入"}` });
    } finally {
      setConfirmingOperationId(null);
    }
  }, [activeId, fetchTaskRuntime, push]);

  const planGitOperation = useCallback(async () => {
    if (!activeId || !taskRuntime?.preparedDelivery) return;
    const provider = scmProviders.find((candidate) =>
      candidate.provider === taskRuntime.provider && candidate.mcpServerRef === taskRuntime.mcpServerRef,
    );
    if (!provider || !provider.available) {
      push({ tone: "warn", title: "无法生成 SCM operation", body: provider?.errorMessage ?? "任务冻结的 SCM MCP Server 当前不可用。" });
      return;
    }
    setPlanningOperation(true);
    try {
      const prepared = taskRuntime.preparedDelivery;
      const operation = await afApi.createPushOperation(activeId, {
        idempotencyKey: `git-plan:${activeId}:${prepared.sourceRevision}:${prepared.changeSet.digest}`,
        provider: taskRuntime.provider,
        mcpServerRef: taskRuntime.mcpServerRef,
        credentialRef: provider.credentialRef,
        targetBranch: prepared.targetBranch,
        sourceRevision: prepared.sourceRevision,
        changeSetDigest: prepared.changeSet.digest,
        commitMessage: `feat: AgentFlow task ${activeId}`,
      });
      await fetchTaskRuntime(activeId);
      push({ tone: "info", title: "SCM operation 已生成", body: `${operation.operationId} · ${operation.status}，等待人工确认远端写入。` });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法生成 SCM operation");
      push({ tone: "warn", title: "SCM operation 生成失败", body: `${failure.code} · ${failure.message}` });
    } finally {
      setPlanningOperation(false);
    }
  }, [activeId, fetchTaskRuntime, push, scmProviders, taskRuntime]);

  const freezeWorkSpec = useCallback(async (draft: WorkSpecDraftInput) => {
    if (!activeId || !active) return;
    const provider = scmProviders.find((item) => item.provider === (draft.repository?.provider ?? taskRuntime?.provider) && item.mcpServerRef === (draft.repository?.mcpServerRef ?? taskRuntime?.mcpServerRef));
    const repository = draft.repository ?? {
      provider: taskRuntime?.provider ?? provider?.provider ?? "github",
      mcpServerRef: taskRuntime?.mcpServerRef ?? provider?.mcpServerRef ?? "github-official",
      repositoryRef: taskRuntime?.repositoryRef ?? active.repo,
      baseBranch: taskRuntime?.baseBranch ?? "main",
      targetBranch: taskRuntime?.targetBranch ?? active.branch,
      credentialRef: provider?.credentialRef ?? "GITHUB_AGENTFLOW_TOKEN",
    };
    const criteria = (draft.doneCriteria ?? []).map((criterion, index) => {
      const preset = criterionDefaultFor(criterion.description ?? "", index);
      const canonicalId = standardCriterionDefaults.some((item) => item.criterionId === criterion.criterionId)
        ? criterion.criterionId
        : preset.criterionId;
      return {
        criterionId: canonicalId,
        required: criterion.required !== false,
        description: criterion.description.trim(),
        verifierId: criterion.verifierId && criterion.verifierId !== "human-review" ? criterion.verifierId : preset.verifierId,
        verifierVersion: criterion.verifierVersion || preset.verifierVersion,
        expected: criterion.expected?.trim() || preset.expected,
        evidencePolicy: { evidenceTypes: criterion.evidencePolicy?.evidenceTypes?.length ? criterion.evidencePolicy.evidenceTypes : [...preset.evidenceTypes], minCount: criterion.evidencePolicy?.minCount ?? 1, retention: criterion.evidencePolicy?.retention || "task-lifetime" },
      };
    });
    const uniqueCriteria = criteria.map((criterion, index, all) => all.slice(0, index).some((item) => item.criterionId === criterion.criterionId)
      ? { ...criterion, required: false, criterionId: `criterion-optional-${index + 1}-${slug(criterion.description)}` }
      : criterion);
    const excludedPaths = draft.scope?.excluded ?? [".git/**"];
    const allowedPaths = Array.from(new Set([...(draft.constraints?.allowedPaths ?? []).filter(isPathPattern), "src/**", "test/**", "docs/**"]));
    const includedPaths = Array.from(new Set([...(draft.scope?.included ?? []).filter(isPathPattern), "src/**", "test/**", "docs/**"]));
    const payload: WorkSpecDraftInput = {
      schemaVersion: 1,
      title: draft.title?.trim() || active.title,
      objective: draft.objective?.trim() || active.title,
      background: draft.background ?? "",
      scope: { included: includedPaths.filter((path) => !excludedPaths.includes(path)), excluded: excludedPaths },
      inputs: draft.inputs ?? [],
      doneCriteria: uniqueCriteria,
      deliverables: draft.deliverables?.length ? draft.deliverables.map((item) => ({ ...item, criterionIds: item.criterionIds?.map((id) => uniqueCriteria.some((criterion) => criterion.criterionId === id) ? id : undefined).filter((id): id is string => Boolean(id)).length ? item.criterionIds?.map((id) => uniqueCriteria.some((criterion) => criterion.criterionId === id) ? id : undefined).filter((id): id is string => Boolean(id)) : uniqueCriteria.map((criterion) => criterion.criterionId) })) : [{ deliverableId: "source-change", kind: "change-set", description: "受限源码变更", criterionIds: uniqueCriteria.map((criterion) => criterion.criterionId) }],
      repository,
      constraints: { ...(draft.constraints ?? { forbiddenPaths: [".git/**"], allowedCommands: [], maxNodes: 9, maxAttempts: 3, maxWallTimeMs: 3_600_000, workspaceWriteConcurrency: 1, externalWrite: { requiresApproval: true, allowedBranches: [repository.targetBranch] } }), allowedPaths: allowedPaths.filter((path) => !((draft.constraints?.forbiddenPaths ?? [".git/**"]).includes(path))), forbiddenPaths: draft.constraints?.forbiddenPaths ?? [".git/**"] },
      policies: draft.policies ?? { policyVersion: taskRuntime?.workflow.policyVersion ?? "1.0.0", approval: "human", rework: "fail-target" },
      templateRef: draft.templateRef ?? { templateId: "standard-code-change", templateVersion: "2.0" },
    };
    try {
      setGovernanceLoad({ status: "loading" });
      await afApi.saveWorkSpec(activeId, payload);
      setWorkSpecDraft(payload);
      setWorkSpecRevisionEditing(false);
      await Promise.all([fetchGovernance(activeId), fetchTaskRuntime(activeId)]);
      push({ tone: "ok", title: "WorkSpec 已冻结", body: "服务端已生成不可变 revision 与 digest，后续规划将引用该事实。" });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法保存 WorkSpec");
      setGovernanceLoad({ status: "error", ...failure });
      push({ tone: "warn", title: "WorkSpec 冻结失败", body: `${failure.code} · ${failure.message}` });
    }
  }, [active, activeId, fetchGovernance, fetchTaskRuntime, push, scmProviders, taskRuntime]);

  const createWorkSpecRevision = useCallback(() => {
    if (!governance.workSpec) return;
    setWorkSpecDraft({
      title: governance.workSpec.title,
      objective: governance.workSpec.objective,
      background: governance.workSpec.background ?? "",
      scope: governance.workSpec.scope,
      inputs: governance.workSpec.inputs ?? [],
      doneCriteria: governance.workSpec.doneCriteria ?? [],
      deliverables: governance.workSpec.deliverables ?? [],
      repository: governance.workSpec.repository,
      constraints: governance.workSpec.constraints,
      policies: governance.workSpec.policies,
      templateRef: governance.workSpec.templateRef,
    });
    setWorkSpecRevisionEditing(true);
    push({ tone: "info", title: "已打开 WorkSpec 新 revision", body: "这是当前冻结事实的可编辑副本；保存后服务端会生成下一 revision，并使旧 Proposal/Plan 失效。" });
  }, [governance.workSpec, push]);

  const answerRequirements = useCallback(async (input: { sourceAttemptId: string; answers: Array<{ questionId?: string; question: string; answer: string; category?: "external-write" | "authorization" | "acceptance-conflict" | "scope" | "security" }>; reason: string }) => {
    if (!activeId || !governance.workSpec) return;
    if (afApi.mode === "fixture") {
      push({ tone: "warn", title: "Fixture 模式不支持澄清写入", body: "回答未写入治理事实；请切换到 HTTP AF API 后重试。" });
      return;
    }
    const expectedRevision = taskRuntime?.revision;
    if (expectedRevision === undefined) {
      push({ tone: "warn", title: "无法提交 Requirements 澄清", body: "当前任务 revision 尚未加载完成，请刷新后重试。" });
      return;
    }
    setClarificationSubmitting(true);
    try {
      setGovernanceLoad({ status: "loading" });
      await afApi.applyRequirementsClarification(activeId, { schemaVersion: 1, expectedRevision, clarificationId: `${activeId}:clarification:${Date.now()}`, sourceAttemptId: input.sourceAttemptId, answers: input.answers, reason: input.reason, workSpecPatch: {} });
      setWorkSpecDraft(undefined);
      setWorkSpecRevisionEditing(false);
      await Promise.all([fetchGovernance(activeId), fetchTaskRuntime(activeId)]);
      push({ tone: "ok", title: "澄清已留痕并生成新 revision", body: "旧 attempt/gate 保留为证据。请重新生成 Proposal、运行 Compiler、审批 Plan 后再启动。" });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法提交 Requirements 澄清");
      setGovernanceLoad({ status: "error", ...failure });
      push({ tone: "warn", title: "澄清提交失败", body: `${failure.code} · ${failure.message}` });
    } finally {
      setClarificationSubmitting(false);
    }
  }, [activeId, fetchGovernance, fetchTaskRuntime, governance.workSpec, push, taskRuntime?.revision]);

  const requestProposal = useCallback(async () => {
    if (!activeId || !governance.workSpec) return;
    try {
      // WorkSpec, catalog/template identities and inputSnapshotDigest are
      // server-owned. The browser only requests initial planning.
      await afApi.requestSupervisor(activeId, "initial-plan", { schemaVersion: 1 });
      await fetchGovernance(activeId);
      push({ tone: "ok", title: "Proposal 已生成", body: "Supervisor 提案已进入服务端治理事实。" });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法生成 Supervisor Proposal");
      push({ tone: "warn", title: "Proposal 生成失败", body: `${failure.code} · ${failure.message}` });
    }
  }, [activeId, fetchGovernance, governance.workSpec, push]);

  const compilePlan = useCallback(async () => {
    if (!activeId || !governance.proposal) return;
    try {
      await afApi.compilePlan(activeId);
      await fetchGovernance(activeId);
      push({ tone: "ok", title: "CompilationReport 已生成", body: "确定性 Compiler 已保存报告与 ExecutionPlanRevision。" });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法运行 Plan Compiler");
      push({ tone: "warn", title: "Compiler 拒绝", body: `${failure.code} · ${failure.message}` });
    }
  }, [activeId, fetchGovernance, governance.proposal, push]);

  const decidePlan = useCallback(async (decision: "approved" | "rejected") => {
    if (!activeId || !governance.plan || !governance.proposal) return;
    try {
      await afApi.savePlanDecision(activeId, { schemaVersion: 1, decisionId: `decision-${Date.now()}`, governanceDigest: governance.plan.governanceDigest ?? taskRuntime?.workflow.nodeSpecDigest ?? governance.proposal.governanceDigest, proposalDigest: governance.proposal.proposalDigest, decision, reason: decision === "approved" ? "人工审阅通过当前冻结计划" : "人工审阅拒绝当前冻结计划" });
      await fetchGovernance(activeId);
      push({ tone: decision === "approved" ? "ok" : "warn", title: decision === "approved" ? "计划已批准" : "计划已拒绝", body: "PlanDecision 已由服务端记录。" });
    } catch (error: unknown) {
      const failure = apiFailure(error, "无法记录 PlanDecision");
      push({ tone: "warn", title: "计划决策失败", body: `${failure.code} · ${failure.message}` });
    }
  }, [activeId, fetchGovernance, governance.plan, governance.proposal, push, taskRuntime]);

  /* --- 常驻治理动作条的派生值 --------------------------------------------
     判据与 GovernanceView 逐条对齐：任务聚合是控制动作的权威，
     RunIntent 只是运行请求的状态；受阻时绝不把不可逆动作显示成可点。 */
  const govStatus = governance.runIntent?.status ?? taskRuntime?.status ?? active?.state;
  const runActive = ["queued", "claimed", "running", "yielded"].includes(String(governance.runIntent?.status));
  const controlBlocked = ["awaiting_human", "blocked_unavailable", "needs_reconcile"].includes(String(taskRuntime?.status));
  /* busyAction 与 GovernanceView 的 prop 同型（string | null）：当前只会在
     clarification / governance / run 三态之间取值，proposal/compile/decision
     的按钮文案分支与 GovernanceView 保持一致，留作后续细分。 */
  const govBusy: string | null = clarificationSubmitting
    ? "clarification"
    : governanceLoad.status === "loading"
      ? "governance"
      : startingTaskId === activeId
        ? "run"
        : null;

  /* 停在人工检查点时，主按钮必须是「继续推进这件事」的那一个动作。
     这些动作此前只存在于默认折叠的「控制面事实」里，用户根本找不到入口。 */
  const awaitingNode = useMemo(
    () => taskRuntime?.nodes.find((node) => node.status === "awaiting_approval") ?? null,
    [taskRuntime],
  );
  const awaitingPreparedOperation = useMemo(() => {
    const prepared = taskRuntime?.preparedDelivery;
    if (!prepared) return null;
    return taskRuntime?.gitOperations.find((operation) =>
      operation.sourceRevision === prepared.sourceRevision &&
      operation.changeSet.digest === prepared.changeSet.digest &&
      operation.targetBranch === prepared.targetBranch,
    ) ?? null;
  }, [taskRuntime]);

  /* 下一步动作只出一个主按钮：顺序即治理链路 WorkSpec → Proposal → Compiler
     → PlanDecision → RunIntent → 人工检查点。没有可做的动作时返回 null。 */
  const primaryAction = useMemo((): { label: string; disabled: boolean; onClick: () => void } | null => {
    const disabled = govBusy !== null || runActive;
    /* 终态任务没有「下一步治理动作」：留着禁用按钮只会让人以为漏点了什么。
       返回 null，让动作条只保留状态与「治理事实」入口。 */
    if (["completed", "cancelled", "failed"].includes(String(taskRuntime?.status))) return null;
    /* 人工检查点优先于运行推进：此时 RunIntent 已 yield，再点「开始执行任务」
       既不会前进也说不清下一步该做什么。 */
    if (awaitingNode) {
      const isGitNode = awaitingNode.kind === "git";
      if (isGitNode && taskRuntime?.preparedDelivery && awaitingPreparedOperation === null) {
        return { label: planningOperation ? "正在准备远端写入…" : "准备远端写入操作", disabled: planningOperation, onClick: () => void planGitOperation() };
      }
      if (isGitNode && awaitingPreparedOperation && awaitingPreparedOperation.status !== "committed") {
        return {
          label: confirmingOperationId === awaitingPreparedOperation.operationId ? "确认中…" : "确认 MCP 功能分支写入",
          disabled: confirmingOperationId === awaitingPreparedOperation.operationId,
          onClick: () => void confirmGitOperation(awaitingPreparedOperation.operationId),
        };
      }
      return {
        label: approvingNodeId === awaitingNode.nodeId ? "批准并继续中…" : "批准并继续",
        disabled: approvingNodeId === awaitingNode.nodeId,
        onClick: () => void approveAndContinueTask(awaitingNode.nodeId),
      };
    }
    if (!governance.workSpec) return null;
    if (!governance.proposal) {
      return { label: govBusy === "proposal" ? "正在生成方案…" : "生成执行方案", disabled, onClick: () => void requestProposal() };
    }
    if (!governance.compilationReport) {
      return { label: govBusy === "compile" ? "正在检查执行计划…" : "检查执行计划", disabled, onClick: () => void compilePlan() };
    }
    if (governance.compilationReport.outcome === "rejected") return null;
    if (governance.plan && !governance.planDecision) {
      return { label: govBusy === "decision" ? "正在提交审批…" : "批准执行计划", disabled, onClick: () => void decidePlan("approved") };
    }
    if (governance.planDecision?.decision === "approved") {
      return {
        label: govBusy === "run" ? "正在提交运行请求…" : "开始执行任务",
        disabled: govBusy !== null || controlBlocked || runActive || ["completed", "cancelled"].includes(String(taskRuntime?.status)),
        onClick: () => void startLiveTask(),
      };
    }
    return null;
  }, [approveAndContinueTask, approvingNodeId, awaitingNode, awaitingPreparedOperation, compilePlan, confirmGitOperation, confirmingOperationId, controlBlocked, decidePlan, govBusy, governance.compilationReport, governance.plan, governance.planDecision, governance.proposal, governance.workSpec, planGitOperation, planningOperation, requestProposal, runActive, startLiveTask, taskRuntime?.preparedDelivery, taskRuntime?.status]);

  /* 折叠事实被展开时，动作条的「治理事实」入口滚到它，一次点击到位 */
  const openFacts = useCallback(() => {
    setFactsOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("waterfall-facts")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  /* 运行活性：静态的「执行中」不足以让人判断是在推进还是卡住。
     lastAdvanceAt 是控制面记录的最近一次节点推进时间，缺失时回落到 updatedAt；
     页面每 2 秒轮询并重渲染，相对时间随之刷新，不需要额外的定时器。
     等待人工/审批/对账是合法停等：此时不推进是设计使然，不能报成停滞。 */
  const lastActivityAt = governance.runIntent?.lastAdvanceAt ?? governance.runIntent?.updatedAt;
  const nowMs = Date.now();
  const lastActivityMs = lastActivityAt ? Date.parse(lastActivityAt) : Number.NaN;
  const lastActivityLabel = relativeTimeLabel(lastActivityAt, nowMs);
  const awaitingHuman =
    taskRuntime?.nodes.some((node) => node.status === "awaiting_approval") === true ||
    String(governance.runIntent?.yieldedReason ?? "").startsWith("awaiting");
  const runStalled =
    runActive &&
    !awaitingHuman &&
    Number.isFinite(lastActivityMs) &&
    nowMs - lastActivityMs > RUN_STALL_THRESHOLD_MS;

  /* 必需验收项无法裁决时，任务永远不会走到 completed（完成守卫按 criterion
     逐条判定）。此前这种状态只在「治理事实」里可见，动作条不给任何提示，
     用户会反复点「批准并继续」却看不出为什么没进展。 */
  const blockingCriteria = useMemo(() => {
    const bindings = normalizePlanPayload(governance.plan?.payload)?.criterionBindings ?? [];
    if (bindings.length === 0) return [];
    const outcomeById = new Map(governance.assessments.map((assessment) => [assessment.criterionId, assessment]));
    return bindings
      .filter((binding) => binding.required !== false)
      .flatMap((binding) => {
        const criterionId = binding.criterionId;
        if (criterionId === undefined) return [];
        const assessment = outcomeById.get(criterionId);
        if (assessment === undefined) return [];
        /* pending / pending-human 是「尚未裁决」，不是失败：任务可能仍在推进，
           此时提示会误导。只有已裁决为 fail/unavailable 才真正卡住收尾。 */
        if (assessment.outcome !== "fail" && assessment.outcome !== "unavailable") return [];
        return [{ criterionId, outcome: assessment.outcome, reason: assessment.reason }];
      });
  }, [governance.assessments, governance.plan]);

  /* 动作条右侧的后果说明：说清「为什么现在不能点 / 该点哪个」 */
  const govHint = (() => {
    if (taskRuntime?.status === "completed") return "任务已完成；交付物、门禁与证据已归档，可在「治理事实」中复核。";
    if (taskRuntime?.status === "cancelled") return "任务已取消；历史事实与审计轨迹保留，可归档或恢复显示。";
    if (taskRuntime?.status === "failed") return "任务已失败；失败原因与已通过的门禁结论保留在「治理事实」中。";
    /* 验收项无法裁决优先于其他提示：这是任务无法收尾的真正原因。 */
    if (blockingCriteria.length > 0 && !["completed", "cancelled"].includes(String(taskRuntime?.status))) {
      const first = blockingCriteria[0]!;
      const label = first.outcome === "unavailable" ? "无法裁决" : "未通过";
      return `必需验收项「${first.criterionId}」${label}（${first.reason}）；任务不会进入已完成，请检查该项的验证器与证据。`;
    }
    /* 人工检查点的提示必须说清「现在该点哪个按钮」，而不是笼统让人去澄清。
       远端写入是两步：先生成操作、再确认写入，最后才批准节点继续。 */
    if (awaitingNode) {
      const isGitNode = awaitingNode.kind === "git";
      if (isGitNode && taskRuntime?.preparedDelivery && awaitingPreparedOperation === null) {
        return "已停在交付检查点：先点右侧按钮生成远端写入操作，确认写入内容后再批准。";
      }
      if (isGitNode && awaitingPreparedOperation && awaitingPreparedOperation.status !== "committed") {
        return "远端写入操作已生成，等待你确认；确认后远端才会真正创建功能分支。";
      }
      return `已停在人工检查点（${awaitingNode.nodeId}），确认无误后点右侧按钮继续推进。`;
    }
    if (!governance.workSpec) return "先完成任务契约（WorkSpec）冻结，服务端才会生成规划事实。";
    if (governance.compilationReport?.outcome === "rejected") return "Compiler 已拒绝当前 revision；请创建新 revision 修正 WorkSpec 后重新请求 Proposal。";
    if (controlBlocked) return `当前任务处于${taskStatusLabel(taskRuntime?.status)}，请先完成澄清、能力恢复或对账，暂不能开始执行。`;
    if (runStalled) return `超过 ${Math.round(RUN_STALL_THRESHOLD_MS / 1000)} 秒没有推进，可能在等待外部系统或已停滞。`;
    if (runActive) return "运行请求已提交，后台正在执行；请等待节点状态刷新后再操作。";
    return "";
  })();
  /* 验收项无法裁决是「任务卡住」的信号，用警示语气，不能混在普通信息里。 */
  const govHintTone = blockingCriteria.length > 0 || controlBlocked || runStalled || governance.compilationReport?.outcome === "rejected" ? "warn" : "info";

  return (
    <div
      className="shell"
      data-sidebar={sidebarOpen ? "open" : "closed"}
      data-inspector={inspectorOpen ? "open" : "closed"}
    >
      <div className="shell__glow" aria-hidden />
      <Rail
        theme={theme}
        onToggleTheme={toggleTheme}
        onPalette={() => setPaletteOpen(true)}
        onNew={() => setNewTaskOpen(true)}
        pane={settingsPane}
        onPane={(p) => setSettingsPane((cur) => (cur === p ? null : p))}
      />
      <Sidebar
        sessions={visibleSessions}
        activeId={activeId}
        showArchived={showArchived}
        onToggleShowArchived={toggleShowArchived}
        onSelect={selectSession}
        onCancel={(id) => void cancelRun(id)}
        onArchive={archiveTask}
        onUnarchive={unarchiveTask}
        onNew={() => setNewTaskOpen(true)}
      />

      <main className="main">
        <TopBar
          session={active}
          streaming={streaming}
          sidebarOpen={sidebarOpen}
          inspectorOpen={inspectorOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleInspector={() => setInspectorOpen((v) => !v)}
          onPalette={() => setPaletteOpen(true)}
          onOpenEvidence={() => {
            setInspectorTab("evidence");
            setInspectorOpen(true);
          }}
          executorMode={executorMode}
          apiMode={afApi.mode}
          runtime={taskRuntime}
        />

        {apiLoad.status === "loading" && <div className="apiNotice" data-state="loading">正在连接 AF API…</div>}
        {apiLoad.status === "error" && (
          <div className="apiNotice" data-state="error" role="alert">
            <span>AF API 不可用 · {apiLoad.code} · {apiLoad.message}</span>
            {apiLoad.retryable && <button className="btn btn--ghost btn--sm" onClick={loadBootstrap}>重试</button>}
          </div>
        )}

        {mode === "welcome" ? (
          <Welcome onStart={runTurn} />
        ) : (
          <>
            <WorkflowStrip
              wf={workflow}
              activeIndex={wfStep}
              onOpen={() => setNewTaskOpen(true)}
              runStates={runStates}
              onNodeSelect={selectNode}
            />

            {/* 治理动作条：动作留主列常驻可见，完整治理事实折叠进瀑布底部。
                判据与 GovernanceView 一致，避免同一动作在两处呈现不同的可点性。 */}
            <div className="govBar">
              <div className="govBar__status">
                <span className="govPill" data-tone={taskStatusTone(govStatus)}>{taskStatusLabel(govStatus)}</span>
                {runActive && (
                  <span className="govBar__liveness" data-stalled={runStalled} data-waiting={awaitingHuman}>
                    {awaitingHuman ? "等待人工确认 · " : ""}最后活动 {lastActivityLabel}
                  </span>
                )}
              </div>
              <div className="govBar__actions">
                {primaryAction && (
                  <button className="btn btn--accent btn--sm" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
                    {primaryAction.label}
                  </button>
                )}
                <button className="btn btn--ghost btn--sm" onClick={openFacts}>治理事实</button>
              </div>
              {govHint && (
                <span className="govBar__hint" data-tone={govHintTone}>{govHint}</span>
              )}
            </div>

            {/* 主列唯一滚动区：阶段卡片 + 事件流 + 折叠事实。 */}
            <div className="waterfall">
              <Waterfall
                cards={stageCards}
                openIds={openStages}
                onToggle={toggleStage}
                traceOf={traceOf}
                factsOpen={factsOpen}
                onToggleFacts={() => setFactsOpen((v) => !v)}
                controlsOpen={controlsOpen}
                onToggleControls={() => setControlsOpen((v) => !v)}
                facts={activeId ? (
                  <GovernanceView
                    key={activeId}
                    taskId={activeId}
                    taskStatus={taskRuntime?.status ?? active?.state}
                    workSpec={governance.workSpec}
                    proposal={governance.proposal}
                    compilationReport={governance.compilationReport}
                    plan={governance.plan}
                    planDecision={governance.planDecision}
                    runIntent={governance.runIntent}
                    attempts={taskRuntime?.attempts ?? []}
                    gates={taskRuntime?.rawGates ?? []}
                    approvals={governance.approvals}
                    evidenceMatrix={governance.evidenceMatrix}
                    scmOperations={taskRuntime?.gitOperations ?? []}
                    trustedDelivery={governance.trustedDelivery}
                    runMode={taskRuntime?.runMode ?? governance.runMode}
                    apiMode={afApi.mode}
                    workSpecEditable={!governance.workSpec || workSpecRevisionEditing}
                    workSpecDraft={workSpecDraft}
                    onWorkSpecDraftChange={setWorkSpecDraft}
                    onFreezeWorkSpec={(draft) => void freezeWorkSpec(draft)}
                    onCreateWorkSpecRevision={createWorkSpecRevision}
                    onRequestProposal={() => void requestProposal()}
                    onCompile={() => void compilePlan()}
                    onPlanDecision={(decision) => void decidePlan(decision)}
                    onRun={() => void startLiveTask()}
                    onAnswerRequirements={(input) => void answerRequirements(input)}
                    busyAction={govBusy}
                  />
                ) : null}
                controls={
                  <RuntimeConsole
                    detail={taskRuntime}
                    trajectory={trajectory}
                    load={runtimeLoad}
                    profiles={agentProfiles}
                    apiMode={afApi.mode}
                    starting={startingTaskId === activeId}
                    runActive={runActive}
                    onStart={() => void startLiveTask()}
                    approvingNodeId={approvingNodeId}
                    onApproveNode={(nodeId) => void approveAndContinueTask(nodeId)}
                    planningOperation={planningOperation}
                    onPlanOperation={() => void planGitOperation()}
                    confirmingOperationId={confirmingOperationId}
                    onConfirmOperation={(operationId) => void confirmGitOperation(operationId)}
                    onRefresh={() => { if (activeId) void fetchTaskRuntime(activeId); }}
                  />
                }
                stream={
                  /* 事件流只承担人工检查点这一操作入口；没有待处理检查点时
                     不渲染空壳，也不重复阶段卡已展示的节点产出。 */
                  events.length > 0 ? (
                    <Stream
                      events={events}
                      streaming={streaming}
                      pendingApproval={pendingApproval}
                      onApprove={resolveApproval}
                      onCheckpoint={handleCheckpoint}
                      planPending={planPending}
                      onAcceptPlan={acceptPlan}
                      onOpenFile={(p) => {
                        setActiveFile(p);
                        setInspectorTab("diff");
                        setInspectorOpen(true);
                      }}
                      onCopy={() => push({ tone: "ok", title: "已复制", body: "内容在剪贴板中。" })}
                    />
                  ) : null
                }
              />
            </div>
          </>
        )}

        <Composer
          streaming={streaming}
          modelProviders={modelProviders}
          planPending={planPending}
          onSend={runTurn}
          onStop={stop}
          onPalette={() => setPaletteOpen(true)}
        />
      </main>

      {/* 没有会话时检查面板无内容可查（文件、改动、证据链都属于某条会话），
          整块不渲染，而不是渲染一个各处为空的空壳 */}
      {active && (
        <Inspector
          tab={inspectorTab}
          onTab={setInspectorTab}
          activeFile={shownFile}
          onFile={setActiveFile}
          session={active}
          bundle={inspectorBundleShown}
          onClose={() => setInspectorOpen(false)}
          onToast={push}
        />
      )}

      {paletteOpen && (
        <Palette onClose={() => setPaletteOpen(false)} onRun={paletteAction} />
      )}
      {settingsPane && (
        <SettingsOverlay
          pane={settingsPane}
          onPane={setSettingsPane}
          onClose={() => setSettingsPane(null)}
          onToast={push}
          runtime={archRuntime}
          onJump={archJump}
        />
      )}
      {newTaskOpen && (
        <NewTaskDialog
          onClose={() => setNewTaskOpen(false)}
          onStart={startTask}
          onToast={push}
          workflows={workflowCatalog}
          profiles={agentProfiles}
          skills={skillCatalog}
          scmProviders={scmProviders}
          onValidateWorkflow={validateWorkflow}
          existingBranches={sessionList.map((session) => session.branch)}
        />
      )}
      <Toasts items={toasts} />
    </div>
  );
}
