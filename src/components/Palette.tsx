import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, iconByKey } from "./Icons";
import { paletteGroups } from "../data/mock";

export function Palette({
  onClose,
  onRun,
}: {
  onClose: () => void;
  onRun: (label: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const groups = useMemo(() => {
    if (!q.trim()) return paletteGroups;
    const k = q.toLowerCase();
    return paletteGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.label.toLowerCase().includes(k) || i.hint.toLowerCase().includes(k),
        ),
      }))
      .filter((g) => g.items.length);
  }, [q]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % Math.max(flat.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + flat.length) % Math.max(flat.length, 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flat[cursor]) onRun(flat[cursor].label);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, flat, onRun]);

  let idx = -1;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="palette__head">
          <Icon.Search size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入命令或搜索…"
            aria-label="命令面板"
          />
          <span className="kbd">esc</span>
        </header>

        <div className="palette__body">
          {groups.map((g) => (
            <section key={g.group} className="palette__group">
              <h3 className="kicker">{g.group}</h3>
              <ul>
                {g.items.map((it) => {
                  idx += 1;
                  const mine = idx;
                  const Glyph = Icon[iconByKey[it.icon] ?? "Sparkle"];
                  return (
                    <li key={it.label}>
                      <button
                        className="pItem"
                        data-active={cursor === mine}
                        onMouseEnter={() => setCursor(mine)}
                        onClick={() => onRun(it.label)}
                      >
                        <span className="pItem__glyph">
                          <Glyph size={14} />
                        </span>
                        <span className="pItem__label">{it.label}</span>
                        <span className="pItem__hint mono">{it.hint}</span>
                        {it.keys && (
                          <span className="pItem__keys">
                            {it.keys.map((k) => (
                              <span key={k} className="kbd">
                                {k}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!groups.length && <p className="palette__empty mono">无匹配命令</p>}
        </div>

        <footer className="palette__foot mono">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> 移动
          </span>
          <span>
            <span className="kbd">⏎</span> 执行
          </span>
          <span className="palette__brand serif">AgentFlow</span>
        </footer>
      </div>
    </div>
  );
}
