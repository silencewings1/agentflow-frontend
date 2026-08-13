import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  conversation,
  sessions,
  type AgentEvent,
  type Session,
  type Theme,
} from "./data/mock";
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
import { NewTaskDialog } from "./components/NewTask";
import { WorkflowStrip, NodeConversation } from "./components/Workflow";
import {
  buildOrchestratorPlan,
  runOf,
  workflowTemplates,
  type OrchestratorPlanEvent,
  type WfRunStates,
  type Workflow,
} from "./data/workflows";

export type ApprovalMode = "auto" | "ask" | "readonly";

let toastSeq = 0;

export default function App() {
  const [theme, setTheme] = useState<Theme>("lumen");
  const [activeId, setActiveId] = useState<string>("s-1");
  /* 会话列表为运行时状态：新建任务会追加，删除会移除，不再只读自静态数据 */
  const [sessionList, setSessionList] = useState<Session[]>(sessions);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("files");
  const [activeFile, setActiveFile] = useState<string>("src/main/java/com/sse/vote/qfii/collect/CollectWindowService.java");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow>(workflowTemplates[0]);
  const [wfStep, setWfStep] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("ask");
  const [model, setModel] = useState("agentflow-large");
  const [mode, setMode] = useState<"session" | "welcome">("session");

  /* --- streamed event window --------------------------------------------- */
  const [visible, setVisible] = useState(conversation.length);
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

  const active = useMemo(
    () => sessionList.find((s) => s.id === activeId) ?? sessionList[0],
    [activeId, sessionList],
  );

  const events = useMemo(
    () => [...conversation.slice(0, visible), ...extra],
    [visible, extra],
  );

  /* 当前模板的模拟运行现场：换编排即换整套消息与最终态 */
  const wfRun = useMemo(() => runOf(workflow.id), [workflow.id]);

  /* 节点运行态：由当前进度推导，保证换工作流或改编排后仍然自洽。
     wfStep 之前的节点已完成，当前节点在跑，其后未开始。
     wfStep < 0 表示规划待确认、流水线尚未开跑，全部节点为未开始。
     推进到末尾后交给模板的最终态 —— 只有它知道这次是收尾还是被阻断，
     这是 wfStep 推导不出来的（推导只会一路 running 到底）。 */
  const runStates = useMemo<WfRunStates>(() => {
    const last = workflow.nodes.length - 1;
    if (wfStep >= last && Object.keys(wfRun.states).length) return wfRun.states;
    const m: WfRunStates = {};
    workflow.nodes.forEach((n, i) => {
      m[n.id] =
        wfStep < 0 ? "todo" : i < wfStep ? "done" : i === wfStep ? "running" : "todo";
    });
    return m;
  }, [workflow, wfStep, wfRun]);

  /* 五层架构的运行时切面：让「总体架构」显示当前会话在每层的实时状态 */
  const archRuntime = useMemo(
    () => ({
      workflowName: workflow.name,
      wfStep,
      wfTotal: workflow.nodes.length,
      currentNode: workflow.nodes[Math.min(wfStep, workflow.nodes.length - 1)]?.name ?? "",
      eventCount: events.length,
      streaming,
      awaitingApproval: pendingApproval !== null,
    }),
    [workflow, wfStep, events.length, streaming, pendingApproval],
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
    [revisePlan],
  );

  const startTask = useCallback(
    (prompt: string, wf: Workflow, contract: AgentEvent) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      /* 上一条任务的推进也要停掉，否则会继续改写新任务的 wfStep */
      stepTimers.current.forEach(clearTimeout);
      stepTimers.current = [];
      setWorkflow(wf);
      /* -1 表示流水线尚未开跑：规划待确认，DAG 全部节点为未开始 */
      setWfStep(-1);
      setNewTaskOpen(false);
      setVisible(0);
      setMode("session");
      setFocusNode(null);
      setPendingApproval(null);
      setStreaming(false);
      /* 新建任务落地为一条会话，进入侧栏「今天」分组并成为当前会话 */
      const repoLabel = contract.kind === "contract" ? contract.repo : "";
      const slug = prompt
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .slice(0, 3)
        .join("-")
        .slice(0, 24);
      const sid = `s-${Date.now()}`;
      const newSession: Session = {
        id: sid,
        title: prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt,
        repo: repoLabel,
        branch: `feat/${slug || "task"}`,
        /* 规划待确认，尚未进入执行 */
        state: "review",
        time: "刚刚",
        bucket: "今天",
        diff: { added: 0, removed: 0, files: 0 },
        turns: 1,
      };
      setSessionList((prev) => [newSession, ...prev.filter((s) => s.id !== sid)]);
      setActiveId(sid);

      /* 第一步只出规划方案，不推进流水线 —— 等用户确认 */
      const plan = buildOrchestratorPlan(wf, prompt);
      setPlanEvent(plan);
      setPlanPending(true);
      planPendingRef.current = true;
      setExtra([
        { id: `${sid}-u`, kind: "user", text: prompt } as AgentEvent,
        contract,
        plan,
      ]);
      push({
        tone: "info",
        title: "主控已完成规划",
        body: `${wf.nodes.length} 个节点的契约与增强提示词待你确认`,
      });
    },
    [push],
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
  }, [planEvent, workflow, activeId, runTurn, push]);

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
          setVisible(conversation.length);
          setPendingApproval(null);
          setStreaming(pick.state === "running");
        } else {
          setMode("welcome");
          setStreaming(false);
          setPendingApproval(null);
        }
      }
      push({ tone: "warn", title: "已删除会话", body: "相关演示记录已从侧栏移除。" });
    },
    [activeId, push, sessionList],
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
    setMode("session");
    setExtra([]);
    setVisible(conversation.length);
    setPendingApproval(null);
    setStreaming(s.state === "running");
    /* 规划态与节点聚焦态属于单条会话，切换时必须清掉，否则会串台 */
    setPlanEvent(null);
    setPlanPending(false);
    planPendingRef.current = false;
    setFocusNode(null);
    setWfStep(1);
  }, []);

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
      if (label.includes("审批模式")) {
        const next: ApprovalMode =
          approvalMode === "ask" ? "auto" : approvalMode === "auto" ? "readonly" : "ask";
        setApprovalMode(next);
        return push({
          tone: "ok",
          title: "审批模式",
          body: next === "auto" ? "自动执行" : next === "ask" ? "逐条确认" : "只读",
        });
      }
      if (label.includes("模型")) {
        const next = model === "agentflow-large" ? "agentflow-swift" : "agentflow-large";
        setModel(next);
        return push({ tone: "ok", title: "已切换模型", body: next });
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
        />

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
              onNodeSelect={setFocusNode}
            />
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
          onCycleModel={() => {
            const next = model === "agentflow-large" ? "agentflow-swift" : "agentflow-large";
            setModel(next);
            push({ tone: "ok", title: "已切换模型", body: next });
          }}
          onCycleApproval={() => {
            const next: ApprovalMode =
              approvalMode === "ask" ? "auto" : approvalMode === "auto" ? "readonly" : "ask";
            setApprovalMode(next);
            push({
              tone: next === "auto" ? "warn" : "ok",
              title: "审批模式",
              body:
                next === "auto"
                  ? "自动执行：低风险命令直接运行，高风险仍需放行"
                  : next === "ask"
                    ? "逐条确认：每条命令执行前请求你批准"
                    : "只读：只做分析，不产生任何写入",
            });
          }}
        />
      </main>

      <Inspector
        tab={inspectorTab}
        onTab={setInspectorTab}
        activeFile={activeFile}
        onFile={setActiveFile}
        session={active}
        onClose={() => setInspectorOpen(false)}
        onToast={push}
      />

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
        />
      )}
      <Toasts items={toasts} />
    </div>
  );
}
