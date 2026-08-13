import { Icon } from "./Icons";
import type { Session } from "../data/mock";
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

export function TopBar({
  session,
  streaming,
  sidebarOpen,
  inspectorOpen,
  onToggleSidebar,
  onToggleInspector,
  onPalette,
  onOpenEvidence,
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
}) {
  /* 门禁进度：已通过节点数决定“这条任务走到哪一步可以被信任” */
  const passed = qualityGates.filter((g) => g.state === "passed").length;
  const current = qualityGates.find((g) => g.state === "active" || g.state === "blocked");

  /* 证据链就绪度：必需证据未闭环时，交付门禁不允许放行 */
  const evReady = evidenceChain.filter((e) => e.confirmed).length;
  const evBlocking = evidenceChain.filter((e) => !e.confirmed && e.required).length;

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
        title={`门禁 ${passed}/${qualityGates.length} 已通过${
          current ? ` · 当前 ${current.index} ${current.name}（${gateStateLabel[current.state]}）` : ""
        } · 证据链 ${evReady}/${evidenceChain.length} 已核实`}
      >
        <span className="gateRail__pips">
          {qualityGates.map((g) => {
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
            {evReady}/{evidenceChain.length}
          </span>
        </span>
      </button>

      <div className="topbar__right">
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

