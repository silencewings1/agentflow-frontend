import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icons";
import {
  archLayers,
  callSteps,
  evidenceChain,
  permTiers,
  qualityGates,
  reworkRoutes,
  type ArchLayer,
} from "../data/settings";
import { MembersPane } from "./MembersPane";
import type { Workflow } from "../data/workflows";
import {
  AfApiError,
  errorText,
  type ActorDto,
  type AccountDto,
  type AccountInputDto,
  type AccountsDto,
  type NodePermDto,
  type AgentProfileSummaryDto,
  type ModelProviderApi,
  type ModelProviderInputDto,
  type ModelProvidersDto,
  type ModelProviderTestResultDto,
  type ConnectionLayerDto,
  type EnvironmentDto,
} from "../api";

export type SettingsPane = "arch" | "members" | "agents" | "models" | "connect" | "env";

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
  /** 服务端实际执行器模式；缺省表示尚未读到任务事实。 */
  executorMode?: string;
}

const PANES: { id: SettingsPane; label: string; glyph: IconName; desc: string }[] = [
  {
    id: "arch",
    label: "总体架构",
    glyph: "Layers",
    desc: "五层协同架构：每一层职责单一、边界清晰，并显示当前会话在该层的实时状态。",
  },
  {
    id: "members",
    label: "成员与权限",
    glyph: "Key",
    desc: "账户目录与节点授权矩阵：每个责任位由谁承担、持有什么权限等级，变更全程留痕。",
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
    desc: "执行环境事实：执行器模式、工作目录隔离策略、命令超时与工具策略面。",
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
  connectionLayer,
  connectionLayerError,
  environment,
  environmentError,
  onRefreshPosture,
  accounts,
  actor,
  workflows,
  onRefreshAccounts,
  onCreateAccount,
  onUpdateAccount,
  onSetAccountState,
  onSetGrant,
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
  connectionLayer: ConnectionLayerDto | null;
  connectionLayerError: string | null;
  environment: EnvironmentDto | null;
  environmentError: string | null;
  onRefreshPosture: () => Promise<void>;
  /* 多用户：账户目录与授权由 App 持有，面板只渲染与派发（§三 状态只放 App）。 */
  accounts: AccountsDto | null;
  actor: ActorDto | null;
  workflows: Workflow[];
  onRefreshAccounts: () => Promise<void>;
  onCreateAccount: (input: AccountInputDto) => Promise<void>;
  onUpdateAccount: (accountId: string, input: Partial<AccountInputDto>) => Promise<void>;
  onSetAccountState: (accountId: string, state: AccountDto["state"]) => Promise<void>;
  onSetGrant: (input: {
    accountId: string;
    workflowId: string;
    nodeId: string;
    perm: NodePermDto | null;
    expectedRevision?: number;
  }) => Promise<void>;
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

          {/* data-pane 让分片样式能按面板收敛滚动行为（成员面板是三列各自独立滚动） */}
          <div className="sheet__body" key={pane} data-pane={pane}>
            {pane === "arch" && (
              <ArchPane onToast={onToast} runtime={runtime} onJump={onJump} profileCount={agentProfiles.length} link={connectionLayer} />
            )}
            {pane === "members" && (
              <MembersPane
                data={accounts}
                actor={actor}
                workflows={workflows}
                onToast={onToast}
                onRefresh={onRefreshAccounts}
                onCreateAccount={onCreateAccount}
                onUpdateAccount={onUpdateAccount}
                onSetAccountState={onSetAccountState}
                onSetGrant={onSetGrant}
              />
            )}
            {pane === "agents" && <AgentsPane onToast={onToast} profiles={agentProfiles} />}
            {pane === "models" && (
              <ModelsPane
                onToast={onToast}
                data={modelProviders}
                error={modelProvidersError}
                canManage={actor?.canManageAccounts === true}
                onRefresh={onRefreshModelProviders}
                onRefreshAccounts={onRefreshAccounts}
                onSave={onSaveModelProvider}
                onDelete={onDeleteModelProvider}
                onTest={onTestModelProvider}
              />
            )}
            {pane === "connect" && (
              <ConnectPane link={connectionLayer} error={connectionLayerError} onRefresh={onRefreshPosture} />
            )}
            {pane === "env" && (
              <EnvPane env={environment} error={environmentError} onRefresh={onRefreshPosture} />
            )}
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

function deriveLayerLive(
  runtime: ArchRuntime,
  profileCount: number,
  link: ConnectionLayerDto | null,
): Record<string, LayerLive> {
  /* L3：受控连接层。这里只陈述**服务端事实**——登记了几个连接、几个档案被禁止
     直写外部。此前用演示回放步数拼出「本次运行 N 次受控调用」，那是把 fixture
     当成了运行时读数；af-api 没有调用遥测，故不再这样表述。 */
  const connectionCount = link?.scmConnections.length ?? 0;
  const availableConnections = link?.scmConnections.filter((c) => c.available).length ?? 0;
  const directWriteProfiles = link?.profilesAllowingExternalWrite ?? 0;
  const uncontrolled = directWriteProfiles > 0;

  /* L4：门禁由确定性程序裁决，证据链决定结论能否被核验 */
  const blocking = qualityGates.find((g) => g.state === "blocked");
  const activeGate = qualityGates.find((g) => g.state === "active");
  const passedGates = qualityGates.filter((g) => g.state === "passed").length;
  const failedChecks = (activeGate ?? blocking)?.checks.filter((c) => !c.ok).length ?? 0;
  const evConfirmed = evidenceChain.filter((e) => e.confirmed).length;
  const evRequired = evidenceChain.filter((e) => e.required).length;

  /* L5：人工检查层只认「谁在等谁」 */
  /* L5：人工检查层只认「谁在等谁」。这里不再用演示回放的步数充数——
     待决策数由任务事实（awaitingApproval）给出，界面不编造审计计数。 */
  const waiting = runtime.awaitingApproval ? 1 : 0;
  const approvalEv = evidenceChain.find((e) => e.kind === "approval");

  return {
    "l-biz": {
      tone: runtime.wfStep + 1 >= runtime.wfTotal ? "sage" : "accent",
      headline: `「${runtime.workflowName}」推进至第 ${Math.min(runtime.wfStep + 1, runtime.wfTotal)} / ${runtime.wfTotal} 个节点`,
      metrics: [
        { label: "当前节点", value: runtime.currentNode || "—" },
        { label: "执行器", value: runtime.executorMode ?? "未声明" },
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
      tone: uncontrolled ? "gold" : connectionCount === 0 ? "gold" : "sage",
      headline: uncontrolled
        ? `模板态 · ${connectionCount} 个已登记连接，但存在可直接写外部的档案`
        : connectionCount === 0
          ? "模板态 · 服务端未登记任何外部连接，Git 写入无可用通道"
          : `模板态 · ${availableConnections}/${connectionCount} 个外部连接可用`,
      metrics: [
        { label: "已登记连接", value: `${connectionCount} 个` },
        { label: "权限上限档案", value: `${profileCount} 份` },
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
  link,
}: {
  onToast: Toast;
  runtime: ArchRuntime;
  onJump: (target: ArchJump) => void;
  /* 服务端登记的档案数：架构图的「调度池规模」必须是可核验的事实 */
  profileCount: number;
  link: ConnectionLayerDto | null;
}) {
  const [active, setActive] = useState<string>(archLayers[1].id);
  const layer = archLayers.find((l) => l.id === active) ?? archLayers[0];
  const live = useMemo(() => deriveLayerLive(runtime, profileCount, link), [runtime, profileCount, link]);
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
  canManage,
  onRefresh,
  /* 被拒后要重读的是**账户目录**（`canManage` 来自 `actor`），而不是供应商列表。
     这两件事必须分开传：只调 `onRefresh`（= 重读供应商）刷新的是一个与被拒原因
     无关的列表，`canManage` 仍旧过期——实测这样改完 `realigned: false`。 */
  onRefreshAccounts,
  onSave,
  onDelete,
  onTest,
}: {
  onToast: Toast;
  data: ModelProvidersDto | null;
  error: string | null;
  /* 服务端 `/model-providers` 的三条写路由现在按**平台级**闸门判权
     （在真实责任位上持 manage）。界面必须与写路径给出同一个答案：
     否则非管理者能照常点击、填完整张表单、最后收到 403，
     而那张表单已经白填了。
     判据与服务端同源（`actor.canManageAccounts`），不在前端另立一套——
     两个答案不一致正是 §「界面事实不可信」记过的那类缺陷。 */
  canManage: boolean;
  onRefresh: () => Promise<void>;
  onRefreshAccounts: () => Promise<void>;
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
    /* 前置条件不满足时不发请求：写路径会 403，而用户已经填完整张表单。
       这里的拦截是**呈现**问题，不是安全问题——服务端才是判据的持有者，
       它不依赖本行（本行也不应被读成"界面在保护什么"）。 */
    if (!canManage) {
      onToast({ tone: "warn", title: "无法写入", body: "登记或修改模型供应商需要管理权限（在至少一个真实责任位上持有「可编排」）。" });
      return;
    }
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
      /* 被拒后重读，让 `actor.canManageAccounts` 回到服务端事实。
         判据是本题的 `canManage`（来自 `actor`，与成员面板同源），因此
         **同一个人被降权后，两个面板会一起停在旧状态**——只修一个面板
         等于把同一个缺陷留一半。触发码与 App.tsx 的 `realignAfterDenial`
         保持一致：重读是"被拒"的补偿，不是无差别的失败重试。 */
      if (e instanceof AfApiError && (e.code === "AF_PERMISSION_DENIED" || e.code === "AF_ACCOUNT_SUSPENDED")) {
        await Promise.all([
          onRefreshAccounts().catch(() => undefined),
          onRefresh().catch(() => undefined),
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (cur === null) return;
    if (!canManage) {
      onToast({ tone: "warn", title: "无法删除", body: "删除模型供应商需要管理权限（在至少一个真实责任位上持有「可编排」）。" });
      return;
    }
    setBusy(true);
    try {
      await onDelete(cur.id);
      onToast({ tone: "warn", title: `已删除 ${cur.name}`, body: "端点与凭据已一并移除；引用其模型的智能体需重新选型。" });
      setSel(null);
      setForm(null);
    } catch (e) {
      onToast({ tone: "warn", title: "删除失败", body: errorText(e instanceof AfApiError ? e.code : undefined, e instanceof Error ? e.message : undefined) });
      /* 同 save：删除失败也可能是"权限在会话中途没了"，此时界面上的
         `canManage` 已过期，不重读就会继续把删除按钮显示为可用。 */
      if (e instanceof AfApiError && (e.code === "AF_PERMISSION_DENIED" || e.code === "AF_ACCOUNT_SUSPENDED")) {
        await Promise.all([
          onRefreshAccounts().catch(() => undefined),
          onRefresh().catch(() => undefined),
        ]);
      }
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
            /* 前置条件未满足时**照常可点但显式呈现受阻**（AGENTS.md §4.3）。
               这里的"可点"是有意的：展开表单本身无害且有用（用户能看到要填什么、
               以及为什么现在不能提交），真正不可逆的是**写入**，而写入那一步
               已在派发前拦住并在按钮上标了 data-blocked。
               因此按钮上不能写 `cursor: not-allowed`——它确实响应点击。
               标明受阻用的是 --gold 虚框 + 斜线纹理（形态差异），
               理由挂在 title 上，点开后表单内的提示会再说一遍。 */
            <button
              className="mpList__add"
              data-blocked={!canManage}
              title={canManage ? undefined : "模型供应商是平台级配置：登记需要管理权限（在至少一个真实责任位上持有「可编排」）。展开后仍可查看字段，但无法提交。"}
              onClick={startCreate}
            >
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
                    title={canManage
                      ? "删除供应商（端点与凭据一并移除）"
                      : "删除供应商需要管理权限（在至少一个真实责任位上持有「可编排」）"}
                    data-blocked={!canManage}
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
                <button
                  className="btn btn--accent"
                  data-blocked={!canManage}
                  disabled={!canSave || busy}
                  onClick={() => void save()}
                >
                  {busy ? "写入中…" : mode === "create" ? "登记到服务端" : "保存到服务端"}
                </button>
                {mode === "create" && (
                  <button className="btn" disabled={busy} onClick={cancelCreate}>取消</button>
                )}
                {/* 保存按钮必须说清它写的是什么，避免被读成「已生效」 */}
                <em className="mpField__hint">
                  {canManage
                    ? "保存即写入服务端设置命名空间与凭据库；界面不做本地乐观更新，以回读结果为准。"
                    : "模型供应商是平台级配置：登记、修改与删除需要管理权限（在至少一个真实责任位上持有「可编排」）。连通性测试不需要该权限。"}
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

/* 允许面与禁止面分开呈现：禁止面用 data-tone="deny" 标出，
   避免读者把「没列出」误解成「被允许」。 */
function PolicyTags({ items, tone }: { items: string[]; tone: "allow" | "deny" }) {
  if (items.length === 0) return <span className="paneNote">无</span>;
  return (
    <span className="tagPick tagPick--static">
      {items.map((item) => (
        <span key={item} className="tag tag--xs" data-tone={tone}>
          <span className="mono">{item}</span>
        </span>
      ))}
    </span>
  );
}

/* 受控连接层：只呈现服务端事实（登记连接、权限上限、命令白名单）。
   设计口径（七步链路、三级权限）是机制描述，直接呈现；
   而调用次数/拦截次数/P95 这类遥测**没有事实源**，因此不再出现在界面上 ——
   宁可少一个数字，也不给一个读起来像实时读数的编造值。 */
function ConnectPane({
  link,
  error,
  onRefresh,
}: {
  link: ConnectionLayerDto | null;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="stack">
      <div className="barRow">
        <span className="paneNote">服务端目录的只读投影：策略随 profile 与 skill 一并冻结。</span>
        <button className="btn btn--outline btn--sm" disabled={refreshing} onClick={() => void refresh()}>
          <Icon.Clock size={13} />
          {refreshing ? "正在回读…" : "回读连接事实"}
        </button>
      </div>

      {/* 读取失败与「服务端确实没登记连接」是两种不同事实，必须分开呈现 */}
      {error !== null && (
        <p className="connErr">
          连接事实读取失败：{error}
        </p>
      )}

      {link === null ? (
        <p className="paneNote">正在读取服务端连接事实…</p>
      ) : (
        <>
          <div className="statRow">
            <Stat label="已登记连接" value={String(link.scmConnections.length)} hint="服务端 scmProviders" />
            <Stat label="权限上限档案" value={String(link.toolPermissions.length)} hint="按 profile 冻结的工具策略" />
            <Stat
              label="允许外部写入"
              value={String(link.profilesAllowingExternalWrite)}
              hint={link.profilesAllowingExternalWrite === 0 ? "没有档案可直写外部系统" : "存在直写档案"}
              tone={link.profilesAllowingExternalWrite === 0 ? undefined : "warn"}
            />
          </div>

          <SectionLabel text="已登记连接" hint="SCM / MCP 目录" />
          {link.scmConnections.length === 0 ? (
            <p className="paneNote">
              服务端尚未登记任何 SCM/MCP 连接，因此 Git 写入这一步没有可用通道。
              这是控制面里确实没有连接，不是界面缺数据。
            </p>
          ) : (
            <div className="connList">
              {link.scmConnections.map((conn, i) => (
                <article className="conn" key={`${conn.provider}-${conn.mcpServerRef}`} style={{ ["--i" as string]: i }}>
                  <span className="conn__glyph" data-kind="mcp">
                    <Icon.Plug size={16} />
                  </span>
                  <div className="conn__id">
                    <div className="conn__name">
                      <strong>{conn.provider}</strong>
                      <span className="pill" data-state={conn.available ? "done" : "review"}>
                        {conn.available ? "可用" : "不可用"}
                      </span>
                    </div>
                    <span className="conn__ep mono">{conn.mcpServerRef}</span>
                    <div className="conn__scopes">
                      <span className="conn__k">凭据引用</span>
                      <span className="mono">{conn.credentialRef}</span>
                    </div>
                  </div>
                  <div className="conn__guard">
                    <span className="conn__k">工具</span>
                    <PolicyTags items={conn.tools} tone="allow" />
                  </div>
                </article>
              ))}
            </div>
          )}

          <SectionLabel text="权限上限（按档案）" hint="身份与分级授权的真实依据" />
          <div className="permList">
            {link.toolPermissions.map((perm, i) => (
              <article className="permRow" key={`${perm.profileId}@${perm.profileVersion}`} style={{ ["--i" as string]: i }}>
                <header>
                  <strong>{perm.name}</strong>
                  <span className="mono">{perm.profileId}@{perm.profileVersion}</span>
                  {perm.independent && <span className="pill" data-state="review">独立审查</span>}
                </header>
                <div className="permRow__line">
                  <span className="conn__k">允许</span>
                  <PolicyTags items={perm.allow} tone="allow" />
                </div>
                <div className="permRow__line">
                  <span className="conn__k">禁止</span>
                  <PolicyTags items={perm.deny} tone="deny" />
                </div>
              </article>
            ))}
          </div>

          <SectionLabel text="受控命令面" hint="上下文与参数校验的真实白名单" />
          <div className="permList">
            {link.controlledCommands.map((cmd, i) => (
              <article className="permRow" key={`${cmd.skillId}@${cmd.skillVersion}`} style={{ ["--i" as string]: i }}>
                <header>
                  <strong>{cmd.name}</strong>
                  <span className="mono">{cmd.skillId}</span>
                  <span className="conn__k">{Math.round(cmd.timeoutMs / 1000)}s 上限</span>
                </header>
                <PolicyTags items={cmd.allowedCommands} tone="allow" />
              </article>
            ))}
          </div>

          <SectionLabel text="一次受控调用" hint="七个固定步骤" />
          <ol className="callFlow">
            {callSteps.map((step, i) => {
              const G = Icon[step.glyph];
              return (
                <li key={step.id} className="callStep" style={{ ["--i" as string]: i }}>
                  <span className="callStep__n mono">{i + 1}</span>
                  <span className="callStep__glyph">
                    <G size={13} />
                  </span>
                  <strong>{step.name}</strong>
                  <em>{step.note}</em>
                </li>
              );
            })}
          </ol>

          <SectionLabel text="权限分级" hint="按操作影响划分" />
          <div className="tierGrid">
            {permTiers.map((tier, i) => (
              <div className="tier" key={tier.id} data-tier={tier.id} style={{ ["--i" as string]: i }}>
                <div className="tier__top">
                  <strong>{tier.name}</strong>
                  <span className="tier__gate">{tier.gate}</span>
                </div>
                <p>{tier.rule}</p>
                <div className="tagPick tagPick--static">
                  {tier.examples.map((example) => (
                    <span key={example} className="tag tag--xs">
                      {example}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="paneNote">
            前三段（连接、权限上限、命令面）是服务端事实。AF API 没有连接层写端点，
            所以界面不提供本地增删——本地改动不会进入真实编排。
          </p>
        </>
      )}
    </div>
  );
}

/* ============================= 环境配置 ================================ */

/* 执行环境事实：来自冻结的 profile 与 skill 清单，不是运行时资源读数。
   原先面板显示的磁盘占用、运行时长、上下文百分比没有任何事实源，已移除。 */
function EnvPane({
  env,
  error,
  onRefresh,
}: {
  env: EnvironmentDto | null;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="stack">
      <div className="barRow">
        <span className="paneNote">执行环境事实来自冻结的 profile 与 skill 清单。</span>
        <button className="btn btn--outline btn--sm" disabled={refreshing} onClick={() => void refresh()}>
          <Icon.Clock size={13} />
          {refreshing ? "正在回读…" : "回读环境事实"}
        </button>
      </div>

      {error !== null && (
        <p className="connErr">
          环境事实读取失败：{error}
        </p>
      )}

      {env === null ? (
        <p className="paneNote">正在读取服务端环境事实…</p>
      ) : (
        <>
          <div className="statRow">
            <Stat label="执行器" value={env.executorMode} hint="服务端唯一合法模式" />
            <Stat label="策略覆盖档案" value={String(env.profileCount)} hint="受工具策略约束的 profile 数" />
            <Stat label="写证据的 skill" value={String(env.skillsWritingEvidence)} hint="执行结果会进证据链" />
          </div>

          <SectionLabel text="工作目录隔离" hint="skill 的取路径策略" />
          <div className="permList">
            {env.workingDirectoryPolicies.map((policy, i) => (
              <article className="permRow" key={policy} style={{ ["--i" as string]: i }}>
                <header>
                  <strong>路径策略</strong>
                </header>
                <code className="mono permRow__raw">{policy}</code>
                <p className="paneNote">
                  要求命令只在工作区内已存在的目录执行，并禁止经符号链接跳出工作区。
                </p>
              </article>
            ))}
          </div>

          <SectionLabel text="命令超时" hint="每个 skill 的硬上限" />
          <div className="permList">
            {env.commandTimeouts.map((item, i) => (
              <article className="permRow" key={item.skillId} style={{ ["--i" as string]: i }}>
                <header>
                  <strong className="mono">{item.skillId}</strong>
                  <span className="conn__k">{Math.round(item.timeoutMs / 1000)}s</span>
                </header>
              </article>
            ))}
          </div>

          <SectionLabel text="工具策略面" hint="全部档案的并集" />
          <div className="permList">
            <article className="permRow">
              <div className="permRow__line">
                <span className="conn__k">至少一个档案允许</span>
                <PolicyTags items={env.toolPolicySurface.allow} tone="allow" />
              </div>
              <div className="permRow__line">
                <span className="conn__k">至少一个档案禁止</span>
                <PolicyTags items={env.toolPolicySurface.deny} tone="deny" />
              </div>
            </article>
          </div>

          <p className="paneNote">
            两个面都列出是为了避免误读：同一项能力可能被一个档案允许、被另一个档案禁止，
            单个节点的实际权限取它自己那份策略，而不是这份并集。
          </p>
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
