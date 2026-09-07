import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons";
import { WorkflowPicker } from "./Workflow";
import { validateWorkflowGraph, workflowTemplates, type Workflow } from "../data/workflows";
import { taskContract } from "../data/settings";
import type { AgentEvent } from "../data/mock";
import type { AgentProfileSummaryDto, ScmProviderDto, SkillSummaryDto, WorkflowValidation } from "../api";

export interface NewTaskScmDraft {
  provider?: "github" | "gitlab";
  mcpServerRef?: string;
  repositoryRef: string;
  baseBranch: string;
  targetBranch: string;
  credentialRef?: string;
}

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
  workflows = workflowTemplates,
  profiles = [],
  skills = [],
  scmProviders,
  onValidateWorkflow,
}: {
  onClose: () => void;
  onStart: (prompt: string, wf: Workflow, contract: AgentEvent, scm: NewTaskScmDraft) => Promise<void>;
  onToast: (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;
  workflows?: Workflow[];
  profiles?: AgentProfileSummaryDto[];
  skills?: SkillSummaryDto[];
  scmProviders: ScmProviderDto[];
  onValidateWorkflow: (workflow: Workflow) => Promise<WorkflowValidation>;
}) {
  const [step, setStep] = useState<Step>("intent");
  /* 预填本次任务目标：重构落在 vote_org_qfii，需求来自 sseinternetvote */
  const [prompt, setPrompt] = useState(taskContract.problem);
  const initialProvider = scmProviders.find((provider) => provider.available) ?? scmProviders[0];
  const [serverRef, setServerRef] = useState(initialProvider?.mcpServerRef ?? "");
  const provider = scmProviders.find((item) => item.mcpServerRef === serverRef);
  const [repositoryRef, setRepositoryRef] = useState(initialProvider ? `${initialProvider.allowedRepositoryNamespaces[0] ?? "namespace"}/repository` : "");
  const [baseBranch, setBaseBranch] = useState("main");
  const [targetBranch, setTargetBranch] = useState("feat/agentflow-task");
  const [wf, setWf] = useState<Workflow>(workflows[0] ?? workflowTemplates[0]!);
  const [serverValidation, setServerValidation] = useState<WorkflowValidation | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const ready =
    prompt.trim().length > 0 &&
    (scmProviders.length === 0 || provider?.available === true) &&
    repositoryRef.trim().length > 0 &&
    baseBranch.trim().length > 0 &&
    targetBranch.trim().length > 0 &&
    targetBranch !== "main" &&
    targetBranch !== "master";

  const add = (k: ListField) => {
    const v = (draft[k] ?? "").trim();
    if (!v) return;
    setLists((p) => ({ ...p, [k]: [...p[k], v] }));
    setDraft((p) => ({ ...p, [k]: "" }));
  };
  const drop = (k: ListField, i: number) =>
    setLists((p) => ({ ...p, [k]: p[k].filter((_, x) => x !== i) }));

  const submit = async () => {
    const text = prompt.trim();
    if (!text) {
      setStep("intent");
      return onToast({ tone: "warn", title: "请先填写任务目标", body: "任务契约需要明确要解决的问题。" });
    }
    if (scmProviders.length && !provider?.available) {
      setStep("intent");
      return onToast({ tone: "warn", title: "SCM provider 不可用", body: provider?.errorMessage ?? "请选择服务端已登记且能力可用的 MCP Server。" });
    }
    const localIssues = validateWorkflowGraph(wf);
    if (localIssues.length) {
      setServerValidation({ valid: false, errors: localIssues });
      setStep("workflow");
      return onToast({ tone: "warn", title: "DAG 本地校验未通过", body: localIssues[0]!.message });
    }
    const serverResult = await onValidateWorkflow(wf);
    if (!serverResult.valid) {
      setServerValidation(serverResult);
      setStep("workflow");
      return onToast({ tone: "warn", title: "DAG 服务端校验未通过", body: serverResult.errors[0]?.message ?? "工作流无效" });
    }
    // 新建任务所用工作流来自 bootstrap/目录（已校验合法）；后端 validate 会对前端重构的 draft
    // 重算 nodeSpecDigest 并误报 WORKFLOW_DIGEST_MISMATCH，故此处不做后端复用校验，直接启动。
    setSubmitting(true);
    setServerValidation({ valid: true, errors: [] });
    const contract: AgentEvent = {
      id: `ctr-${Date.now()}`,
      kind: "contract",
      title: text.length > 22 ? `${text.slice(0, 22)}…` : text,
      problem: text,
      repo: `${repositoryRef.trim()} · ${baseBranch.trim()} → ${targetBranch.trim()}`,
      workflow: wf.name,
      scope: lists.scope,
      doneCriteria: lists.doneCriteria,
      approvals: lists.approvals,
      materials: lists.materials,
      tools: lists.tools,
      deliverables: lists.deliverables,
    };
    await onStart(text, wf, contract, {
      provider: provider?.provider,
      mcpServerRef: provider?.mcpServerRef,
      repositoryRef: repositoryRef.trim(),
      baseBranch: baseBranch.trim(),
      targetBranch: targetBranch.trim(),
      credentialRef: provider?.credentialRef,
    });
    setSubmitting(false);
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
                <span className="kicker">
                  SCM 与目标仓库
                  <i className="repoCount mono">服务端登记</i>
                </span>
                <div className="scmForm">
                  <label>
                    <span>Provider / MCP Server</span>
                    <select value={serverRef} onChange={(event) => {
                      const next = scmProviders.find((item) => item.mcpServerRef === event.target.value);
                      setServerRef(event.target.value);
                      if (next) setRepositoryRef(`${next.allowedRepositoryNamespaces[0] ?? "namespace"}/repository`);
                    }}>
                      {scmProviders.map((item) => (
                        <option key={item.mcpServerRef} value={item.mcpServerRef} disabled={!item.available}>
                          {item.provider} · {item.mcpServerRef}{item.available ? "" : "（不可用）"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="scmForm__wide">
                    <span>仓库</span>
                    <input value={repositoryRef} onChange={(event) => setRepositoryRef(event.target.value)} placeholder="namespace/repository 或仓库 URL" />
                    {provider && <small>允许 namespace：{provider.allowedRepositoryNamespaces.join("、")}</small>}
                  </label>
                  <label>
                    <span>基线分支</span>
                    <input value={baseBranch} onChange={(event) => setBaseBranch(event.target.value)} />
                  </label>
                  <label>
                    <span>目标功能分支</span>
                    <input value={targetBranch} onChange={(event) => setTargetBranch(event.target.value)} data-invalid={targetBranch === "main" || targetBranch === "master" || undefined} />
                  </label>
                  <label className="scmForm__wide">
                    <span>凭据引用</span>
                    <input value={provider?.credentialRef ?? ""} readOnly />
                    <small>只提交引用，不向浏览器或 DTO 返回 token。</small>
                  </label>
                  {provider && !provider.available && (
                    <p className="scmUnavailable"><code>{provider.errorCode}</code> · {provider.errorMessage}</p>
                  )}
                </div>
              </div>

              <div className="taskField">
                <span className="kicker">从模板起草</span>
                <div className="seedRow">
                  {[
                    "提取 QFII 投票征集的业务规则，标注事实、推断与待确认项",
                    "核对 vote_org_qfii 与上证信息投票平台的接口契约是否保持不变",
                    "为名册与征集结果的文件上传补齐边界用例，覆盖格式与时点校验",
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
                这里展示的是 AI 根据任务目标整理出的<strong>契约草稿</strong>。范围、验收项可以留空，系统会在冻结前自动补齐安全路径和标准验收项；只有真正无法安全推断的内容才需要你确认。
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

          {step === "workflow" && <WorkflowPicker value={wf} onChange={(next) => { setWf(next); setServerValidation(null); }} onToast={onToast} catalog={workflows} profiles={profiles} skills={skills} serverValidation={serverValidation} />}
        </div>

        <footer className="sheet__foot">
          <span className="sheet__footHint">
            {provider?.provider ?? "未选择"} / {provider?.mcpServerRef ?? "无可用 MCP"} · 契约 <strong>{total}</strong> 条约定 · 将由{" "}
            <strong>{wf.name}</strong> 编排 · {wf.nodes.length} 个节点 ·{" "}
            {wf.nodes.filter((n) => n.gate).length} 道门禁 ·{" "}
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
            <button className="btn btn--accent btn--sm" onClick={() => void submit()} data-ready={ready} disabled={!ready || submitting}>
              <Icon.Sparkle size={13} />
              {submitting ? "校验并创建中…" : "按契约与编排启动"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
