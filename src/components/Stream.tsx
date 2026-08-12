import { useEffect, useRef, useState } from "react";
import { Icon, iconByKey, type IconName } from "./Icons";
import type { AgentEvent } from "../data/mock";
import { roleLabel, permTierLabel } from "../data/settings";
import { roleGlyph } from "../data/workflows";

export function Stream({
  events,
  streaming,
  pendingApproval,
  onApprove,
  onOpenFile,
  onCopy,
}: {
  events: AgentEvent[];
  streaming: boolean;
  pendingApproval: string | null;
  onApprove: (id: string, ok: boolean) => void;
  onOpenFile: (path: string) => void;
  onCopy: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length, streaming]);

  return (
    <div className="stream">
      <div className="stream__inner">
        <div className="stream__spine" aria-hidden />
        {events.map((e, i) => (
          <Event
            key={e.id}
            e={e}
            index={i}
            pending={pendingApproval === e.id}
            onApprove={onApprove}
            onOpenFile={onOpenFile}
            onCopy={onCopy}
          />
        ))}
        {streaming && <Thinking />}
        <div ref={endRef} className="stream__end" />
      </div>
    </div>
  );
}

function Event({
  e,
  index,
  pending,
  onApprove,
  onOpenFile,
  onCopy,
}: {
  e: AgentEvent;
  index: number;
  pending: boolean;
  onApprove: (id: string, ok: boolean) => void;
  onOpenFile: (path: string) => void;
  onCopy: () => void;
}) {
  const style = { ["--i" as string]: Math.min(index, 14) };

  switch (e.kind) {
    case "user":
      return (
        <article className="ev ev--user" style={style}>
          <div className="ev__gutter">
            <span className="avatar avatar--me mono">YZ</span>
          </div>
          <div className="bubble">
            <p className="bubble__text" dangerouslySetInnerHTML={{ __html: md(e.text) }} />
            {e.attachments?.length ? (
              <div className="attachments">
                {e.attachments.map((a) => (
                  <span key={a} className="attachment mono">
                    <Icon.Paperclip size={11} />
                    {a}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      );

    case "reasoning":
      return <Reasoning e={e} style={style} />;

    case "text":
      return (
        <article className="ev ev--agent" style={style}>
          <div className="ev__gutter">
            <span className="avatar avatar--agent">
              <Icon.Sparkle size={13} />
            </span>
          </div>
          <div className="prose">
            <p dangerouslySetInnerHTML={{ __html: md(e.body) }} />
          </div>
        </article>
      );

    case "plan":
      return (
        <article className="ev ev--card" style={style}>
          <div className="ev__gutter" />
          <div className="card card--plan">
            <header className="card__head">
              <span className="kicker">执行计划</span>
              <span className="mono card__count">
                {e.steps.filter((s) => s.status === "done").length}/{e.steps.length}
              </span>
            </header>
            <ol className="plan">
              {e.steps.map((s, si) => (
                <li key={s.label} className="plan__item" data-status={s.status} style={{ ["--si" as string]: si }}>
                  <span className="plan__mark">
                    {s.status === "done" ? (
                      <Icon.Check size={11} />
                    ) : s.status === "active" ? (
                      <i className="plan__spin" />
                    ) : (
                      <i className="plan__idle" />
                    )}
                  </span>
                  <span className="plan__label">{s.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </article>
      );

    case "tool":
      return <Tool e={e} style={style} onCopy={onCopy} />;

    case "diff":
      return (
        <article className="ev ev--card" style={style}>
          <div className="ev__gutter" />
          <div className="card card--diff">
            <header className="card__head">
              <span className="kicker">改动摘要</span>
              <span className="mono card__count">
                {e.files.length} 个文件
              </span>
            </header>
            <p className="card__lede">{e.summary}</p>
            <ul className="fileList">
              {e.files.map((f) => (
                <li key={f.path}>
                  <button className="fileRow" onClick={() => onOpenFile(f.path)}>
                    <Icon.File size={13} className="fileRow__icon" />
                    <span className="fileRow__path mono">
                      {f.path.replace(/\/([^/]+)$/, "/")}
                      <b>{f.path.split("/").pop()}</b>
                    </span>
                    <span className="bars" aria-hidden>
                      {bars(f.added, f.removed).map((t, bi) => (
                        <i key={bi} data-t={t} />
                      ))}
                    </span>
                    <span className="delta mono">
                      <b>+{f.added}</b>
                      <i>−{f.removed}</i>
                    </span>
                    <Icon.Chevron size={13} className="fileRow__go" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </article>
      );

    case "approval":
      return (
        <article className="ev ev--card" style={style}>
          <div className="ev__gutter" />
          <div className="card card--approval" data-pending={pending}>
            <div className="approval__glow" aria-hidden />
            <header className="card__head">
              <span className="kicker kicker--accent">需要批准</span>
              <span className="risk mono" data-risk={e.risk}>
                风险 {e.risk === "low" ? "低" : e.risk === "medium" ? "中" : "高"}
              </span>
            </header>
            <div className="cmd mono">
              <span className="cmd__sigil">$</span>
              <code>{e.command}</code>
            </div>
            <p className="card__lede">{e.rationale}</p>
            {pending ? (
              <div className="approval__actions">
                <button className="btn btn--accent" onClick={() => onApprove(e.id, true)}>
                  <Icon.Check size={14} />
                  批准并运行
                  <span className="btn__keys">
                    <span className="kbd">⏎</span>
                  </span>
                </button>
                <button className="btn btn--outline" onClick={() => onApprove(e.id, false)}>
                  <Icon.X size={14} />
                  拒绝
                </button>
                <span className="approval__note mono">此后一直允许该命令</span>
              </div>
            ) : (
              <div className="approval__resolved mono">
                <Icon.Check size={12} />
                已批准 · 在沙箱内执行
              </div>
            )}
          </div>
        </article>
      );

    case "tests":
      return (
        <article className="ev ev--card" style={style}>
          <div className="ev__gutter" />
          <div className="card card--tests">
            <div className="tests__figure">
              <span className="tests__num serif">{e.passed}</span>
              <span className="kicker">项通过</span>
            </div>
            <ul className="tests__meta mono">
              <li>
                <span>失败</span>
                <b data-zero={e.failed === 0}>{e.failed}</b>
              </li>
              <li>
                <span>跳过</span>
                <b>{e.skipped}</b>
              </li>
              <li>
                <span>耗时</span>
                <b>{(e.ms / 1000).toFixed(2)}s</b>
              </li>
            </ul>
            <div className="tests__spark" aria-hidden>
              {Array.from({ length: 24 }).map((_, i) => (
                <i key={i} style={{ ["--h" as string]: `${28 + ((i * 37) % 62)}%` }} />
              ))}
            </div>
          </div>
        </article>
      );
    case "handoff":
      return <Handoff e={e} style={style} />;

    case "gate":
      return <Gate e={e} style={style} />;

    case "rework":
      return <Rework e={e} style={style} />;

    case "controlled":
      return <Controlled e={e} style={style} />;

    case "checkpoint":
      return <Checkpoint e={e} style={style} />;

    case "contract":
      return <Contract e={e} style={style} />;
  }
}

/* ===================== 任务契约（第二章第二节） ======================== */

function Contract({ e, style }: { e: Extract<AgentEvent, { kind: "contract" }>; style: object }) {
  const [open, setOpen] = useState(true);
  const rows: { label: string; items: string[]; glyph: IconName }[] = [
    { label: "改动范围", items: e.scope, glyph: "Layers" },
    { label: "完成判定", items: e.doneCriteria, glyph: "Check" },
    { label: "需人工放行", items: e.approvals, glyph: "Shield" },
    { label: "输入资料", items: e.materials, glyph: "Book" },
    { label: "可用工具", items: e.tools, glyph: "Plug" },
    { label: "交付物", items: e.deliverables, glyph: "Cube" },
  ];

  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="card card--contract" data-open={open}>
        <button className="ctr__head" onClick={() => setOpen((v) => !v)}>
          <span className="ctr__seal">
            <Icon.Nodes size={13} />
          </span>
          <span className="ctr__headText">
            <span className="ctr__kicker">任务契约 · 唯一入口与验收依据</span>
            <strong className="ctr__title">{e.title}</strong>
          </span>
          <span className="ctr__meta mono">{e.repo}</span>
          <span className="ctr__wf">{e.workflow}</span>
          <Icon.Chevron size={14} className={open ? "rot180" : undefined} />
        </button>

        <div className="ctr__body">
          <p className="ctr__problem">
            <span className="kicker">要解决的问题</span>
            {e.problem}
          </p>
          <div className="ctr__grid">
            {rows.map((r, i) => {
              const G = Icon[r.glyph];
              return (
                <section
                  className="ctrCell"
                  key={r.label}
                  style={{ ["--i" as string]: i }}
                >
                  <span className="ctrCell__label">
                    <G size={11} />
                    {r.label}
                    <b className="mono">{r.items.length}</b>
                  </span>
                  <ul className="ctrCell__list">
                    {r.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="ctr__foot">
            契约一经确认即作为后续每个节点的验收基线；范围之外的改动会被门禁拦截并要求补充契约。
          </p>
        </div>
      </div>
    </article>
  );
}

/* =================== 结构化任务交接（第二章第三节） ==================== */

function Handoff({ e, style }: { e: Extract<AgentEvent, { kind: "handoff" }>; style: object }) {
  const [open, setOpen] = useState(false);
  const From = Icon[roleGlyph[e.from]];
  const To = Icon[roleGlyph[e.to]];

  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="card card--handoff" data-open={open}>
        <button className="handoff__head" onClick={() => setOpen((v) => !v)}>
          <span className="handoff__pair">
            <i className="handoff__role" data-role={e.from}>
              <From size={12} />
              {roleLabel[e.from]}
            </i>
            <Icon.Arrow size={12} className="handoff__arrow" />
            <i className="handoff__role" data-role={e.to}>
              <To size={12} />
              {roleLabel[e.to]}
            </i>
          </span>
          <span className="handoff__title">{e.title}</span>
          <span className="handoff__badge mono">交接物</span>
          <Icon.Chevron size={12} className="handoff__chev" />
        </button>
        <div className="handoff__body">
          <div className="handoff__grid">
            <ContractCol label="交接范围" items={e.scope} tone="scope" />
            <ContractCol label="完成判定" items={e.done} tone="done" />
            {e.open?.length ? <ContractCol label="未决问题" items={e.open} tone="open" /> : null}
          </div>
          <div className="handoff__ev mono">
            <Icon.Shield size={11} />
            随交接传递证据
            {e.evidence.map((id) => (
              <span key={id} className="evRef">
                {id}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ContractCol({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "scope" | "done" | "open";
}) {
  return (
    <div className="cCol" data-tone={tone}>
      <span className="cCol__label kicker">{label}</span>
      <ul className="cCol__list">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/* ===================== AI 研发质量门禁（第六节） ====================== */

function Gate({ e, style }: { e: Extract<AgentEvent, { kind: "gate" }>; style: object }) {
  const [open, setOpen] = useState(e.verdict === "block");
  const failed = e.checks.filter((c) => c.state === "fail").length;
  const warned = e.checks.filter((c) => c.state === "warn").length;
  const passed = e.checks.length - failed - warned;

  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="card card--gate" data-verdict={e.verdict} data-open={open}>
        <button className="gate__head" onClick={() => setOpen((v) => !v)}>
          <span className="gate__seal" data-verdict={e.verdict}>
            {e.verdict === "pass" ? (
              <Icon.Check size={13} />
            ) : e.verdict === "block" ? (
              <Icon.X size={13} />
            ) : (
              <Icon.Dot size={13} />
            )}
          </span>
          <span className="gate__name">{e.gate}</span>
          <span className="gate__node mono">节点 {e.node}</span>
          <span className="gate__score mono">
            <b data-tone="ok">{passed}</b> 通过
            {warned > 0 && (
              <>
                {" · "}
                <b data-tone="warn">{warned}</b> 警示
              </>
            )}
            {failed > 0 && (
              <>
                {" · "}
                <b data-tone="fail">{failed}</b> 未过
              </>
            )}
          </span>
          <span className="gate__verdict" data-verdict={e.verdict}>
            {e.verdict === "pass" ? "放行" : e.verdict === "block" ? "拦截" : "豁免"}
          </span>
          <Icon.Chevron size={12} className="gate__chev" />
        </button>
        <div className="gate__body">
          <ul className="gate__dims">
            {e.checks.map((c, i) => (
              <li key={c.dim} data-state={c.state} style={{ ["--i" as string]: i }}>
                <span className="gate__dot" />
                <span className="gate__dim">{c.dim}</span>
                <span className="gate__note">{c.note}</span>
              </li>
            ))}
          </ul>
          <div className="gate__foot mono">
            <span>{e.reviewer}</span>
            <span className="gate__evs">
              {e.evidence.map((id) => (
                <span key={id} className="evRef">
                  {id}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ======================== 定向返工（第三节） ========================== */

function Rework({ e, style }: { e: Extract<AgentEvent, { kind: "rework" }>; style: object }) {
  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="card card--rework">
        <div className="rework__head">
          <span className="rework__badge">
            <Icon.Merge size={12} />
            定向返工
          </span>
          <span className="rework__route mono">
            {e.fromNode}
            <Icon.Arrow size={11} className="rot180" />
            {e.toNode}
          </span>
          <span className="rework__round mono">第 {e.round} 轮</span>
        </div>
        <p className="rework__reason">{e.reason}</p>
        <div className="rework__grid">
          <div className="rework__col" data-tone="redo">
            <span className="kicker">仅重做</span>
            <ul>
              {e.redo.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rework__col" data-tone="keep">
            <span className="kicker">保留成果</span>
            <ul>
              {e.keep.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="rework__hint">
          承接角色 <b>{roleLabel[e.role]}智能体</b> · 上下文与已通过结论随交接物一并传递，无需整体重来
        </p>
      </div>
    </article>
  );
}

/* ==================== 受控连接层调用（第五节） ======================== */

function Controlled({ e, style }: { e: Extract<AgentEvent, { kind: "controlled" }>; style: object }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="card card--ctrl" data-open={open}>
        <button className="ctrl__head" onClick={() => setOpen((v) => !v)}>
          <span className="ctrl__tier" data-tier={e.tier}>
            {permTierLabel[e.tier]}
          </span>
          <span className="ctrl__conn mono">{e.conn}</span>
          <span className="ctrl__action">{e.action}</span>
          <span className="ctrl__trace mono">{e.traceId}</span>
          <Icon.Chevron size={12} className="ctrl__chev" />
        </button>
        <div className="ctrl__body">
          <ol className="ctrl__steps">
            {e.steps.map((s, i) => (
              <li key={s.label} data-state={s.state} style={{ ["--i" as string]: i }}>
                <b className="mono">{i + 1}</b>
                {s.label}
              </li>
            ))}
          </ol>
          {e.approver && (
            <p className="ctrl__foot mono">
              <Icon.Shield size={11} />
              人工放行 {e.approver} · 调用参数、影响面与结果已全量归档，可按 {e.traceId} 回放
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/* ===================== 人工检查点（第一节人工检查层） ================= */

function Checkpoint({ e, style }: { e: Extract<AgentEvent, { kind: "checkpoint" }>; style: object }) {
  const [pick, setPick] = useState<string | null>(e.decided ?? null);
  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="card card--ckpt" data-done={pick ? "true" : undefined}>
        <div className="ckpt__head">
          <span className="ckpt__badge">
            <Icon.Sparkle size={12} />
            人工检查点
          </span>
          <span className="ckpt__node mono">节点 {e.node}</span>
          <span className="ckpt__hint">人只判定节点结论，不逐行读码</span>
        </div>
        <p className="ckpt__q">{e.question}</p>
        <ul className="ckpt__facts">
          {e.facts.map((f, i) => (
            <li key={f.label} data-tone={f.tone ?? "info"} style={{ ["--i" as string]: i }}>
              <span className="ckpt__fl kicker">{f.label}</span>
              <span className="ckpt__fv">{f.value}</span>
            </li>
          ))}
        </ul>
        <div className="ckpt__acts">
          {e.options.map((o) => (
            <button
              key={o}
              className="ckpt__opt"
              data-active={pick === o ? "true" : undefined}
              onClick={() => setPick(o)}
            >
              {pick === o && <Icon.Check size={11} />}
              {o}
            </button>
          ))}
        </div>
        {pick && (
          <p className="ckpt__done mono">
            已判定「{pick}」· {e.decidedBy ?? "me@agentflow.dev"} · 判定结论进入证据链
          </p>
        )}
      </div>
    </article>
  );
}

function Reasoning({ e, style }: { e: Extract<AgentEvent, { kind: "reasoning" }>; style: object }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="think" data-open={open}>
        <button className="think__head" onClick={() => setOpen((v) => !v)}>
          <Icon.Chevron size={12} className="think__chev" />
          <span className="think__title mono">{e.title}</span>
          <span className="think__ghost">推理过程</span>
        </button>
        <div className="think__body">
          <p>{e.body}</p>
        </div>
      </div>
    </article>
  );
}

function Tool({
  e,
  style,
  onCopy,
}: {
  e: Extract<AgentEvent, { kind: "tool" }>;
  style: object;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(Boolean(e.lines?.length) && e.tool === "shell");
  const Glyph = Icon[iconByKey[e.tool] ?? "Terminal"];
  const hasBody = Boolean(e.lines?.length);

  return (
    <article className="ev ev--card" style={style}>
      <div className="ev__gutter" />
      <div className="tool" data-open={open} data-status={e.status} data-kind={e.tool}>
        <button
          className="tool__head"
          onClick={() => hasBody && setOpen((v) => !v)}
          data-clickable={hasBody}
        >
          <span className="tool__glyph">
            <Glyph size={13} />
          </span>
          <span className="tool__label mono">{e.label}</span>
          <span className="tool__meta mono">{e.meta}</span>
          <span className="tool__status" data-status={e.status}>
            {e.status === "running" ? <i className="pulse" /> : <Icon.Check size={11} />}
          </span>
          {hasBody && <Icon.Chevron size={12} className="tool__chev" />}
        </button>
        {hasBody && (
          <div className="tool__body">
            <button
              className="tool__copy"
              onClick={(ev) => {
                ev.stopPropagation();
                navigator.clipboard?.writeText(e.lines!.join("\n")).catch(() => {});
                onCopy();
              }}
            >
              <Icon.Copy size={12} />
            </button>
            <pre className="mono">
              {e.lines!.map((l, i) => (
                <code key={i} data-kind={lineKind(l)}>
                  {l || " "}
                </code>
              ))}
            </pre>
          </div>
        )}
      </div>
    </article>
  );
}

function Thinking() {
  return (
    <div className="ev ev--agent ev--live">
      <div className="ev__gutter">
        <span className="avatar avatar--agent avatar--live">
          <Icon.Sparkle size={13} />
        </span>
      </div>
      <div className="live mono">
        <span className="live__shimmer">代理正在工作</span>
        <span className="live__dots">
          <i /> <i /> <i />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- helpers ---------------------------------- */

function md(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/`([^`]+)`/g, '<code class="inline mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function bars(add: number, del: number) {
  const total = add + del || 1;
  const n = 5;
  const a = Math.round((add / total) * n);
  return Array.from({ length: n }, (_, i) => (i < a ? "a" : "d"));
}

function lineKind(l: string) {
  if (l.startsWith("$")) return "cmd";
  if (l.trimStart().startsWith("✓") || l.includes("passed") || l.startsWith("✔")) return "ok";
  if (l.includes("FIXME") || l.includes("fail")) return "warn";
  if (/^\s*\S+:\d+/.test(l)) return "match";
  return "ctx";
}
