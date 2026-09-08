import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import type { Theme } from "../data/mock";
import type { SettingsPane } from "./Settings";
import {
  accounts as defaultAccounts,
  accountById,
  type Account,
} from "../data/accounts";

const NAV: { id: SettingsPane; label: string; glyph: "Layers" | "Key" | "Agent" | "Bolt" | "Cpu" | "Plug" | "Cloud" }[] = [
  { id: "arch", label: "总体架构", glyph: "Layers" },
  { id: "members", label: "成员与权限", glyph: "Key" },
  { id: "agents", label: "智能体", glyph: "Agent" },
  { id: "skills", label: "技能配置", glyph: "Bolt" },
  { id: "models", label: "模型配置", glyph: "Cpu" },
  { id: "connect", label: "连接层", glyph: "Plug" },
  { id: "env", label: "环境配置", glyph: "Cloud" },
];

export function Rail({
  theme,
  onToggleTheme,
  onPalette,
  onNew,
  pane,
  onPane,
  accounts = defaultAccounts,
  currentAccountId,
  onLogout,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onPalette: () => void;
  onNew: () => void;
  pane: SettingsPane | null;
  onPane: (p: SettingsPane) => void;
  accounts?: Account[];
  currentAccountId: string;
  onLogout: () => void;
}) {
  const current = accountById(currentAccountId, accounts) ?? accounts[0];
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    if (!switcherOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwitcherOpen(false);
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
        <div className="rail__avatarWrap">
          <button
            className="rail__avatar"
            data-tint={current.tint}
            title={`${current.name} · ${current.handle}`}
            onClick={() => setSwitcherOpen((v) => !v)}
          >
            {(() => {
              const G = Icon[current.glyph];
              return <G size={15} />;
            })()}
          </button>
          {switcherOpen && (
            <>
              <div className="rail__scrim" onClick={() => setSwitcherOpen(false)} />
              <div className="accountSwitcher">
                <div className="accountSwitcher__head">
                  <span className="accountSwitcher__glyph" data-tint={current.tint}>
                    {(() => {
                      const G = Icon[current.glyph];
                      return <G size={16} />;
                    })()}
                  </span>
                  <div className="accountSwitcher__headText">
                    <b>{current.name}</b>
                    <i className="mono">{current.handle}</i>
                  </div>
                  <span className="accountSwitcher__layer">{current.layer}</span>
                </div>
                <button
                  className="accountSwitcher__foot accountSwitcher__foot--logout"
                  onClick={() => {
                    onLogout();
                    setSwitcherOpen(false);
                  }}
                >
                  <Icon.X size={12} />
                  退出登录
                </button>
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
              </div>
            </>
          )}
        </div>
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
