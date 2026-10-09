import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icons";
import type { Theme } from "../data/mock";
import type { SettingsPane } from "./Settings";
import { ACCOUNT_ROLE_LABEL, type ActorDto } from "../api";

const NAV: { id: SettingsPane; label: string; glyph: IconName }[] = [
  { id: "arch", label: "总体架构", glyph: "Layers" },
  { id: "members", label: "成员与权限", glyph: "Key" },
  { id: "agents", label: "智能体", glyph: "Agent" },
  { id: "models", label: "模型配置", glyph: "Cpu" },
  { id: "connect", label: "连接层", glyph: "Plug" },
  { id: "env", label: "环境配置", glyph: "Cloud" },
];

/** 当前身份的角色 → 头像图标，让"谁在操作"一眼可辨。 */
const GLYPH_OF_ROLE: Record<string, IconName> = {
  requirement: "Book",
  architecture: "Layers",
  development: "Pencil",
  testing: "Beaker",
  review: "Shield",
  delivery: "Cube",
  ops: "Cloud",
  orchestrator: "Nodes",
};

export function Rail({
  theme,
  onToggleTheme,
  onPalette,
  onNew,
  pane,
  onPane,
  actor,
  onLogout,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onPalette: () => void;
  onNew: () => void;
  pane: SettingsPane | null;
  onPane: (p: SettingsPane) => void;
  /** 当前身份：头像与切换菜单都以它为准，未登录时不渲染头像。 */
  actor: ActorDto | null;
  onLogout: () => void;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);

  /* Esc 关闭切换菜单：用捕获阶段，避免被上层悬浮层的 Esc 处理抢先关掉。 */
  useEffect(() => {
    if (!switcherOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSwitcherOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [switcherOpen]);

  return (
    <aside className="rail">
      <button className="rail__mark" onClick={onNew} title="AgentFlow">
        <Icon.Logo size={19} className="rail__markGlyph" />
      </button>

      <div className="rail__group">
        {NAV.map((n) => {
          const G = Icon[n.glyph];
          return (
            <RailBtn
              key={n.id}
              label={n.label}
              active={pane === n.id}
              onClick={() => onPane(n.id)}
            >
              <G size={17} />
            </RailBtn>
          );
        })}
      </div>

      <div className="rail__spacer" />

      <div className="rail__group">
        <RailBtn label="命令面板 ⌘K" onClick={onPalette}>
          <Icon.Command size={17} />
        </RailBtn>
        <RailBtn
          label={theme === "lumen" ? "切到 Ink 暗色 ⌘J" : "切到 Lumen 亮色 ⌘J"}
          onClick={onToggleTheme}
        >
          {theme === "lumen" ? <Icon.Moon size={17} /> : <Icon.Sun size={17} />}
        </RailBtn>
        {actor !== null && (
          <div className="rail__avatarWrap">
            <button
              className="rail__avatar"
              data-tint="accent"
              title={actor.accountId === null ? "未登录" : `${actor.name} · ${actor.handle}`}
              onClick={() => setSwitcherOpen((value) => !value)}
            >
              {(() => {
                const G = Icon[GLYPH_OF_ROLE[actor.role ?? ""] ?? "Agent"];
                return <G size={15} />;
              })()}
            </button>
            {switcherOpen && (
              <>
                <div className="rail__scrim" onClick={() => setSwitcherOpen(false)} />
                <div className="accountSwitcher">
                  <div className="accountSwitcher__head">
                    <span className="accountSwitcher__glyph" data-tint="accent">
                      {(() => {
                        const G = Icon[GLYPH_OF_ROLE[actor.role ?? ""] ?? "Agent"];
                        return <G size={16} />;
                      })()}
                    </span>
                    <div className="accountSwitcher__headText">
                      <b>{actor.name}</b>
                      <i className="mono">{actor.handle}</i>
                    </div>
                    <span className="accountSwitcher__layer">
                      {actor.role === null ? "未登录" : ACCOUNT_ROLE_LABEL[actor.role]}
                    </span>
                  </div>
                  {/* 权限是事实而不是评价：说清"能做什么"，免得用户去成员面板逐格数。
                      但**数字的口径必须写在数字旁边**：grantCount 统计的是
                      "有授权记录的责任位数（含仅可见）"，不是"能执行的责任位数"。
                      实测李雯与周林都显示 11，可执行数却是 1 与 11；
                      李雯(11) 与陈硕(1) 显示相差十倍，可执行数却同为 1。
                      只写"持有授权 N 个节点"会让读者把它当成能力数，从而高估自己。 */}
                  <div className="accountSwitcher__meta">
                    <span title="含权限等级为「可见」、只能查看不能执行的责任位">
                      责任位覆盖 <b>{actor.grantCount}</b> 个节点 · 含仅可见
                    </span>
                    <span data-on={actor.canManageAccounts ? "true" : undefined}>
                      {actor.canManageAccounts ? "可管理成员与授权" : "仅可查看成员与授权"}
                    </span>
                  </div>
                  <button
                    className="accountSwitcher__foot"
                    onClick={() => {
                      onPane("members");
                      setSwitcherOpen(false);
                    }}
                  >
                    <Icon.Key size={12} />
                    成员与权限设置
                  </button>
                  <button
                    className="accountSwitcher__foot accountSwitcher__foot--logout"
                    onClick={() => {
                      setSwitcherOpen(false);
                      onLogout();
                    }}
                  >
                    <Icon.X size={12} />
                    退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function RailBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      className="railBtn"
      data-active={active ? "true" : undefined}
      onClick={onClick}
      aria-label={label}
    >
      {children}
      <span className="railBtn__tip">{label}</span>
    </button>
  );
}
