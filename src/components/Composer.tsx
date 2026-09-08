import { useRef, useState } from "react";
import { Icon } from "./Icons";
import type { ModelProvidersDto } from "../api";

const quick = [
  "补齐这块逻辑的单元测试",
  "解释一下这段改动的取舍",
  "把它改成幂等实现",
];

export function Composer({
  streaming,
  modelProviders,
  onSend,
  onStop,
  onPalette,
  planPending,
}: {
  streaming: boolean;
  /** 服务端登记的模型供应商与默认路由；未加载完成时为 null。 */
  modelProviders: ModelProvidersDto | null;
  onSend: (v: string) => void;
  onStop: () => void;
  onPalette: () => void;
  /** 规划待确认：此时输入的是修改意见，不是普通对话 */
  planPending?: boolean;
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

  /* 模型路由由服务端按任务决定，前端只如实展示当前默认值。
     拿不到注册表时明确说明，而不是显示一个本地硬编码的模型名。 */
  const route = modelProviders?.defaultModel ?? null;
  const routeLabel = route ? `${route.provider} / ${route.model}` : null;

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
            placeholder={
              planPending
                ? "对规划方案提出修改意见，主控会重新规划…"
                : "描述你想让代理完成的事，或用 @ 引用文件、/ 触发命令…"
            }
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
            {/* 模型路由是服务端配置，不由会话选择；此处只展示生效值，
                不做成可点下拉——可点却改不动执行模型属于误导。 */}
            <span className="composer__route" data-known={routeLabel !== null}>
              <Icon.Sparkle size={11} />
              <span>{routeLabel ?? "模型路由未登记"}</span>
              <i className="composer__routeHint">服务端按任务决定</i>
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
