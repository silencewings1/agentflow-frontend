import { useMemo, useState, type ReactNode } from "react";
import type {
  AfGateDetailDto,
  ApprovalQueryDto,
  AttemptDetailDto,
  ClarificationAnswerDto,
  CompilationReportDto,
  EvidenceMatrixDto,
  GitOperationDto,
  PlanDecisionDto,
  PlanDto,
  ProposalDto,
  RunIntentDto,
  RunMode,
  TaskState,
  TrustedDeliveryDto,
  WorkSpecDraftInput,
  WorkSpecDto,
} from "../api/types";
import { deriveWorkSpecPreflight, type WorkSpecPreflightItem, type WorkSpecPreflightTone } from "./workSpecPreflight";

export interface GovernanceReworkItem {
  reworkId: string;
  fromNodeId?: string;
  targetNodeId?: string;
  reason: string;
  status?: "open" | "running" | "resolved" | "superseded";
  keep?: string[];
  redo?: string[];
  createdAt?: string;
}

export interface GovernanceViewProps {
  taskId: string;
  taskStatus?: TaskState | string;
  workSpec?: WorkSpecDto | null;
  proposal?: ProposalDto | null;
  compilationReport?: CompilationReportDto | null;
  plan?: PlanDto | null;
  planDecision?: PlanDecisionDto | null;
  runIntent?: RunIntentDto | null;
  attempts?: AttemptDetailDto[];
  gates?: AfGateDetailDto[];
  rework?: GovernanceReworkItem[];
  approvals?: ApprovalQueryDto | null;
  evidenceMatrix?: EvidenceMatrixDto | null;
  scmOperations?: GitOperationDto[];
  trustedDelivery?: TrustedDeliveryDto | null;
  runMode?: RunMode;
  apiMode?: "http" | "fixture";
  workSpecEditable?: boolean;
  workSpecDraft?: WorkSpecDraftInput;
  onWorkSpecDraftChange?: (draft: WorkSpecDraftInput) => void;
  onFreezeWorkSpec?: (draft: WorkSpecDraftInput) => void;
  onCreateWorkSpecRevision?: () => void;
  onRequestProposal?: () => void;
  onCompile?: () => void;
  onPlanDecision?: (decision: "approved" | "rejected") => void;
  onRun?: () => void;
  onAnswerRequirements?: (input: { sourceAttemptId: string; answers: ClarificationAnswerDto[]; reason: string }) => void;
  busyAction?: string | null;
}

const taskLabels: Record<string, string> = {
  draft: "草稿",
  created: "任务壳",
  planning: "规划中",
  awaiting_plan_approval: "等待计划审批",
  ready: "已就绪",
  queued: "排队中",
  running: "执行中",
  yielded: "已让出",
  blocked_unavailable: "能力不可用",
  needs_reconcile: "等待对账",
  compiler_rejected: "编译拒绝",
  stale: "已过期",
  awaiting_human: "等待人工",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const modeLabels: Record<RunMode | "fixture-test-double", string> = {
  real: "REAL · 真实运行",
  "rehearsal-real": "REHEARSAL-REAL · 真实演练",
  "fault-injection": "FAULT-INJECTION · 故障注入",
  "fixture/test-double": "FIXTURE · TEST DOUBLE",
  "fixture-test-double": "FIXTURE · TEST DOUBLE",
};

function shortDigest(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 24 ? `${value.slice(0, 20)}…` : value;
}

function dateLabel(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function approvalDate(value: { occurredAt?: string; createdAt?: string }): string {
  return dateLabel(value.occurredAt ?? value.createdAt);
}

function statusLabel(value: string | undefined): string {
  return value ? (taskLabels[value] ?? value) : "未声明";
}

function StatusPill({ value, tone }: { value: string | undefined; tone?: string }) {
  return <span className="govPill" data-tone={tone ?? value ?? "unknown"}>{statusLabel(value)}</span>;
}

function RequirementsGateHint({ gates, taskStatus }: { gates: AfGateDetailDto[]; taskStatus?: string }) {
  const gate = [...gates].reverse().find((item) => item.gateType === "requirements" || item.gateId.includes("requirements-contract-v1"));
  if (!gate) return null;
  const actual = gate.actual as Record<string, unknown>;
  const blocking = typeof actual.blockingQuestionCount === "number" ? actual.blockingQuestionCount : undefined;
  const inferred = typeof actual.inferredQuestionCount === "number" ? actual.inferredQuestionCount : undefined;
  if (gate.outcome === "pass" && !inferred) return null;
  if (gate.outcome === "pass") {
    return <div className="govNotice govNotice--info"><strong>需求澄清已通过</strong><span>{inferred} 项偏好问题已由任务契约自动推断，无需额外填写。</span></div>;
  }
  if (gate.outcome !== "fail") return null;
  return <div className="govNotice govNotice--warn"><strong>{taskStatus === "awaiting_human" ? "需要人工澄清后才能继续" : "需求门禁未通过"}</strong><span>{blocking !== undefined ? `仍有 ${blocking} 项需要人工确认。` : (gate.failureCode ?? "请查看门禁详情。")} 当前版本不会把覆盖率工具、测试文件布局等可推断偏好视为阻塞；涉及分支、远端写入、权限或安全边界的问题才需要确认。</span></div>;
}

function isLikelyInferableQuestion(question: string): boolean {
  const text = question.trim().toLowerCase();
  if (!text) return false;
  if (["远端写", "远端提交", "push", "merge", "deploy", "release", "发布", "目标分支", "target branch", "仓库", "repository", "credential", "凭据", "权限", "授权", "批准", "生产", "production", "secret", "密钥", "安全边界", "验收冲突", "是否允许修改业务"].some((token) => text.includes(token))) return false;
  return ["覆盖率", "coverage", "百分比", "threshold", "门槛", "测试工具", "第三方依赖", "devdepend", "依赖", "测试文件", "文件布局", "脚本", "实现细节", "命名"].some((token) => text.includes(token));
}

function isRequirementsQuestionBlocking(item: Record<string, unknown>): boolean {
  const category = typeof item.category === "string" ? item.category.trim().toLowerCase() : "";
  const resolution = typeof item.resolutionStatus === "string" ? item.resolutionStatus.trim().toLowerCase() : "";
  if (["external-write", "authorization", "acceptance-conflict", "scope", "security"].includes(category)) {
    return !["answered", "confirmed", "inferred"].includes(resolution);
  }
  if (["implementation-preference", "evidence-preference"].includes(category)) return false;
  return item.blocking === true && !isLikelyInferableQuestion(String(item.question ?? ""));
}

function RequirementsQuestionCard({ attempts, onAnswer, busy, apiMode }: { attempts: AttemptDetailDto[]; onAnswer?: GovernanceViewProps["onAnswerRequirements"]; busy?: boolean; apiMode: "http" | "fixture" }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const attempt = [...attempts].reverse().find((item) => item.nodeId === "requirements" && item.structured && Array.isArray(item.structured.openQuestions));
  const questions = Array.isArray(attempt?.structured?.openQuestions) ? attempt.structured.openQuestions : [];
  if (!questions.length) return null;
  const blockingQuestions = questions.map((raw, index) => ({ raw, index })).filter(({ raw }) => { const item = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {}; return isRequirementsQuestionBlocking(item); });
  return <div className="govQuestions"><div className="govQuestions__head"><strong>需求澄清问题</strong><span>模型问题会先经过平台分类，只有真正影响授权或执行边界的问题才阻断。</span></div>{questions.map((raw, index) => {
    const item = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
    const question = String(item.question ?? "");
    const blocking = isRequirementsQuestionBlocking(item);
    const inferred = !blocking && (item.blocking === true || item.resolutionStatus === "inferred" || item.resolutionStatus === "assumed");
    return <article key={`${String(item.id ?? "question")}-${index}`} data-tone={blocking ? "warn" : "info"}><span className="govQuestions__badge">{blocking ? "需要确认" : inferred ? "可自动推断" : "说明"}</span><p>{question || "未提供问题文本"}</p>{blocking ? <textarea value={answers[index] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))} placeholder="填写确认结果，例如：允许写入 feature/demo 分支" rows={2} /> : null}<small>{blocking ? "回答后会生成新的 WorkSpec revision；旧 attempt 保留为审计证据。" : "平台将按当前 WorkSpec 默认策略处理，不影响继续执行。"}</small></article>;
  })}{blockingQuestions.length > 0 && <div className="govQuestions__actions">{apiMode === "fixture" ? <p className="govHint govHint--warn">当前是 FIXTURE · TEST DOUBLE；回答不会写入治理事实，请切换到 HTTP AF API 后提交。</p> : <><label><span>本次确认说明</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明你确认了哪些边界，以及为什么" rows={2} /></label><button className="btn btn--accent btn--sm" disabled={!onAnswer || busy || !reason.trim() || blockingQuestions.some(({ index }) => !(answers[index] ?? "").trim())} onClick={() => onAnswer?.({ sourceAttemptId: attempt!.attemptId, answers: blockingQuestions.map(({ raw, index }) => { const item = raw as Record<string, unknown>; return { ...(typeof item.id === "string" ? { questionId: item.id } : {}), question: String(item.question ?? ""), answer: (answers[index] ?? "").trim(), ...(typeof item.category === "string" && ["external-write", "authorization", "acceptance-conflict", "scope", "security"].includes(item.category) ? { category: item.category as ClarificationAnswerDto["category"] } : {}) }; }), reason: reason.trim() })}>{busy ? "提交并创建新 revision…" : "回答并重新规划"}</button></>}</div>}</div>;
}

function Section({ title, kicker, children, empty }: { title: string; kicker?: string; children: ReactNode; empty?: boolean }) {
  return (
    <section className="govSection">
      <header className="govSection__head">
        <div>
          {kicker && <span className="kicker">{kicker}</span>}
          <h3>{title}</h3>
        </div>
      </header>
      {empty ? <p className="govEmpty">暂无服务端事实。</p> : children}
    </section>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return <div className="govFact"><span>{label}</span><strong className={mono ? "mono" : undefined}>{value}</strong></div>;
}

function List({ items }: { items?: string[] }) {
  if (!items?.length) return <span className="govMuted">—</span>;
  return <ul className="govList">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>;
}

function initialDraft(workSpec?: WorkSpecDto | null, draft?: WorkSpecDraftInput): WorkSpecDraftInput {
  if (draft) return draft;
  return {
    title: workSpec?.title ?? "",
    objective: workSpec?.objective ?? "",
    background: workSpec?.background ?? "",
    scope: workSpec?.scope ?? { included: [], excluded: [] },
    inputs: workSpec?.inputs ?? [],
    doneCriteria: workSpec?.doneCriteria ?? [],
    deliverables: workSpec?.deliverables ?? [],
    repository: workSpec?.repository,
    constraints: workSpec?.constraints,
    policies: workSpec?.policies,
    templateRef: workSpec?.templateRef,
  };
}

function WorkSpecPreflightCard({ draft }: { draft: WorkSpecDraftInput }) {
  const preflight = deriveWorkSpecPreflight(draft);
  const groups: Array<{ title: string; summary: string; items: WorkSpecPreflightItem[]; tone: WorkSpecPreflightTone }> = [
    { title: "已自动推断的偏好", summary: "这些是实现选择，不会要求你为了通过门禁而预先填写内部规则。", items: preflight.inferred, tone: "info" },
    { title: "冻结前需要确认的边界", summary: "只有会影响授权、外部写入或执行范围的事项才会阻塞后续运行。", items: preflight.boundaries, tone: "warn" },
    { title: "冻结后会影响运行的内容", summary: "这不是不可修改；修改时会创建新的不可变 revision，历史记录继续保留。", items: preflight.frozenChanges, tone: "info" },
  ];
  return <aside className="govPreflight" aria-label="WorkSpec 冻结前预检">
    <div className="govPreflight__head"><div><strong>冻结前预检</strong><span>先确认业务边界，平台再补齐可推断的执行细节。</span></div><em>本地预览</em></div>
    <div className="govPreflight__groups">{groups.map((group) => <section key={group.title} data-tone={group.tone}><h4>{group.title}</h4><p>{group.summary}</p><ul>{group.items.map((item) => <li key={item.label} data-tone={item.tone}><strong>{item.label}</strong><span>{item.detail}</span></li>)}</ul></section>)}</div>
  </aside>;
}

function WorkSpecEditor({
  workSpec,
  editable,
  draft: controlledDraft,
  onDraftChange,
  onFreeze,
}: {
  workSpec?: WorkSpecDto | null;
  editable: boolean;
  draft?: WorkSpecDraftInput;
  onDraftChange?: (draft: WorkSpecDraftInput) => void;
  onFreeze?: (draft: WorkSpecDraftInput) => void;
}) {
  const [localDraft, setLocalDraft] = useState<WorkSpecDraftInput>(() => initialDraft(workSpec, controlledDraft));
  const draft = controlledDraft ?? localDraft;
  const update = (patch: Partial<WorkSpecDraftInput>) => {
    const next = { ...draft, ...patch };
    if (!controlledDraft) setLocalDraft(next);
    onDraftChange?.(next);
  };
  const criteria = draft.doneCriteria ?? [];
  const canFreeze = Boolean(draft.title?.trim() && draft.objective?.trim() && criteria.length > 0 && criteria.every((criterion) => criterion.description.trim() && criterion.expected?.trim() && criterion.verifierId?.trim() && criterion.evidencePolicy?.evidenceTypes?.length));

  return (
    <div className="govWorkSpec">
      <div className="govFacts">
        <Fact label="revision" value={workSpec?.workSpecRevision ?? "未冻结"} mono />
        <Fact label="digest" value={shortDigest(workSpec?.workSpecDigest)} mono />
        <Fact label="created" value={dateLabel(workSpec?.createdAt)} />
      </div>
      {editable ? (
        <div className="govForm">
          <WorkSpecPreflightCard draft={draft} />
          <label><span>标题</span><input value={draft.title ?? ""} onChange={(event) => update({ title: event.target.value })} placeholder="这项任务要交付什么" /></label>
          <label><span>目标</span><textarea value={draft.objective ?? ""} onChange={(event) => update({ objective: event.target.value })} rows={3} placeholder="可验证的目标与边界" /></label>
          <label><span>背景（可选）</span><textarea value={draft.background ?? ""} onChange={(event) => update({ background: event.target.value })} rows={2} placeholder="为什么现在做" /></label>
          <div className="govForm__columns">
            <label><span>包含范围（每行一项）</span><textarea value={(draft.scope?.included ?? []).join("\n")} onChange={(event) => update({ scope: { included: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean), excluded: draft.scope?.excluded ?? [] } })} rows={4} /></label>
            <label><span>排除范围（每行一项）</span><textarea value={(draft.scope?.excluded ?? []).join("\n")} onChange={(event) => update({ scope: { included: draft.scope?.included ?? [], excluded: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) } })} rows={4} /></label>
          </div>
          <div className="govCriteria">
            <div className="govCriteria__head"><span>完成判定</span><button className="btn btn--ghost btn--sm" type="button" onClick={() => update({ doneCriteria: [...criteria, { criterionId: `criterion-${criteria.length + 1}`, required: true, description: "", verifierId: "human-review", verifierVersion: "1", expected: "", evidencePolicy: { evidenceTypes: [], minCount: 1, retention: "task" } }] })}>添加判定</button></div>
            {criteria.map((criterion, index) => <div className="govCriteria__row" key={criterion.criterionId}><span className="mono">{criterion.criterionId}</span><input value={criterion.description} onChange={(event) => update({ doneCriteria: criteria.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} placeholder="什么证据能证明已完成" /><input value={criterion.expected ?? ""} onChange={(event) => update({ doneCriteria: criteria.map((item, itemIndex) => itemIndex === index ? { ...item, expected: event.target.value } : item) })} placeholder="预期结果" /><input value={(criterion.evidencePolicy?.evidenceTypes ?? []).join(", ")} onChange={(event) => update({ doneCriteria: criteria.map((item, itemIndex) => itemIndex === index ? { ...item, evidencePolicy: { ...item.evidencePolicy, evidenceTypes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } } : item) })} placeholder="证据类型，如 test" /></div>)}
          </div>
          <div className="govForm__actions">
            <span className="govHint">冻结后服务端生成不可变 revision 与 digest，浏览器草稿不会成为治理事实。</span>
            <button className="btn btn--accent btn--sm" type="button" disabled={!onFreeze || !canFreeze} onClick={() => onFreeze?.(draft)}>保存并冻结 WorkSpec</button>
          </div>
        </div>
      ) : (
        <div className="govReadOnly">
          <Fact label="title" value={workSpec?.title ?? "—"} />
          <Fact label="objective" value={workSpec?.objective ?? "—"} />
          <div className="govReadOnly__grid"><div><span>包含范围</span><List items={workSpec?.scope?.included} /></div><div><span>排除范围</span><List items={workSpec?.scope?.excluded} /></div></div>
          <div><span>完成判定</span><List items={workSpec?.doneCriteria?.map((criterion) => `${criterion.criterionId} · ${criterion.description}`)} /></div>
        </div>
      )}
    </div>
  );
}

export function GovernanceView({
  taskId,
  taskStatus,
  workSpec,
  proposal,
  compilationReport,
  plan,
  planDecision,
  runIntent,
  attempts = [],
  gates = [],
  rework = [],
  approvals,
  evidenceMatrix,
  scmOperations = [],
  trustedDelivery,
  runMode,
  apiMode = "http",
  workSpecEditable = !workSpec,
  workSpecDraft,
  onWorkSpecDraftChange,
  onFreezeWorkSpec,
  onCreateWorkSpecRevision,
  onRequestProposal,
  onCompile,
  onPlanDecision,
  onRun,
  onAnswerRequirements,
  busyAction,
}: GovernanceViewProps) {
  const effectiveRunMode = runMode ?? runIntent?.runMode;
  const currentStatus = runIntent?.status ?? taskStatus;
  // The durable RunIntent may remain `yielded` after the task aggregate has
  // entered `awaiting_human`. For control actions, the task aggregate is the
  // authority: never expose a new RunIntent while a gate/reconcile block is
  // active, even if the old intent is merely yielded.
  const controlBlocked = ["awaiting_human", "blocked_unavailable", "needs_reconcile"].includes(String(taskStatus));
  const currentEvidence = useMemo(() => evidenceMatrix?.rows ?? [], [evidenceMatrix]);
  const acceptedAttempts = attempts.filter((attempt) => attempt.status === "accepted");
  const pendingApprovals = (approvals?.nodeApprovals ?? []).filter((approval) => approval.decision !== "approved").length;
  const unresolvedOperations = scmOperations.filter((operation) => operation.status === "unknown" || operation.status === "failed").length;

  return (
    <main className="govView" data-api-mode={apiMode} data-run-mode={effectiveRunMode ?? "undeclared"}>
      <header className="govView__head">
        <div><span className="kicker">W7 · 可信展示</span><h2>治理事实与可信交付</h2><p className="govView__task mono">task {taskId}</p></div>
        <div className="govView__badges"><StatusPill value={currentStatus} /><span className="govPill" data-tone={effectiveRunMode ? "mode" : "warn"}>{effectiveRunMode ? modeLabels[effectiveRunMode] : "RUN MODE · 未声明"}</span>{apiMode === "fixture" && <span className="govPill" data-tone="fixture">FIXTURE · TEST DOUBLE</span>}</div>
      </header>

      <div className="govStatusRail" aria-label="任务与运行状态">
        {(["draft", "planning", "awaiting_plan_approval", "queued", "running", "yielded", "awaiting_human", "blocked_unavailable", "needs_reconcile", "completed"] as const).map((status) => <span key={status} data-active={currentStatus === status} data-status={status}>{statusLabel(status)}</span>)}
      </div>

      <div className="govActions">
        {!workSpec && onFreezeWorkSpec && <span className="govHint">先完成 WorkSpec，服务端才会生成规划事实。</span>}
        {workSpec && onCreateWorkSpecRevision && <button className="btn btn--ghost btn--sm" disabled={busyAction !== null} onClick={onCreateWorkSpecRevision}>创建 WorkSpec 新 revision</button>}
        {workSpec && !proposal && onRequestProposal && <button className="btn btn--accent btn--sm" disabled={busyAction !== null} onClick={onRequestProposal}>{busyAction === "proposal" ? "生成 Proposal…" : "请求 Supervisor Proposal"}</button>}
        {proposal && !compilationReport && onCompile && <button className="btn btn--accent btn--sm" disabled={busyAction !== null} onClick={onCompile}>{busyAction === "compile" ? "编译中…" : "运行 Plan Compiler"}</button>}
        {compilationReport?.outcome === "rejected" && <span className="govHint govHint--warn">Compiler 已拒绝当前 revision；先创建新 revision 修正 WorkSpec，再重新请求 Proposal。</span>}
        {plan && !planDecision && onPlanDecision && <button className="btn btn--accent btn--sm" disabled={busyAction !== null} onClick={() => onPlanDecision("approved")}>{busyAction === "decision" ? "提交中…" : "批准 Execution Plan"}</button>}
        {controlBlocked && <span className="govHint govHint--warn">当前任务处于 {statusLabel(String(taskStatus))}，请先完成澄清、能力恢复或对账，暂不能创建 RunIntent。</span>}
        {planDecision?.decision === "approved" && onRun && <button className="btn btn--accent btn--sm" disabled={busyAction !== null || controlBlocked || ["completed", "cancelled"].includes(String(taskStatus))} onClick={onRun}>{busyAction === "run" ? "排队中…" : "创建 RunIntent"}</button>}
      </div>

      <RequirementsGateHint gates={gates} taskStatus={taskStatus ?? currentStatus} />
      <RequirementsQuestionCard attempts={attempts} onAnswer={onAnswerRequirements} busy={busyAction === "clarification"} apiMode={apiMode} />

      <div className="govGrid">
        <Section title="WorkSpec" kicker="唯一入口">
          <WorkSpecEditor workSpec={workSpec} editable={workSpecEditable} draft={workSpecDraft} onDraftChange={onWorkSpecDraftChange} onFreeze={onFreezeWorkSpec} />
        </Section>

        <Section title="Proposal" kicker="Supervisor">
          {proposal ? <div className="govCard"><div className="govCard__title"><strong>{proposal.proposalId}</strong><StatusPill value={proposal.status} /></div><div className="govFacts"><Fact label="revision" value={proposal.workSpecRevision} mono /><Fact label="workSpec" value={shortDigest(proposal.workSpecDigest)} mono /><Fact label="proposal" value={shortDigest(proposal.proposalDigest)} mono /><Fact label="governance" value={shortDigest(proposal.governanceDigest)} mono /></div></div> : <p className="govEmpty">冻结 WorkSpec 后等待 Proposal。</p>}
        </Section>

        <Section title="CompilationReport" kicker="确定性 Compiler">
          {compilationReport ? <div className="govCard"><div className="govCard__title"><strong>{compilationReport.reportId}</strong><StatusPill value={compilationReport.outcome} tone={compilationReport.outcome === "pass" ? "ok" : "fail"} /></div><div className="govFacts"><Fact label="digest" value={shortDigest(compilationReport.reportDigest)} mono /><Fact label="created" value={dateLabel(compilationReport.createdAt)} /></div><ul className="govChecks">{compilationReport.checks.map((check) => <li key={check.checkId} data-outcome={check.outcome}><span>{check.checkId}</span><strong>{check.outcome}</strong><p>{check.reason}</p></li>)}</ul></div> : <p className="govEmpty">尚未产生 CompilationReport。</p>}
        </Section>

        <Section title="Execution Plan 与 PlanDecision" kicker="人工责任边界">
          <div className="govCard"><div className="govFacts"><Fact label="plan" value={plan ? `${plan.planRevisionId} · ${plan.status ?? "—"}` : "—"} mono /><Fact label="plan digest" value={shortDigest(plan?.planDigest)} mono /><Fact label="decision" value={planDecision?.decision ?? "pending"} /><Fact label="actor" value={planDecision?.actor ?? "—"} /></div>{planDecision?.reason && <p className="govReason">{planDecision.reason}</p>}</div>
        </Section>

        <Section title="RunIntent 与执行状态" kicker="程序驱动">
          <div className="govCard"><div className="govFacts"><Fact label="run" value={runIntent?.runId ?? "—"} mono /><Fact label="status" value={<StatusPill value={runIntent?.status} />} /><Fact label="kind" value={runIntent?.kind ?? "—"} /><Fact label="lease" value={runIntent?.leaseGeneration ?? "—"} mono /><Fact label="last advance" value={dateLabel(runIntent?.lastAdvanceAt)} /></div>{runIntent?.lastError && <p className="govReason govReason--bad">{runIntent.lastError}</p>}</div>
        </Section>

        <Section title="Attempts、Gates 与定向返工" kicker="节点级事实" empty={!attempts.length && !gates.length && !rework.length}>
          <div className="govTableWrap"><table className="govTable"><thead><tr><th>对象</th><th>状态</th><th>关联</th><th>结果 / 说明</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.attemptId}><td><strong>attempt {attempt.ordinal}</strong><small className="mono">{attempt.attemptId}</small></td><td><StatusPill value={attempt.status} /></td><td className="mono">{attempt.nodeId}</td><td>{attempt.error ?? `output ${shortDigest(attempt.outputDigest)}`}</td></tr>)}{gates.map((gate) => <tr key={gate.gateId}><td><strong>gate {gate.gateId}</strong><small>{gate.gateType}</small></td><td><StatusPill value={gate.outcome} tone={gate.outcome === "pass" ? "ok" : gate.outcome === "fail" ? "fail" : "warn"} /></td><td className="mono">{gate.nodeId} · {gate.attemptId}</td><td>{gate.failureCode ?? gate.evidenceRef}</td></tr>)}{rework.map((item) => <tr key={item.reworkId}><td><strong>rework</strong><small className="mono">{item.reworkId}</small></td><td><StatusPill value={item.status ?? "open"} tone="warn" /></td><td className="mono">{item.fromNodeId ?? "—"} → {item.targetNodeId ?? "—"}</td><td>{item.reason}</td></tr>)}</tbody></table></div>
          <div className="govSummary"><span>accepted attempts <b>{acceptedAttempts.length}</b></span><span>返工 <b>{rework.length}</b></span></div>
        </Section>

        <Section title="审批事实" kicker="人工检查层" empty={!approvals || (!approvals.nodeApprovals.length && !approvals.gitOperationConfirmations.length)}>
          <div className="govApprovalGrid">{approvals?.nodeApprovals.map((approval) => <article key={approval.approvalId} className="govMiniCard"><strong>NodeApproval · {approval.nodeId}</strong><StatusPill value={approval.decision} tone={approval.decision === "approved" ? "ok" : "fail"} /><span>{approval.actor} · {approvalDate(approval)}</span><code>{shortDigest(approval.inputDigest)}</code></article>)}{approvals?.gitOperationConfirmations.map((confirmation) => <article key={confirmation.confirmationId} className="govMiniCard"><strong>GitOperationConfirmation</strong><StatusPill value={confirmation.decision} tone={confirmation.decision === "confirmed" ? "ok" : confirmation.decision === "unknown" ? "warn" : "fail"} /><span>{confirmation.actor ?? "—"} · {approvalDate(confirmation)}</span><code>{shortDigest(confirmation.operationId)}</code></article>)}</div><p className="govHint">待处理审批 {pendingApprovals} 项；审批事实由 API 返回，不从浏览器状态推导。</p>
        </Section>

        <Section title="Evidence Matrix" kicker="证据链" empty={!evidenceMatrix}>
          {evidenceMatrix && <><div className="govFacts"><Fact label="matrix" value={evidenceMatrix.matrixId} mono /><Fact label="workSpec" value={shortDigest(evidenceMatrix.workSpecDigest)} mono /><Fact label="generated" value={dateLabel(evidenceMatrix.generatedAt)} /></div><div className="govEvidence">{currentEvidence.map((row) => <article key={row.criterionId} data-outcome={row.outcome}><strong>{row.criterionId}</strong><StatusPill value={row.outcome} /><span>{row.evidenceRefs.length} evidence refs</span><code>{row.evidenceRefs.join(" · ") || "—"}</code></article>)}</div></>}
        </Section>

        <Section title="SCM 对账" kicker="受控连接层" empty={!scmOperations.length}>
          <div className="govEvidence">{scmOperations.map((operation) => <article key={operation.operationId} data-outcome={operation.status === "committed" ? "pass" : operation.status === "unknown" ? "warn" : operation.status === "failed" ? "fail" : "pending"}><strong>{operation.operationId}</strong><StatusPill value={operation.status} tone={operation.status === "committed" ? "ok" : operation.status === "unknown" ? "warn" : undefined} /><span>{operation.sourceRevision} → {operation.remoteRevision ?? "远端未确认"}</span><code>{operation.reconcileQueryRef ?? operation.changeSet.digest}</code></article>)}</div><p className="govHint">{unresolvedOperations ? `${unresolvedOperations} 项需要 reconcile；禁止重放未知写操作。` : "没有未对账 SCM 操作。"}</p>
        </Section>

        <Section title="Trusted Delivery" kicker="最终可信交付" empty={!trustedDelivery}>
          {trustedDelivery && <div className="govCard"><div className="govFacts"><Fact label="task" value={trustedDelivery.taskId} mono /><Fact label="contract" value={trustedDelivery.contractVersion} /><Fact label="accepted attempts" value={trustedDelivery.acceptedAttempts.length} /><Fact label="deliverables" value={trustedDelivery.deliverables.length} /><Fact label="evidence refs" value={trustedDelivery.evidenceRefs.length} /><Fact label="generated" value={dateLabel(trustedDelivery.generatedAt)} /></div><div className="govDelivery__digests"><span>WorkSpec <code>{shortDigest(trustedDelivery.workSpecDigest)}</code></span><span>Proposal <code>{shortDigest(trustedDelivery.proposalDigest)}</code></span><span>Plan <code>{shortDigest(trustedDelivery.planDigest)}</code></span></div><p className="govHint">Trusted Delivery 仅展示已接受 attempt、门禁、交付物、SCM 操作和证据引用的服务端汇总。</p></div>}
        </Section>
      </div>
    </main>
  );
}
