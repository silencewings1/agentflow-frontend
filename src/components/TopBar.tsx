import { Icon } from "./Icons";
import type { Session } from "../data/mock";
import type { ApprovalMode } from "../App";

const approvalCopy: Record<ApprovalMode, { label: string; hint: string }> = {
  auto: { label: "自动执行", hint: "代理可直接运行命令" },
  ask: { label: "逐条确认", hint: "每条命令需你批准" },
  readonly: { label: "只读", hint: "仅分析，不写入" },
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
}) {
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
        <button className="btn btn--outline btn--sm">
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
