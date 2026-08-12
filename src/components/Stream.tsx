import { useEffect, useRef, useState } from "react";
import { Icon, iconByKey } from "./Icons";
import type { AgentEvent } from "../data/mock";

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
  }
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
