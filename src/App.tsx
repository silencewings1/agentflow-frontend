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
import { WorkflowStrip } from "./components/Workflow";
import { workflowTemplates, type Workflow } from "./data/workflows";

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
  const [activeFile, setActiveFile] = useState<string>("src/auth/token-service.ts");
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
  const timers = useRef<number[]>([]);

  const active = useMemo(
    () => sessionList.find((s) => s.id === activeId) ?? sessionList[0],
    [activeId, sessionList],
  );

  const events = useMemo(
    () => [...conversation.slice(0, visible), ...extra],
    [visible, extra],
  );

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

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

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

  /* --- simulated agent turn ---------------------------------------------- */
  const runTurn = useCallback(
    (prompt: string, contract?: AgentEvent) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setMode("session");

      const uid = `u${Date.now()}`;
      const script: AgentEvent[] = [
        { id: `${uid}-a`, kind: "user", text: prompt },
        ...(contract ? [contract] : []),
        {
          id: `${uid}-b`,
          kind: "reasoning",
          title: "已思考 6 秒",
          body: "先确认改动范围是否会触及公共导出。仓库根目录的 AGENTS.md 要求所有新增文件带上许可头，并且改动需附带对应的测试。据此拟定最小步骤集。",
          ms: 6100,
        },
        {
          id: `${uid}-c`,
          kind: "plan",
          steps: [
            { label: "定位相关实现与调用点", status: "done" },
            { label: "按最小改动落地修改", status: "active" },
            { label: "补测试并跑通类型检查", status: "todo" },
          ],
        },
        {
          id: `${uid}-d`,
          kind: "tool",
          tool: "search",
          label: "grep",
          meta: "rotateSession — 2 files, 3 matches",
          status: "ok",
          lines: [
            "src/auth/middleware/cookie.ts:31   await tokens.rotate(req, res)",
            "src/auth/legacy/compat.ts:12       export { rotateSession }",
          ],
        },
        {
          id: `${uid}-e`,
          kind: "approval",
          command: "pnpm typecheck && pnpm vitest run test/auth",
          rationale: "需要在沙箱内执行类型检查与测试，确认改动没有破坏既有契约。",
          risk: "low",
        },
      ];

      setExtra([]);
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
    [],
  );

  const startTask = useCallback(
    (prompt: string, wf: Workflow, contract: AgentEvent) => {
      setWorkflow(wf);
      setWfStep(0);
      setNewTaskOpen(false);
      setVisible(0);
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
        state: "running",
        time: "刚刚",
        bucket: "今天",
        diff: { added: 0, removed: 0, files: 0 },
        turns: 1,
      };
      setSessionList((prev) => [newSession, ...prev.filter((s) => s.id !== sid)]);
      setActiveId(sid);
      runTurn(prompt, contract);
      push({
        tone: "ok",
        title: `已按「${wf.name}」启动`,
        body: `${wf.nodes.length} 个节点 · ${wf.edges.filter((e) => e.kind === "fail").length} 条失败回退边`,
      });
      wf.nodes.forEach((_, i) => {
        if (i === 0) return;
        const t = window.setTimeout(() => setWfStep(i), 1400 + i * 1600);
        timers.current.push(t);
      });
    },
    [push, runTurn],
  );

  const deleteSession = useCallback(
    (id: string) => {
      const next = sessionList.filter((s) => s.id !== id);
      setSessionList(next);
      /* 删除当前会话时切到首条；若已无会话则回到空态 */
      if (id === activeId) {
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
          meta: "pnpm typecheck && pnpm vitest run test/auth",
          status: "ok",
          lines: [
            "$ pnpm typecheck",
            "> tsc --noEmit -p tsconfig.json",
            "✔ 0 errors · 312 files · 4.1s",
            "",
            "$ pnpm vitest run test/auth",
            " ✓ test/auth/token-service.spec.ts (9 tests) 208ms",
            " ✓ test/auth/middleware.spec.ts (14 tests) 322ms",
            " Tests  23 passed (23)",
          ],
        },
        { id: `${id}-t`, kind: "tests", passed: 23, failed: 0, skipped: 1, ms: 1380 },
        {
          id: `${id}-w`,
          kind: "text",
          body: "类型检查与测试全部通过，`rotateSession` 已标注为弃用并保留再导出。可以开 PR 了。",
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
    setStreaming(false);
    push({ tone: "warn", title: "已中断", body: "代理停在当前步骤。" });
  }, [push]);

  const selectSession = useCallback((s: Session) => {
    setActiveId(s.id);
    setMode("session");
    setExtra([]);
    setVisible(conversation.length);
    setPendingApproval(null);
    setStreaming(s.state === "running");
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
          model={model}
          approvalMode={approvalMode}
          streaming={streaming}
          sidebarOpen={sidebarOpen}
          inspectorOpen={inspectorOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleInspector={() => setInspectorOpen((v) => !v)}
          onCycleApproval={() =>
            setApprovalMode((m) =>
              m === "ask" ? "auto" : m === "auto" ? "readonly" : "ask",
            )
          }
          onCycleModel={() =>
            setModel((m) => (m === "agentflow-large" ? "agentflow-swift" : "agentflow-large"))
          }
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
            />
            <Stream
            events={events}
            streaming={streaming}
            pendingApproval={pendingApproval}
            onApprove={resolveApproval}
            onOpenFile={(p) => {
              setActiveFile(p);
              setInspectorTab("diff");
              setInspectorOpen(true);
            }}
            onCopy={() => push({ tone: "ok", title: "已复制", body: "内容在剪贴板中。" })}
          />
          </>
        )}

        <Composer
          streaming={streaming}
          model={model}
          approvalMode={approvalMode}
          onSend={runTurn}
          onStop={stop}
          onPalette={() => setPaletteOpen(true)}
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
