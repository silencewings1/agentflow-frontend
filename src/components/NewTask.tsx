import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons";
import { WorkflowPicker } from "./Workflow";
import { validateWorkflowGraph, workflowTemplates, type Workflow } from "../data/workflows";
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

/* 仓库默认值取服务端登记的第一个允许 namespace 原文 —— 它已经是 owner/repo；
   没有登记项时留空并只给占位提示，不把「namespace/repository」当成真实仓库名提交，
   主按钮因此在仓库为空时保持受阻。 */
function repositoryDefaultFor(provider: ScmProviderDto | undefined): string {
  const namespace = provider?.allowedRepositoryNamespaces[0]?.trim();
  return namespace || "";
}

/* 创建任务只问「我想做什么、改哪里」；契约六清单不再要求用户凭空发明 ——
   可推断项由 WorkSpec 冻结前补齐，必须确认的边界放到 WorkSpec 确认面板。 */
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
  /* 任务目标留空由用户填写：预填演示任务会让无关条目混进冻结后的 WorkSpec */
  const [prompt, setPrompt] = useState("");
  const initialProvider = scmProviders.find((provider) => provider.available) ?? scmProviders[0];
  const [serverRef, setServerRef] = useState(initialProvider?.mcpServerRef ?? "");
  const provider = scmProviders.find((item) => item.mcpServerRef === serverRef);
  const [repositoryRef, setRepositoryRef] = useState(repositoryDefaultFor(initialProvider));
  const [baseBranch, setBaseBranch] = useState("main");
  const [targetBranch, setTargetBranch] = useState("feat/agentflow-task");
  const [wf, setWf] = useState<Workflow>(workflows[0] ?? workflowTemplates[0]!);
  const [serverValidation, setServerValidation] = useState<WorkflowValidation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /* 工作流是可选检查项而非必经步骤：默认折叠，保持创建是「一段描述 + 仓库/分支」的单屏动作 */
  const [wfOpen, setWfOpen] = useState(false);

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

  const localIssues = useMemo(() => validateWorkflowGraph(wf), [wf]);
  const forbiddenTargetBranch = targetBranch.trim() === "main" || targetBranch.trim() === "master";

  /* 主按钮的可用性只由真实前置条件决定：目标、可用 provider、仓库、分支、目标分支合法、DAG 合法。
     每一条受阻都给出原因，界面不会出现「看起来能点但点了报错」的状态。 */
  const blockers: string[] = [];
  if (!prompt.trim()) blockers.push("填写任务目标：它是 WorkSpec objective 与后续验收基线的来源。");
  if (scmProviders.length === 0) blockers.push("服务端尚未登记 SCM provider，无法创建任务；请先在连接层配置可用的 MCP Server。");
  else if (provider?.available !== true) blockers.push("当前 SCM provider 不可用，请选择服务端登记且能力可用的 MCP Server。");
  if (!repositoryRef.trim()) blockers.push("填写目标仓库（owner/repo 或仓库 URL）。");
  if (!baseBranch.trim()) blockers.push("填写基线分支。");
  if (!targetBranch.trim()) blockers.push("填写目标功能分支。");
  if (forbiddenTargetBranch) blockers.push("目标功能分支不能是 main / master：平台禁止直接向受保护分支写入。");
  if (localIssues.length > 0) blockers.push(`工作流 DAG 有 ${localIssues.length} 项问题，展开工作流检查后再创建。`);
  const ready = blockers.length === 0;

  const submit = async () => {
    const text = prompt.trim();
    if (!ready) {
      return onToast({ tone: "warn", title: "还差一步才能创建", body: blockers[0] ?? "请补齐创建任务所需的信息。" });
    }
    const serverResult = await onValidateWorkflow(wf);
    if (!serverResult.valid) {
      setServerValidation(serverResult);
      setWfOpen(true);
      return onToast({ tone: "warn", title: "DAG 服务端校验未通过", body: serverResult.errors[0]?.message ?? "工作流无效" });
    }
    // 新建任务所用工作流来自 bootstrap/目录（已校验合法）；后端 validate 会对前端重构的 draft
    // 重算 nodeSpecDigest 并误报 WORKFLOW_DIGEST_MISMATCH，故此处不做后端复用校验，直接启动。
    setSubmitting(true);
    setServerValidation({ valid: true, errors: [] });
    /* 六清单留空：可推断项由 workSpecFromContract 在冻结前补齐，边界项在 WorkSpec 确认面板核对 */
    const contract: AgentEvent = {
      id: `ctr-${Date.now()}`,
      kind: "contract",
      title: text.length > 22 ? `${text.slice(0, 22)}…` : text,
      problem: text,
      repo: `${repositoryRef.trim()} · ${baseBranch.trim()} → ${targetBranch.trim()}`,
      workflow: wf.name,
      scope: [],
      doneCriteria: [],
      approvals: [],
      materials: [],
      tools: [],
      deliverables: [],
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

  const gates = wf.nodes.filter((n) => n.gate).length;
  const checkpoints = wf.nodes.filter((n) => n.approval).length;

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
            <h2 className="serif">描述要解决的问题，并绑定目标仓库</h2>
            <p>契约清单不再要求你凭空填写：可推断项由平台补齐，必须确认的边界在 WorkSpec 面板逐条核对。</p>
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="关闭">
            <Icon.X size={16} />
          </button>
        </header>

        <div className="sheet__body">
          <div className="taskOne">
            <div className="stack">
              <div className="taskField">
                <span className="kicker">要解决的问题</span>
                <textarea
                  className="taskInput"
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例如：把 useDashboard 的数据获取抽成独立 hook，并保持 SSR 行为一致"
                  autoFocus
                />
              </div>

              <div className="taskField">
                <span className="kicker">从模板起草</span>
                <div className="seedRow">
                  {[
                    "为 createTodoList 增加 update(id, patch) 方法，保持现有调用方行为不变",
                    "为 createTodoList 补齐单元测试，覆盖新增、更新与删除路径",
                    "调整 createTodoList 的语义：按 id 去重后再写入，返回最终条目",
                  ].map((s) => (
                    <button key={s} className="seedChip" onClick={() => setPrompt(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
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
                    setRepositoryRef(repositoryDefaultFor(next));
                  }}>
                    {scmProviders.map((item) => (
                      <option key={item.mcpServerRef} value={item.mcpServerRef} disabled={!item.available}>
                        {item.provider} · {item.mcpServerRef}{item.available ? "" : "（不可用）"}
                      </option>
                    ))}
                  </select>
                  {scmProviders.length === 0 && <small>服务端尚未登记可用的 MCP Server。任务创建需要 provider 与 mcpServerRef，请先在连接层完成登记。</small>}
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
                  <input value={targetBranch} onChange={(event) => setTargetBranch(event.target.value)} data-invalid={forbiddenTargetBranch || undefined} />
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
          </div>

          <section className="taskWf" data-open={wfOpen}>
            <button className="taskWf__head" onClick={() => setWfOpen((v) => !v)} aria-expanded={wfOpen}>
              <Icon.Nodes size={13} />
              <strong>{wf.name}</strong>
              <span className="mono">{wf.nodes.length} 节点 · {gates} 门禁 · {checkpoints} 人工检查点</span>
              <em data-frozen={wf.frozen === true}>{wf.frozen ? "已由服务端冻结" : "本地草稿"}</em>
              <Icon.Chevron size={13} className={wfOpen ? "rot90" : undefined} />
            </button>
            <p className="taskWf__hint">
              工作流已由服务端预选并冻结，不调整也能直接创建；展开只用于查看节点分工与失败回退。
            </p>
            {wfOpen && (
              <div className="taskWf__body">
                <WorkflowPicker
                  value={wf}
                  onChange={(next) => { setWf(next); setServerValidation(null); }}
                  onToast={onToast}
                  catalog={workflows}
                  profiles={profiles}
                  skills={skills}
                  serverValidation={serverValidation}
                />
              </div>
            )}
          </section>
        </div>

        <footer className="sheet__foot">
          <span className="sheet__footHint">
            {provider?.provider ?? "未选择"} / {provider?.mcpServerRef ?? "无可用 MCP"} · {repositoryRef.trim() || "未填写仓库"} ·{" "}
            {baseBranch.trim() || "未填写基线分支"} → {targetBranch.trim() || "未填写目标分支"} · 由 <strong>{wf.name}</strong> 编排
          </span>
          <div className="taskFoot__act">
            {!ready && <span className="taskFoot__block" data-blocked="true">{blockers[0]}</span>}
            <button className="btn btn--accent btn--sm" onClick={() => void submit()} data-blocked={!ready || submitting} disabled={!ready || submitting}>
              <Icon.Sparkle size={13} />
              {submitting ? "校验并创建中…" : "创建任务"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
