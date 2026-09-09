import { Icon } from "./Icons";
import type { Session } from "../data/mock";
import type { ExecutorMode, TaskDetailDto } from "../api";
import {
  evidenceChain,
  gateStateLabel,
  qualityGates,
  type GateState,
} from "../data/settings";

/* 门禁状态到视觉语义的映射：门禁是流程的必经节点，而非可跳过的提醒 */
const gateGlyph: Record<GateState, "Check" | "Dot" | "X"> = {
  passed: "Check",
  active: "Dot",
  blocked: "X",
  todo: "Dot",
};

/**
 * 按节点聚合门禁记录，每个节点只保留最新一次结论。
 *
 * 门禁事实按 attempt 追加，同一节点返工/澄清重跑会有多条；界面要表达的是
 * 「这道门禁现在过没过」，因此按 nodeId 收敛到最新一条。保持首次出现顺序，
 * 让 pip 与工作流节点顺序一致。
 *
 * 优先用 rawGates（带 createdAt，可判新旧）；退回投影后的 gates 时按出现顺序
 * 取最后一条（投影顺序即追加顺序）。
 */
function aggregateGatesByNode(
  projected: TaskDetailDto["gates"],
  raw: TaskDetailDto["rawGates"],
): Array<{ gateId: string; nodeId: string; outcome: TaskDetailDto["gates"][number]["outcome"] }> {
  const source: Array<{ gateId: string; nodeId: string; outcome: TaskDetailDto["gates"][number]["outcome"]; at: number }> =
    raw && raw.length > 0
      ? raw.map((gate) => ({ gateId: gate.gateId, nodeId: gate.nodeId, outcome: gate.outcome, at: Date.parse(gate.createdAt) || 0 }))
      : projected.map((gate, index) => ({ gateId: gate.gateId, nodeId: gate.nodeId, outcome: gate.outcome, at: index }));

  const latest = new Map<string, (typeof source)[number]>();
  for (const gate of source) {
    const current = latest.get(gate.nodeId);
    if (current === undefined || gate.at >= current.at) latest.set(gate.nodeId, gate);
  }
  const ordered: Array<{ gateId: string; nodeId: string; outcome: (typeof source)[number]["outcome"] }> = [];
  const seen = new Set<string>();
  for (const gate of source) {
    if (seen.has(gate.nodeId)) continue;
    seen.add(gate.nodeId);
    const winner = latest.get(gate.nodeId);
    if (winner !== undefined) ordered.push({ gateId: winner.gateId, nodeId: winner.nodeId, outcome: winner.outcome });
  }
  return ordered;
}

export function TopBar({
  session,
  streaming,
  sidebarOpen,
  inspectorOpen,
  onToggleSidebar,
  onToggleInspector,
  onPalette,
  onOpenEvidence,
  executorMode,
  apiMode,
  runtime,
}: {
  /** 会话列表可能被删空，此时没有当前会话 */
  session: Session | undefined;
  streaming: boolean;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onPalette: () => void;
  onOpenEvidence: () => void;
  executorMode: ExecutorMode;
  apiMode: "http" | "fixture";
  runtime: TaskDetailDto | null;
}) {
  /* 门禁轨按「门禁定义」聚合，而不是按 attempt 逐条展开。
     runtime.gates 是按 attempt 记录的事实：同一节点返工或澄清后重跑会留下多条
     记录（如 requirements 先 fail 再 pass）。逐条展开会把已修复的历史失败当成
     当前状态，让已完成任务显示成受阻，并凭空多出 pip。这里按 nodeId 取最新结论。 */
  const gates: Array<{ id: string; index: string; name: string; state: GateState }> = runtime
    ? aggregateGatesByNode(runtime.gates, runtime.rawGates).map((gate, index) => ({
        id: gate.gateId,
        index: String(index + 1),
        name: gate.nodeId,
        state: gate.outcome === "pass" ? "passed" : gate.outcome === "fail" ? "blocked" : "todo",
      }))
    : qualityGates;
  const passed = gates.filter((g) => g.state === "passed").length;
  const current = gates.find((g) => g.state === "active" || g.state === "blocked");

  /* 证据链就绪度：必需证据未闭环时，交付门禁不允许放行 */
  const evReady = runtime ? runtime.nodes.reduce((count, node) => count + node.evidenceRefs.length, 0) : evidenceChain.filter((e) => e.confirmed).length;
  const evTotal = runtime ? Math.max(evReady, runtime.nodes.length + runtime.gitOperations.length) : evidenceChain.length;
  const evBlocking = runtime ? runtime.nodes.filter((node) => node.status !== "accepted").length : evidenceChain.filter((e) => !e.confirmed && e.required).length;

  return (
    <header className="topbar">
      <button
        className="iconBtn"
        onClick={onToggleSidebar}
        title={sidebarOpen ? "收起会话列表 ⌘B" : "展开会话列表 ⌘B"}
        data-on={sidebarOpen}
      >
        <Icon.Panel size={16} style={{ transform: "scaleX(-1)" }} />
      </button>

      {/* 会话被删空时没有面包屑可显示：整块隐去而不是渲染空壳，
          也不能读 session.repo —— 那会直接崩掉整个页面 */}
      {session && (
        <div className="topbar__crumbs mono">
          <span className="crumb crumb--muted">{session.repo}</span>
          <Icon.Chevron size={12} className="crumb__sep" />
          <span className="crumb crumb--branch">
            <Icon.Branch size={12} />
            {session.branch}
          </span>
        </div>
      )}

      <div className="topbar__title">
        <h2 className="serif">{session ? session.title : "新任务"}</h2>
        {streaming && (
          <span className="working mono">
            <i /> <i /> <i /> 代理执行中
          </span>
        )}
      </div>

      {/* 质量门禁进度 + 证据链就绪度：把“可信度”常驻在视野里 */}
      <button
        className="gateRail"
        onClick={onOpenEvidence}
        title={`门禁 ${passed}/${gates.length} 已通过${
          current ? ` · 当前 ${current.index} ${current.name}（${gateStateLabel[current.state]}）` : ""
        } · 证据链 ${evReady}/${evTotal} 已核实`}
      >
        <span className="gateRail__pips">
          {gates.map((g) => {
            const G = Icon[gateGlyph[g.state]];
            return (
              <i key={g.id} className="gateRail__pip" data-state={g.state}>
                <G size={9} />
                <b className="mono">{g.index}</b>
              </i>
            );
          })}
        </span>
        <span className="gateRail__rule" />
        <span className="gateRail__ev" data-blocking={evBlocking > 0}>
          <Icon.Book size={11} />
          <span className="mono">
            {evReady}/{evTotal}
          </span>
        </span>
      </button>

      <div className="topbar__right">
        <span className="chip chip--ghost mono" title="当前执行模式">
          {executorMode} · API {apiMode}
        </span>
        {/* 模型与审批模式已下移至输入框底部：决策点紧邻输入 */}
        <button className="chip chip--ghost" onClick={onPalette} title="命令面板">
          <Icon.Search size={13} />
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </button>
        <span className="topbar__rule" />
        <button
          className="iconBtn"
          onClick={onToggleInspector}
          title={inspectorOpen ? "收起检查面板 ⌘\\" : "展开检查面板 ⌘\\"}
          data-on={inspectorOpen}
        >
          <Icon.Panel size={16} />
        </button>
      </div>
    </header>
  );
}
