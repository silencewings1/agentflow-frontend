import { Icon } from "./Icons";
import type { Theme } from "../data/mock";
import type { SettingsPane } from "./Settings";

const NAV: { id: SettingsPane; label: string; glyph: "Layers" | "Agent" | "Plug" | "Cloud" }[] = [
  { id: "arch", label: "总体架构", glyph: "Layers" },
  { id: "agents", label: "智能体", glyph: "Agent" },
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
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onPalette: () => void;
  onNew: () => void;
  pane: SettingsPane | null;
  onPane: (p: SettingsPane) => void;
}) {
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
        <button className="rail__avatar" title="me@agentflow.dev">
          <span className="mono">YZ</span>
        </button>
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
