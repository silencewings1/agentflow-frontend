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
  design: "方案设计",
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
