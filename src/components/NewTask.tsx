import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons";
import { WorkflowPicker } from "./Workflow";
import { workflowTemplates, type Workflow } from "../data/workflows";
import { taskContract } from "../data/settings";
import type { AgentEvent } from "../data/mock";

const repos = [
  { name: "atlas-api", lang: "TypeScript", branch: "main", dot: "var(--azure)" },
  { name: "atlas-web", lang: "TypeScript", branch: "main", dot: "var(--gold)" },
  { name: "settle-core", lang: "Java", branch: "release", dot: "var(--sage)" },
  { name: "infra", lang: "HCL", branch: "prod", dot: "var(--plum)" },
];

type Step = "intent" | "contract" | "workflow";

const steps: { key: Step; label: string }[] = [
  { key: "intent", label: "任务目标" },
  { key: "contract", label: "任务契约" },
  { key: "workflow", label: "工作流编排" },
];

/** 契约七要素中的清单类字段 —— 可增删，进入运行后作为验收基线 */
type ListField = "scope" | "doneCriteria" | "approvals" | "materials" | "tools" | "deliverables";

const fieldMeta: {
  key: ListField;
  label: string;
  hint: string;
  glyph: "Layers" | "Check" | "Shield" | "Book" | "Plug" | "Cube";
}[] = [
  { key: "scope", label: "改动范围", hint: "越界改动会被门禁拦截", glyph: "Layers" },
  { key: "doneCriteria", label: "完成判定", hint: "门禁按此逐条核验", glyph: "Check" },
  { key: "approvals", label: "需人工放行", hint: "人工检查层的落点", glyph: "Shield" },
  { key: "materials", label: "输入资料", hint: "证据链的原始出处", glyph: "Book" },
  { key: "tools", label: "可用工具", hint: "受控连接层按此授权", glyph: "Plug" },
  { key: "deliverables", label: "交付物", hint: "结构化材料而非零散回答", glyph: "Cube" },
];

export function NewTaskDialog({
  onClose,
  onStart,
  onToast,
}: {
  onClose: () => void;
  onStart: (prompt: string, wf: Workflow, contract: AgentEvent) => void;
  onToast: (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;
}) {
  const [step, setStep] = useState<Step>("intent");
  const [prompt, setPrompt] = useState("");
  const [repo, setRepo] = useState(repos[0].name);
  const [wf, setWf] = useState<Workflow>(workflowTemplates[0]);

  /* 契约清单：默认取自体系内置模板，允许逐条裁剪 */
  const [lists, setLists] = useState<Record<ListField, string[]>>({
    scope: taskContract.scope,
    doneCriteria: taskContract.doneCriteria,
    approvals: taskContract.approvals,
    materials: taskContract.materials,
    tools: taskContract.tools,
    deliverables: taskContract.deliverables,
  });
  const [draft, setDraft] = useState<Record<string, string>>({});

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

  const total = useMemo(
    () => fieldMeta.reduce((n, f) => n + lists[f.key].length, 0),
    [lists],
  );
  const ready = prompt.trim().length > 0 && lists.scope.length > 0 && lists.doneCriteria.length > 0;

  const add = (k: ListField) => {
    const v = (draft[k] ?? "").trim();
    if (!v) return;
    setLists((p) => ({ ...p, [k]: [...p[k], v] }));
    setDraft((p) => ({ ...p, [k]: "" }));
  };
  const drop = (k: ListField, i: number) =>
    setLists((p) => ({ ...p, [k]: p[k].filter((_, x) => x !== i) }));

  const submit = () => {
    const text = prompt.trim();
    if (!text) {
      setStep("intent");
      return onToast({ tone: "warn", title: "请先填写任务目标", body: "任务契约需要明确要解决的问题。" });
    }
    if (!lists.scope.length || !lists.doneCriteria.length) {
      setStep("contract");
      return onToast({
        tone: "warn",
        title: "契约不完整",
        body: "改动范围与完成判定不可为空，否则门禁无法核验。",
      });
    }
    const contract: AgentEvent = {
      id: `ctr-${Date.now()}`,
      kind: "contract",
      title: text.length > 22 ? `${text.slice(0, 22)}…` : text,
      problem: text,
      repo: `agentflow/${repo} · ${repos.find((r) => r.name === repo)?.branch}`,
      workflow: wf.name,
      scope: lists.scope,
      doneCriteria: lists.doneCriteria,
      approvals: lists.approvals,
      materials: lists.materials,
      tools: lists.tools,
      deliverables: lists.deliverables,
    };
    onStart(text, wf, contract);
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
            {steps.map((s, i) => (
              <span className="taskSteps__seg" key={s.key}>
                {i > 0 && <span className="taskSteps__rule" />}
                <button className="taskStep" data-on={step === s.key} onClick={() => setStep(s.key)}>
                  <span className="taskStep__n mono">{i + 1}</span>
                  {s.label}
                </button>
              </span>
            ))}
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="关闭">
            <Icon.X size={16} />
          </button>
        </header>

        <div className="sheet__body" key={step}>
          {step === "intent" && (
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
          )}

          {step === "contract" && (
            <div className="stack">
              <p className="ctrNote">
                <Icon.Nodes size={13} />
                任务契约是本次任务的<strong>唯一入口</strong>：它同时充当执行边界与验收依据。
                下游每个节点只按契约判定通过与否，人工也只在契约声明的放行点介入。
              </p>

              <div className="ctrEdit">
                {fieldMeta.map((f, i) => {
                  const G = Icon[f.glyph];
                  const req = f.key === "scope" || f.key === "doneCriteria";
                  return (
                    <section
                      className="ctrEdit__cell"
                      key={f.key}
                      style={{ ["--i" as string]: i }}
                      data-empty={lists[f.key].length === 0}
                    >
                      <header className="ctrEdit__head">
                        <G size={12} />
                        <strong>{f.label}</strong>
                        {req && <i className="ctrEdit__req">必填</i>}
                        <span className="ctrEdit__hint">{f.hint}</span>
                      </header>
                      <ul className="ctrEdit__list">
                        {lists[f.key].map((it, x) => (
                          <li key={`${it}-${x}`}>
                            <span>{it}</span>
                            <button
                              className="ctrEdit__x"
                              onClick={() => drop(f.key, x)}
                              aria-label="移除"
                            >
                              <Icon.X size={11} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="ctrEdit__add">
                        <input
                          value={draft[f.key] ?? ""}
                          onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              add(f.key);
                            }
                          }}
                          placeholder={`补充${f.label}…`}
                        />
                        <button className="ctrEdit__plus" onClick={() => add(f.key)} aria-label="添加">
                          <Icon.Plus size={12} />
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {step === "workflow" && <WorkflowPicker value={wf} onChange={setWf} onToast={onToast} />}
        </div>

        <footer className="sheet__foot">
          <span className="sheet__footHint">
            契约 <strong>{total}</strong> 条约定 · 将由 <strong>{wf.name}</strong> 编排 ·{" "}
            {wf.nodes.length} 个节点 · {wf.nodes.filter((n) => n.gate).length} 道门禁 ·{" "}
            {wf.nodes.filter((n) => n.approval).length} 个人工检查点
          </span>
          {step === "intent" && (
            <button className="btn btn--accent btn--sm" onClick={() => setStep("contract")}>
              下一步：任务契约
              <Icon.Arrow size={13} className="rot90" />
            </button>
          )}
          {step === "contract" && (
            <button className="btn btn--accent btn--sm" onClick={() => setStep("workflow")}>
              下一步：工作流
              <Icon.Arrow size={13} className="rot90" />
            </button>
          )}
          {step === "workflow" && (
            <button className="btn btn--accent btn--sm" onClick={submit} data-ready={ready}>
              <Icon.Sparkle size={13} />
              按契约与编排启动
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
