import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { afApi } from "../api/client";
import type { AfModelProviderDto, AfModelProvidersDto } from "../api/types";
import { Icon, type IconName } from "./Icons";
import {
  agentToolCatalog,
  archLayers,
  builtinAgents,
  callSteps,
  cloudEnvStateLabel,
  cloudEnvs,
  connKindLabel,
  connPolicies,
  connStateLabel,
  connections,
  customAgents,
  defaultModel,
  envVars,
  evidenceChain,
  apiFormatLabel,
  modelOptions,
  modelProviders,
  permTierLabel,
  permTiers,
  qualityGates,
  replaySteps,
  reworkRoutes,
  roleLabel,
  sandboxLimits,
  sandboxToggles,
  scopeLabel,
  type AgentRole,
  type AgentScope,
  type AgentSpec,
  type ApiFormat,
  type ArchLayer,
  type Connection,
  type ModelProvider,
} from "../data/settings";

export type SettingsPane = "arch" | "agents" | "models" | "connect" | "env";

/* 架构层的跳转落点：点击直达承载该层证据的界面，而不是让用户自己去找 */
export type ArchJump = "workflow" | "agents" | "replay" | "evidence" | "checkpoint";

/** 当前会话在五层架构上的运行时切面，由 App 下传 —— 架构图因此变成分层监控 */
export interface ArchRuntime {
  workflowName: string;
  wfStep: number;
  wfTotal: number;
  currentNode: string;
  eventCount: number;
  streaming: boolean;
  awaitingApproval: boolean;
}

const PANES: { id: SettingsPane; label: string; glyph: IconName; desc: string }[] = [
  {
    id: "arch",
    label: "总体架构",
    glyph: "Layers",
    desc: "五层协同架构：每一层职责单一、边界清晰，并显示当前会话在该层的实时状态。",
  },
  {
    id: "agents",
    label: "智能体",
    glyph: "Agent",
    desc: "主控智能体与专业智能体的职责、模型、权限与工具集。",
  },
  {
    id: "models",
    label: "模型配置",
    glyph: "Cpu",
    desc: "管理模型供应商与可用模型。凭据经受控连接层保管，配置后可在会话与智能体中选用。",
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
  runtime,
  onJump,
}: {
  pane: SettingsPane;
  onPane: (p: SettingsPane) => void;
  onClose: () => void;
  onToast: (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;
  runtime: ArchRuntime;
  onJump: (target: ArchJump) => void;
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
          <div className="sheet__navFoot mono">v1.0.1 · sandbox</div>
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
            {pane === "arch" && (
              <ArchPane onToast={onToast} runtime={runtime} onJump={onJump} />
            )}
            {pane === "agents" && <AgentsPane onToast={onToast} />}
            {pane === "models" && <ModelsPane onToast={onToast} />}
            {pane === "connect" && <ConnectPane onToast={onToast} />}
            {pane === "env" && <EnvPane onToast={onToast} />}
          </div>
        </div>
      </section>
    </div>
  );
}

type Toast = (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;

/* ============================ 总体架构：五层 ============================ */

/* 责任主体决定该层能否被“说服”：确定性程序不接受协商，AI 只在授权内行动 */
const ownerNote: Record<ArchLayer["owner"], string> = {
  平台: "由平台承载，是研发活动发生的地方",
  AI: "由智能体判断，输出必须可被下层核验",
  确定性程序: "由程序裁决，不接受自然语言协商",
  人工: "由人决策，AI 只能请求、不能代替",
};

/* ---- 反向联动：把运行时事实按层归位 ----
   每层的状态只允许由该层真实的裁决材料推导：
   L1 取编排进度与环境，L2 取智能体与事件，L3 取受控调用审计，
   L4 取门禁与证据链，L5 取人工审批。语义色沿用全局约定：
   sage 已闭环 / accent 进行中 / gold 待人工或未闭环 / rose 失败或被拒。 */

type LayerTone = "sage" | "accent" | "gold" | "rose" | "idle";

interface LayerLive {
  tone: LayerTone;
  /** 一句话结论：这一层现在卡在哪 */
  headline: string;
  /** 可核验的量，而不是评语 */
  metrics: { label: string; value: string }[];
  jump: ArchJump;
  jumpLabel: string;
}

const toneLabel: Record<LayerTone, string> = {
  sage: "已闭环",
  accent: "进行中",
  gold: "待人工",
  rose: "已阻断",
  idle: "未开始",
};

function deriveLayerLive(runtime: ArchRuntime): Record<string, LayerLive> {
  /* L3：受控连接层的裁决记录在回放里 —— 调用次数与被拒次数都是审计事实 */
  const calls = replaySteps.filter((s) => s.tier !== "—").length;
  const denied = replaySteps.filter((s) => s.result === "denied").length;
  const pausedConn = connections.filter((c) => c.state !== "linked").length;

  /* L4：门禁由确定性程序裁决，证据链决定结论能否被核验 */
  const blocking = qualityGates.find((g) => g.state === "blocked");
  const activeGate = qualityGates.find((g) => g.state === "active");
  const passedGates = qualityGates.filter((g) => g.state === "passed").length;
  const failedChecks = (activeGate ?? blocking)?.checks.filter((c) => !c.ok).length ?? 0;
  const evConfirmed = evidenceChain.filter((e) => e.confirmed).length;
  const evRequired = evidenceChain.filter((e) => e.required).length;

  /* L5：人工检查层只认「谁在等谁」 */
  const waiting = replaySteps.filter((s) => s.result === "wait").length;
  const approvalEv = evidenceChain.find((e) => e.kind === "approval");
  const env = cloudEnvs.find((e) => e.active);

  return {
    "l-biz": {
      tone: runtime.wfStep + 1 >= runtime.wfTotal ? "sage" : "accent",
      headline: `「${runtime.workflowName}」推进至第 ${Math.min(runtime.wfStep + 1, runtime.wfTotal)} / ${runtime.wfTotal} 个节点`,
      metrics: [
        { label: "当前节点", value: runtime.currentNode || "—" },
        { label: "运行环境", value: env ? env.name : "未指派" },
      ],
      jump: "workflow",
      jumpLabel: "查看编排进度",
    },
    "l-exec": {
      tone: runtime.streaming ? "accent" : "sage",
      headline: runtime.streaming
        ? "智能体正在生成，产出尚未进入下层核验"
        : "本轮产出已交付下层核验，等待门禁裁决",
      metrics: [
        { label: "本轮事件", value: `${runtime.eventCount} 条` },
        { label: "调度智能体", value: `${builtinAgents.length + customAgents.length} 个` },
      ],
      jump: "agents",
      jumpLabel: "查看智能体职责",
    },
    "l-conn": {
      tone: denied > 0 ? "rose" : pausedConn > 0 ? "gold" : "sage",
      headline:
        denied > 0
          ? `本次运行 ${calls} 次受控调用 · ${denied} 次被拒绝`
          : `本次运行 ${calls} 次受控调用 · 全部通过校验`,
      metrics: [
        { label: "高风险调用", value: `${replaySteps.filter((s) => s.tier === "highrisk").length} 次` },
        { label: "非正常连接", value: `${pausedConn} 个` },
      ],
      jump: "replay",
      jumpLabel: "按步查证调用",
    },
    "l-qa": {
      tone: blocking ? "rose" : failedChecks > 0 ? "gold" : activeGate ? "accent" : "sage",
      headline: blocking
        ? `${blocking.index} ${blocking.name} 已阻断`
        : activeGate
          ? `${activeGate.index} ${activeGate.name} 进行中 · ${failedChecks} 项检查未过`
          : "四道门禁全部通过",
      metrics: [
        { label: "门禁通过", value: `${passedGates} / ${qualityGates.length}` },
        { label: "证据闭环", value: `${evConfirmed} / ${evRequired}` },
      ],
      jump: "evidence",
      jumpLabel: "核验证据链",
    },
    "l-human": {
      tone: runtime.awaitingApproval || waiting > 0 ? "gold" : approvalEv?.confirmed ? "sage" : "idle",
      headline:
        runtime.awaitingApproval || waiting > 0
          ? "有决策在等人：AI 只能请求，不能代替签批"
          : approvalEv?.confirmed
            ? "关键决策已由责任人签批"
            : "尚无待人工放行的决策",
      metrics: [
        { label: "等待决策", value: `${waiting + (runtime.awaitingApproval ? 1 : 0)} 项` },
        { label: "审批证据", value: approvalEv?.confirmed ? "已闭环" : "待提交" },
      ],
      jump: "checkpoint",
      jumpLabel: "前往人工检查点",
    },
  };
}

function ArchPane({
  onToast,
  runtime,
  onJump,
}: {
  onToast: Toast;
  runtime: ArchRuntime;
  onJump: (target: ArchJump) => void;
}) {
  const [active, setActive] = useState<string>(archLayers[1].id);
  const layer = archLayers.find((l) => l.id === active) ?? archLayers[0];
  const live = useMemo(() => deriveLayerLive(runtime), [runtime]);
  const focusLive = live[layer.id];
  /* 当前最需要处理的层：优先阻断，其次待人工 */
  const attention =
    archLayers.find((l) => live[l.id]?.tone === "rose") ??
    archLayers.find((l) => live[l.id]?.tone === "gold");

  return (
    <div className="arch">
      <p className="arch__lead">
        单点辅助的问题不在模型能力，而在<b>缺少承接结构</b>
        ：结论无从核验、责任无从界定。五层架构把「谁判断、谁核验、谁负责」拆开，
        让 AI 的产出必须穿过确定性验证与人工决策才能落地。
      </p>

      {/* 分层监控条：架构不只声明责任，还要显示这一刻谁在负责 */}
      <div className="archNow" data-tone={attention ? live[attention.id].tone : "sage"}>
        <span className="kicker">此刻</span>
        <p>
          {attention ? (
            <>
              <b>
                {attention.index} {attention.name}
              </b>
              {live[attention.id].headline}，责任主体为 <b>{attention.owner}</b>。
            </>
          ) : (
            <>五层均已闭环，等待责任人签批交付。</>
          )}
        </p>
        {attention && (
          <button className="chipBtn" onClick={() => onJump(live[attention.id].jump)}>
            {live[attention.id].jumpLabel}
            <Icon.Arrow size={11} />
          </button>
        )}
      </div>

      {/* 分层栈：自上而下即一次任务的流转方向 */}
      <ol className="archStack">
        {archLayers.map((l, i) => {
          const G = Icon[l.glyph];
          const st = live[l.id];
          return (
            <li key={l.id} style={{ "--i": i } as CSSProperties}>
              <button
                className="archLayer"
                data-tint={l.tint}
                data-active={l.id === active}
                onClick={() => setActive(l.id)}
              >
                <span className="archLayer__idx mono">{l.index}</span>
                <span className="archLayer__glyph">
                  <G size={15} />
                </span>
                <span className="archLayer__main">
                  <span className="archLayer__top">
                    <strong>{l.name}</strong>
                    <em className="archLayer__owner">{l.owner}</em>
                    {/* 实时状态：形态（点的虚实）先于颜色，便于色觉障碍识别 */}
                    <em className="archLive" data-tone={st.tone}>
                      <i />
                      {toneLabel[st.tone]}
                    </em>
                  </span>
                  <span className="archLayer__duty">{l.duty}</span>
                  <span className="archLive__now" data-tone={st.tone}>
                    {st.headline}
                  </span>
                  <span className="archLive__metrics">
                    {st.metrics.map((m) => (
                      <i key={m.label}>
                        {m.label}
                        <b className="mono">{m.value}</b>
                      </i>
                    ))}
                  </span>
                  <span className="archLayer__items">
                    {l.items.map((it) => (
                      <i key={it}>{it}</i>
                    ))}
                  </span>
                </span>
              </button>
              {i < archLayers.length - 1 && (
                <span className="archStack__link" aria-hidden>
                  <Icon.Arrow size={12} className="rot90" />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* 选中层的责任边界 + 直达该层证据 */}
      <div className="archFocus" data-tint={layer.tint}>
        <div className="archFocus__head">
          <span className="kicker">
            {layer.index} · 责任边界
          </span>
          <h4 className="serif">{layer.name}</h4>
        </div>
        <p>{ownerNote[layer.owner]}。{layer.duty}</p>
        <div className="archFocus__tags">
          {layer.items.map((it) => (
            <span key={it}>{it}</span>
          ))}
        </div>
        <div className="archFocus__act">
          <span className="archFocus__state" data-tone={focusLive.tone}>
            {focusLive.headline}
          </span>
          <button className="chipBtn" onClick={() => onJump(focusLive.jump)}>
            {focusLive.jumpLabel}
            <Icon.Arrow size={11} />
          </button>
        </div>
      </div>

      {/* 定向返工路由：失败不推倒重来，而是回到出问题的那一层 */}
      <section className="archRoute">
        <header>
          <span className="kicker">失败回退路由</span>
          <h4 className="serif">问题回到它产生的那一层</h4>
          <button
            className="chipBtn"
            onClick={() =>
              onToast({
                tone: "info",
                title: "回退策略",
                body: "命中回退路由时只重跑目标节点及其下游，已闭环证据不重复采集。",
              })
            }
          >
            <Icon.Sliders size={11} />
            策略说明
          </button>
        </header>
        <ul>
          {reworkRoutes.map((r, i) => (
            <li key={r.id} style={{ "--i": i } as CSSProperties}>
              <span className="archRoute__cause">{r.cause}</span>
              <Icon.Arrow size={11} />
              <span className="archRoute__target">{r.target}</span>
              <em data-human={r.handler === "人工"}>{r.handler}</em>
              <span className="archRoute__note">{r.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

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
        model: defaultModel,
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
            <dd>
              {/* 模型可直接改：不同职责该配不同档位的模型，这是编排的一部分，
                  不应该只让人看不让人改 */}
              <select
                className="modelPick"
                value={active.model}
                onChange={(e) => {
                  const model = e.target.value;
                  setAgents((prev) =>
                    prev.map((x) => (x.id === active.id ? { ...x, model } : x)),
                  );
                }}
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} · {m.vendor}
                  </option>
                ))}
              </select>
              <span className="modelPick__note">
                {modelOptions.find((m) => m.id === active.model)?.note ?? ""}
              </span>
            </dd>
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

/* ============================== 模型配置 =============================== */
/* 左栏选供应商、右栏配该供应商 —— 模型能力的来源是「供应商」这一整体，
   Base URL / API 格式 / Key / 模型列表必须一起看、一起改。 */

function ModelListEditor({
  models, onChange, draftVal, onDraftChange, onAdd, providerId, testingModel, onTest,
}: {
  models: Array<{ id: string; name?: string; contextWindow?: number }>;
  onChange: (next: Array<{ id: string; name?: string; contextWindow?: number }>) => void;
  draftVal: string;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  providerId?: string;
  testingModel?: string | null;
  onTest?: (providerId: string, modelId: string) => void;
}) {
  return (
    <div className="mpField">
      <span className="mpField__label">模型列表<span className="mpField__n mono">{models.filter((m) => m.id.trim()).length}</span></span>
      {models.length ? (
        <ul className="mpModels">
          {models.map((m, i) => {
            const modelKey = providerId ? `${providerId}/${m.id}` : "";
            const isTesting = testingModel === modelKey;
            return (
              <li key={i} className="mpModel">
                <input className="mono mpModel__id" value={m.id} onChange={(e) => onChange(models.map((x, j) => j === i ? { ...x, id: e.target.value } : x))} placeholder="模型 ID" />
                {providerId && onTest && m.id.trim() && (
                  <button
                    className={"iconBtn iconBtn--sm" + (isTesting ? " iconBtn--spin" : "")}
                    onClick={() => onTest(providerId, m.id.trim())}
                    title={isTesting ? "测试中…" : "测试连通性"}
                  >
                    <Icon.Bolt size={12} />
                  </button>
                )}
                <button className="iconBtn iconBtn--sm" title="移除模型" onClick={() => onChange(models.filter((_, j) => j !== i))}><Icon.Trash size={12} /></button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mpEmpty">还没有模型。</p>
      )}
      <div className="mpModelAdd">
        <input className="mono" value={draftVal} onChange={(e) => onDraftChange(e.target.value)} placeholder="模型 ID，回车添加" onKeyDown={(e) => { if (e.key === "Enter" && draftVal.trim()) { onAdd(); } }} />
        <button className="btn btn--sm" disabled={!draftVal.trim()} onClick={onAdd}><Icon.Plus size={12} />添加模型</button>
      </div>
    </div>
  );
}

function ModelsPane({ onToast }: { onToast: Toast }) {
  const [providers, setProviders] = useState<AfModelProviderDto[]>([]);
  const [sel, setSel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  /* 新建供应商表单（右栏） */
  const [creating, setCreating] = useState(false);
  const [addId, setAddId] = useState("");
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addApi, setAddApi] = useState("openai-responses");
  const [addKey, setAddKey] = useState("");
  const [addModels, setAddModels] = useState<Array<{ id: string; name?: string; contextWindow?: number }>>([]);
  const [addModelDraft, setAddModelDraft] = useState("");

  /* 右栏编辑草稿：key=provider id */
  const [drafts, setDrafts] = useState<Record<string, { id: string; displayName: string; baseURL: string; api: string; apiKey: string; models: Array<{ id: string; name?: string; contextWindow?: number }> }>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});

  const cur = providers.find((p) => p.id === sel) ?? providers[0];
  const draft = cur ? drafts[cur.id] : undefined;
  const totalModels = providers.reduce((n, p) => n + p.models.length, 0);
  const [testingModel, setTestingModel] = useState<string | null>(null);

  const handleTestModel = async (providerId: string, modelId: string) => {
    const key = `${providerId}/${modelId}`;
    if (testingModel !== null) return;
    setTestingModel(key);
    try {
      const result = await afApi.testModel(providerId, modelId);
      if (result.ok) {
        onToast({ tone: "ok", title: `连通性测试成功（${result.durationMs}ms）`, body: result.reply ? `模型回复：${result.reply}` : "模型已响应。" });
      } else {
        onToast({ tone: "warn", title: `连通性测试失败（${result.durationMs}ms）`, body: result.error ?? "未知错误" });
      }
    } catch (err) {
      onToast({ tone: "warn", title: "连通性测试失败", body: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestingModel(null);
    }
  };

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const dto = await afApi.listModelProviders();
        if (disposed) return;
        setProviders(dto.providers);
        setSel(dto.providers[0]?.id ?? "");
        setLoading(false);
      } catch (err) {
        if (disposed) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, []);

  /* 选中 provider 时初始化草稿 */
  useEffect(() => {
    if (!cur || creating) return;
    if (drafts[cur.id]) return;
    setDrafts((prev) => ({
      ...prev,
      [cur.id]: {
        id: cur.id,
        displayName: cur.name,
        baseURL: cur.baseURL ?? "",
        api: cur.api ?? "openai-responses",
        apiKey: "",
        models: cur.models.map((m) => ({ id: m.id, name: m.name })),
      },
    }));
  }, [cur?.id, creating]);

  const patchDraft = (id: string, next: Partial<NonNullable<typeof drafts[string]>>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...next } }));

  const pick = (id: string) => { setSel(id); setCreating(false); setShowKey(false); };

  const resetAddForm = () => {
    setAddId(""); setAddName(""); setAddUrl(""); setAddApi("openai-responses");
    setAddKey(""); setAddModels([{ id: "" }]); setAddModelDraft("");
  };

  const startCreate = () => { setCreating(true); setShowKey(false); };
  const cancelCreate = () => { setCreating(false); resetAddForm(); };

  const handleCreate = async () => {
    const models = addModels.filter((m) => m.id.trim());
    if (!addId.trim() || !addName.trim() || !addUrl.trim() || models.length === 0) {
      onToast({ tone: "warn", title: "请补全信息", body: "供应商 ID、名称、Base URL 和至少一个模型为必填。" });
      return;
    }
    setSaving(true);
    try {
      const dto = await afApi.createProvider({
        id: addId.trim(),
        displayName: addName.trim(),
        baseURL: addUrl.trim(),
        api: addApi,
        apiKey: addKey || undefined,
        models,
      });
      setProviders(dto.providers);
      setSel(addId.trim());
      setCreating(false);
      resetAddForm();
      onToast({ tone: "ok", title: "供应商已添加", body: `${addName.trim()} 已写入 dsh 配置并生效。` });
    } catch (err) {
      onToast({ tone: "warn", title: "添加失败", body: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  /* 新建表单中点击测试：先创建供应商，再测试该模型 */
  const handleTestInCreate = async (_providerId: string, modelId: string) => {
    const models = addModels.filter((m) => m.id.trim());
    if (!addId.trim() || !addName.trim() || !addUrl.trim() || models.length === 0) {
      onToast({ tone: "warn", title: "请先补全信息", body: "测试前需填好供应商 ID、名称、Base URL 和至少一个模型。" });
      return;
    }
    if (!addKey.trim()) {
      onToast({ tone: "warn", title: "请先填写 API Key", body: "测试连通性需要有效的 API Key。" });
      return;
    }
    setSaving(true);
    try {
      const newId = addId.trim();
      const dto = await afApi.createProvider({
        id: newId,
        displayName: addName.trim(),
        baseURL: addUrl.trim(),
        api: addApi,
        apiKey: addKey,
        models,
      });
      setProviders(dto.providers);
      setSel(newId);
      setCreating(false);
      resetAddForm();
      onToast({ tone: "ok", title: "供应商已创建", body: "正在测试模型连通性…" });
      // 创建后立即测试
      const result = await afApi.testModel(newId, modelId);
      if (result.ok) {
        onToast({ tone: "ok", title: `连通性测试成功（${result.durationMs}ms）`, body: result.reply ? `模型回复：${result.reply}` : "模型已响应。" });
      } else {
        onToast({ tone: "warn", title: `连通性测试失败（${result.durationMs}ms）`, body: result.error ?? "未知错误" });
      }
    } catch (err) {
      onToast({ tone: "warn", title: "测试失败", body: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!cur || !draft) return;
    const models = draft.models.filter((m) => m.id.trim());
    if (!draft.baseURL.trim() || models.length === 0) {
      onToast({ tone: "warn", title: "请补全信息", body: "Base URL 和至少一个模型为必填。" });
      return;
    }
    setSaving(true);
    try {
      const newId = draft.id.trim();
      const newName = draft.displayName.trim();
      const dto = await afApi.updateProvider(cur.id, {
        id: newId,
        displayName: newName,
        baseURL: draft.baseURL.trim(),
        api: draft.api,
        apiKey: draft.apiKey || undefined,
        models,
      });
      setProviders(dto.providers);
      setSel(newId);
      const updated = dto.providers.find((p) => p.id === newId);
      setDrafts((prev) => {
        const next = { ...prev };
        if (cur.id !== newId) delete next[cur.id];
        if (updated) {
          next[newId] = {
            id: updated.id,
            displayName: updated.name,
            baseURL: updated.baseURL ?? "",
            api: updated.api ?? "openai-responses",
            apiKey: "",
            models: updated.models.map((m) => ({ id: m.id, name: m.name })),
          };
        }
        return next;
      });
      onToast({ tone: "ok", title: "已保存", body: `${newName} 的配置已写入 dsh 并生效。` });
    } catch (err) {
      onToast({ tone: "warn", title: "保存失败", body: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!cur) return;
    setSaving(true);
    try {
      const dto = await afApi.removeProvider(cur.id);
      setProviders(dto.providers);
      setSel(dto.providers[0]?.id ?? "");
      setDrafts((prev) => { const next = { ...prev }; delete next[cur.id]; return next; });
      onToast({ tone: "warn", title: `已删除 ${cur.name}`, body: "端点与凭据一并移除。" });
    } catch (err) {
      onToast({ tone: "warn", title: "删除失败", body: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (<div className="stack"><div className="mpNotice">正在从 dsh 后端加载模型配置…</div></div>);
  }
  if (loadError !== null) {
    return (<div className="stack"><div className="mpNotice mpNotice--error">加载模型配置失败：{loadError}</div></div>);
  }

  const API_OPTIONS = [
    { value: "openai-responses", label: "OpenAI Responses (/v1/responses)" },
    { value: "openai-completions", label: "OpenAI Chat Completions (/v1/chat/completions)" },
    { value: "anthropic-messages", label: "Anthropic Messages (/v1/messages)" },
  ];

  return (
    <div className="stack">
      <div className="mpNotice">模型与凭据由 dsh 后端（settings.yaml + credentials）管理；修改后即时写入并热重载生效。</div>
      <div className="statRow">
        <Stat label="供应商" value={String(providers.length)} hint="已注册" />
        <Stat label="可选模型" value={String(totalModels)} hint="全部供应商下的模型" />
        <Stat label="凭据保管" value="dsh credentials" hint="Key 不下发到智能体" />
      </div>

      <div className="mpLayout">
        {/* ---------------- 左栏：供应商列表 ---------------- */}
        <aside className="mpList">
          <div className="mpList__group">
            <span className="kicker">已注册供应商</span>
            <ul>
              {providers.map((p) => (
                <li key={p.id}>
                  <button className="mpItem" data-active={!creating && p.id === sel} onClick={() => pick(p.id)}>
                    <span className="mpItem__glyph"><Icon.Cpu size={13} /></span>
                    <span className="mpItem__name">{p.name}</span>
                    <span className="mpItem__count mono">{p.models.length}</span>
                    <span className="mpItem__dot" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button className="mpList__add" data-active={creating} onClick={creating ? cancelCreate : startCreate}>
            <Icon.Plus size={13} />{creating ? "取消新建" : "添加供应商"}
          </button>
        </aside>

        {/* ---------------- 右栏：新建 / 编辑 ---------------- */}
        <section className="mpForm">
          {creating ? (
            <>
              <header className="mpForm__head">
                <h4 className="serif">新建供应商</h4>
                <span className="mpBadge">待创建</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
                  <button className="btn btn--sm" onClick={cancelCreate}>取消</button>
                  <button className="btn btn--sm btn--accent" disabled={saving} onClick={handleCreate}>{saving ? "创建中…" : "创建"}</button>
                </div>
              </header>

              <label className="mpField">
                <span className="mpField__label">Provider ID</span>
                <input className="mono" value={addId} onChange={(e) => setAddId(e.target.value)} placeholder="如 my-openai（小写字母数字，可含 - _）" autoFocus spellCheck={false} />
              </label>

              <label className="mpField">
                <span className="mpField__label">显示名称</span>
                <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="如 我的 OpenAI 网关" />
              </label>

              <label className="mpField">
                <span className="mpField__label">Base URL</span>
                <input className="mono" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="https://…/v1" spellCheck={false} />
              </label>

              <label className="mpField">
                <span className="mpField__label">API 格式</span>
                <select value={addApi} onChange={(e) => setAddApi(e.target.value)}>
                  {API_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <em className="mpField__hint">决定请求体如何拼装，填错会在首次调用时被连接层拦下。</em>
              </label>

              <label className="mpField">
                <span className="mpField__label">API Key</span>
                <span className="mpKey">
                  <input className="mono" type={showKey ? "text" : "password"} value={addKey} onChange={(e) => setAddKey(e.target.value)} placeholder="输入 API Key（可选）" aria-label="API Key" />
                  <button className="iconBtn iconBtn--sm" title={showKey ? "隐藏" : "显示"} onClick={() => setShowKey((v) => !v)}><Icon.Key size={13} /></button>
                </span>
              </label>

              <ModelListEditor
                models={addModels}
                onChange={setAddModels}
                draftVal={addModelDraft}
                onDraftChange={setAddModelDraft}
                onAdd={() => { setAddModels((prev) => [...prev, { id: addModelDraft.trim() }]); setAddModelDraft(""); }}
                providerId={addId.trim() || undefined}
                testingModel={testingModel}
                onTest={handleTestInCreate}
              />
            </>
          ) : cur ? (
            <>
              <header className="mpForm__head">
                <h4 className="serif">{cur.name}</h4>
                <span className="mpBadge" data-on>已注册</span>
                <button className="btn btn--sm btn--accent" disabled={saving} onClick={handleSave}>{saving ? "保存中…" : "保存修改"}</button>
                <button className="iconBtn iconBtn--sm" title="删除供应商" onClick={handleRemove}><Icon.Trash size={13} /></button>
              </header>

              <label className="mpField">
                <span className="mpField__label">Provider ID</span>
                <input className="mono" value={draft?.id ?? ""} onChange={(e) => patchDraft(cur.id, { id: e.target.value })} placeholder="小写字母数字，可含 - _" spellCheck={false} />
                <em className="mpField__hint">修改后保存会自动迁移配置与凭据。</em>
              </label>

              <label className="mpField">
                <span className="mpField__label">显示名称</span>
                <input value={draft?.displayName ?? ""} onChange={(e) => patchDraft(cur.id, { displayName: e.target.value })} placeholder="供应商显示名称" />
              </label>

              <label className="mpField">
                <span className="mpField__label">Base URL</span>
                <input className="mono" value={draft?.baseURL ?? ""} onChange={(e) => patchDraft(cur.id, { baseURL: e.target.value })} placeholder="https://…/v1" spellCheck={false} />
              </label>

              <label className="mpField">
                <span className="mpField__label">API 格式</span>
                <select value={draft?.api ?? "openai-responses"} onChange={(e) => patchDraft(cur.id, { api: e.target.value })}>
                  {API_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <em className="mpField__hint">决定请求体如何拼装，填错会在首次调用时被连接层拦下。</em>
              </label>

              <label className="mpField">
                <span className="mpField__label">更新 API Key（留空不修改）</span>
                <span className="mpKey">
                  <input className="mono" type={showKey ? "text" : "password"} value={draft?.apiKey ?? ""} onChange={(e) => patchDraft(cur.id, { apiKey: e.target.value })} placeholder="输入新 Key 以更新，留空保持不变" aria-label="更新 API Key" />
                  <button className="iconBtn iconBtn--sm" title={showKey ? "隐藏" : "显示"} onClick={() => setShowKey((v) => !v)}><Icon.Key size={13} /></button>
                </span>
              </label>

              <ModelListEditor
                models={draft?.models ?? []}
                onChange={(next) => patchDraft(cur.id, { models: next })}
                draftVal={modelDrafts[cur.id] ?? ""}
                onDraftChange={(v) => setModelDrafts((prev) => ({ ...prev, [cur.id]: v }))}
                onAdd={() => { const id = (modelDrafts[cur.id] ?? "").trim(); patchDraft(cur.id, { models: [...(draft?.models ?? []), { id }] }); setModelDrafts((prev) => ({ ...prev, [cur.id]: "" })); }}
                providerId={cur.id}
                testingModel={testingModel}
                onTest={handleTestModel}
              />
            </>
          ) : (
            <div className="mpEmpty">dsh 后端暂无已注册的模型供应商。</div>
          )}
        </section>
      </div>
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
