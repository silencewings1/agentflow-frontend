/* ============================================================
   AGENTFLOW — 工作流编排（DAG）
   节点绑定智能体角色，边分为流转 / 失败回退 / 审批三类
   ============================================================ */

import type { IconName } from "../components/Icons";
import type { AgentRole } from "./settings";

export type EdgeKind = "flow" | "fail" | "approve";

export interface WfNode {
  id: string;
  name: string;
  role: AgentRole;
  col: number;
  lane: number;
  desc: string;
  gate?: string;
  approval?: boolean;
}

export interface WfEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  glyph: IconName;
  tint: "accent" | "cyan" | "sage" | "gold" | "plum" | "azure";
  builtin: boolean;
  summary: string;
  scene: string;
  nodes: WfNode[];
  edges: WfEdge[];
  maxRetry: number;
  onExhaust: "人工接管" | "降级处理" | "终止任务";
}

export const roleGlyph: Record<AgentRole, IconName> = {
  orchestrator: "Nodes",
  requirement: "Book",
  architecture: "Layers",
  development: "Pencil",
  testing: "Beaker",
  review: "Shield",
  delivery: "Cube",
  ops: "Terminal",
};

export const roleTint: Record<AgentRole, Workflow["tint"]> = {
  orchestrator: "accent",
  requirement: "azure",
  architecture: "cyan",
  development: "accent",
  testing: "sage",
  review: "gold",
  delivery: "plum",
  ops: "sage",
};

export const edgeKindLabel: Record<EdgeKind, string> = {
  flow: "流转",
  fail: "失败回退",
  approve: "人工审批",
};

/* ------------------------- 1. 需求开发（默认） ------------------------- */

const wfFeature: Workflow = {
  id: "wf-feature",
  name: "需求开发",
  glyph: "Book",
  tint: "azure",
  builtin: true,
  summary: "需求分析 → 代码开发 → 评审 → 交付，每级失败回退上一节点。",
  scene: "新增功能、需求变更、常规迭代交付",
  maxRetry: 3,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "需求分析",
      role: "requirement",
      col: 0,
      lane: 0,
      desc: "拆解需求语义与验收条件，标注事实、推断与待确认项。",
      gate: "需求可测试性",
      approval: true,
    },
    {
      id: "n2",
      name: "代码开发",
      role: "development",
      col: 1,
      lane: 0,
      desc: "在隔离分支实现需求，同步补齐单元测试。",
      gate: "编译与单元测试",
    },
    {
      id: "n3",
      name: "评审",
      role: "review",
      col: 2,
      lane: 0,
      desc: "独立核对实现与需求，检查安全、异常处理与影响范围。",
      gate: "无阻断与严重问题",
    },
    {
      id: "n4",
      name: "交付",
      role: "delivery",
      col: 3,
      lane: 0,
      desc: "汇总变更说明、测试报告与回滚方案，提交责任人验收。",
      gate: "证据链完整",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "e3", from: "n3", to: "n4", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "需求不明" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "实现问题" },
    { id: "f3", from: "n4", to: "n3", kind: "fail", label: "证据不足" },
  ],
};

/* ------------------------- 2. 单元测试（默认） ------------------------- */

const wfUnit: Workflow = {
  id: "wf-unit",
  name: "单元测试",
  glyph: "Beaker",
  tint: "sage",
  builtin: true,
  summary: "单元测试代码开发 → 评审 → 交付，每级失败回退上一节点。",
  scene: "测试补充、覆盖率提升、历史模块补测",
  maxRetry: 3,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "单元测试开发",
      role: "testing",
      col: 0,
      lane: 0,
      desc: "按已确认需求编写用例，保留预期失败记录后再补实现。",
      gate: "覆盖率阈值",
    },
    {
      id: "n2",
      name: "评审",
      role: "review",
      col: 1,
      lane: 0,
      desc: "检查用例是否覆盖主要业务规则与边界，核查断言有效性。",
      gate: "断言有效性",
    },
    {
      id: "n3",
      name: "交付",
      role: "delivery",
      col: 2,
      lane: 0,
      desc: "提交测试资产与覆盖率报告，纳入回归基线。",
      gate: "证据链完整",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "覆盖不足" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "复核未过" },
  ],
};

/* --------------------------- 3. 缺陷修复 ------------------------------- */

const wfBugfix: Workflow = {
  id: "wf-bugfix",
  name: "缺陷修复",
  glyph: "Bolt",
  tint: "gold",
  builtin: true,
  summary: "先复现再定位，修复后回归验证，失败按原因定向回退。",
  scene: "线上缺陷、CI 偶发失败、生产问题处置",
  maxRetry: 3,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "缺陷复现",
      role: "testing",
      col: 0,
      lane: 0,
      desc: "补一条能稳定复现问题的测试，作为修复的验证标准。",
      gate: "可复现用例",
    },
    {
      id: "n2",
      name: "根因定位",
      role: "architecture",
      col: 1,
      lane: 0,
      desc: "沿调用链定位根因，判断影响范围与兼容性风险。",
    },
    {
      id: "n3",
      name: "修复实现",
      role: "development",
      col: 2,
      lane: 0,
      desc: "以最小改动修复，保持既有契约不变。",
      gate: "复现用例转通过",
    },
    {
      id: "n4",
      name: "回归验证",
      role: "testing",
      col: 3,
      lane: 0,
      desc: "运行受影响模块的回归测试与关键业务流程。",
      gate: "回归全绿",
    },
    {
      id: "n5",
      name: "评审交付",
      role: "review",
      col: 4,
      lane: 0,
      desc: "审查修复方式与副作用，汇总证据链提交合并。",
      gate: "无阻断问题",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "e3", from: "n3", to: "n4", kind: "flow" },
    { id: "e4", from: "n4", to: "n5", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "无法复现" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "根因有误" },
    { id: "f3", from: "n4", to: "n3", kind: "fail", label: "回归失败" },
    { id: "f4", from: "n5", to: "n3", kind: "fail", label: "审查驳回" },
  ],
};

/* ---------------------- 4. 存量系统逆向重构 ---------------------------- */

const wfLegacy: Workflow = {
  id: "wf-legacy",
  name: "存量系统逆向重构",
  glyph: "Layers",
  tint: "cyan",
  builtin: true,
  summary: "从源码逆向需求，人工确认后重新设计并以测试驱动方式重写。",
  scene: "资料缺失的存量系统梳理与整系统重写",
  maxRetry: 2,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "源码解析",
      role: "architecture",
      col: 0,
      lane: 0,
      desc: "按模块、调用关系与依赖整理源码，记录来源与版本。",
    },
    {
      id: "n2",
      name: "需求逆向",
      role: "requirement",
      col: 1,
      lane: 0,
      desc: "抽取业务规则与接口行为，区分代码事实、推断与待确认。",
      gate: "G1 需求与设计",
      approval: true,
    },
    {
      id: "n3",
      name: "架构设计",
      role: "architecture",
      col: 2,
      lane: 0,
      desc: "确定新系统结构、模块职责、接口与关键设计决定。",
      gate: "G1 需求与设计",
    },
    {
      id: "n4",
      name: "测试驱动开发",
      role: "development",
      col: 3,
      lane: 0,
      desc: "先写用例并保留预期失败，再实现代码直至转为通过。",
      gate: "G2 测试驱动开发",
    },
    {
      id: "n5",
      name: "集成验证",
      role: "testing",
      col: 4,
      lane: 0,
      desc: "跨模块业务流程集成测试与浏览器冒烟测试。",
      gate: "G3 集成验证",
    },
    {
      id: "n6",
      name: "交付验收",
      role: "delivery",
      col: 5,
      lane: 0,
      desc: "输出需求、设计、验证与运维四类材料，交付人工验收。",
      gate: "G4 交付提交",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "e3", from: "n3", to: "n4", kind: "flow" },
    { id: "e4", from: "n4", to: "n5", kind: "flow" },
    { id: "e5", from: "n5", to: "n6", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "资料不足" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "语义待澄清" },
    { id: "f3", from: "n4", to: "n3", kind: "fail", label: "接口不兼容" },
    { id: "f4", from: "n5", to: "n4", kind: "fail", label: "集成失败" },
    { id: "f5", from: "n6", to: "n5", kind: "fail", label: "验收驳回" },
  ],
};

/* ---------------------- 5. 开源漏洞排查整改 --------------------------- */

const wfCve: Workflow = {
  id: "wf-cve",
  name: "开源漏洞整改",
  glyph: "Shield",
  tint: "gold",
  builtin: true,
  summary: "排查后并行做依赖分析与版本核对，整改经回归与审查后发布。",
  scene: "组件漏洞通告、跨项目安全处置",
  maxRetry: 2,
  onExhaust: "降级处理",
  nodes: [
    {
      id: "n1",
      name: "影响排查",
      role: "orchestrator",
      col: 0,
      lane: 0,
      desc: "读取组件清单与依赖扫描结果，确定受影响项目范围。",
    },
    {
      id: "n2",
      name: "依赖分析",
      role: "architecture",
      col: 1,
      lane: 0,
      desc: "区分直接依赖与间接依赖，确定可用修复版本。",
    },
    {
      id: "n3",
      name: "兼容性核对",
      role: "testing",
      col: 1,
      lane: 1,
      desc: "核对接口变化、构建限制与可能影响的业务功能。",
    },
    {
      id: "n4",
      name: "整改实现",
      role: "development",
      col: 2,
      lane: 0,
      desc: "在独立分支升级组件并调整代码、配置与构建文件。",
      gate: "构建与单元测试",
    },
    {
      id: "n5",
      name: "回归验证",
      role: "testing",
      col: 3,
      lane: 0,
      desc: "执行集成测试与关键业务回归测试。",
      gate: "关键业务回归",
    },
    {
      id: "n6",
      name: "安全复核",
      role: "review",
      col: 4,
      lane: 0,
      desc: "确认漏洞已消除、依赖完整升级且未引入新问题。",
      gate: "漏洞已消除",
    },
    {
      id: "n7",
      name: "发布审批",
      role: "delivery",
      col: 5,
      lane: 0,
      desc: "由项目负责人批准合并与发布，状态回写现有平台。",
      gate: "责任人审批",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n1", to: "n3", kind: "flow" },
    { id: "e3", from: "n2", to: "n4", kind: "flow" },
    { id: "e4", from: "n3", to: "n4", kind: "flow" },
    { id: "e5", from: "n4", to: "n5", kind: "flow" },
    { id: "e6", from: "n5", to: "n6", kind: "flow" },
    { id: "e7", from: "n6", to: "n7", kind: "flow" },
    { id: "f1", from: "n4", to: "n2", kind: "fail", label: "无可用版本" },
    { id: "f2", from: "n5", to: "n4", kind: "fail", label: "回归失败" },
    { id: "f3", from: "n6", to: "n4", kind: "fail", label: "仍有风险" },
    { id: "f4", from: "n7", to: "n6", kind: "fail", label: "审批驳回" },
  ],
};

/* ------------------------- 6. AI 代码审核 ----------------------------- */

const wfReview: Workflow = {
  id: "wf-review",
  name: "AI 代码审核",
  glyph: "Merge",
  tint: "plum",
  builtin: true,
  summary: "取差异后并行做功能与安全审查，汇总问题定向整改再复核。",
  scene: "合并请求触发的公共质量节点、项目全量扫描",
  maxRetry: 2,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "差异获取",
      role: "orchestrator",
      col: 0,
      lane: 0,
      desc: "经受控连接层取得代码差异、相关文件、任务说明与项目规则。",
    },
    {
      id: "n2",
      name: "功能与边界审查",
      role: "review",
      col: 1,
      lane: 0,
      desc: "检查功能正确性、异常处理、边界条件与并发资源使用。",
    },
    {
      id: "n3",
      name: "安全与合规审查",
      role: "review",
      col: 1,
      lane: 1,
      desc: "检查安全问题、合规要求、测试充分性与修改影响范围。",
    },
    {
      id: "n4",
      name: "问题汇总",
      role: "orchestrator",
      col: 2,
      lane: 0,
      desc: "按问题位置与严重程度写回代码平台，区分阻断与一般问题。",
      gate: "严重问题必须整改",
    },
    {
      id: "n5",
      name: "定向整改",
      role: "development",
      col: 3,
      lane: 0,
      desc: "按问题清单修改，一般问题由人员决定是否处理。",
    },
    {
      id: "n6",
      name: "复核放行",
      role: "review",
      col: 4,
      lane: 0,
      desc: "复核整改结果，通过后允许进入人工合并流程。",
      gate: "复核通过",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n1", to: "n3", kind: "flow" },
    { id: "e3", from: "n2", to: "n4", kind: "flow" },
    { id: "e4", from: "n3", to: "n4", kind: "flow" },
    { id: "e5", from: "n4", to: "n5", kind: "flow" },
    { id: "e6", from: "n5", to: "n6", kind: "flow" },
    { id: "f1", from: "n6", to: "n5", kind: "fail", label: "整改不达标" },
    { id: "f2", from: "n5", to: "n4", kind: "fail", label: "问题需重判" },
  ],
};

export const workflowTemplates: Workflow[] = [
  wfFeature,
  wfUnit,
  wfBugfix,
  wfLegacy,
  wfCve,
  wfReview,
];

/* ============================ 布局与编辑 ============================== */

export const NODE_W = 148;
export const NODE_H = 62;
export const GAP_X = 60;
export const GAP_Y = 26;

export function nodePos(n: WfNode) {
  return { x: n.col * (NODE_W + GAP_X), y: n.lane * (NODE_H + GAP_Y) };
}

export function dagSize(nodes: WfNode[]) {
  const maxCol = Math.max(0, ...nodes.map((n) => n.col));
  const maxLane = Math.max(0, ...nodes.map((n) => n.lane));
  return {
    w: maxCol * (NODE_W + GAP_X) + NODE_W,
    h: maxLane * (NODE_H + GAP_Y) + NODE_H,
  };
}

/** 流转边：右侧出、左侧入，三次贝塞尔 */
export function flowPath(a: WfNode, b: WfNode) {
  const pa = nodePos(a);
  const pb = nodePos(b);
  const x1 = pa.x + NODE_W;
  const y1 = pa.y + NODE_H / 2;
  const x2 = pb.x;
  const y2 = pb.y + NODE_H / 2;
  const dx = Math.max(28, (x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** 失败回退边：自底部下沉后向左回绕，depth 用于错开多条回退线 */
export function failPath(a: WfNode, b: WfNode, depth: number, baseY: number) {
  const pa = nodePos(a);
  const pb = nodePos(b);
  const x1 = pa.x + NODE_W * 0.34;
  const y1 = pa.y + NODE_H;
  const x2 = pb.x + NODE_W * 0.66;
  const y2 = pb.y + NODE_H;
  const dip = baseY + depth * 17;
  return `M ${x1} ${y1} C ${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}`;
}

/** 回退边标签的落点 */
export function failLabelPos(a: WfNode, b: WfNode, depth: number, baseY: number) {
  const pa = nodePos(a);
  const pb = nodePos(b);
  const x1 = pa.x + NODE_W * 0.34;
  const x2 = pb.x + NODE_W * 0.66;
  const y1 = pa.y + NODE_H;
  const y2 = pb.y + NODE_H;
  const dip = baseY + depth * 17;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 * 0.25 + dip * 0.75 };
}

/** 在指定节点之后插入一个节点，自动重连流转边并补一条回退边 */
export function insertAfter(wf: Workflow, afterId: string, role: AgentRole, name: string): Workflow {
  const anchor = wf.nodes.find((n) => n.id === afterId);
  if (!anchor) return wf;
  const id = `n${Date.now().toString(36)}`;
  const nodes = wf.nodes.map((n) =>
    n.col > anchor.col ? { ...n, col: n.col + 1 } : n,
  );
  nodes.push({
    id,
    name,
    role,
    col: anchor.col + 1,
    lane: anchor.lane,
    desc: "新增节点，待补充职责说明。",
  });
  const edges: WfEdge[] = wf.edges.map((e) =>
    e.kind === "flow" && e.from === afterId ? { ...e, from: id } : e,
  );
  edges.push({ id: `e${id}`, from: afterId, to: id, kind: "flow" });
  edges.push({ id: `f${id}`, from: id, to: afterId, kind: "fail", label: "校验未过" });
  return { ...wf, nodes, edges, builtin: false };
}

/** 删除节点，把它的前驱直接接到后继 */
export function removeNode(wf: Workflow, id: string): Workflow {
  const target = wf.nodes.find((n) => n.id === id);
  if (!target || wf.nodes.length <= 2) return wf;
  const preds = wf.edges.filter((e) => e.kind === "flow" && e.to === id).map((e) => e.from);
  const succs = wf.edges.filter((e) => e.kind === "flow" && e.from === id).map((e) => e.to);
  const kept = wf.edges.filter(
    (e) => e.from !== id && e.to !== id,
  );
  const bridged: WfEdge[] = [];
  preds.forEach((p) =>
    succs.forEach((s) => {
      if (!kept.some((e) => e.kind === "flow" && e.from === p && e.to === s))
        bridged.push({ id: `e${p}${s}`, from: p, to: s, kind: "flow" });
    }),
  );
  const nodes = wf.nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.col > target.col ? { ...n, col: n.col - 1 } : n));
  return { ...wf, nodes, edges: [...kept, ...bridged], builtin: false };
}

/** 切换某节点的失败回退目标 */
export function setFailTarget(wf: Workflow, nodeId: string, targetId: string | null): Workflow {
  const edges = wf.edges.filter((e) => !(e.kind === "fail" && e.from === nodeId));
  if (targetId) {
    edges.push({
      id: `f${nodeId}-${targetId}`,
      from: nodeId,
      to: targetId,
      kind: "fail",
      label: "校验未过",
    });
  }
  return { ...wf, edges, builtin: false };
}

export function patchNode(wf: Workflow, id: string, patch: Partial<WfNode>): Workflow {
  return {
    ...wf,
    builtin: false,
    nodes: wf.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}
