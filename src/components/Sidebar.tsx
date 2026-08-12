import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import type { Session, SessionState } from "../data/mock";

const stateLabel: Record<SessionState, string> = {
  running: "进行中",
  review: "待审阅",
  done: "已完成",
  failed: "失败",
  idle: "空闲",
};

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: {
  sessions: Session[];
  activeId: string;
  onSelect: (s: Session) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const filtered = sessions.filter(
      (s) =>
        !q.trim() ||
        s.title.toLowerCase().includes(q.toLowerCase()) ||
        s.repo.toLowerCase().includes(q.toLowerCase()) ||
        s.branch.toLowerCase().includes(q.toLowerCase()),
    );
    const order: Session["bucket"][] = ["今天", "昨天", "更早"];
    return order
      .map((b) => ({ bucket: b, items: filtered.filter((s) => s.bucket === b) }))
      .filter((g) => g.items.length);
  }, [q, sessions]);

  return (
    <aside className="sidebar">
      <header className="sidebar__head">
        <div className="sidebar__brandRow">
          <h1 className="sidebar__brand serif">AgentFlow</h1>
          <span className="sidebar__ver mono">1.0.1</span>
        </div>
      </header>

      <div className="sidebar__tools">
        <label className="search">
          <Icon.Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索会话…"
            aria-label="搜索会话"
          />
          <span className="kbd">/</span>
        </label>
        <button className="btn btn--accent btn--block" onClick={onNew}>
          <Icon.Plus size={14} />
          新任务
          <span className="btn__keys">
            <span className="kbd">⌘</span>
            <span className="kbd">N</span>
          </span>
        </button>
      </div>

      <nav className="sidebar__list">
        {groups.map((g, gi) => (
          <section key={g.bucket} className="grp" style={{ ["--gi" as string]: gi }}>
            <h2 className="grp__label kicker">{g.bucket}</h2>
            <ul>
              {g.items.map((s, i) => (
                <li key={s.id} className="sessItem">
                  <button
                    className="sess"
                    data-active={s.id === activeId}
                    data-state={s.state}
                    style={{ ["--i" as string]: i }}
                    onClick={() => onSelect(s)}
                  >
                    <span className="sess__bar" aria-hidden />
                    <span className="sess__top">
                      <span className="sess__title">{s.title}</span>
                    </span>
                    <span className="sess__meta mono">
                      <span className="sess__branch">
                        <Icon.Branch size={11} />
                        {s.branch}
                      </span>
                      <span className="sess__dot">·</span>
                      <span className="sess__time">{s.time}</span>
                    </span>
                    <span className="sess__foot">
                      <span className="pill" data-state={s.state}>
                        {s.state === "running" && <i className="pulse" />}
                        {stateLabel[s.state]}
                      </span>
                      <span className="delta mono">
                        <b>+{s.diff.added}</b>
                        <i>−{s.diff.removed}</i>
                      </span>
                    </span>
                  </button>
                  <button
                    className="sess__del"
                    aria-label="删除会话"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                  >
                    <Icon.Trash size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && (
          <p className="sidebar__empty mono">没有匹配 “{q}” 的会话</p>
        )}
      </nav>
    </aside>
  );
}
