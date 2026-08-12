import { Icon } from "./Icons";
import type { Session } from "../data/mock";
import type { ApprovalMode } from "../App";
import {
  evidenceChain,
  gateStateLabel,
  qualityGates,
  type GateState,
} from "../data/settings";

const approvalCopy: Record<ApprovalMode, { label: string; hint: string }> = {
  auto: { label: "自动执行", hint: "代理可直接运行命令" },
  ask: { label: "逐条确认", hint: "每条命令需你批准" },
  readonly: { label: "只读", hint: "仅分析，不写入" },
};

/* 门禁状态到视觉语义的映射：门禁是流程的必经节点，而非可跳过的提醒 */
const gateGlyph: Record<GateState, "Check" | "Dot" | "X"> = {
  passed: "Check",
  active: "Dot",
  blocked: "X",
  todo: "Dot",
};

export function TopBar({
  session,
  model,
  approvalMode,
  streaming,
  sidebarOpen,
  inspectorOpen,
  onToggleSidebar,
  onToggleInspector,
  onCycleApproval,
  onCycleModel,
  onPalette,
  onOpenEvidence,
}: {
  session: Session;
  model: string;
  approvalMode: ApprovalMode;
  streaming: boolean;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onCycleApproval: () => void;
  onCycleModel: () => void;
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

      <div className="topbar__crumbs mono">
        <span className="crumb crumb--muted">{session.repo}</span>
        <Icon.Chevron size={12} className="crumb__sep" />
        <span className="crumb crumb--branch">
          <Icon.Branch size={12} />
          {session.branch}
        </span>
      </div>

      <div className="topbar__title">
        <h2 className="serif">{session.title}</h2>
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
        <button className="chip" onClick={onCycleModel} title="切换模型">
          <Icon.Cpu size={13} />
          <span className="mono">{model}</span>
        </button>
        <button
          className="chip"
          onClick={onCycleApproval}
          data-mode={approvalMode}
          title={approvalCopy[approvalMode].hint}
        >
          <Icon.Shield size={13} />
          <span>{approvalCopy[approvalMode].label}</span>
        </button>
        <button className="chip chip--ghost" onClick={onPalette} title="命令面板">
          <Icon.Search size={13} />
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </button>
        <span className="topbar__rule" />
        <button className="btn btn--outline btn--sm" data-blocked={evBlocking > 0}>
          <Icon.Merge size={13} />
          开 PR
        </button>
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

