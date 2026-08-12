import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { WorkflowPicker } from "./Workflow";
import { workflowTemplates, type Workflow } from "../data/workflows";

const repos = [
  { name: "atlas-api", lang: "TypeScript", branch: "main", dot: "var(--azure)" },
  { name: "atlas-web", lang: "TypeScript", branch: "main", dot: "var(--gold)" },
  { name: "settle-core", lang: "Java", branch: "release", dot: "var(--sage)" },
  { name: "infra", lang: "HCL", branch: "prod", dot: "var(--plum)" },
];

type Step = "intent" | "workflow";

export function NewTaskDialog({
  onClose,
  onStart,
  onToast,
}: {
  onClose: () => void;
  onStart: (prompt: string, wf: Workflow) => void;
  onToast: (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;
}) {
  const [step, setStep] = useState<Step>("intent");
  const [prompt, setPrompt] = useState("");
  const [repo, setRepo] = useState(repos[0].name);
  const [wf, setWf] = useState<Workflow>(workflowTemplates[0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const submit = () => {
    const text = prompt.trim();
    if (!text) {
      setStep("intent");
      return onToast({ tone: "warn", title: "请先填写任务目标", body: "任务契约需要明确要解决的问题。" });
    }
    onStart(text, wf);
  };

  return (
    <div className="scrim scrim--wide" onClick={onClose}>
      <section
        className="sheet sheet--task"
        role="dialog"
        aria-label="新建任务"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet__head">
          <div className="sheet__headText">
            <span className="kicker">新建任务</span>
            <h2 className="serif">配置任务契约与工作流</h2>
          </div>
          <div className="taskSteps">
            <button className="taskStep" data-on={step === "intent"} onClick={() => setStep("intent")}>
              <span className="taskStep__n mono">1</span>
              任务目标
            </button>
            <span className="taskSteps__rule" />
            <button className="taskStep" data-on={step === "workflow"} onClick={() => setStep("workflow")}>
              <span className="taskStep__n mono">2</span>
              工作流编排
            </button>
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="关闭">
            <Icon.X size={16} />
          </button>
        </header>

        <div className="sheet__body" key={step}>
          {step === "intent" ? (
            <div className="stack">
              <div className="taskField">
                <span className="kicker">要解决的问题</span>
                <textarea
                  className="taskInput"
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例如：把 useDashboard 的数据获取抽成独立 hook，并保持 SSR 行为一致"
                  autoFocus
                />
              </div>

              <div className="taskField">
                <span className="kicker">目标仓库</span>
                <div className="repoGrid">
                  {repos.map((r, i) => (
                    <button
                      key={r.name}
                      className="repo repo--pick"
                      data-on={repo === r.name}
                      style={{ ["--i" as string]: i }}
                      onClick={() => setRepo(r.name)}
                    >
                      <i className="repo__dot" style={{ background: r.dot }} />
                      <span className="repo__name mono">agentflow/{r.name}</span>
                      <span className="repo__lang">{r.lang}</span>
                      <span className="repo__branch mono">
                        <Icon.Branch size={11} />
                        {r.branch}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="taskField">
                <span className="kicker">从模板起草</span>
                <div className="seedRow">
                  {[
                    "为 billing 退款分支补齐边界用例，覆盖率提到 90% 以上",
                    "CI 上 snapshot.spec.ts 偶发失败，定位根因并给出最小修复",
                    "排查 log4j 组件影响范围并在试点项目完成升级",
                  ].map((s) => (
                    <button key={s} className="seedChip" onClick={() => setPrompt(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <WorkflowPicker value={wf} onChange={setWf} onToast={onToast} />
          )}
        </div>

        <footer className="sheet__foot">
          <span className="sheet__footHint">
            将由 <strong>{wf.name}</strong> 编排 · {wf.nodes.length} 个节点 ·{" "}
            {wf.nodes.filter((n) => n.gate).length} 道门禁 ·{" "}
            {wf.nodes.filter((n) => n.approval).length} 个人工检查点
          </span>
          {step === "intent" ? (
            <button className="btn btn--accent btn--sm" onClick={() => setStep("workflow")}>
              下一步：工作流
              <Icon.Arrow size={13} className="rot90" />
            </button>
          ) : (
            <button className="btn btn--accent btn--sm" onClick={submit}>
              <Icon.Sparkle size={13} />
              按此编排启动
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
