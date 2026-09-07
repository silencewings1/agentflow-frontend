/* ================================================================
   账户与节点权限 · 领域模型
   设计主张：权限不是围栏，是责任分配。
   1. 每个节点必须有明确操作者 —— 没有操作者的节点不允许进入编排；
   2. 权限授予落在五层架构上：账户类型（人工/智能体/程序）决定它
      能承担哪类节点 —— AI 节点配 AI 账户，人工节点配人工账户；
   3. 门禁裁决权只属于确定性程序与人工检查层；智能体账户不能持有
      「可裁决」，AI 的产出必须穿过验证层，而不是成为验证层；
   4. 所有授权变更必须可回溯（changedAt / changedBy），与证据链的
      出处/版本/责任人三元组呼应。
   ================================================================ */

import type { IconName } from "../components/Icons";
import { workflowTemplates, type WfNode } from "./workflows";

/* ---------------- 账户 ---------------- */

export type AccountState = "active" | "suspended";

export const accountStateLabel: Record<AccountState, string> = {
  active: "在职",
  suspended: "停用",
};

/** 账户类型：与五层责任主体（平台 / AI / 确定性程序 / 人工）对齐 */
export type AccountKind = "human" | "ai" | "program";

export const accountKindLabel: Record<AccountKind, string> = {
  human: "人工",
  ai: "智能体",
  program: "确定性程序",
};

/** 账户在五层架构上的落位，决定它可被授予的节点范围 */
export type AccountLayer = "L1" | "L2" | "L3" | "L4" | "L5";

export const accountLayerLabel: Record<AccountLayer, string> = {
  L1: "业务研发层",
  L2: "智能执行层",
  L3: "受控连接层",
  L4: "质量验证层",
  L5: "人工检查层",
};

/** 账户：界面上一行身份 = 类型 × 五层落位 × 状态 */
export interface Account {
  id: string;
  name: string;
  /** 登录标识（邮箱 / agent id / 服务账号） */
  handle: string;
  kind: AccountKind;
  layer: AccountLayer;
  duty: string;
  glyph: IconName;
  tint: "accent" | "cyan" | "sage" | "gold" | "plum" | "azure";
  state: AccountState;
  /** 内置账户不可删除，只能停用 */
  builtin: boolean;
}

/* ---------------- 节点权限 ---------------- */

/**
 * 节点权限四级：
 * - view    只读可见（可看节点消息与产物）
 * - run     可执行（可启动 / 重跑该节点）
 * - approve 可裁决（门禁放行 / 人工检查点判定）
 * - manage  可编排（增删节点、改失败回退、下发契约）
 */
export type NodePerm = "view" | "run" | "approve" | "manage";

export const nodePermLabel: Record<NodePerm, string> = {
  view: "可见",
  run: "可执行",
  approve: "可裁决",
  manage: "可编排",
};

export const nodePermRank: Record<NodePerm, number> = {
  view: 0,
  run: 1,
  approve: 2,
  manage: 3,
};

/** 单条授权：账户 × 节点 × 权限等级。
 *  节点以 workflowId+nodeId 定位 —— 不同编排里的同名节点（n1/n2…）是不同责任位 */
export interface NodeGrant {
  accountId: string;
  workflowId: string;
  nodeId: string;
  perm: NodePerm;
  /** 授权来源：owner 手工授予 / role 按角色默认继承 */
  source: "owner" | "role";
}

/** 授权变更记录：与证据链「出处 / 版本 / 责任人」三元组呼应 */
export interface GrantAudit {
  id: string;
  at: string;
  by: string;
  action: "grant" | "revoke" | "raise" | "lower";
  accountId: string;
  nodeId: string;
  nodeName: string;
  perm: NodePerm;
}

/* ---------------- 授权合法性（责任落位校验） ---------------- */

/**
 * 合法性矩阵编码设计红线：
 * - 智能体账户不能持有 approve —— 门禁裁决与人工判定不可由 AI 代持；
 * - 确定性程序账户不能持有 manage —— 程序执行裁决，但不设计流程；
 * - manage 仅人工账户可持有（主控智能体的编排由「角色」继承，不走授权）。
 */
const KIND_PERM_LEGAL: Record<AccountKind, NodePerm[]> = {
  human: ["view", "run", "approve", "manage"],
  ai: ["view", "run"],
  program: ["view", "run"],
};

export function permAllowed(kind: AccountKind, perm: NodePerm): boolean {
  return KIND_PERM_LEGAL[kind].includes(perm);
}

/** 不可授的原因文案：界面上解释「为什么这一格点不了」 */
export function permDenyReason(kind: AccountKind, perm: NodePerm): string | null {
  if (permAllowed(kind, perm)) return null;
  if (kind === "ai" && perm === "approve")
    return "门禁裁决与人工判定不可由智能体代持 —— AI 的产出必须穿过验证层，而不是成为验证层。";
  if (kind === "program" && perm === "manage")
    return "编排是设计决策：确定性程序执行裁决，但不设计流程。";
  return "该账户类型不承担此类节点责任。";
}

/* ---------------- 节点索引 ---------------- */

/** 跨全部工作流模板的节点索引，权限矩阵按此展平，界面无需再遍历 */
export interface NodeRef {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeName: string;
  role: WfNode["role"];
  gate?: string;
  approval?: boolean;
}

let nodeIndexCache: NodeRef[] | null = null;

export function nodeRefs(): NodeRef[] {
  if (nodeIndexCache) return nodeIndexCache;
  nodeIndexCache = workflowTemplates.flatMap((w) =>
    w.nodes.map((n) => ({
      workflowId: w.id,
      workflowName: w.name,
      nodeId: n.id,
      nodeName: n.name,
      role: n.role,
      gate: n.gate,
      approval: n.approval,
    })),
  );
  return nodeIndexCache;
}

/* ---------------- 账户目录（演示数据） ---------------- */

export const accounts: Account[] = [
  {
    id: "ac-yz",
    name: "杨知远",
    handle: "yz@agentflow.dev",
    kind: "human",
    layer: "L5",
    duty: "需求确认、合并放行与生产发布的最终责任人",
    glyph: "Shield",
    tint: "accent",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-lw",
    name: "李雯",
    handle: "liwen@agentflow.dev",
    kind: "human",
    layer: "L1",
    duty: "需求分析与验收口径维护，需求语义问题的第一响应人",
    glyph: "Book",
    tint: "azure",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-orch",
    name: "主控智能体",
    handle: "orchestrator@agentflow.dev",
    kind: "ai",
    layer: "L2",
    duty: "理解任务、拆分步骤、下发节点契约、汇总偏差",
    glyph: "Nodes",
    tint: "cyan",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-dev",
    name: "开发智能体",
    handle: "dev-agent@agentflow.dev",
    kind: "ai",
    layer: "L2",
    duty: "按节点契约实现代码与修复缺陷，产出必须可被质量验证层核验",
    glyph: "Pencil",
    tint: "cyan",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-gate",
    name: "质量门禁程序",
    handle: "gate-runner@agentflow.dev",
    kind: "program",
    layer: "L4",
    duty: "编译、测试、覆盖率与安全扫描的机器裁决者",
    glyph: "Beaker",
    tint: "sage",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-conn",
    name: "连接层守护程序",
    handle: "conn-guard@agentflow.dev",
    kind: "program",
    layer: "L3",
    duty: "外部调用的身份核验、权限分级与参数校验",
    glyph: "Plug",
    tint: "gold",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-qa",
    name: "王勖",
    handle: "wangxu@agentflow.dev",
    kind: "human",
    layer: "L4",
    duty: "独立审查视角，抽检门禁结论与证据链完整性",
    glyph: "Search",
    tint: "sage",
    state: "suspended",
    builtin: true,
  },
];

/* ---------------- 初始授权（演示：以需求开发编排为基线） ---------------- */

/**
 * source: "role"  = 按角色继承的默认授权（界面显示为「角色继承」，可被 owner 覆盖）
 * source: "owner" = 手工授予（变更走 GrantAudit）
 */
export const initialGrants: NodeGrant[] = [
  // 需求分析 n1：李雯可执行可裁决（需求评审人），杨知远可裁决
  { accountId: "ac-lw", workflowId: "wf-feature", nodeId: "n1", perm: "run", source: "role" },
  { accountId: "ac-lw", workflowId: "wf-feature", nodeId: "n1", perm: "approve", source: "role" },
  { accountId: "ac-yz", workflowId: "wf-feature", nodeId: "n1", perm: "approve", source: "owner" },
  // 代码开发 n2：主控 + 开发智能体可执行
  { accountId: "ac-orch", workflowId: "wf-feature", nodeId: "n2", perm: "run", source: "role" },
  { accountId: "ac-dev", workflowId: "wf-feature", nodeId: "n2", perm: "run", source: "role" },
  // 评审 n3：门禁程序裁决（机器门禁）
  { accountId: "ac-gate", workflowId: "wf-feature", nodeId: "n3", perm: "approve", source: "role" },
  // 交付 n4（含人工检查点）：杨知远裁决
  { accountId: "ac-yz", workflowId: "wf-feature", nodeId: "n4", perm: "approve", source: "role" },
];

/* ---------------- 授权变更记录（演示） ---------------- */

export const initialAudit: GrantAudit[] = [
  {
    id: "ga-1",
    at: "09:12",
    by: "杨知远",
    action: "grant",
    accountId: "ac-yz",
    nodeId: "n4",
    nodeName: "交付",
    perm: "approve",
  },
  {
    id: "ga-2",
    at: "10:03",
    by: "杨知远",
    action: "raise",
    accountId: "ac-lw",
    nodeId: "n1",
    nodeName: "需求分析",
    perm: "approve",
  },
];
