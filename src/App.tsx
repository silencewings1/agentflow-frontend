import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  type AgentEvent,
  type Session,
  type Theme,
} from "./data/mock";
import { afApi, AfApiError, structuredToEvents, toUiBootstrap, toWorkflowDto } from "./api";
import { realInspectorBundle } from "./api/inspectorMapper";
import type { AgentProfileSummaryDto, ApprovalQueryDto, CompilationReportDto, CriterionAssessmentDto, EvidenceMatrixDto, ExecutorMode, FaultInjectionDto, PlanDecisionDto, PlanDto, ProposalDto, RunIntentDto, RunMode, ScmProviderDto, SkillSummaryDto, TaskDetailDto, TrajectoryEventDto, TrustedDeliveryDto, WorkSpecDraftInput, WorkSpecDto, WorkflowValidation } from "./api";
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
import { WorkflowStrip, NodeConversation } from "./components/Workflow";
import { RuntimeConsole, type RuntimeLoadState } from "./components/RuntimeConsole";
import { GovernanceView } from "./components/GovernanceView";
import { defaultModel, modelOptions } from "./data/settings";
import {
  buildOrchestratorPlan,
  runOf,
  workflowTemplates,
  type OrchestratorPlanEvent,
  type WfRunStates,
  type Workflow,
} from "./data/workflows";

export type ApprovalMode = "auto" | "ask" | "readonly";
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
  const pathItems = scopeItems.filter((item) => /[/*\\]/.test(item));
  const included = Array.from(new Set([...(pathItems.length ? pathItems : []), "src/**", "test/**", "docs/**"]));
  const criteria = (contractData?.doneCriteria ?? []).map((text, index) => {
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
    templateRef: { templateId: "standard-code-change", templateVersion: "1.7" },
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

let toastSeq = 0;

export default function App() {
  const [theme, setTheme] = useState<Theme>("lumen");
  const [activeId, setActiveId] = useState<string>("");
  /* 任务列表由 AF API bootstrap 注入；fixture 只由 api/client.ts 作为兜底适配器提供。 */
  const [sessionList, setSessionList] = useState<Session[]>([]);
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
  const [runtimeLoad, setRuntimeLoad] = useState<RuntimeLoadState>({ status: "idle" });
  const [governanceLoad, setGovernanceLoad] = useState<GovernanceLoadState>({ status: "idle" });
  const [governance, setGovernance] = useState<GovernanceSnapshot>({ workSpec: null, proposal: null, compilationReport: null, plan: null, planDecision: null, runIntent: null, assessments: [], evidenceMatrix: null, approvals: null, trustedDelivery: null });
  const [workSpecDraft, setWorkSpecDraft] = useState<WorkSpecDraftInput | undefined>(undefined);
  const [workSpecRevisionEditing, setWorkSpecRevisionEditing] = useState(false);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [approvingNodeId, setApprovingNodeId] = useState<string | null>(null);
  const [planningOperation, setPlanningOperation] = useState(false);
  const [confirmingOperationId, setConfirmingOperationId] = useState<string | null>(null);
  const [wfStep, setWfStep] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("ask");
  const [model, setModel] = useState(defaultModel);
  const [mode, setMode] = useState<"session" | "welcome">("welcome");

  /* --- streamed event window --------------------------------------------- */
  const [visible, setVisible] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);
  const [extra, setExtra] = useState<AgentEvent[]>([]);

  /* --- 两阶段流水线 --------------------------------------------------------
     阶段一：主控出规划方案，planPending 期间流水线不动、输入框转为「提修改意见」
     阶段二：focusNode 非空时，会话区整体切换为该节点的消息视图 */
  const [planEvent, setPlanEvent] = useState<OrchestratorPlanEvent | null>(null);
  const [planPending, setPlanPending] = useState(false);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  /* planPending 的同步镜像：acceptPlan 内紧接着要调 runTurn，
     而此时 setPlanPending(false) 尚未生效，闭包里读到的仍是旧值，
     会导致确认动作被误判为「又一轮修改意见」。用 ref 做同步判据。 */
  const planPendingRef = useRef(false);

  const timers = useRef<number[]>([]);
  /* 流水线节点推进的定时器单独存放：runTurn / startTask 会清空 timers 以
     中断上一轮脚本播放，若与推进共用一个数组，推进会被连带清掉（表现为
     流水线卡在中途不动）。两者生命周期不同，就该分开管。 */
  const stepTimers = useRef<number[]>([]);
  const currentActiveRef = useRef("");
  const preferredActiveRef = useRef<string | null>(null);

  useEffect(() => { currentActiveRef.current = activeId; }, [activeId]);

  /* 首屏只依赖 AF API。未配置后端时，client 会显式走 fixture adapter，
     但组件仍通过同一套 API 契约工作，接入真实服务无需改页面状态模型。 */
  const loadBootstrap = useCallback(() => {
    setApiLoad({ status: "loading" });
    let disposed = false;
    afApi.bootstrap().then((data) => {
      if (disposed) return;
      const ui = toUiBootstrap(data);
      setWorkflowCatalog(ui.workflows);
      setSessionList(ui.tasks);
      setExecutorMode(ui.executorMode);
      setAgentProfiles(ui.agentProfiles);
      setSkillCatalog(ui.skills);
      setScmProviders(ui.scmProviders);
      setApiLoad({ status: "ready" });
      const requestedId = preferredActiveRef.current ?? currentActiveRef.current;
      const first = ui.tasks.find((task) => task.id === requestedId) ?? ui.tasks[0];
      preferredActiveRef.current = null;
      if (!first) {
        setMode("welcome");
        return;
      }
      setActiveId(first.id);
      setWorkflow(wfOf(first.workflow, ui.workflows));
      setVisible(conversationOf(first.workflow).length);
      setMode("session");
    }).catch((error: unknown) => {
      if (disposed) return;
      setApiLoad({ status: "error", ...apiFailure(error, "无法读取 AF API 首屏数据") });
      setMode("welcome");
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => loadBootstrap(), [loadBootstrap]);

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
      setGovernance({
        workSpec: latest(workSpecs),
        proposal: latest(proposals),
        compilationReport: latest(reports),
        plan: latest(plans),
        planDecision: latest(decisions),
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

  /* http 模式：检查面板用真实 detail/trajectory 归一化出的现场（文件树/diff/证据/回放）。 */
  const realBundle = useMemo(
    () => realInspectorBundle(taskRuntime, trajectory),
    [taskRuntime, trajectory],
  );

  /* 当前查看的文件必须属于当前会话：切换会话后原路径往往不在新现场里，
     此时回落到该会话改动的第一个文件，而不是让「改动」页空白。 */
  const shownFile = useMemo(() => {
    const paths = Object.keys(inspectorBundle.diffs);
    return paths.includes(activeFile) ? activeFile : (paths[0] ?? activeFile);
  }, [activeFile, inspectorBundle]);

  const events = useMemo(
    () => afApi.mode === "http"
      ? (() => {
          const rich = structuredToEvents(taskRuntime);
          if (rich.length) return rich;
          return trajectory.map((event) => ({ id: event.eventId, kind: "text" as const, body: `#${event.seq} · ${event.eventType} · ${event.summary}（${event.actor}）` }));
        })()
      : [...baseConversation.slice(0, visible), ...extra],
    [baseConversation, visible, extra, trajectory, taskRuntime],
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
      setFocusNode(null);
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

  const deleteSession = useCallback(
    (id: string) => {
      const next = sessionList.filter((s) => s.id !== id);
      setSessionList(next);
      /* 删除当前会话时切到首条；若已无会话则回到空态 */
      if (id === activeId) {
        setPlanEvent(null);
        setPlanPending(false);
        planPendingRef.current = false;
        setFocusNode(null);
        if (next.length) {
          const pick = next[0];
          setActiveId(pick.id);
          setMode("session");
          setExtra([]);
          setVisible(conversationOf(pick.workflow).length);
          setPendingApproval(null);
          setStreaming(pick.state === "running");
          /* 顶部流水线也要跟着切到接手的这条会话，否则会残留上一条的编排 */
          setWorkflow(wfOf(pick.workflow, workflowCatalog));
          setWfStep(1);
        } else {
          setMode("welcome");
          setStreaming(false);
          setPendingApproval(null);
        }
      }
      push({ tone: "warn", title: "已删除会话", body: "相关演示记录已从侧栏移除。" });
    },
    [activeId, push, sessionList, workflowCatalog],
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
    /* 规划态与节点聚焦态属于单条会话，切换时必须清掉，否则会串台 */
    setPlanEvent(null);
    setPlanPending(false);
    planPendingRef.current = false;
    setFocusNode(null);
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
      /* 这两项不再弹提示：输入框底部的下拉框已经常驻显示当前选中值，
         再弹 toast 属于重复告知 */
      if (label.includes("审批模式")) {
        const next: ApprovalMode =
          approvalMode === "ask" ? "auto" : approvalMode === "auto" ? "readonly" : "ask";
        setApprovalMode(next);
        return;
      }
      if (label.includes("模型")) {
        /* 按目录顺序轮换，而不是在两个写死的名字之间跳 */
        const ids = modelOptions.map((m) => m.id);
        const i = ids.indexOf(model);
        setModel(ids[(i + 1) % ids.length]);
        return;
      }
      if (label.includes("终端") || label.includes("重跑")) {
        setInspectorTab("terminal");
        setInspectorOpen(true);
        return;
      }
      push({ tone: "ok", title: label, body: "演示动作已触发。" });
    },
    [approvalMode, model, push, toggleTheme],
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
      push({ tone: "ok", title: "任务已启动", body: "控制面已推进到下一人工检查点或终态。" });
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
    const allowedPaths = Array.from(new Set([...(draft.constraints?.allowedPaths ?? []), "src/**", "test/**", "docs/**"]));
    const includedPaths = Array.from(new Set([...(draft.scope?.included ?? []), "src/**", "test/**", "docs/**"]));
    const payload: WorkSpecDraftInput = {
      schemaVersion: 1,
      title: draft.title?.trim() || active.title,
      objective: draft.objective?.trim() || active.title,
      background: draft.background ?? "",
      scope: { included: includedPaths, excluded: draft.scope?.excluded ?? [".git/**"] },
      inputs: draft.inputs ?? [],
      doneCriteria: uniqueCriteria,
      deliverables: draft.deliverables?.length ? draft.deliverables.map((item) => ({ ...item, criterionIds: item.criterionIds?.map((id) => uniqueCriteria.some((criterion) => criterion.criterionId === id) ? id : undefined).filter((id): id is string => Boolean(id)).length ? item.criterionIds?.map((id) => uniqueCriteria.some((criterion) => criterion.criterionId === id) ? id : undefined).filter((id): id is string => Boolean(id)) : uniqueCriteria.map((criterion) => criterion.criterionId) })) : [{ deliverableId: "source-change", kind: "change-set", description: "受限源码变更", criterionIds: uniqueCriteria.map((criterion) => criterion.criterionId) }],
      repository,
      constraints: { ...(draft.constraints ?? { forbiddenPaths: [".git/**"], allowedCommands: [], maxNodes: 9, maxAttempts: 3, maxWallTimeMs: 3_600_000, workspaceWriteConcurrency: 1, externalWrite: { requiresApproval: true, allowedBranches: [repository.targetBranch] } }), allowedPaths, forbiddenPaths: draft.constraints?.forbiddenPaths ?? [".git/**"] },
      policies: draft.policies ?? { policyVersion: taskRuntime?.workflow.policyVersion ?? "1.0.0", approval: "human", rework: "fail-target" },
      templateRef: draft.templateRef ?? { templateId: "standard-code-change", templateVersion: "1.7" },
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
        sessions={sessionList}
        activeId={activeId}
        onSelect={selectSession}
        onDelete={deleteSession}
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
              focusNode={focusNode}
              onNodeSelect={afApi.mode === "fixture" ? setFocusNode : undefined}
            />
            {/* AF 控制面事实面板：默认隐藏，主区聚焦事件流。需要时可取消注释。 */}
            <RuntimeConsole
              detail={taskRuntime}
              trajectory={trajectory}
              load={runtimeLoad}
              profiles={agentProfiles}
              apiMode={afApi.mode}
              starting={startingTaskId === activeId}
              onStart={() => void startLiveTask()}
              approvingNodeId={approvingNodeId}
              onApproveNode={(nodeId) => void approveAndContinueTask(nodeId)}
              planningOperation={planningOperation}
              onPlanOperation={() => void planGitOperation()}
              confirmingOperationId={confirmingOperationId}
              onConfirmOperation={(operationId) => void confirmGitOperation(operationId)}
              onRefresh={() => { if (activeId) void fetchTaskRuntime(activeId); }}
            />
            {activeId && (
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
                busyAction={governanceLoad.status === "loading" ? "governance" : startingTaskId === activeId ? "run" : null}
              />
            )}
            {/* 点开 DAG 节点后，会话区整体切换为该节点视图；否则为正常事件流 */}
            {focusNode ? (
              <NodeConversation
                wf={workflow}
                runStates={runStates}
                messages={wfRun.messages}
                focus={focusNode}
                onFocus={setFocusNode}
                onBack={() => setFocusNode(null)}
              />
            ) : (
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
            )}
          </>
        )}

        <Composer
          streaming={streaming}
          model={model}
          approvalMode={approvalMode}
          planPending={planPending}
          onSend={runTurn}
          onStop={stop}
          onPalette={() => setPaletteOpen(true)}
          /* 选模型与审批模式不再弹提示：下拉框自己就显示了当前选中值，
             再弹一条 toast 是重复告知，还会盖住右下角内容 */
          onPickModel={setModel}
          onPickApproval={setApprovalMode}
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
          bundle={afApi.mode === "http" ? realBundle : inspectorBundle}
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
        />
      )}
      <Toasts items={toasts} />
    </div>
  );
}
