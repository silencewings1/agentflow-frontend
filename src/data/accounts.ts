/* ================================================================
   账户与节点权限 · 领域模型
   设计主张：权限不是围栏，是责任分配。
   1. 每个节点必须有明确操作者 —— 没有操作者的节点不允许进入编排；
   2. 所有账户都是人工账户，权限差异完全由节点级授权决定 ——
      不再以账户类型区分能做什么，而是看「谁被授予了什么」；
   3. 五层架构落位（L1-L5）决定账户可被指派到哪类节点；
   4. 所有授权变更必须可回溯（changedAt / changedBy），与证据链的
      出处/版本/责任人三元组呼应。
   ================================================================ */

import type { IconName } from "../components/Icons";
import { workflowTemplates, type WfNode } from "./workflows";
import type { AgentRole } from "./settings";

/* ---------------- 账户 ---------------- */

export type AccountState = "active" | "suspended";

export const accountStateLabel: Record<AccountState, string> = {
  active: "在职",
  suspended: "停用",
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

/** 智能体角色到五层架构的映射：决定哪些账户可被指派为该节点的执行者 */
export const roleLayerMap: Record<AgentRole, AccountLayer> = {
  orchestrator: "L2",
  requirement: "L1",
  architecture: "L1",
  development: "L2",
  testing: "L2",
  review: "L4",
  delivery: "L1",
  ops: "L1",
};

/** 按角色返回可承担该节点的账户列表（层匹配 + 在职状态） */
export function accountsForRole(role: AgentRole, list: Account[] = accounts): Account[] {
  const layer = roleLayerMap[role];
  return list.filter((a) => a.layer === layer && a.state === "active");
}

/**
 * 按节点返回可指派的账户列表。
 * 人工检查节点（approval=true）由 L5 账户承担；
 * 普通节点按角色 → 层映射筛选。
 */
export function assignableAccounts(node: Pick<WfNode, "role" | "approval">, list: Account[] = accounts): Account[] {
  if (node.approval) {
    return list.filter((a) => a.layer === "L5" && a.state === "active");
  }
  return accountsForRole(node.role, list);
}

/** 按 id 查找账户 */
export function accountById(id: string, list: Account[] = accounts): Account | undefined {
  return list.find((a) => a.id === id);
}

/** 取某账户在某节点的最高权限 */
export function highestPerm(
  grants: NodeGrant[],
  accountId: string,
  workflowId: string,
  nodeId: string,
): NodePerm | null {
  const rows = grants.filter(
    (g) => g.accountId === accountId && g.workflowId === workflowId && g.nodeId === nodeId,
  );
  if (!rows.length) return null;
  return rows.reduce(
    (best, g) => (nodePermRank[g.perm] > nodePermRank[best] ? g.perm : best),
    rows[0].perm,
  );
}

/** 当前账户在节点上是否有 run 及以上权限 */
export function canRun(
  grants: NodeGrant[],
  accountId: string,
  workflowId: string,
  nodeId: string,
): boolean {
  const p = highestPerm(grants, accountId, workflowId, nodeId);
  return p !== null && nodePermRank[p] >= nodePermRank.run;
}

/** 账户：界面上一行身份 = 五层落位 × 状态 × 职责 */
export interface Account {
  id: string;
  name: string;
  /** 登录标识（邮箱 / agent id / 服务账号） */
  handle: string;
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
    layer: "L1",
    duty: "需求分析与验收口径维护，需求语义问题的第一响应人",
    glyph: "Book",
    tint: "azure",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-orch",
    name: "周林",
    handle: "zhoulin@agentflow.dev",
    layer: "L2",
    duty: "理解任务、拆分步骤、下发节点契约、汇总偏差",
    glyph: "Nodes",
    tint: "cyan",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-dev",
    name: "陈硕",
    handle: "chenshuo@agentflow.dev",
    layer: "L2",
    duty: "按节点契约实现代码与修复缺陷，产出必须可被质量验证层核验",
    glyph: "Pencil",
    tint: "cyan",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-gate",
    name: "林晓",
    handle: "linxiao@agentflow.dev",
    layer: "L4",
    duty: "执行编译、测试、覆盖率与安全扫描，产出门禁裁决结论",
    glyph: "Beaker",
    tint: "sage",
    state: "active",
    builtin: true,
  },
  {
    id: "ac-conn",
    name: "赵远",
    handle: "zhaoyuan@agentflow.dev",
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
  // 源码解析 n1：李雯可执行
  { accountId: "ac-lw", workflowId: "wf-legacy", nodeId: "n1", perm: "run", source: "role" },
  // 需求逆向 n2（含人工检查点）：杨知远裁决
  { accountId: "ac-yz", workflowId: "wf-legacy", nodeId: "n2", perm: "approve", source: "role" },
  { accountId: "ac-lw", workflowId: "wf-legacy", nodeId: "n2", perm: "view", source: "role" },
  // 架构设计 n3：周林可执行
  { accountId: "ac-orch", workflowId: "wf-legacy", nodeId: "n3", perm: "run", source: "role" },
  // 测试驱动开发 n4：陈硕可执行
  { accountId: "ac-dev", workflowId: "wf-legacy", nodeId: "n4", perm: "run", source: "role" },
  // 集成验证 n5：林晓可裁决
  { accountId: "ac-gate", workflowId: "wf-legacy", nodeId: "n5", perm: "approve", source: "role" },
  // 交付验收 n6（含人工检查点）：赵远裁决
  { accountId: "ac-conn", workflowId: "wf-legacy", nodeId: "n6", perm: "approve", source: "role" },
];

/* ---------------- 授权变更记录（演示） ---------------- */

export const initialAudit: GrantAudit[] = [
  {
    id: "ga-1",
    at: "09:12",
    by: "杨知远",
    action: "grant",
    accountId: "ac-conn",
    nodeId: "n6",
    nodeName: "交付验收",
    perm: "approve",
  },
  {
    id: "ga-2",
    at: "10:03",
    by: "杨知远",
    action: "raise",
    accountId: "ac-lw",
    nodeId: "n1",
    nodeName: "源码解析",
    perm: "run",
  },
];
