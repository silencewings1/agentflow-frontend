import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import {
  diffs,
  fileTree,
  terminalLog,
  type FileNode,
  type Session,
} from "../data/mock";
import {
  evidenceChain,
  evidenceKindLabel,
  replaySteps,
  permTierLabel,
  type EvidenceKind,
} from "../data/settings";
import type { Toast } from "./Toasts";

export type InspectorTab = "files" | "diff" | "terminal" | "env" | "evidence" | "replay";

const tabs: { key: InspectorTab; label: string }[] = [
  { key: "files", label: "文件" },
  { key: "diff", label: "改动" },
  { key: "evidence", label: "证据链" },
  { key: "replay", label: "回放" },
  { key: "terminal", label: "终端" },
  { key: "env", label: "沙箱" },
];

export function Inspector({
  tab,
  onTab,
  activeFile,
  onFile,
  session,
  onClose,
  onToast,
}: {
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  activeFile: string;
  onFile: (p: string) => void;
  session: Session;
  onClose: () => void;
  onToast: (t: Omit<Toast, "id">) => void;
}) {
  const evReady = evidenceChain.filter((e) => e.confirmed).length;

  return (
    <aside className="inspector">
      <header className="inspector__head">
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className="tab"
              data-active={tab === t.key}
              onClick={() => onTab(t.key)}
            >
              {t.label}
              {t.key === "diff" && (
                <span className="tab__badge mono">{session.diff.files}</span>
              )}
              {t.key === "evidence" && (
                <span className="tab__badge mono">
                  {evReady}/{evidenceChain.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <button className="iconBtn iconBtn--sm" onClick={onClose} title="收起 ⌘\">
          <Icon.X size={14} />
        </button>
      </header>

      <div className="inspector__body">
        {tab === "files" && (
          <Tree nodes={fileTree} onFile={(p) => { onFile(p); onTab("diff"); }} />
        )}
        {tab === "diff" && (
          <DiffView path={activeFile} onFile={onFile} onToast={onToast} />
        )}
        {tab === "evidence" && <EvidencePane onToast={onToast} />}
        {tab === "replay" && <ReplayPane onToast={onToast} />}
        {tab === "terminal" && <Terminal />}
        {tab === "env" && <Env session={session} />}
      </div>
    </aside>
  );
}

/* ============================== 证据链 ==================================== */
/* 每条结论都能回溯到出处、版本与责任人 —— 交接物之所以可信的依据 */

const evGlyph: Record<EvidenceKind, "Pencil" | "Plug" | "Beaker" | "Shield" | "Book" | "Check"> = {
  change: "Pencil",
  toolcall: "Plug",
  test: "Beaker",
  scan: "Shield",
  review: "Book",
  approval: "Check",
};

function EvidencePane({ onToast }: { onToast: (t: Omit<Toast, "id">) => void }) {
  const [only, setOnly] = useState(false);
  const list = useMemo(
    () => (only ? evidenceChain.filter((e) => !e.confirmed) : evidenceChain),
    [only],
  );
  const ready = evidenceChain.filter((e) => e.confirmed).length;
  const blocking = evidenceChain.filter((e) => !e.confirmed && e.required).length;
  const pct = Math.round((ready / evidenceChain.length) * 100);

  return (
    <div className="pane">
      <div className="paneHead">
        <div className="paneHead__text">
          <span className="kicker">证据链</span>
          <h3 className="serif">每条结论都可回溯到出处</h3>
        </div>
      </div>

      <div className="evSum">
        <div className="evSum__meter">
          <span className="evSum__bar">
            <i style={{ width: `${pct}%` }} />
          </span>
          <span className="evSum__pct mono">{pct}%</span>
        </div>
        <p className="evSum__note">
          {ready}/{evidenceChain.length} 项已核实
          {blocking > 0 && (
            <>
              ·<b>{blocking} 项必需证据未闭环</b>，交付门禁保持阻断
            </>
          )}
        </p>
        <button className="chipBtn" data-on={only} onClick={() => setOnly((v) => !v)}>
          <Icon.Sliders size={11} />
          {only ? "显示全部" : "仅看未闭环"}
        </button>
      </div>

      <ol className="evChain">
        {list.map((e, i) => {
          const G = Icon[evGlyph[e.kind]];
          return (
            <li
              className="evChain__item"
              key={e.id}
              data-ok={e.confirmed}
              style={{ ["--i" as string]: i }}
            >
              <span className="evChain__node">
                <G size={11} />
              </span>
              <div className="evChain__main">
                <header className="evChain__top">
                  <span className="evChain__kind">{evidenceKindLabel[e.kind]}</span>
                  {e.required && <i className="evChain__req">必需</i>}
                  <span className="evChain__at mono">{e.at}</span>
                </header>
                <strong className="evChain__title">{e.title}</strong>
                <div className="evChain__meta">
                  <span className="mono" title="出处">{e.source}</span>
                  <span className="evChain__ver mono" title="版本">{e.version}</span>
                  <span title="责任人">{e.actor}</span>
                </div>
              </div>
              <button
                className="evChain__state"
                data-ok={e.confirmed}
                onClick={() =>
                  onToast(
                    e.confirmed
                      ? { tone: "ok", title: `${e.id} 已核实`, body: `${e.source} · ${e.version}` }
                      : { tone: "warn", title: `${e.id} 尚未闭环`, body: "需补齐后才能进入交付门禁。" },
                  )
                }
              >
                {e.confirmed ? <Icon.Check size={11} /> : <Icon.Dot size={11} />}
                {e.confirmed ? "已核实" : "待闭环"}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="paneFoot">
        证据链随交接物在节点之间传递：下游无需重新提问即可拿到上游的事实、版本与责任人，
        返工时也只替换失效的那几条证据。
      </p>
    </div>
  );
}

/* ============================== 任务回放 ================================== */
/* 把整条执行链路还原为可审计的时间线：谁、在什么权限下、做了什么、结果如何 */

const resultLabel: Record<string, string> = {
  ok: "通过",
  fail: "失败",
  denied: "已拒绝",
  wait: "等待",
};

function ReplayPane({ onToast }: { onToast: (t: Omit<Toast, "id">) => void }) {
  const [cursor, setCursor] = useState(replaySteps.length - 1);
  const cur = replaySteps[cursor];
  const abnormal = replaySteps.filter((s) => s.result !== "ok").length;

  return (
    <div className="pane">
      <div className="paneHead">
        <div className="paneHead__text">
          <span className="kicker">任务回放</span>
          <h3 className="serif">完整链路可逐步复盘</h3>
        </div>
        <button
          className="chipBtn"
          onClick={() =>
            onToast({
              tone: "info",
              title: "回放已导出",
              body: `${replaySteps.length} 个步骤 · ${abnormal} 处异常，可作为审计材料归档。`,
            })
          }
        >
          <Icon.Copy size={11} />
          导出审计
        </button>
      </div>

      <div className="rpScrub">
        <input
          type="range"
          min={0}
          max={replaySteps.length - 1}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          aria-label="回放进度"
        />
        <span className="rpScrub__pos mono">
          {cursor + 1}/{replaySteps.length}
        </span>
      </div>

      <ol className="rpLine">
        {replaySteps.map((s, i) => (
          <li
            className="rpLine__item"
            key={s.id}
            data-result={s.result}
            data-past={i <= cursor}
            data-cur={i === cursor}
            style={{ ["--i" as string]: i }}
            onClick={() => setCursor(i)}
          >
            <span className="rpLine__at mono">{s.at}</span>
            <span className="rpLine__dot" />
            <div className="rpLine__main">
              <header className="rpLine__top">
                <strong>{s.stage}</strong>
                <span className="rpLine__actor">{s.actor}</span>
                {s.tier !== "—" && (
                  <span className="rpLine__tier" data-tier={s.tier}>
                    {permTierLabel[s.tier]}
                  </span>
                )}
                <span className="rpLine__res" data-result={s.result}>
                  {resultLabel[s.result]}
                </span>
              </header>
              <p className="rpLine__act">{s.action}</p>
              <span className="rpLine__mat mono">{s.materials}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="rpNow">
        <span className="kicker">当前定位</span>
        <p>
          <strong>{cur.stage}</strong> · {cur.actor} · {cur.action}
          <span className="mono"> （{cur.materials}）</span>
        </p>
        <p className="rpNow__hint">
          回放不依赖人的记忆：任何一次结论都能定位到具体步骤、权限层级与输入材料，
          问题定位从「反复追问」变成「按步查证」。
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- tree ----------------------------------- */

function Tree({
  nodes,
  onFile,
  prefix = "",
  depth = 0,
}: {
  nodes: FileNode[];
  onFile: (p: string) => void;
  prefix?: string;
  depth?: number;
}) {
  return (
    <ul className="tree" data-depth={depth}>
      {nodes.map((n) => (
        <TreeNode key={n.name} node={n} onFile={onFile} prefix={prefix} depth={depth} />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  onFile,
  prefix,
  depth,
}: {
  node: FileNode;
  onFile: (p: string) => void;
  prefix: string;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const path = prefix ? `${prefix}/${node.name}` : node.name;

  if (node.kind === "dir") {
    return (
      <li className="tree__li">
        <button className="node node--dir" onClick={() => setOpen((v) => !v)}>
          <Icon.Chevron size={11} className="node__chev" data-open={open} />
          <Icon.Folder size={13} className="node__icon" />
          <span className="node__name mono">{node.name}</span>
        </button>
        {open && (
          <div className="tree__nest">
            <Tree nodes={node.children ?? []} onFile={onFile} prefix={path} depth={depth + 1} />
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="tree__li">
      <button className="node node--file" onClick={() => onFile(path)} data-status={node.status}>
        <span className="node__spacer" />
        <Icon.File size={13} className="node__icon" />
        <span className="node__name mono">{node.name}</span>
        {node.status && (
          <span className="node__flag mono" data-status={node.status}>
            {node.status === "added" ? "A" : node.status === "removed" ? "D" : "M"}
          </span>
        )}
      </button>
    </li>
  );
}

/* -------------------------------- diff view -------------------------------- */

function DiffView({
  path,
  onFile,
  onToast,
}: {
  path: string;
  onFile: (p: string) => void;
  onToast: (t: Omit<Toast, "id">) => void;
}) {
  const paths = Object.keys(diffs);
  const lines = diffs[path] ?? [];
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "del").length;

  return (
    <div className="diffView">
      <div className="diffView__switch">
        {paths.map((p) => (
          <button
            key={p}
            className="switchChip mono"
            data-active={p === path}
            onClick={() => onFile(p)}
            title={p}
          >
            {p.split("/").pop()}
          </button>
        ))}
      </div>

      <header className="diffView__head">
        <span className="diffView__path mono">{path}</span>
        <span className="delta mono">
          <b>+{added}</b>
          <i>−{removed}</i>
        </span>
        <button
          className="iconBtn iconBtn--sm"
          onClick={() => {
            navigator.clipboard
              ?.writeText(lines.map((l) => l.text).join("\n"))
              .catch(() => {});
            onToast({ tone: "ok", title: "已复制补丁", body: path });
          }}
        >
          <Icon.Copy size={13} />
        </button>
      </header>

      <div className="diff">
        {lines.map((l, i) => (
          <div key={i} className="diff__line" data-type={l.type}>
            <span className="diff__n mono">{l.type === "hunk" ? "" : l.n}</span>
            <span className="diff__sign mono">
              {l.type === "add" ? "+" : l.type === "del" ? "−" : ""}
            </span>
            <code className="mono">{l.text || " "}</code>
          </div>
        ))}
      </div>

      <footer className="diffView__foot">
        <button className="btn btn--outline btn--sm btn--block">
          <Icon.Check size={13} />
          接受该文件改动
        </button>
      </footer>
    </div>
  );
}

/* -------------------------------- terminal --------------------------------- */

function Terminal() {
  const [log, setLog] = useState(terminalLog);
  const [cmd, setCmd] = useState("");

  const run = () => {
    const c = cmd.trim();
    if (!c) return;
    setLog((prev) => [
      ...prev,
      `$ ${c}`,
      c.startsWith("git")
        ? "已同步 · 工作区干净"
        : c.includes("test") || c.includes("mvn")
          ? " Tests  23 passed (23)"
          : `agentflow: 演示沙箱不执行真实命令 (${c.split(" ")[0]})`,
      "",
    ]);
    setCmd("");
  };

  return (
    <div className="term">
      <div className="term__log mono">
        {log.map((l, i) => (
          <div key={i} data-kind={l.startsWith("$") ? "cmd" : l.includes("✓") || l.includes("✔") || l.includes("passed") ? "ok" : l.startsWith(" M") || l.startsWith("??") ? "vcs" : "ctx"}>
            {l || " "}
          </div>
        ))}
      </div>
      <div className="term__input mono">
        <span className="term__sigil">❯</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="在沙箱中执行…"
          aria-label="沙箱命令"
        />
      </div>
    </div>
  );
}

/* ---------------------------------- env ------------------------------------ */

function Env({ session }: { session: Session }) {
  const rows = [
    ["容器", "agentflow-sandbox:node20-bookworm"],
    ["工作区", `~/workspace/${session.repo.split("/")[1]}`],
    ["分支", session.branch],
    ["包管理", "pnpm 9.7.0"],
    ["网络", "受限 · 仅白名单域名"],
    ["磁盘", "8.2 GB / 20 GB"],
    ["运行时长", "14 分 22 秒"],
  ];

  return (
    <div className="env">
      <div className="env__card">
        <span className="kicker">沙箱状态</span>
        <div className="env__state">
          <i className="pulse pulse--lg" />
          <span className="serif">运行中</span>
        </div>
        <dl className="env__rows mono">
          {rows.map(([k, v]) => (
            <div key={k} className="env__row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="env__card">
        <span className="kicker">仓库约定 · AGENTS.md</span>
        <ul className="env__rules">
          <li>所有新增文件需带许可头</li>
          <li>改动必须附带对应测试</li>
          <li>提交前跑 <code className="inline mono">pnpm typecheck</code></li>
          <li>禁止直接改动 <code className="inline mono">dist/</code></li>
        </ul>
      </div>

      <div className="env__card env__card--meter">
        <span className="kicker">上下文占用</span>
        <div className="meter">
          <div className="meter__fill" style={{ width: "41%" }} />
        </div>
        <span className="mono env__meterHint">82k / 200k tokens · 41%</span>
      </div>
    </div>
  );
}
