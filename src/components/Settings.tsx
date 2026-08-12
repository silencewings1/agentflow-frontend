import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./Icons";
import {
  agentToolCatalog,
  builtinAgents,
  callSteps,
  cloudEnvStateLabel,
  cloudEnvs,
  connKindLabel,
  connPolicies,
  connStateLabel,
  connections,
  customAgents,
  envVars,
  permTierLabel,
  permTiers,
  roleLabel,
  sandboxLimits,
  sandboxToggles,
  scopeLabel,
  type AgentRole,
  type AgentScope,
  type AgentSpec,
  type Connection,
} from "../data/settings";

export type SettingsPane = "agents" | "connect" | "env";

const PANES: { id: SettingsPane; label: string; glyph: IconName; desc: string }[] = [
  {
    id: "agents",
    label: "智能体",
    glyph: "Agent",
    desc: "主控智能体与专业智能体的职责、模型、权限与工具集。",
  },
  {
    id: "connect",
    label: "连接层",
    glyph: "Plug",
    desc: "受控连接统一管理外部调用，支持 MCP 与自建系统接入，并按操作影响分级。",
  },
  {
    id: "env",
    label: "环境配置",
    glyph: "Cloud",
    desc: "云环境规格与沙箱运行策略、资源上限、环境变量。",
  },
];

export function SettingsOverlay({
  pane,
  onPane,
  onClose,
  onToast,
}: {
  pane: SettingsPane;
  onPane: (p: SettingsPane) => void;
  onClose: () => void;
  onToast: (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const meta = PANES.find((p) => p.id === pane) ?? PANES[0];

  return (
    <div className="scrim scrim--wide" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-label={meta.label}
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="sheet__nav">
          <div className="sheet__navHead">
            <span className="kicker">AGENTFLOW</span>
            <strong className="serif">控制台设置</strong>
          </div>
          {PANES.map((p) => {
            const G = Icon[p.glyph];
            return (
              <button
                key={p.id}
                className="sheet__navItem"
                data-active={p.id === pane}
                onClick={() => onPane(p.id)}
              >
                <G size={16} />
                <span>{p.label}</span>
              </button>
            );
          })}
          <div className="sheet__navFoot mono">v0.9.4 · sandbox</div>
        </nav>

        <div className="sheet__main">
          <header className="sheet__head">
            <div className="sheet__headText">
              <h2 className="serif">{meta.label}</h2>
              <p>{meta.desc}</p>
            </div>
            <button className="iconBtn" onClick={onClose} aria-label="关闭">
              <Icon.X size={16} />
            </button>
          </header>

          <div className="sheet__body" key={pane}>
            {pane === "agents" && <AgentsPane onToast={onToast} />}
            {pane === "connect" && <ConnectPane onToast={onToast} />}
            {pane === "env" && <EnvPane onToast={onToast} />}
          </div>
        </div>
      </section>
    </div>
  );
}

type Toast = (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;

/* ============================== 智能体 ================================= */

function AgentsPane({ onToast }: { onToast: Toast }) {
  const [agents, setAgents] = useState<AgentSpec[]>([...builtinAgents, ...customAgents]);
  const [selected, setSelected] = useState<string>(builtinAgents[0].id);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState<AgentRole>("testing");
  const [draftScope, setDraftScope] = useState<AgentScope>("ask");
  const [draftTools, setDraftTools] = useState<string[]>(["repo.read"]);
  const [draftDuty, setDraftDuty] = useState("");

  const active = useMemo(
    () => agents.find((a) => a.id === selected) ?? agents[0],
    [agents, selected],
  );

  const system = agents.filter((a) => a.kind === "system");
  const custom = agents.filter((a) => a.kind === "custom");

  const toggle = (id: string) => {
    const a = agents.find((x) => x.id === id);
    setAgents((prev) => prev.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));
    onToast({
      tone: a?.enabled ? "warn" : "ok",
      title: a?.enabled ? "已停用" : "已启用",
      body: `${a?.name} ${a?.enabled ? "不再参与任务编排" : "已加入可调度池"}`,
    });
  };

  const create = () => {
    const name = draftName.trim() || `${roleLabel[draftRole]}智能体`;
    const id = `ag-${Date.now()}`;
    setAgents((prev) => [
      ...prev,
      {
        id,
        role: draftRole,
        name,
        kind: "custom",
        glyph: "Sparkle",
        tint: "plum",
        duty: draftDuty.trim() || "自定义智能体，尚未填写职责说明。",
        model: "agentflow-swift",
        scope: draftScope,
        tools: draftTools.length ? draftTools : ["repo.read"],
        outputs: ["自定义交付物"],
        independent: false,
        enabled: true,
      },
    ]);
    setSelected(id);
    setCreating(false);
    setDraftName("");
    setDraftDuty("");
    setDraftTools(["repo.read"]);
    onToast({ tone: "ok", title: "已创建自定义智能体", body: name });
  };

  return (
    <div className="split">
      <div className="split__list">
        <SectionLabel text="系统内置" hint={`主控 + ${system.length - 1} 类专业智能体`} />
        <div className="agentGrid">
          {system.map((a, i) => (
            <AgentCard key={a.id} a={a} i={i} active={a.id === active.id} onPick={() => setSelected(a.id)} onToggle={() => toggle(a.id)} />
          ))}
        </div>

        <SectionLabel text="自定义" hint={`${custom.length} 个`} />
        <div className="agentGrid">
          {custom.map((a, i) => (
            <AgentCard key={a.id} a={a} i={i} active={a.id === active.id} onPick={() => setSelected(a.id)} onToggle={() => toggle(a.id)} />
          ))}
          <button className="agentCard agentCard--new" onClick={() => setCreating((v) => !v)}>
            <Icon.Plus size={18} />
            <span>新建自定义智能体</span>
          </button>
        </div>

        {creating && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="form__row">
              <label>名称</label>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="例如：发布前巡检智能体" autoFocus />
            </div>
            <div className="form__row form__row--top">
              <label>职责</label>
              <div className="tagPick">
                {(Object.keys(roleLabel) as AgentRole[]).map((r) => (
                  <button key={r} type="button" className="tag" data-on={draftRole === r} onClick={() => setDraftRole(r)}>
                    {roleLabel[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="form__row">
              <label>权限</label>
              <div className="segment">
                {(["readonly", "ask", "auto"] as AgentScope[]).map((s) => (
                  <button key={s} type="button" data-on={draftScope === s} onClick={() => setDraftScope(s)}>
                    {scopeLabel[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="form__row form__row--top">
              <label>工具</label>
              <div className="tagPick">
                {agentToolCatalog.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="tag"
                    data-on={draftTools.includes(t)}
                    onClick={() =>
                      setDraftTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                  >
                    <span className="mono">{t}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="form__row form__row--top">
              <label>说明</label>
              <textarea value={draftDuty} onChange={(e) => setDraftDuty(e.target.value)} rows={3} placeholder="描述职责边界、输入材料与输出格式…" />
            </div>
            <div className="form__actions">
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setCreating(false)}>
                取消
              </button>
              <button type="submit" className="btn btn--accent btn--sm">
                <Icon.Check size={14} />
                创建智能体
              </button>
            </div>
          </form>
        )}
      </div>

      <aside className="split__detail">
        <div className="detail__head">
          <span className="detail__glyph" data-tint={active.tint}>
            {(() => {
              const G = Icon[active.glyph];
              return <G size={18} />;
            })()}
          </span>
          <div>
            <strong>{active.name}</strong>
            <span className="detail__kind">
              {roleLabel[active.role]} · {active.kind === "system" ? "系统内置" : "自定义"}
            </span>
          </div>
        </div>
        <p className="detail__desc">{active.duty}</p>

        <dl className="kv">
          <div>
            <dt>模型</dt>
            <dd className="mono">{active.model}</dd>
          </div>
          <div>
            <dt>权限</dt>
            <dd>{scopeLabel[active.scope]}</dd>
          </div>
          <div>
            <dt>独立性</dt>
            <dd>{active.independent ? "与开发分离" : "参与主流程"}</dd>
          </div>
        </dl>

        <SectionLabel text="结构化交付物" />
        <div className="tagPick tagPick--static">
          {active.outputs.map((o) => (
            <span key={o} className="tag" data-on="true">
              {o}
            </span>
          ))}
        </div>

        <SectionLabel text="已授权工具" />
        <div className="tagPick tagPick--static">
          {active.tools.map((t) => (
            <span key={t} className="tag">
              <span className="mono">{t}</span>
            </span>
          ))}
        </div>

        <div className="detail__foot">
          <button className="btn btn--outline btn--sm" onClick={() => onToast({ tone: "ok", title: "已进入编辑", body: `${active.name} · 演示动作` })}>
            <Icon.Sliders size={14} />
            编辑
          </button>
        </div>
      </aside>
    </div>
  );
}

function AgentCard({
  a,
  i,
  active,
  onPick,
  onToggle,
}: {
  a: AgentSpec;
  i: number;
  active: boolean;
  onPick: () => void;
  onToggle: () => void;
}) {
  const G = Icon[a.glyph];
  return (
    <div
      className="agentCard"
      data-active={active}
      data-off={!a.enabled}
      style={{ ["--i" as string]: i }}
      onClick={onPick}
    >
      <span className="agentCard__glyph" data-tint={a.tint}>
        <G size={17} />
      </span>
      <div className="agentCard__text">
        <strong>{a.name}</strong>
        <p>{a.duty}</p>
        <div className="agentCard__meta">
          <span>{roleLabel[a.role]}</span>
          <span className="dotSep" />
          <span>{scopeLabel[a.scope]}</span>
          {a.independent && (
            <>
              <span className="dotSep" />
              <span>独立</span>
            </>
          )}
        </div>
      </div>
      <button
        className="switch"
        data-on={a.enabled}
        aria-label={a.enabled ? "停用" : "启用"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <i />
      </button>
    </div>
  );
}

/* ============================== 连接层 ================================= */

function ConnectPane({ onToast }: { onToast: Toast }) {
  const [list, setList] = useState<Connection[]>(connections);
  const [policies, setPolicies] = useState(connPolicies);
  const [filter, setFilter] = useState<"all" | Connection["kind"]>("all");
  const [adding, setAdding] = useState(false);
  const [draftKind, setDraftKind] = useState<Connection["kind"]>("mcp");
  const [draftName, setDraftName] = useState("");
  const [draftEndpoint, setDraftEndpoint] = useState("");

  const shown = filter === "all" ? list : list.filter((c) => c.kind === filter);
  const linked = list.filter((c) => c.state === "linked").length;
  const calls = list.reduce((s, c) => s + c.calls24h, 0);
  const denied = list.reduce((s, c) => s + c.denied, 0);

  return (
    <div className="stack">
      <div className="statRow">
        <Stat label="受控连接" value={`${linked}/${list.length}`} hint="已连接 / 全部" />
        <Stat label="24h 外部调用" value={calls.toLocaleString()} hint="全部经连接层代理" />
        <Stat label="权限拦截" value={String(denied)} hint="越界或未授权调用" tone="warn" />
      </div>

      <SectionLabel text="一次受控调用" hint="七个固定步骤" />
      <ol className="callFlow">
        {callSteps.map((s, i) => {
          const G = Icon[s.glyph];
          return (
            <li key={s.id} className="callStep" style={{ ["--i" as string]: i }}>
              <span className="callStep__n mono">{i + 1}</span>
              <span className="callStep__glyph">
                <G size={13} />
              </span>
              <strong>{s.name}</strong>
              <em>{s.note}</em>
            </li>
          );
        })}
      </ol>

      <SectionLabel text="权限分级" hint="按操作影响划分" />
      <div className="tierGrid">
        {permTiers.map((t, i) => (
          <div className="tier" key={t.id} data-tier={t.id} style={{ ["--i" as string]: i }}>
            <div className="tier__top">
              <strong>{t.name}</strong>
              <span className="tier__gate">{t.gate}</span>
            </div>
            <p>{t.rule}</p>
            <div className="tagPick tagPick--static">
              {t.examples.map((e) => (
                <span key={e} className="tag tag--xs">
                  {e}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="barRow">
        <div className="segment">
          {(["all", "platform", "mcp", "internal"] as const).map((k) => (
            <button key={k} data-on={filter === k} onClick={() => setFilter(k)}>
              {k === "all" ? "全部" : connKindLabel[k]}
            </button>
          ))}
        </div>
        <button className="btn btn--accent btn--sm" onClick={() => setAdding((v) => !v)}>
          <Icon.Plus size={14} />
          接入连接
        </button>
      </div>

      {adding && (
        <form
          className="form form--inline"
          onSubmit={(e) => {
            e.preventDefault();
            const name = draftName.trim() || "未命名连接";
            setList((prev) => [
              ...prev,
              {
                id: `c-${Date.now()}`,
                name,
                kind: draftKind,
                state: "linked",
                endpoint: draftEndpoint.trim() || "stdio://local",
                transport: draftKind === "mcp" ? "stdio" : "REST · OAuth2",
                scopes: ["repo.read"],
                tier: "readonly",
                calls24h: 0,
                p95: 0,
                denied: 0,
              },
            ]);
            setAdding(false);
            setDraftName("");
            setDraftEndpoint("");
            onToast({ tone: "ok", title: "连接已登记", body: `${name} · 默认只读权限` });
          }}
        >
          <div className="form__row">
            <label>类型</label>
            <div className="segment">
              {(["mcp", "internal", "platform"] as const).map((k) => (
                <button key={k} type="button" data-on={draftKind === k} onClick={() => setDraftKind(k)}>
                  {connKindLabel[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="form__row">
            <label>名称</label>
            <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="例如：payments-mcp" autoFocus />
          </div>
          <div className="form__row">
            <label>端点</label>
            <input
              className="mono"
              value={draftEndpoint}
              onChange={(e) => setDraftEndpoint(e.target.value)}
              placeholder={draftKind === "mcp" ? "stdio:// 或 https://" : "https://svc.corp/api"}
            />
          </div>
          <div className="form__actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setAdding(false)}>
              取消
            </button>
            <button type="submit" className="btn btn--accent btn--sm">
              <Icon.Check size={14} />
              登记并连接
            </button>
          </div>
        </form>
      )}

      <div className="connList">
        {shown.map((c, i) => (
          <article className="conn" key={c.id} style={{ ["--i" as string]: i }}>
            <span className="conn__glyph" data-kind={c.kind}>
              {c.kind === "mcp" ? <Icon.Plug size={16} /> : c.kind === "internal" ? <Icon.Cube size={16} /> : <Icon.Layers size={16} />}
            </span>

            <div className="conn__id">
              <div className="conn__name">
                <strong>{c.name}</strong>
                <span className="pill" data-state={c.state === "linked" ? "done" : c.state === "degraded" ? "review" : undefined}>
                  {c.state === "linked" && <i className="pulse" />}
                  {connStateLabel[c.state]}
                </span>
              </div>
              <span className="conn__ep mono">{c.endpoint}</span>
              <div className="conn__scopes">
                {c.scopes.map((s) => (
                  <span key={s} className="tag tag--xs">
                    <span className="mono">{s}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="conn__stats">
              <div>
                <span className="conn__k">传输</span>
                <span className="conn__v">{c.transport}</span>
              </div>
              <div>
                <span className="conn__k">24h</span>
                <span className="conn__v mono">{c.calls24h.toLocaleString()}</span>
              </div>
              <div>
                <span className="conn__k">P95</span>
                <span className="conn__v mono">{c.p95 ? `${c.p95}ms` : "—"}</span>
              </div>
            </div>

            <div className="conn__guard">
              <span className="conn__k">最高权限</span>
              <span className="conn__badge" data-guard={c.tier}>
                <Icon.Shield size={12} />
                {permTierLabel[c.tier]}
              </span>
              <span className="conn__deny mono">拦截 {c.denied}</span>
            </div>

            <div className="conn__act">
              <button className="iconBtn iconBtn--sm" aria-label="配置" onClick={() => onToast({ tone: "ok", title: "打开配置", body: `${c.name} · 演示动作` })}>
                <Icon.Sliders size={14} />
              </button>
              <button
                className="switch"
                data-on={c.state !== "paused"}
                aria-label="启停"
                onClick={() => {
                  setList((prev) =>
                    prev.map((x) => (x.id === c.id ? { ...x, state: x.state === "paused" ? "linked" : "paused" } : x)),
                  );
                  onToast({
                    tone: c.state === "paused" ? "ok" : "warn",
                    title: c.state === "paused" ? "已恢复连接" : "已暂停连接",
                    body: c.name,
                  });
                }}
              >
                <i />
              </button>
            </div>
          </article>
        ))}
      </div>

      <SectionLabel text="受控策略" hint="作用于全部外部调用" />
      <div className="policyGrid">
        {policies.map((p, i) => (
          <div className="policy" key={p.id} style={{ ["--i" as string]: i }}>
            <div className="policy__text">
              <strong>{p.title}</strong>
              <p>{p.body}</p>
            </div>
            <button
              className="switch"
              data-on={p.on}
              aria-label={p.title}
              onClick={() => setPolicies((prev) => prev.map((x) => (x.id === p.id ? { ...x, on: !x.on } : x)))}
            >
              <i />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================= 环境配置 ================================ */

function EnvPane({ onToast }: { onToast: Toast }) {
  const [tab, setTab] = useState<"cloud" | "sandbox">("cloud");
  const [activeEnv, setActiveEnv] = useState(cloudEnvs.find((e) => e.active)!.id);
  const [toggles, setToggles] = useState(sandboxToggles);
  const [reveal, setReveal] = useState<string | null>(null);

  return (
    <div className="stack">
      <div className="segment segment--lg">
        <button data-on={tab === "cloud"} onClick={() => setTab("cloud")}>
          <Icon.Cloud size={14} />
          云环境配置
        </button>
        <button data-on={tab === "sandbox"} onClick={() => setTab("sandbox")}>
          <Icon.Cube size={14} />
          沙箱配置
        </button>
      </div>

      {tab === "cloud" ? (
        <>
          <div className="envGrid">
            {cloudEnvs.map((e, i) => (
              <button
                key={e.id}
                className="envCard"
                data-active={activeEnv === e.id}
                style={{ ["--i" as string]: i }}
                onClick={() => {
                  setActiveEnv(e.id);
                  onToast({ tone: "ok", title: "已切换云环境", body: `${e.name} · ${e.region}` });
                }}
              >
                <div className="envCard__top">
                  <span className="envCard__radio" data-on={activeEnv === e.id} />
                  <strong>{e.name}</strong>
                  <span className="pill" data-state={e.state === "ready" ? "done" : e.state === "warming" ? "running" : undefined}>
                    {cloudEnvStateLabel[e.state]}
                  </span>
                </div>
                <dl className="kv kv--tight">
                  <div>
                    <dt>区域</dt>
                    <dd className="mono">{e.region}</dd>
                  </div>
                  <div>
                    <dt>规格</dt>
                    <dd>{e.spec}</dd>
                  </div>
                  <div>
                    <dt>镜像</dt>
                    <dd className="mono">{e.image}</dd>
                  </div>
                  <div>
                    <dt>网络</dt>
                    <dd>{e.network}</dd>
                  </div>
                  <div>
                    <dt>数据</dt>
                    <dd>{e.dataTier}</dd>
                  </div>
                </dl>
              </button>
            ))}
          </div>

          <SectionLabel text="环境变量" hint="注入到所有任务容器" />
          <div className="varList">
            {envVars.map((v) => (
              <div className="var" key={v.key}>
                <span className="mono var__k">{v.key}</span>
                <span className="mono var__v">{v.secret && reveal !== v.key ? "••••••••••••" : v.value}</span>
                {v.secret && (
                  <button className="iconBtn iconBtn--sm" aria-label="显示" onClick={() => setReveal((r) => (r === v.key ? null : v.key))}>
                    <Icon.Key size={13} />
                  </button>
                )}
                <button className="iconBtn iconBtn--sm" aria-label="删除" onClick={() => onToast({ tone: "warn", title: "演示动作", body: `未真正删除 ${v.key}` })}>
                  <Icon.Trash size={13} />
                </button>
              </div>
            ))}
            <button className="var var--new" onClick={() => onToast({ tone: "ok", title: "新增变量", body: "演示动作" })}>
              <Icon.Plus size={14} />
              添加变量
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="policyGrid">
            {toggles.map((t, i) => (
              <div className="policy" key={t.id} style={{ ["--i" as string]: i }}>
                <div className="policy__text">
                  <strong>
                    {t.title}
                    {t.locked && <span className="lockTag">强制</span>}
                  </strong>
                  <p>{t.body}</p>
                </div>
                <button
                  className="switch"
                  data-on={t.on}
                  data-locked={t.locked || undefined}
                  aria-label={t.title}
                  onClick={() => {
                    if (t.locked)
                      return onToast({ tone: "warn", title: "该项为强制策略", body: "由安全边界要求，不可关闭。" });
                    setToggles((prev) => prev.map((x) => (x.id === t.id ? { ...x, on: !x.on } : x)));
                    if (t.id === "s-root" && !t.on)
                      onToast({ tone: "warn", title: "已开启特权模式", body: "容器逃逸风险上升，建议仅临时使用。" });
                  }}
                >
                  <i />
                </button>
              </div>
            ))}
          </div>

          <SectionLabel text="资源与失败上限" hint="超出即中断或转人工" />
          <div className="limitGrid">
            {sandboxLimits.map((l, i) => (
              <div className="limit" key={l.label} style={{ ["--i" as string]: i }}>
                <span className="limit__k">{l.label}</span>
                <span className="limit__v mono">{l.value}</span>
              </div>
            ))}
          </div>

          <div className="noteCard">
            <Icon.Shield size={16} />
            <p>
              沙箱内所有出网请求都会回到<strong>连接层</strong>做白名单校验；关闭网络访问后，智能体仅能读写工作区与执行白名单命令。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== 小组件 ================================= */

function SectionLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="secLabel">
      <span className="kicker">{text}</span>
      {hint && <span className="secLabel__hint">{hint}</span>}
      <span className="secLabel__rule" />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warn";
}) {
  return (
    <div className="stat" data-tone={tone}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value mono">{value}</strong>
      <span className="stat__hint">{hint}</span>
    </div>
  );
}
