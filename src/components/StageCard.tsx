/* 阶段卡片：把单个节点的真实结构化交付物渲染成「可逐条验收」的记录。
   纯展示 + 受控组件：展开状态由 App.tsx 持有，本组件不持有任何状态。
   数据契约见 src/api/stageModel.ts 的 StageCardModel（冻结）；
   字段缺失即整段省略，绝不补造内容，也绝不把对象渲染成 [object Object]。 */
import { Icon } from "./Icons";
import type { StageCardModel, StageStatus } from "../api/stageModel";

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

export function StageCard({
  card,
  open,
  onToggle,
}: {
  card: StageCardModel;
  open: boolean;
  onToggle: () => void;
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
                <span className="evRef mono" key={safeText(ref) + "-" + String(i)}>
                  {safeText(ref)}
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
