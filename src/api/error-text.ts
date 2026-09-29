/**
 * AF 错误码 → 面向用户的中文说明。
 *
 * 为什么需要这一层：AF API 的 `error.message` 是**面向调用方与运维的工程文案**
 * （英文、含步骤名与内部约束），而界面把它拼进 toast 直接展示给用户，于是用户
 * 会看到「Git node is not approvable yet: no committed remote operation matches
 * the prepared change set.」这类句子；早期版本甚至内嵌 `{taskId}` 那样不会替换的
 * 模板占位符。
 *
 * 契约取向（与 af-api 的分工）：后端 message 保持工程口径——英文、精确、便于
 * 程序判断与运维对照日志；**界面语言由前端负责**。这与其它界面文案（toast 的
 * title 全为中文）一致，也避免为 44 个错误码在服务端维护两套文案。
 *
 * 完整性约束：`ERROR_CODE_TEXT` 覆盖 af-api `errors.ts` 里 `AF_ERROR_CODES` 的
 * 全部成员，并额外包含前端本地产生的错误码。新增后端错误码时应同步补齐
 * （`KNOWN_BACKEND_CODES` 记录了编写时的全集，便于核对）。
 */

/** AF API 的冻结错误码全集（来源：packages/af/af-api/src/errors.ts）。 */
export const KNOWN_BACKEND_CODES = [
  "AF_INVALID_REQUEST",
  "AF_WORKFLOW_INVALID",
  "AF_WORKFLOW_FROZEN",
  "AF_TASK_NOT_FOUND",
  "AF_TASK_NOT_RUNNABLE",
  "AF_REVISION_CONFLICT",
  "AF_LEASE_UNAVAILABLE",
  "AF_GATE_UNAVAILABLE",
  "AF_OPERATION_CONFIRMATION_REQUIRED",
  "AF_OPERATION_UNKNOWN",
  "AF_OPERATION_FORBIDDEN",
  "AF_OPERATION_NOT_FOUND",
  "AF_CREDENTIAL_REF_INVALID",
  "AF_SCM_PROVIDER_UNSUPPORTED",
  "AF_SCM_CAPABILITY_UNAVAILABLE",
  "AF_SCM_BASE_REVISION_CONFLICT",
  "AF_MCP_UNAVAILABLE",
  "AF_MCP_PROTOCOL_ERROR",
  "AF_ROUTE_NOT_FOUND",
  "AF_WORKSPEC_INVALID",
  "AF_WORKSPEC_FROZEN",
  "AF_PROPOSAL_INVALID",
  "AF_PROPOSAL_STALE",
  "AF_PROPOSAL_SUPERSEDED",
  "AF_COMPILATION_REJECTED",
  "AF_PLAN_NOT_FOUND",
  "AF_PLAN_NOT_READY",
  "AF_PLAN_DECISION_CONFLICT",
  "AF_SUPERVISOR_UNAVAILABLE",
  "AF_SUPERVISOR_REJECTED",
  "AF_RUN_INTENT_NOT_FOUND",
  "AF_RUN_INTENT_CONFLICT",
  "AF_RUN_INTENT_NOT_RUNNABLE",
  "AF_CRITERION_UNSATISFIED",
  "AF_CRITERION_UNAVAILABLE",
  "AF_EVIDENCE_REF_INVALID",
  "AF_NODE_APPROVAL_REQUIRED",
  "AF_NODE_APPROVAL_NOT_REQUIRED",
  "AF_NODE_ALREADY_APPROVED",
  "AF_GIT_CONFIRMATION_REQUIRED",
  "AF_BUDGET_EXCEEDED",
  "AF_CAPABILITY_UNREGISTERED",
  "AF_WORKSPACE_WRITE_CONFLICT",
  "AF_INTERNAL",
] as const;

/** 已登记错误码的中文说明。键为 AF API 的冻结错误码或前端本地码。 */
export const ERROR_CODE_TEXT: Record<string, string> = {
  // —— 请求与工作流 ——
  AF_INVALID_REQUEST: "请求参数不合法，请检查填写内容。",
  AF_WORKFLOW_INVALID: "工作流定义无效，无法使用。",
  AF_WORKFLOW_FROZEN: "该工作流已冻结，不能再修改。",
  AF_ROUTE_NOT_FOUND: "请求的接口不存在，可能是前后端版本不匹配。",

  // —— 任务与推进 ——
  AF_TASK_NOT_FOUND: "找不到该任务，可能已被删除。",
  AF_TASK_NOT_RUNNABLE:
    "当前任务不可推进：缺少已批准的计划。请先完成治理链——生成 Proposal、运行 Compiler、批准 Plan，再启动运行。",
  AF_REVISION_CONFLICT: "该任务已被其他操作更新，请刷新后重试。",
  AF_LEASE_UNAVAILABLE: "该任务正被另一个运行实例持有，请稍后重试。",
  AF_GATE_UNAVAILABLE: "门禁暂时不可用，无法继续推进。",
  AF_BUDGET_EXCEEDED: "超出该任务的预算上限（节点数、耗时或重试次数）。",
  AF_WORKSPACE_WRITE_CONFLICT: "工作区写入冲突，可能存在并发修改。",

  // —— WorkSpec / Proposal / Plan ——
  AF_WORKSPEC_INVALID: "工作规格不合法，无法冻结。",
  AF_WORKSPEC_FROZEN: "工作规格已冻结，不能再修改。",
  AF_PROPOSAL_INVALID: "Proposal 不合法，无法提交。",
  AF_PROPOSAL_STALE: "Proposal 已过期，请重新生成。",
  AF_PROPOSAL_SUPERSEDED: "Proposal 已被更新版本取代，请使用最新的一份。",
  AF_COMPILATION_REJECTED: "编译被拒绝，请查看编译报告中的原因。",
  AF_PLAN_NOT_FOUND: "找不到该计划。",
  AF_PLAN_NOT_READY: "计划尚未就绪，请先完成编译。",
  AF_PLAN_DECISION_CONFLICT: "计划审批状态冲突，请刷新后重试。",

  // —— 运行意图 ——
  AF_RUN_INTENT_NOT_FOUND: "找不到该运行记录。",
  AF_RUN_INTENT_CONFLICT: "运行状态冲突，请刷新后重试。",
  AF_RUN_INTENT_NOT_RUNNABLE:
    "当前任务不可推进：缺少已批准的计划。请先完成治理链——生成 Proposal、运行 Compiler、批准 Plan，再启动运行。",

  // —— 审批与人工检查点 ——
  AF_NODE_APPROVAL_REQUIRED: "该节点需要人工批准后才能继续。",
  AF_NODE_APPROVAL_NOT_REQUIRED: "该节点不需要人工批准。",
  AF_NODE_ALREADY_APPROVED: "该节点已批准过，无需重复批准。",
  AF_GIT_CONFIRMATION_REQUIRED:
    "该 Git 节点还不能批准：尚未产生对应的已提交远端操作。请依次完成变更集准备、Git 操作的计划与确认（确认时才真正写入远端）、再对账。",
  AF_OPERATION_CONFIRMATION_REQUIRED: "该 Git 操作等待人工确认，请先在确认界面确认。",
  AF_OPERATION_FORBIDDEN: "该操作被策略拒绝：分支限制或权限不足。",
  AF_OPERATION_UNKNOWN: "未知的 Git 操作。",
  AF_OPERATION_NOT_FOUND: "找不到该 Git 操作。",

  // —— 验收与证据 ——
  AF_CRITERION_UNSATISFIED: "验收判据尚未满足，无法交付。",
  AF_CRITERION_UNAVAILABLE: "验收判据暂时不可用。",
  AF_EVIDENCE_REF_INVALID: "证据引用不合法。",

  // —— SCM / MCP / 凭据 ——
  AF_SCM_PROVIDER_UNSUPPORTED: "不支持该 Git 提供方。",
  AF_SCM_CAPABILITY_UNAVAILABLE: "Git 提供方缺少所需能力，无法执行该操作。",
  AF_SCM_BASE_REVISION_CONFLICT: "远端基线与本地记录不一致，请先同步。",
  AF_CREDENTIAL_REF_INVALID: "凭据引用无效或未配置，请在「连接层」检查凭据设置。",
  AF_MCP_UNAVAILABLE: "外部 Git 服务（MCP）当前不可用，请稍后重试。",
  AF_MCP_PROTOCOL_ERROR: "与外部 Git 服务通信出错，请稍后重试。",
  AF_CAPABILITY_UNREGISTERED: "该能力未注册，无法使用。",

  // —— 监督与内部 ——
  AF_SUPERVISOR_UNAVAILABLE: "监督器当前不可用。",
  AF_SUPERVISOR_REJECTED: "监督器拒绝了该操作。",
  AF_INTERNAL: "服务内部错误，请稍后重试；若持续出现请携带错误码报障。",

  // —— 前端本地错误码（不在后端 errors.ts 内）——
  AF_NETWORK_ERROR: "无法连接 AF API，请确认后端已启动并检查网络。",
  AF_CLIENT_RESPONSE_INVALID: "服务端返回了无法解析的内容，可能是前后端版本不匹配。",
  AF_UNSUPPORTED_IN_FIXTURE:
    "演示模式（fixture）没有服务端设置与凭据库，无法真正保存。请配置 VITE_AF_API_BASE_URL 连接真实 AF API 后再操作。",
};

/**
 * 取某个错误码的用户可读文案。
 *
 * @param code AF 错误码；未登记或为空时返回 undefined，交由 `describeError` 回退。
 */
export function errorCodeText(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return ERROR_CODE_TEXT[code];
}

/**
 * 只返回「面向用户的说明文本」，**不含错误码前缀**。
 *
 * 用于那些自己渲染错误码的展示点（如 RuntimeConsole 的 `{code} · {message}`、
 * StageCard 的 text/sub 两段式）。若这里也带前缀，会变成 `CODE · CODE · 说明`。
 *
 * 未登记的码给出中文兜底并附上后端原文——既不把英文技术句直接甩给用户，也不丢
 * 掉报障时对照日志所需的信息。
 */
export function errorText(code: string | undefined, backendMessage?: string): string {
  const label = code ?? "AF_CLIENT_RESPONSE_INVALID";
  const text = errorCodeText(label);
  if (text) return text;
  const detail = backendMessage ? `（原始信息：${backendMessage}）` : "";
  return `出现了未登记的错误${detail}`;
}

/**
 * 组合出「错误码 · 中文说明」的一行文案，供不单独渲染错误码的场景使用（toast 的 body）。
 *
 * 需要在同一行里同时给出「是哪个码」与「人话说明」，便于用户报障时报出错误码。
 * **不要**把它塞进那些会另行渲染 code 的字段，否则前缀重复。
 */
export function describeError(code: string | undefined, backendMessage?: string): string {
  const label = code ?? "AF_CLIENT_RESPONSE_INVALID";
  return `${label} · ${errorText(code, backendMessage)}`;
}

/**
 * DAG / WorkSpec 校验 issue（`WorkflowValidationIssueDto`）的 code → 中文说明。
 *
 * 与上面的 AF 错误码是**不同类别**：那些是 API 调用失败的错误码，这些是校验收敛后
 * 的结构化问题清单（带 `path` 指向具体字段）。但它们同样会被界面直接展示
 * （`Workflow.tsx` 的校验面板、`NewTask.tsx` 的 toast），而后端 message 是英文
 * （如 `criterionId must be unique`），因此需要同一层转换。
 *
 * 来源：packages/af/af-contract 与 af-api 的校验器 code 全集。
 */
export const VALIDATION_CODE_TEXT: Record<string, string> = {
  // —— Workflow 结构 ——
  WORKFLOW_SCHEMA_INVALID: "工作流结构不符合 schema。",
  WORKFLOW_INVALID_NODE: "存在不合法的节点定义。",
  WORKFLOW_INVALID_EDGE: "存在不合法的连线。",
  WORKFLOW_DUPLICATE_NODE: "节点 ID 重复。",
  WORKFLOW_DUPLICATE_EDGE: "连线重复。",
  WORKFLOW_DUPLICATE_INPUT_REF: "输入引用重复。",
  WORKFLOW_INVALID_INPUT_REF: "输入引用不合法。",
  WORKFLOW_INVALID_ENTRY: "入口节点不合法：工作流必须有且仅有一个入口。",
  WORKFLOW_INVALID_EXIT: "出口节点不合法：工作流必须有且仅有一个出口。",
  WORKFLOW_UNCLOSED_EXIT: "出口未闭合：出口节点不能有后继。",
  WORKFLOW_CYCLE: "存在环：工作流必须是有向无环图。",
  WORKFLOW_ISOLATED_NODE: "存在孤立节点：既不连入口也不连出口。",
  WORKFLOW_UNREACHABLE_NODE: "存在从入口不可达的节点。",
  WORKFLOW_UNMERGEABLE_BRANCH: "分支无法汇合：并行分支必须在同一节点合并。",
  WORKFLOW_MULTIPLE_FAIL_EDGES: "一个节点有多条失败回退边，回退目标不唯一。",
  WORKFLOW_FROZEN: "该工作流已冻结，不能再修改。",
  WORKFLOW_DIGEST_MISMATCH: "工作流摘要与冻结记录不一致。",

  // —— WorkSpec 契约 ——
  WORKSPEC_SCHEMA_INVALID: "任务契约结构不符合 schema。",
  WORKSPEC_CRITERION_DUPLICATE: "验收判据 ID 重复，必须唯一。",
  WORKSPEC_CRITERION_UNKNOWN: "引用了未定义的验收判据。",
  WORKSPEC_REQUIRED_CRITERION_INCOMPLETE: "必填判据缺少验证器、预期结果或证据策略。",
  WORKSPEC_DELIVERABLE_DUPLICATE: "交付物 ID 重复，必须唯一。",
  WORKSPEC_DIGEST_MISMATCH: "任务契约摘要与冻结记录不一致。",
  WORKSPEC_SCOPE_CONFLICT: "改动范围存在冲突（同一路径既允许又禁止）。",

  // —— 并发 ——
  DAG_CAS_STALE: "工作流已被其他修改更新，请刷新后重试。",
};

/**
 * 取校验 issue 的用户可读文案。
 *
 * issue 的 message 常含字段级细节（如「criterionId must be unique」说明了是哪个
 * 字段），因此未登记 code 时保留原文，不静默丢弃。
 */
export function validationCodeText(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return VALIDATION_CODE_TEXT[code];
}

/**
 * 组合校验 issue 的展示文案：`code · 中文说明`。
 *
 * 未登记的 code 回退到后端原文——校验信息用于修正配置，丢掉细节反而让人无从下手。
 */
export function describeValidationIssue(code: string | undefined, backendMessage?: string): string {
  const label = code ?? "WORKFLOW_SCHEMA_INVALID";
  const text = validationCodeText(label);
  if (text) return `${label} · ${text}`;
  return backendMessage ? `${label} · ${backendMessage}` : label;
}
