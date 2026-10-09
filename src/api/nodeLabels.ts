/**
 * 节点显示名投影（纯展示层）。
 *
 * AF API 只返回稳定的 `nodeId`（requirements / unit-tests 等内部标识），
 * 不返回展示文案（bootstrap 的 `presentation` 可能为 null）。界面不应把内部
 * 标识当标题给用户看，因此在这里集中映射为中文角色名。
 *
 * 这里只影响展示，不参与任何执行绑定：冻结工作流、门禁、证据引用仍以 nodeId 为准。
 * @module @agentflow/frontend/api/nodeLabels
 */

const NODE_DISPLAY_NAME: Record<string, string> = {
  requirements: "需求分析",
  "requirements-review": "需求评审",
  design: "方案设计",
  "design-review": "方案评审",
  implementation: "代码开发",
  "unit-tests": "单元测试",
  "integration-tests": "集成测试",
  "test-merge": "测试汇合门禁",
  review: "独立审查",
  "prepare-change-set": "准备变更集",
  "publish-via-mcp": "远端交付",
};

/** 未知节点不回退成英文 id，退化为带序号的通用名，避免把内部标识当标题。 */
export function nodeDisplayName(nodeId: string): string {
  return NODE_DISPLAY_NAME[nodeId] ?? `节点 ${nodeId}`;
}

/**
 * 编排显示名投影（纯展示层）。
 *
 * 与节点名同理，但缺口更隐蔽：`WorkflowDefinitionDto.presentation` 在契约里是
 * **可选**的，而 AF API **从不填它**（`workflowPresentationSchema.optional()`，
 * 后端全仓无赋值点）。于是 `mappers.ts` 的 `presentation?.name ?? dto.workflowId`
 * 恒走 fallback，界面上把内部 id 直接当编排名显示——实测真实后端下：
 * - 新建任务对话框的编排选项显示「standard-code-change 11 节点 · 4 门禁」
 * - 入口无权限时的拒绝理由写「在『standard-code-change』的入口责任位上没有执行权限」
 *
 * 而本地 fixture **填了** presentation（渲染成「标准代码变更」），所以这个缺口只在
 * 接真实后端时出现——设计演示里看不出问题，正是它长期留存的理由。
 *
 * 为什么在展示层补而不是让后端补发：`presentation` 不参与 `nodeSpecDigest`
 * （见 af-contract 的 buildCanonicalSpec，canonical 只含 nodes/edges/入口出口/
 * policyVersion），即它是**纯展示投影**、与冻结契约无关；后端也不持有这份文案
 * （全仓搜不到「标准代码变更」）。让后端凭空造一套展示文案，等于把展示层的事
 * 塞进契约层。此处与 `nodeLabels.ts` 的处理保持一致。
 *
 * 只影响展示，不参与任何执行绑定：冻结工作流、门禁、证据引用仍以 workflowId 为准。
 */
const WORKFLOW_DISPLAY_NAME: Record<string, string> = {
  "standard-code-change": "标准代码变更",
  /* fixture / 设计演示用的编排 id，与 data/workflows.ts 的展示名对齐。 */
  "wf-feature": "需求开发",
  "wf-unit": "单元测试",
  "wf-bugfix": "缺陷修复",
  "wf-legacy": "存量系统逆向重构",
  "wf-cve": "开源漏洞整改",
  "wf-review": "AI 代码审核",
  "wf-custom": "自定义编排",
};

/**
 * 编排显示名。**已知 id 优先**，其次才用后端给的 presentation.name。
 *
 * 顺序不能反：后端一旦开始发 presentation，那份文案与这里的可能不一致，
 * 而用户在有本地投影时应当看到与设计演示一致的名字；把已知 id 的文案
 * 放在唯一位置，保证"同一个编排在任何模式下同名"。
 */
export function workflowDisplayName(workflowId: string, presentationName?: string): string {
  return WORKFLOW_DISPLAY_NAME[workflowId] ?? presentationName ?? `编排 ${workflowId}`;
}
