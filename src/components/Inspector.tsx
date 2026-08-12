import { useState } from "react";
import { Icon } from "./Icons";
import {
  diffs,
  fileTree,
  terminalLog,
  type FileNode,
  type Session,
} from "../data/mock";
import type { Toast } from "./Toasts";

export type InspectorTab = "files" | "diff" | "terminal" | "env";

const tabs: { key: InspectorTab; label: string }[] = [
  { key: "files", label: "文件" },
  { key: "diff", label: "改动" },
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
        {tab === "terminal" && <Terminal />}
        {tab === "env" && <Env session={session} />}
      </div>
    </aside>
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
        : c.includes("test") || c.includes("vitest")
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
