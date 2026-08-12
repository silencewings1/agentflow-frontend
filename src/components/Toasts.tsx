import { Icon } from "./Icons";

export type Toast = {
  id: string;
  tone: "ok" | "warn" | "info";
  title: string;
  body: string;
};

export function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone}>
          <span className="toast__glyph">
            {t.tone === "warn" ? <Icon.X size={12} /> : <Icon.Check size={12} />}
          </span>
          <div className="toast__text">
            <strong>{t.title}</strong>
            <span>{t.body}</span>
          </div>
          <i className="toast__bar" />
        </div>
      ))}
    </div>
  );
}
