/* 阶段卡片：把单个节点的真实结构化交付物渲染成「可逐条验收」的记录。
   纯展示 + 受控组件：展开状态由 App.tsx 持有，本组件不持有任何跨组件状态。
   数据契约见 src/api/stageModel.ts 的 StageCardModel（冻结，attemptId 为阶段 B2 可选增补）；
   字段缺失即整段省略，绝不补造内容，也绝不把对象渲染成 [object Object]。

   执行过程（阶段 B2）：把模型在该节点里的真实活动（推理文本、工具调用/结果、
   节点输入、token 用量）如实呈现。它是**只读诊断**，不是治理事实——界面上
   必须与门禁/交付物结论在视觉与文案上分开，绝不因轨迹内容暗示门禁通过。 */
import { useState } from "react";
import { Icon } from "./Icons";
import type { StageCardModel, StageStatus } from "../api/stageModel";
import type { AttemptTraceDto, SkillOutputDto, SkillOutputUnavailableReason, TraceEventDto, TraceUnavailableReason } from "../api/types";

/** 执行诊断的受控展示态；由 App.tsx 持有并下传（组件内不存跨组件状态）。 */
export interface StageTraceView {
  status: "idle" | "loading" | "ready" | "error";
  trace: AttemptTraceDto | null;
  error: { code: string; message: string } | null;
  /** 当前节点是否正在运行并被实时跟随（决定文案与是否提示「不再刷新」）。 */
  live: boolean;
}

/** Skill 逐条用例的受控展示态；与 StageTraceView 同构，由 App.tsx 持有。 */
export interface StageSkillOutputView {
  status: "idle" | "loading" | "ready" | "error";
  output: SkillOutputDto | null;
  error: { code: string; message: string } | null;
}

/* 只接受标量文本：结构化数据里可能混入对象/数组，直接渲染会得到 [object Object] */
function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

/* stageMapper 允许省略可选字段，运行时数组可能缺失；统一收口成空数组 */
function listOf<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/* 节点状态 → govPill 语气：状态是结论，颜色只是辅助，文字必须自解释 */
function statusTone(status: StageStatus): string {
  switch (status) {
    case "accepted": return "pass";
    case "rejected": return "rejected";
    case "blocked": return "blocked_unavailable";
    case "running": return "running";
    default: return "pending";
  }
}

function statusLabel(status: StageStatus): string {
  switch (status) {
    case "accepted": return "已验收";
    case "rejected": return "已拒绝";
    case "blocked": return "不可用";
    case "running": return "进行中";
    default: return "待执行";
  }
}

/* 门禁/验收结论 → 语气。未知结论归入「需要注意」，不伪装成通过 */
function passFailTone(value: string): string {
  const v = value.toLowerCase();
  if (v === "pass" || v === "passed" || v === "ok" || v === "accepted") return "pass";
  if (v === "fail" || v === "failed" || v === "rejected") return "fail";
  if (v === "blocked" || v === "blocked_unavailable" || v === "unavailable") return "blocked_unavailable";
  return "warn";
}

/* blocker / critical / high 是阻塞项；medium / moderate 是警示；其余中性 */
function severityTone(severity: string): "blocking" | "warn" | "neutral" {
  const v = severity.toLowerCase();
  if (v === "blocker" || v === "critical" || v === "high") return "blocking";
  if (v === "medium" || v === "moderate") return "warn";
  return "neutral";
}

function actionTone(action: string): string {
  const v = action.toLowerCase();
  if (v === "added" || v === "add" || v === "created" || v === "create") return "pass";
  if (v === "deleted" || v === "delete" || v === "removed" || v === "remove") return "fail";
  return "mode";
}

/* 文件级列表只给短摘要，行级 diff 属于右侧检查面板的职责 */
function shortDigest(digest: string): string {
  const value = safeText(digest);
  return value.length > 12 ? value.slice(0, 12) : value;
}

function outcomeTone(outcome: string): string {
  const v = outcome.toLowerCase();
  if (v === "pass") return "pass";
  if (v === "fail") return "fail";
  if (v === "unavailable") return "blocked_unavailable";
  return "pending";
}

/* --------------------------- 执行过程诊断 ------------------------------- */

/* 不可用原因是后端枚举，这里给出中文说明 + 后果。未知原因也如实呈现，不吞掉。 */
function unavailableReasonLabel(reason: TraceUnavailableReason | null): string {
  switch (reason) {
    case "session-id-missing": return "该节点尚未记录执行会话";
    case "session-log-not-found": return "未找到该节点的执行记录";
    case "session-query-unavailable": return "当前服务未提供执行记录查询能力";
    case "session-read-failed": return "执行记录读取失败";
    default: return "原因未声明";
  }
}

/* 逐条用例不可用原因：与后端枚举一一对应，说明「为什么看不到」以及后果。 */
function skillOutputReasonLabel(reason: SkillOutputUnavailableReason | null): string {
  switch (reason) {
    case "skill-ref-missing": return "该节点不是 Skill 执行节点";
    case "evidence-ref-missing": return "该节点未记录证据引用";
    case "evidence-not-found": return "证据内容已不可读取";
    case "evidence-read-failed": return "证据内容读取失败";
    case "output-unparseable": return "该次输出中没有可识别的用例";
    default: return "原因未声明";
  }
}

function caseStatusLabel(status: "pass" | "fail" | "skipped"): string {
  switch (status) {
    case "pass": return "通过";
    case "fail": return "失败";
    case "skipped": return "跳过";
  }
}

/* 单条用例耗时：null 表示测试框架未上报，不补 0（0ms 与「未知」含义不同）。 */
function caseDuration(value: number | null): string {
  if (value === null) return "";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${value < 1 ? value.toFixed(3) : value.toFixed(1)} ms`;
}

/* 逐条用例段：只在卡片展开时渲染。默认展开——这正是本功能要暴露的过程事实，
   与「执行过程」的诊断轨迹不同，它是可逐条核验的测试结论。 */
function SkillCasesSection({ view }: { view: StageSkillOutputView | undefined }) {
  if (view === undefined) return null;

  const { status, output, error } = view;
  const cases = output?.cases ?? [];
  const summary = output?.summary ?? null;
  const available = output !== null && output.available;

  const meta = (() => {
    if (status === "loading" && output === null) return "正在读取…";
    if (status === "error") return "读取失败";
    if (output === null) return "暂无数据";
    if (!output.available) return "不可用";
    return `${cases.length} 条用例`;
  })();

  const honestState = status === "loading" && output === null
    ? { tone: "loading", text: "正在读取逐条用例…", sub: "" }
    : status === "error"
      ? { tone: "error", text: `逐条用例读取失败 · ${error?.code ?? "AF_NETWORK_ERROR"}`, sub: `${error?.message ?? "无法连接 AF API"}；这是诊断通道的问题，不影响节点事实与门禁结论。` }
      : output !== null && !output.available
        ? { tone: "unavailable", text: `逐条用例不可用 · ${skillOutputReasonLabel(output.unavailableReason)}`, sub: "无法展示该次执行的逐条测试；节点的状态与门禁结论仍以上方事实为准。" }
        : null;

  return (
    <section className="stage__section stage__cases" data-state={status}>
      <div className="stage__traceHead">
        <h4 className="kicker stage__label">测试用例</h4>
        <span className="govPill stage__traceKind" data-tone="mode">诊断</span>
        {summary !== null && available && (
          <span className="stage__casesSummary mono">
            {summary.pass !== null && <><span className="stage__traceUsageLabel">通过</span><span className="stage__traceUsageValue">{summary.pass}</span></>}
            {summary.fail !== null && <><span className="stage__traceUsageLabel">失败</span><span className="stage__traceUsageValue">{summary.fail}</span></>}
            {summary.skipped !== null && <><span className="stage__traceUsageLabel">跳过</span><span className="stage__traceUsageValue">{summary.skipped}</span></>}
            {summary.durationMs !== null && <><span className="stage__traceUsageLabel">耗时</span><span className="stage__traceUsageValue">{caseDuration(summary.durationMs)}</span></>}
          </span>
        )}
        {output?.truncated === true && (
          <span className="govPill stage__traceTruncated" data-tone="warn">截断</span>
        )}
        <span className="stage__traceMeta mono">{meta}</span>
      </div>

      {honestState !== null && (
        <div className="stage__traceState" data-tone={honestState.tone}>
          <p>{honestState.text}</p>
          {honestState.sub.length > 0 && <p className="stage__traceStateSub">{honestState.sub}</p>}
        </div>
      )}

      {available && cases.length > 0 && (
        <ol className="stage__caseList">
          {cases.map((item, index) => (
            <li className="stage__caseItem" data-status={item.status} key={`${item.name}-${String(index)}`}>
              <span className="stage__caseMark" aria-hidden>{item.status === "pass" ? "✔" : item.status === "fail" ? "✖" : "﹣"}</span>
              <span className="stage__caseName">{item.name}</span>
              <span className="govPill stage__casePill" data-tone={item.status === "pass" ? "pass" : item.status === "fail" ? "fail" : "neutral"}>{caseStatusLabel(item.status)}</span>
              {item.durationMs !== null && <span className="mono stage__caseMs">{caseDuration(item.durationMs)}</span>}
            </li>
          ))}
        </ol>
      )}

      {available && cases.length === 0 && (
        <p className="stage__traceHint">该次输出没有逐条用例；汇总数字仍以上方为准。</p>
      )}
    </section>
  );
}

/* 诊断事件的语义标签与语气；颜色只是辅助，文字必须自解释 */
function traceEventMeta(event: TraceEventDto): { label: string; tone: string } {
  switch (event.type) {
    case "assistant-text": return { label: "模型输出", tone: "model" };
    case "tool-call": return { label: "工具调用", tone: "call" };
    case "tool-result": return { label: event.isError ? "工具结果 · 失败" : "工具结果", tone: event.isError ? "error" : "result" };
    case "user-message": return { label: "节点输入", tone: "input" };
    case "step": return { label: `轮次 ${event.turn} · 步骤 ${event.step}`, tone: "step" };
  }
}

/* 一条诊断事件。tool-call / tool-result 用等宽体，失败结果加左色条。 */
function TraceEventRow({ event }: { event: TraceEventDto }) {
  const [inputOpen, setInputOpen] = useState(false);
  const meta = traceEventMeta(event);

  if (event.type === "step") {
    return (
      <li className="stage__traceStep" data-type="step">
        <span className="stage__traceStepRule" aria-hidden />
        <span className="stage__traceStepLabel mono">{meta.label}</span>
        <span className="stage__traceStepRule" aria-hidden />
      </li>
    );
  }

  if (event.type === "user-message") {
    return (
      <li className="stage__traceItem" data-type="input">
        <div className="stage__traceItemHead">
          <span className="stage__traceTag" data-tone={meta.tone}>{meta.label}</span>
          <button
            type="button"
            className="stage__traceToggle"
            aria-expanded={inputOpen}
            onClick={() => setInputOpen((v) => !v)}
          >
            {inputOpen ? "收起节点输入" : "展开节点输入"}
          </button>
        </div>
        {inputOpen && <pre className="stage__traceMono">{event.preview}</pre>}
      </li>
    );
  }

  if (event.type === "assistant-text") {
    return (
      <li className="stage__traceItem" data-type="assistant">
        <div className="stage__traceItemHead">
          <span className="stage__traceTag" data-tone={meta.tone}>{meta.label}</span>
        </div>
        <p className="stage__traceProse">{event.text}</p>
      </li>
    );
  }

  if (event.type === "tool-call") {
    return (
      <li className="stage__traceItem" data-type="call">
        <div className="stage__traceItemHead">
          <span className="stage__traceTag" data-tone={meta.tone}>{meta.label}</span>
          {event.name.length > 0 && <span className="mono stage__traceToolName">{event.name}</span>}
        </div>
        {event.argumentsPreview.length > 0 && (
          <pre className="stage__traceMono">{event.argumentsPreview}</pre>
        )}
      </li>
    );
  }

  return (
    <li className="stage__traceItem" data-type="result" data-error={event.isError}>
      <div className="stage__traceItemHead">
        <span className="stage__traceTag" data-tone={meta.tone}>{meta.label}</span>
      </div>
      {event.preview.length > 0 && <pre className="stage__traceMono">{event.preview}</pre>}
    </li>
  );
}

/* 执行过程段：只在卡片展开时渲染；诊断自身可再折叠，避免长轨迹压垮卡片。
   默认展开策略：正在被实时跟随的节点默认展开（用户正想看它「现在在做什么」），
   已结束的节点默认收起（结论已由上方交付物承载，轨迹按需回看）。 */
function TraceSection({ traceView }: { traceView: StageTraceView | undefined }) {
  const [open, setOpen] = useState(() => traceView?.live === true);
  if (traceView === undefined) return null;

  const { status, trace, error, live } = traceView;
  const events = trace?.events ?? [];
  const usage = trace?.usage ?? null;
  const reason = unavailableReasonLabel(trace?.unavailableReason ?? null);

  /* 计数只统计真实事件；不含未渲染的未知类型 */
  const toolCalls = events.filter((event) => event.type === "tool-call").length;
  const assistantTexts = events.filter((event) => event.type === "assistant-text").length;

  const meta = (() => {
    if (status === "loading" && trace === null) return "正在读取…";
    if (status === "error") return "读取失败";
    if (trace === null) return "暂无数据";
    if (!trace.available) return "不可用";
    if (live) return `实时跟随 · ${events.length} 条`;
    return `${events.length} 条事件`;
  })();

  /* 诚实态（不可用 / 读取失败 / 空窗口）永远可见：折叠只作用于可能很长的
     事件列表，绝不把「拿不到诊断」这件事藏进折叠区。 */
  const hasEvents = trace !== null && trace.available && events.length > 0;
  const honestState = status === "loading" && trace === null
    ? { tone: "loading", text: "正在读取执行诊断…", sub: "" }
    : status === "error"
      ? { tone: "error", text: `执行诊断读取失败 · ${error?.code ?? "AF_NETWORK_ERROR"}`, sub: `${error?.message ?? "无法连接 AF API"}；这是诊断通道的问题，不影响节点事实与治理结论。` }
      : trace !== null && !trace.available
        ? { tone: "unavailable", text: `执行诊断不可用 · ${reason}`, sub: "无法展示模型在该节点内的真实活动；节点的交付物与门禁结论仍以下方事实为准。" }
        : trace !== null && trace.available && events.length === 0
          ? { tone: "empty", text: "诊断通道可用，但当前窗口内没有可展示的事件。", sub: "" }
          : null;

  return (
    <section className="stage__section stage__trace" data-live={live} data-state={status}>
      <div className="stage__traceHead">
        <h4 className="kicker stage__label">执行过程</h4>
        <span className="govPill stage__traceKind" data-tone="mode">诊断</span>
        {usage !== null && trace?.available === true && (
          <span className="stage__traceUsage mono" title="token 用量">
            <span className="stage__traceUsageLabel">输入</span>
            <span className="stage__traceUsageValue">{usage.inputTokens}</span>
            <span className="stage__traceUsageLabel">输出</span>
            <span className="stage__traceUsageValue">{usage.outputTokens}</span>
            <span className="stage__traceUsageLabel">缓存读</span>
            <span className="stage__traceUsageValue">{usage.cacheReadTokens}</span>
          </span>
        )}
        {trace?.truncated === true && (
          <span className="govPill stage__traceTruncated" data-tone="warn">截断</span>
        )}
        {live && <span className="stage__traceLive">实时跟随</span>}
        {hasEvents && (
          <button
            type="button"
            className="stage__traceToggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起执行过程" : `展开执行过程 · ${meta}`}
          </button>
        )}
      </div>

      {honestState !== null && (
        <div className="stage__traceState" data-tone={honestState.tone}>
          <p>{honestState.text}</p>
          {honestState.sub.length > 0 && <p className="stage__traceStateSub">{honestState.sub}</p>}
        </div>
      )}

      {hasEvents && !open && (
        <p className="stage__traceHint">
          模型在此节点内的真实活动（推理、工具调用与结果、token 用量）属于只读诊断，
          不构成门禁结论或交付物验收依据。
        </p>
      )}

      {hasEvents && open && (
        <div className="stage__traceBody">
          <p className="stage__traceMeta mono">
            {toolCalls} 次工具调用 · {assistantTexts} 段模型输出
            {trace.capturedThroughSeq === null ? "" : ` · 已同步至第 ${trace.capturedThroughSeq} 条`}
          </p>
          <ol className="stage__traceList">
            {events.map((event, index) => (
              <TraceEventRow event={event} key={`${event.type}-${String(event.seq)}-${String(index)}`} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export function StageCard({
  card,
  open,
  onToggle,
  trace,
  skillOutput,
}: {
  card: StageCardModel;
  open: boolean;
  onToggle: () => void;
  /** 执行诊断展示态（App.tsx 持有）；省略时整段不渲染。 */
  trace?: StageTraceView;
  /** Skill 逐条用例展示态（App.tsx 持有）；省略时整段不渲染。 */
  skillOutput?: StageSkillOutputView;
}) {
  const facts = listOf(card.facts);
  const lists = listOf(card.lists);
  const findings = listOf(card.findings);
  const diffFiles = listOf(card.diffFiles);
  const criteria = listOf(card.criteria);
  const evidenceRefs = listOf(card.evidenceRefs).filter((ref) => safeText(ref).length > 0);
  const summary = safeText(card.summary);
  const name = safeText(card.name);
  const role = safeText(card.role);
  const schemaVersion = safeText(card.schemaVersion);
  const gate = card.gate;
  const dimensions = gate === undefined ? [] : listOf(gate.dimensions);

  const hasBody =
    trace !== undefined ||
    summary.length > 0 ||
    facts.length > 0 ||
    lists.length > 0 ||
    findings.length > 0 ||
    gate !== undefined ||
    diffFiles.length > 0 ||
    criteria.length > 0 ||
    evidenceRefs.length > 0;

  return (
    <article className="card stage" data-open={open} data-status={card.status}>
      <button
        type="button"
        className="stage__head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="stage__seq mono">{safeText(card.index)}</span>
        {name.length > 0 && <span className="stage__name mono">{name}</span>}
        {role.length > 0 && <span className="govPill stage__role">{role}</span>}
        <span className="govPill stage__status" data-tone={statusTone(card.status)}>
          {statusLabel(card.status)}
        </span>
        {schemaVersion.length > 0 && (
          <span className="stage__schema mono">{schemaVersion}</span>
        )}
        {gate !== undefined && safeText(gate.outcome).length > 0 && (
          <span className="govPill stage__gateOutcome" data-tone={passFailTone(gate.outcome)}>
            {safeText(gate.outcome)}
          </span>
        )}
        <Icon.Chevron size={14} className="stage__chev" aria-hidden />
      </button>

      <div className="stage__body">
        <TraceSection traceView={trace} />
        <SkillCasesSection view={skillOutput} />

        {summary.length > 0 && (
          <section className="stage__section">
            <h4 className="kicker stage__label">摘要</h4>
            <p className="stage__summary">{summary}</p>
          </section>
        )}

        {facts.length > 0 && (
          <section className="stage__section">
            <h4 className="kicker stage__label">事实</h4>
            <dl className="stage__facts">
              {facts.map((fact, i) => (
                <div className="stage__fact" key={safeText(fact.label) + "-" + String(i)}>
                  <dt className="stage__factLabel">{safeText(fact.label)}</dt>
                  <dd className={fact.mono === true ? "mono stage__factValue" : "stage__factValue"}>
                    {safeText(fact.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {lists.map((list, i) => (
          <section className="stage__section" key={safeText(list.label) + "-" + String(i)}>
            <h4 className="kicker stage__label">{safeText(list.label)}</h4>
            <ul className="ctrCell__list stage__listItems">
              {listOf(list.items).map((item, j) => (
                <li key={String(j)}>{safeText(item)}</li>
              ))}
            </ul>
          </section>
        ))}

        {findings.length > 0 && (
          <section className="stage__section">
            <h4 className="kicker stage__label">发现项</h4>
            <ul className="stage__findings">
              {findings.map((finding, i) => (
                <li
                  className="stage__finding"
                  data-tone={severityTone(finding.severity)}
                  key={safeText(finding.id) + "-" + String(i)}
                >
                  <div className="stage__findingHead">
                    {safeText(finding.id).length > 0 && (
                      <span className="mono stage__findingId">{safeText(finding.id)}</span>
                    )}
                    {safeText(finding.severity).length > 0 && (
                      <span className="stage__findingSeverity">{safeText(finding.severity)}</span>
                    )}
                    {safeText(finding.path).length > 0 && (
                      <span className="mono stage__findingPath">{safeText(finding.path)}</span>
                    )}
                  </div>
                  {safeText(finding.description).length > 0 && (
                    <p className="stage__findingDesc">{safeText(finding.description)}</p>
                  )}
                  {safeText(finding.requiredAction).length > 0 && (
                    <p className="stage__findingAction">
                      需处理：{safeText(finding.requiredAction)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {gate !== undefined && (
          <section className="stage__section stage__gate">
            <h4 className="kicker stage__label">门禁</h4>
            <div className="stage__gateHead">
              <span className="govPill" data-tone={passFailTone(gate.outcome)}>
                {safeText(gate.outcome)}
              </span>
              {safeText(gate.gateId).length > 0 && (
                <span className="mono stage__gateId">{safeText(gate.gateId)}</span>
              )}
            </div>
            {dimensions.length > 0 && (
              <ul className="stage__gateDims">
                {dimensions.map((dim, i) => {
                  const passed = dim.passed === true;
                  return (
                    <li
                      className="stage__gateDim"
                      data-outcome={passed ? "pass" : "fail"}
                      key={safeText(dim.name) + "-" + String(i)}
                    >
                      <i className="stage__dimDot" />
                      <span className="stage__dimName">{safeText(dim.name)}</span>
                      {safeText(dim.note).length > 0 && (
                        <span className="mono stage__dimNote">{safeText(dim.note)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {diffFiles.length > 0 && (
          <section className="stage__section">
            <h4 className="kicker stage__label">变更文件</h4>
            <ul className="stage__files">
              {diffFiles.map((file, i) => (
                <li className="stage__file" key={safeText(file.path) + "-" + String(i)}>
                  <span className="mono stage__filePath">{safeText(file.path)}</span>
                  <span
                    className="govPill stage__fileAction"
                    data-tone={actionTone(file.action)}
                  >
                    {safeText(file.action)}
                  </span>
                  {shortDigest(file.contentDigest).length > 0 && (
                    <span className="mono stage__fileDigest">{shortDigest(file.contentDigest)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {criteria.length > 0 && (
          <section className="stage__section">
            <h4 className="kicker stage__label">逐条验收</h4>
            <ul className="stage__criteria">
              {criteria.map((item, i) => (
                <li
                  className="stage__criterion"
                  data-outcome={safeText(item.outcome)}
                  key={safeText(item.assessmentId) + "-" + String(i)}
                >
                  <div className="stage__criterionHead">
                    {safeText(item.criterionId).length > 0 && (
                      <span className="mono stage__criterionId">{safeText(item.criterionId)}</span>
                    )}
                    {safeText(item.outcome).length > 0 && (
                      <span
                        className="govPill"
                        data-tone={outcomeTone(safeText(item.outcome))}
                      >
                        {safeText(item.outcome)}
                      </span>
                    )}
                  </div>
                  {safeText(item.expected).length > 0 && (
                    <div className="stage__criterionField">
                      <span>期望</span>
                      <span>{safeText(item.expected)}</span>
                    </div>
                  )}
                  {safeText(item.actual).length > 0 && (
                    <div className="stage__criterionField">
                      <span>实测</span>
                      <span>{safeText(item.actual)}</span>
                    </div>
                  )}
                  {safeText(item.reason).length > 0 && (
                    <div className="stage__criterionField">
                      <span>原因</span>
                      <span>{safeText(item.reason)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {evidenceRefs.length > 0 && (
          <section className="stage__section">
            <h4 className="kicker stage__label">证据引用</h4>
            <div className="stage__evidence">
              {evidenceRefs.map((ref, i) => (
                /* 摘要只展示前 12 位：完整 sha256 在卡片里是噪音，需要核对时
                   可到右侧证据链面板查看原值。 */
                <span className="evRef mono" key={safeText(ref) + "-" + String(i)} title={safeText(ref)}>
                  {shortDigest(safeText(ref))}
                </span>
              ))}
            </div>
          </section>
        )}

        {!hasBody && (
          <p className="stage__empty">该节点暂无结构化交付物</p>
        )}
      </div>
    </article>
  );
}
