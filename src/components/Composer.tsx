import { useRef, useState } from "react";
import { Icon } from "./Icons";
import type { ApprovalMode } from "../App";

const quick = [
  "补齐这块逻辑的单元测试",
  "解释一下这段改动的取舍",
  "把它改成幂等实现",
];

export function Composer({
  streaming,
  model,
  approvalMode,
  onSend,
  onStop,
  onPalette,
}: {
  streaming: boolean;
  model: string;
  approvalMode: ApprovalMode;
  onSend: (v: string) => void;
  onStop: () => void;
  onPalette: () => void;
}) {
  const [value, setValue] = useState("");
  const [focus, setFocus] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const v = value.trim();
    if (!v || streaming) return;
    onSend(v);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  return (
    <div className="composerWrap">
      <div className="composer" data-focus={focus} data-streaming={streaming}>
        <div className="composer__edge" aria-hidden />

        <div className="composer__body">
          <textarea
            ref={ref}
            className="composer__input"
            value={value}
            rows={1}
            placeholder="描述你想让代理完成的事，或用 @ 引用文件、/ 触发命令…"
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onChange={(e) => {
              setValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />

          <div className="composer__actions">
            <button className="iconBtn iconBtn--sm" title="附加文件">
              <Icon.Paperclip size={15} />
            </button>
            <button className="iconBtn iconBtn--sm" title="命令面板" onClick={onPalette}>
              <Icon.Command size={15} />
            </button>
            {streaming ? (
              <button className="sendBtn sendBtn--stop" onClick={onStop} title="中断">
                <Icon.Stop size={13} />
              </button>
            ) : (
              <button
                className="sendBtn"
                onClick={submit}
                disabled={!value.trim()}
                title="发送 ⏎"
              >
                <Icon.Arrow size={15} />
              </button>
            )}
          </div>
        </div>

        <footer className="composer__foot">
          <div className="composer__chips">
            {quick.map((q) => (
              <button key={q} className="ghostChip" onClick={() => setValue(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="composer__status mono">
            <span>{model}</span>
            <span className="composer__sep">·</span>
            <span>
              {approvalMode === "auto"
                ? "自动执行"
                : approvalMode === "ask"
                  ? "逐条确认"
                  : "只读"}
            </span>
            <span className="composer__sep">·</span>
            <span>
              <span className="kbd">⏎</span> 发送 <span className="kbd">⇧⏎</span> 换行
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
