import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icons";
import {
  archLayers,
  callSteps,
  cloudEnvStateLabel,
  cloudEnvs,
  connKindLabel,
  connPolicies,
  connStateLabel,
  connections,
  envVars,
  evidenceChain,
  permTierLabel,
  permTiers,
  qualityGates,
  replaySteps,
  reworkRoutes,
  sandboxLimits,
  sandboxToggles,
  type ArchLayer,
  type Connection,
} from "../data/settings";
import {
  AfApiError,
  errorText,
  type AgentProfileSummaryDto,
  type ModelProviderApi,
  type ModelProviderInputDto,
  type ModelProvidersDto,
  type ModelProviderTestResultDto,
} from "../api";

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
  modelProviders,
  modelProvidersError,
  agentProfiles,
  onRefreshModelProviders,
  onSaveModelProvider,
  onDeleteModelProvider,
  onTestModelProvider,
}: {
  pane: SettingsPane;
  onPane: (p: SettingsPane) => void;
  onClose: () => void;
  onToast: (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;
  runtime: ArchRuntime;
  onJump: (target: ArchJump) => void;
  /* 真实服务端目录：由 App.tsx 持有，面板只渲染与派发，不在组件内自行 fetch */
  modelProviders: ModelProvidersDto | null;
  modelProvidersError: string | null;
  agentProfiles: AgentProfileSummaryDto[];
  onRefreshModelProviders: () => Promise<void>;
  onSaveModelProvider: (input: ModelProviderInputDto, mode: "create" | "update") => Promise<void>;
  onDeleteModelProvider: (id: string) => Promise<void>;
  onTestModelProvider: (id: string, modelId: string) => Promise<ModelProviderTestResultDto>;
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
              <ArchPane onToast={onToast} runtime={runtime} onJump={onJump} profileCount={agentProfiles.length} />
            )}
            {pane === "agents" && <AgentsPane onToast={onToast} profiles={agentProfiles} />}
            {pane === "models" && (
              <ModelsPane
                onToast={onToast}
                data={modelProviders}
                error={modelProvidersError}
                onRefresh={onRefreshModelProviders}
                onSave={onSaveModelProvider}
                onDelete={onDeleteModelProvider}
                onTest={onTestModelProvider}
              />
            )}
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

function deriveLayerLive(runtime: ArchRuntime, profileCount: number): Record<string, LayerLive> {
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
        /* 调度池的真实规模来自服务端登记的 agent profile，不是演示数组 */
        { label: "调度智能体", value: `${profileCount} 个` },
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
  profileCount,
}: {
  onToast: Toast;
  runtime: ArchRuntime;
  onJump: (target: ArchJump) => void;
  /* 服务端登记的档案数：架构图的「调度池规模」必须是可核验的事实 */
  profileCount: number;
}) {
  const [active, setActive] = useState<string>(archLayers[1].id);
  const layer = archLayers.find((l) => l.id === active) ?? archLayers[0];
  const live = useMemo(() => deriveLayerLive(runtime, profileCount), [runtime, profileCount]);
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

/* 智能体面板：只渲染服务端登记 agentPresets 的 **只读** 事实。
   AF API 没有 agent-profile 写端点（无 POST/PUT/DELETE /agent-profiles），
   因此这里不提供创建/启停/改模型 —— 演示期的本地增删会被误读成「已配置」，
   而它既没有落到服务端，也不会进入真实编排。可写的是模型供应商（见「模型配置」）。 */
function AgentsPane({ onToast, profiles }: { onToast: Toast; profiles: AgentProfileSummaryDto[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const active = useMemo(
    () => profiles.find((a) => a.profileId === selected) ?? profiles[0] ?? null,
    [profiles, selected],
  );

  const independent = profiles.filter((a) => a.independent);

  /* 无 profile 是合法事实（例如后端未登记），要如实说明而不是显示空网格 */
  if (profiles.length === 0) {
    return (
      <div className="stack">
        <p className="apiNotice" data-state="empty">
          服务端未登记任何智能体档案（agent profile）。没有档案时节点无法绑定执行者，任务不能启动。
        </p>
      </div>
    );
  }

  return (
    <div className="split">
      <div className="split__list">
        <SectionLabel text="服务端档案" hint={`共 ${profiles.length} 个，其中 ${independent.length} 个承担独立审查`} />
        <div className="agentGrid">
          {profiles.map((a, i) => (
            <ProfileCard
              key={a.profileId}
              a={a}
              i={i}
              active={a.profileId === active?.profileId}
              onPick={() => setSelected(a.profileId)}
            />
          ))}
        </div>

        <p className="paneNote">
          档案由服务端登记并冻结（含 profileVersion 与平台摘要），界面上不提供增删改：
          AF API 没有对应的写端点，任何本地改动都不会进入真实编排。
        </p>
      </div>

      {active !== null && (
        <aside className="split__detail">
          <div className="detail__head">
            <span className="detail__glyph" data-tint={active.independent ? "sage" : "accent"}>
              {(() => {
                const G = Icon[active.independent ? "Shield" : "Cpu"];
                return <G size={18} />;
              })()}
            </span>
            <div>
              <strong>{active.name}</strong>
              <span className="detail__kind">
                {active.profileId} · v{active.profileVersion}
              </span>
            </div>
          </div>

          <SectionLabel text="职责" />
          <ul className="dutyList">
            {active.responsibilities.map((r, i) => (
              <li key={`r${i}`} data-kind="in">{r}</li>
            ))}
            {/* 非职责与职责并列展示：边界不清的智能体会越权改契约或自行宣布门禁通过 */}
            {active.nonResponsibilities.map((r, i) => (
              <li key={`n${i}`} data-kind="out">{r}</li>
            ))}
          </ul>

          <dl className="kv">
            <div>
              <dt>模型策略</dt>
              <dd className="mono">
                {active.modelPolicy.provider} / {active.modelPolicy.model}
              </dd>
            </div>
            <div>
              <dt>独立性</dt>
              <dd>{active.independent ? "与实现分离，承担独立审查" : "参与主流程"}</dd>
            </div>
            <div>
              <dt>工具策略</dt>
              <dd className="mono">v{active.toolPolicyVersion} · {active.tools.length} 项授权</dd>
            </div>
            <div>
              <dt>输入 / 输出</dt>
              <dd className="mono">
                {active.inputSchemaVersion} → {active.outputSchemaVersion}
              </dd>
            </div>
            <div>
              <dt>提示词</dt>
              <dd className="mono">
                {active.promptId}@{active.promptVersion}
              </dd>
            </div>
          </dl>

          <SectionLabel text="已授权工具" />
          <div className="tagPick tagPick--static">
            {active.tools.map((t) => (
              <span key={t} className="tag">
                <span className="mono">{t}</span>
              </span>
            ))}
          </div>

          <div className="detail__foot">
            <button
              className="btn btn--outline btn--sm"
              onClick={() =>
                onToast({
                  tone: "info",
                  title: "档案为服务端只读事实",
                  body: `${active.profileId} 由服务端登记与冻结；AF API 未提供写端点，因此这里不提供编辑。`,
                })
              }
            >
              <Icon.Sliders size={14} />
              为何不可编辑
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

/* 档案卡：形态差异先于颜色差异 —— 独立审查用实心盾牌 + 描边，主流程用普通图标 */
function ProfileCard({
  a,
  i,
  active,
  onPick,
}: {
  a: AgentProfileSummaryDto;
  i: number;
  active: boolean;
  onPick: () => void;
}) {
  const G = Icon[a.independent ? "Shield" : "Cpu"];
  return (
    <div
      className="agentCard"
      data-active={active}
      style={{ ["--i" as string]: i }}
      onClick={onPick}
    >
      <span className="agentCard__glyph" data-tint={a.independent ? "sage" : "accent"}>
        <G size={17} />
      </span>
      <div className="agentCard__text">
        <strong>{a.name}</strong>
        <p>{a.responsibilities[0] ?? "未声明职责"}</p>
        <div className="agentCard__meta">
          <span className="mono">{a.profileId}</span>
          <span className="dotSep" />
          <span>v{a.profileVersion}</span>
          {a.independent && (
            <>
              <span className="dotSep" />
              <span>独立审查</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================== 模型配置 =============================== */
/* 模型配置：直接读写服务端登记的供应商（GET/POST/PUT/DELETE /model-providers）。
   后端 provider 只有 id / name / models / baseURL / api / apiKeyEnv 六项 —— 它没有
   「启用/停用」、没有「内置/自建」分组、也没有掩码 Key 尾号。界面不得为对齐旧演示
   数据而补造这三项：它们每一个都会被当成事实来读，而事实的唯一来源是服务端回读。 */
const modelApiLabel: Record<ModelProviderApi, string> = {
  "openai-completions": "OpenAI Chat Completions（/v1/chat/completions）",
  "openai-responses": "OpenAI Responses（/v1/responses）",
  "anthropic-messages": "Anthropic Messages（/v1/messages）",
};

interface ProviderForm {
  id: string;
  displayName: string;
  baseURL: string;
  api: ModelProviderApi;
  /* 明文 Key 只在本次写入时提交；服务端落凭据库后只回 apiKeyEnv 变量名。
     留空表示「不改动既有凭据」，不是「设置为空」。 */
  apiKey: string;
  models: Array<{ id: string; name?: string; contextWindow?: number }>;
}

function ModelsPane({
  onToast,
  data,
  error,
  onRefresh,
  onSave,
  onDelete,
  onTest,
}: {
  onToast: Toast;
  data: ModelProvidersDto | null;
  error: string | null;
  onRefresh: () => Promise<void>;
  onSave: (input: ModelProviderInputDto, mode: "create" | "update") => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string, modelId: string) => Promise<ModelProviderTestResultDto>;
}) {
  const providers = useMemo(() => data?.providers ?? [], [data]);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProviderForm | null>(null);
  const [modelDraft, setModelDraft] = useState("");

  const cur = providers.find((p) => p.id === sel) ?? providers[0] ?? null;
  const mode: "create" | "update" = creating ? "create" : "update";

  /* 选中项或服务端目录变化时重建可编辑副本：表单必须从事实重启，
     否则上一次编辑的残留会被误当成服务端值再提交回去。 */
  useEffect(() => {
    if (creating) return;
    if (cur === null) { setForm(null); return; }
    setForm({
      id: cur.id,
      displayName: cur.name,
      baseURL: cur.baseURL ?? "",
      api: (cur.api as ModelProviderApi | undefined) ?? "openai-completions",
      apiKey: "",
      models: cur.models.map((m) => ({ id: m.id, name: m.name })),
    });
  }, [cur, creating]);

  const startCreate = () => {
    setCreating(true);
    setSel(null);
    setForm({ id: "", displayName: "", baseURL: "", api: "openai-completions", apiKey: "", models: [] });
  };

  const cancelCreate = () => {
    setCreating(false);
    setForm(null);
  };

  const editable = form !== null;
  const idOk = /^[a-z0-9][a-z0-9_-]*$/.test(form?.id ?? "");
  const canSave = editable && idOk && (form?.displayName.trim().length ?? 0) > 0
    && (form?.baseURL.trim().length ?? 0) > 0 && (form?.models.length ?? 0) > 0;

  const save = async () => {
    if (form === null || !canSave) return;
    setBusy(true);
    try {
      await onSave({
        id: form.id.trim(),
        displayName: form.displayName.trim(),
        baseURL: form.baseURL.trim(),
        api: form.api,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        models: form.models.map((m) => ({ id: m.id, ...(m.name ? { name: m.name } : {}), ...(m.contextWindow === undefined ? {} : { contextWindow: m.contextWindow }) })),
      }, mode);
      onToast({
        tone: "ok",
        title: mode === "create" ? "供应商已登记" : "供应商已更新",
        body: `${form.displayName.trim()} · 已写入服务端设置与凭据库，并回读确认。`,
      });
      setCreating(false);
      setSel(form.id.trim());
    } catch (e) {
      onToast({ tone: "warn", title: mode === "create" ? "登记失败" : "更新失败", body: errorText(e instanceof AfApiError ? e.code : undefined, e instanceof Error ? e.message : undefined) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (cur === null) return;
    setBusy(true);
    try {
      await onDelete(cur.id);
      onToast({ tone: "warn", title: `已删除 ${cur.name}`, body: "端点与凭据已一并移除；引用其模型的智能体需重新选型。" });
      setSel(null);
      setForm(null);
    } catch (e) {
      onToast({ tone: "warn", title: "删除失败", body: errorText(e instanceof AfApiError ? e.code : undefined, e instanceof Error ? e.message : undefined) });
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (modelId: string) => {
    if (cur === null) return;
    setTesting(modelId);
    try {
      const r = await onTest(cur.id, modelId);
      onToast({ tone: "ok", title: `${modelId} 探测通过`, body: `服务端回复：${r.reply} · 耗时 ${r.durationMs}ms` });
    } catch (e) {
      onToast({ tone: "warn", title: `${modelId} 探测失败`, body: errorText(e instanceof AfApiError ? e.code : undefined, e instanceof Error ? e.message : undefined) });
    } finally {
      setTesting(null);
    }
  };

  const defaultRef = data?.defaultModel ?? null;
  const withCredential = providers.filter((p) => p.apiKeyEnv).length;

  /* 加载/失败/空是三件不同的事，必须各自有明确页面状态，不能静默显示成空列表 */
  if (data === null && error === null) {
    return <p className="apiNotice" data-state="loading">正在读取服务端供应商目录…</p>;
  }
  if (data === null && error !== null) {
    return (
      <div className="stack">
        <p className="apiNotice" data-state="error" role="alert">供应商目录读取失败 · {error}</p>
        <button className="btn btn--sm" onClick={() => void onRefresh()}>重新读取</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="statRow">
        <Stat label="供应商" value={String(providers.length)} hint="服务端已登记" />
        <Stat label="默认模型" value={defaultRef ? defaultRef.model : "未配置"} hint={defaultRef ? `来自 ${defaultRef.provider}` : "服务端未指定默认模型"} />
        <Stat label="凭据来源" value={`${withCredential}/${providers.length}`} hint="已声明环境变量引用的供应商" />
      </div>

      <div className="mpLayout">
        {/* ---------------- 左栏：供应商列表 ---------------- */}
        <aside className="mpList">
          {providers.length === 0 && !creating ? (
            <p className="mpEmpty">服务端未登记任何供应商。没有可用供应商时，模型选型无法进行。</p>
          ) : (
            <div className="mpList__group">
              <span className="kicker">服务端登记</span>
              <ul>
                {providers.map((p, i) => (
                  <li key={p.id} style={{ ["--i" as string]: i }}>
                    <button
                      className="mpItem"
                      data-active={!creating && p.id === cur?.id}
                      onClick={() => { setCreating(false); setSel(p.id); }}
                    >
                      <Icon.Cube size={13} className="mpItem__glyph" />
                      <span className="mpItem__name">{p.name}</span>
                      <span className="mpItem__n mono">{p.models.length}</span>
                      {/* 「默认」是服务端 currentSelection 的真实回读，不是本地推断 */}
                      {defaultRef?.provider === p.id && <i className="mpItem__dot" data-on title="服务端默认模型所在供应商" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 只在「正在新建」时隐藏入口：form 非空只表示正在查看某个已登记供应商，
              不能据此隐藏新增入口，否则有任一供应商后永远无法再登记新的。 */}
          {creating ? null : (
            <button className="mpList__add" onClick={startCreate}>
              <Icon.Plus size={13} />
              登记供应商
            </button>
          )}
        </aside>

        {/* ---------------- 右栏：当前供应商配置 ---------------- */}
        <section className="mpForm">
          {form === null ? (
            <p className="mpEmpty">从左侧选择一个供应商查看其端点、协议与模型。</p>
          ) : (
            <>
              <header className="mpForm__head">
                <h4 className="serif">{mode === "create" ? "登记新供应商" : form.displayName || form.id}</h4>
                <span className="mpBadge" data-on>
                  {mode === "create" ? "待写入" : "服务端已登记"}
                </span>
                <button className="btn btn--sm" onClick={() => void onRefresh()} disabled={busy}>
                  重新读取
                </button>
                {/* 删除不可逆：新建态没有可删对象，故只在 update 态出现 */}
                {mode === "update" && (
                  <button
                    className="iconBtn iconBtn--sm"
                    title="删除供应商（端点与凭据一并移除）"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    <Icon.Trash size={13} />
                  </button>
                )}
              </header>

              <label className="mpField">
                <span className="mpField__label">供应商 ID</span>
                <input
                  className="mono"
                  value={form.id}
                  readOnly={mode === "update"}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  spellCheck={false}
                  aria-label="供应商 ID"
                />
                <em className="mpField__hint">
                  {mode === "update"
                    ? "ID 是服务端设置命名空间的键，登记后不可改名。"
                    : "小写字母开头，只能含小写字母、数字、下划线与连字符；它同时是凭据引用前缀。"}
                </em>
                {!idOk && form.id.length > 0 && (
                  <em className="mpField__hint" data-warn>ID 不符合服务端命名约束，无法写入。</em>
                )}
              </label>

              <label className="mpField">
                <span className="mpField__label">显示名称</span>
                <input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="如 所内模型网关"
                  aria-label="显示名称"
                />
              </label>

              <label className="mpField">
                <span className="mpField__label">Base URL</span>
                <input
                  className="mono"
                  value={form.baseURL}
                  onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
                  placeholder="https://…/v1"
                  spellCheck={false}
                  aria-label="Base URL"
                />
              </label>

              <label className="mpField">
                <span className="mpField__label">API 格式</span>
                <select
                  value={form.api}
                  onChange={(e) => setForm({ ...form, api: e.target.value as ModelProviderApi })}
                >
                  {(Object.keys(modelApiLabel) as ModelProviderApi[]).map((f) => (
                    <option key={f} value={f}>{modelApiLabel[f]}</option>
                  ))}
                </select>
                <em className="mpField__hint">
                  这是服务端支持的协议枚举，决定请求体如何拼装；填错会在首次调用时被连接层拦下。
                </em>
              </label>

              <label className="mpField">
                <span className="mpField__label">API Key</span>
                <input
                  className="mono"
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={mode === "update" ? "留空表示保留服务端既有凭据" : "粘贴明文 Key，仅本次提交"}
                  aria-label="API Key"
                />
                <em className="mpField__hint">
                  明文 Key 只在写入时提交一次，服务端落凭据库后只回环境变量名（当前：
                  {cur?.apiKeyEnv ? ` ${cur.apiKeyEnv}` : " 未声明"}）。智能体拿不到明文。
                </em>
              </label>

              <div className="mpField">
                <span className="mpField__label">
                  模型列表
                  <span className="mpField__n mono">{form.models.length}</span>
                </span>

                {form.models.length ? (
                  <ul className="mpModels">
                    {form.models.map((m, i) => (
                      <li key={m.id} className="mpModel" style={{ ["--i" as string]: i }}>
                        <span className="mpModel__id mono">{m.id}</span>
                        {m.contextWindow !== undefined && (
                          <span className="mpModel__ctx mono">{(m.contextWindow / 1000).toFixed(0)}K</span>
                        )}
                        <button
                          className="btn btn--sm"
                          disabled={testing === m.id || cur === null || mode === "create"}
                          title={mode === "create" ? "先写入服务端后才能探测" : "发起真实连通性探测"}
                          onClick={() => void runTest(m.id)}
                        >
                          {testing === m.id ? "探测中…" : "测试"}
                        </button>
                        <button
                          className="iconBtn iconBtn--sm"
                          title="移除模型"
                          onClick={() => setForm({ ...form, models: form.models.filter((x) => x.id !== m.id) })}
                        >
                          <Icon.Trash size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mpEmpty">还没有模型。供应商没有任何模型时无法参与选型，先添加一个。</p>
                )}

                <div className="mpModelAdd">
                  <input
                    className="mono"
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    placeholder="模型 API 名，如 deepseek-v4.1-flash"
                    aria-label="模型名"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModel(); } }}
                  />
                  <button className="btn btn--sm" disabled={!modelDraft.trim()} onClick={addModel}>
                    <Icon.Plus size={12} />
                    添加模型
                  </button>
                </div>
              </div>

              <div className="mpForm__act">
                <button className="btn btn--accent" disabled={!canSave || busy} onClick={() => void save()}>
                  {busy ? "写入中…" : mode === "create" ? "登记到服务端" : "保存到服务端"}
                </button>
                {mode === "create" && (
                  <button className="btn" disabled={busy} onClick={cancelCreate}>取消</button>
                )}
                {/* 保存按钮必须说清它写的是什么，避免被读成「已生效」 */}
                <em className="mpField__hint">
                  保存即写入服务端设置命名空间与凭据库；界面不做本地乐观更新，以回读结果为准。
                </em>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );

  function addModel() {
    const id = modelDraft.trim();
    if (!id || form === null) return;
    if (form.models.some((m) => m.id === id)) {
      onToast({ tone: "warn", title: "模型已存在", body: `${id} 已在列表中，未重复添加。` });
      return;
    }
    setForm({ ...form, models: [...form.models, { id }] });
    setModelDraft("");
  }
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
      <p className="paneNote">
        本面板展示的是受控连接层的<strong>设计口径</strong>（分级规则、七步链路、策略清单），
        数字为设计期示例，不是运行时遥测：AF API 没有连接层端点，
        真实的受控调用事实目前只落在任务轨迹里（<code className="mono">dag.operation.planned</code> 等）。
      </p>

      <div className="statRow">
        <Stat label="受控连接" value={`${linked}/${list.length}`} hint="示例口径 · 非实时" />
        <Stat label="24h 外部调用" value={calls.toLocaleString()} hint="设计期示例 · 无遥测端点" />
        <Stat label="权限拦截" value={String(denied)} hint="设计期示例 · 非实时" tone="warn" />
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
      <p className="paneNote">
        本面板展示的是执行环境的<strong>设计口径</strong>（云环境与沙箱的分级、隔离与数据边界），
        内容为设计期示例，不是运行时事实：AF API 没有环境端点，
        任务真实使用的执行器只有 <code className="mono">executorMode</code> 一项（见任务事实）。
      </p>

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
