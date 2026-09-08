import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import type { Session, SessionState } from "../data/mock";

const stateLabel: Record<SessionState, string> = {
  running: "进行中",
  review: "待审阅",
  done: "已完成",
  failed: "失败",
  idle: "空闲",
  draft: "待配置",
};

/* 终态判定：只有终态任务才能归档/恢复；非终态任务是「运行中」，
   它的动作是取消运行。二者语义不同，不能共用一个按钮。 */
const TERMINAL_STATES: SessionState[] = ["done", "failed", "idle"];

export function Sidebar({
  sessions,
  activeId,
  showArchived,
  onToggleShowArchived,
  onSelect,
  onCancel,
  onArchive,
  onUnarchive,
  onNew,
}: {
  sessions: Session[];
  activeId: string;
  showArchived: boolean;
  onToggleShowArchived: (next: boolean) => void;
  onSelect: (s: Session) => void;
  onCancel: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
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

  /* 每个会话只暴露一个与状态匹配的动作：非终态=取消运行，
     终态未归档=归档，终态已归档=恢复。确认前不产生任何副作用。 */
  const runAction = (s: Session) => {
    if (s.archived) {
      if (!window.confirm("恢复后该任务会重新出现在默认列表中，确定恢复？")) return;
      onUnarchive(s.id);
      return;
    }
    if (!TERMINAL_STATES.includes(s.state)) {
      if (!window.confirm("取消后该运行将终止且不可恢复，确定取消？")) return;
      onCancel(s.id);
      return;
    }
    if (!window.confirm("归档后该任务将从默认列表隐藏；任务事实、审计与证据仍可查询，确定归档？")) return;
    onArchive(s.id);
  };

  const actionLabel = (s: Session) =>
    s.archived ? "恢复" : TERMINAL_STATES.includes(s.state) ? "归档" : "取消运行";
  const actionKind = (s: Session) =>
    s.archived ? "restore" : TERMINAL_STATES.includes(s.state) ? "archive" : "cancel";

  return (
    <aside className="sidebar">
      <header className="sidebar__head">
        <div className="sidebar__brandRow">
          <h1 className="sidebar__brand serif">AgentFlow</h1>
          <span className="sidebar__ver mono">1.0.1</span>
          <label className="sessToggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => onToggleShowArchived(e.target.checked)}
            />
            显示已归档
          </label>
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
                <li key={s.id} className="sessItem" data-archived={s.archived === true}>
                  <button
                    className="sess"
                    data-active={s.id === activeId}
                    data-state={s.state}
                    data-archived={s.archived === true}
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
                      {s.archived && <span className="pill pill--archived">已归档</span>}
                      {s.diff
                        ? <span className="delta mono"><b>+{s.diff.added}</b><i>−{s.diff.removed}</i></span>
                        : <span className="delta mono">diff —</span>}
                    </span>
                  </button>
                  <button
                    className="sess__act"
                    data-action={actionKind(s)}
                    aria-label={actionLabel(s)}
                    title={actionLabel(s)}
                    onClick={(e) => {
                      e.stopPropagation();
                      runAction(s);
                    }}
                  >
                    {actionKind(s) === "cancel"
                      ? <Icon.Stop size={12} />
                      : actionKind(s) === "archive"
                        ? <Icon.Trash size={12} />
                        : <Icon.Arrow size={12} />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && (
          <p className="sidebar__empty mono">
            {q ? `没有匹配 “${q}” 的会话` : "暂无会话"}
          </p>
        )}
      </nav>
    </aside>
  );
}
