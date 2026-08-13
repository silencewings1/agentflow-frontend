import { useRef, useState } from "react";
import { Icon } from "./Icons";
import type { ApprovalMode } from "../App";

const quick = [
  "补齐这块逻辑的单元测试",
  "解释一下这段改动的取舍",
  "把它改成幂等实现",
];

const approvalCopy: Record<ApprovalMode, { label: string; hint: string }> = {
  auto: { label: "自动执行", hint: "自动执行：低风险命令直接运行，高风险仍需放行" },
  ask: { label: "逐条确认", hint: "逐条确认：每条命令执行前请求你批准" },
  readonly: { label: "只读", hint: "只读：只做分析，不产生任何写入" },
};

export function Composer({
  streaming,
  model,
  approvalMode,
  onSend,
  onStop,
  onPalette,
  onCycleModel,
  onCycleApproval,
  planPending,
}: {
  streaming: boolean;
  model: string;
  approvalMode: ApprovalMode;
  onSend: (v: string) => void;
  onStop: () => void;
  onPalette: () => void;
  onCycleModel: () => void;
  onCycleApproval: () => void;
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
            {/* 模型与审批模式在此处直接切换：决策点紧邻输入，不必回到顶栏 */}
            <button className="composer__toggle" onClick={onCycleModel} title="切换模型">
              <Icon.Sparkle size={11} />
              <span>{model}</span>
            </button>
            <span className="composer__sep">·</span>
            <button
              className="composer__toggle"
              onClick={onCycleApproval}
              data-mode={approvalMode}
              title={approvalCopy[approvalMode].hint}
            >
              <Icon.Shield size={11} />
              <span>{approvalCopy[approvalMode].label}</span>
            </button>
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
