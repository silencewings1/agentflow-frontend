/**
 * 多用户 fixture：账户目录与节点授权的脱敏样例。
 *
 * 定位（与 AGENTS.md §一 一致）：这只是**设计演示的兜底数据**，不是事实源。
 * 真实后端（af-api 的 GovernanceStore）才是授权与身份的权威，fixture 只在
 * 未配置 VITE_AF_API_BASE_URL 的开发形态下，让登录页与权限矩阵可以启动。
 *
 * 与后端保持同构的三条约束，否则 fixture 会掩盖真实缺陷：
 *   1. 授权按 workflowId + nodeId 定位（同名节点不跨编排泄漏）；
 *   2. 权限梯度 view < run < approve < manage，高级含低级；
 *   3. 未登录 → actor.anonymous，写操作抛 AF_ACTOR_UNKNOWN。
 *
 * fixture 里的账户名与后端内置目录一致，使演示与真实形态的观感不跳变。
 * @module src/api/fixtures/accounts
 */

import type {
  AccountAuditDto,
  AccountDto,
  AccountsDto,
  AccountRoleDto,
  DirectoryHealthDto,
  GrantAuditDto,
  NodeGrantDto,
  NodePermDto,
  ActorDto,
} from "../types";

const PERM_RANK: Record<NodePermDto, number> = { view: 0, run: 1, approve: 2, manage: 3 };

/** 账户角色 → 界面中文标签。与后端 ROLE_LABEL 同源，避免两处措辞不一致。 */
export const ACCOUNT_ROLE_LABEL: Record<AccountRoleDto, string> = {
  orchestrator: "编排",
  requirement: "需求",
  architecture: "架构",
  development: "开发",
  testing: "测试",
  review: "审查",
  delivery: "交付",
  ops: "运维",
};

/** 角色分组顺序（界面展示用）：与 DAG 编排的责任顺序一致。 */
export const ACCOUNT_ROLE_ORDER: AccountRoleDto[] = [
  "requirement",
  "architecture",
  "development",
  "testing",
  "review",
  "delivery",
  "ops",
  "orchestrator",
];

export const NODE_PERM_LABEL: Record<NodePermDto, string> = {
  view: "可见",
  run: "可执行",
  approve: "可裁决",
  manage: "可编排",
};

export const NODE_PERM_ORDER: NodePermDto[] = ["view", "run", "approve", "manage"];

export const permRank = (perm: NodePermDto): number => PERM_RANK[perm];

const FIXTURE_AT = "2026-09-02T08:00:00.000Z";

function account(
  accountId: string,
  name: string,
  handle: string,
  role: AccountRoleDto,
  duty: string,
  state: "active" | "suspended" = "active",
): AccountDto {
  return { accountId, name, handle, role, duty, state, builtin: true, createdAt: FIXTURE_AT, updatedAt: FIXTURE_AT };
}

export const FIXTURE_ACCOUNTS: AccountDto[] = [
  account("ac-yz", "杨知远", "yz@agentflow.dev", "review", "需求确认、合并放行与生产发布的最终责任人"),
  account("ac-lw", "李雯", "liwen@agentflow.dev", "requirement", "需求分析与验收口径维护，需求语义问题的第一响应人"),
  account("ac-orch", "周林", "zhoulin@agentflow.dev", "orchestrator", "理解任务、拆分步骤、下发节点契约、汇总偏差"),
  account("ac-dev", "陈硕", "chenshuo@agentflow.dev", "development", "按节点契约实现代码与修复缺陷，产出必须可被审查角色核验"),
  account("ac-arch", "苏铭", "suming@agentflow.dev", "architecture", "方案设计与跨模块接口决策，兼容性与技术债的第一责任人"),
  account("ac-gate", "林晓", "linxiao@agentflow.dev", "testing", "执行编译、测试、覆盖率与安全扫描，产出门禁裁决结论"),
  account("ac-conn", "赵远", "zhaoyuan@agentflow.dev", "delivery", "交付验收与变更说明汇总，提交责任人审批"),
  account("ac-ops", "郑川", "zhengchuan@agentflow.dev", "ops", "运行环境与发布通道维护，只处置可回滚的运维动作"),
  account("ac-qa", "王勖", "wangxu@agentflow.dev", "review", "独立审查视角，抽检门禁结论与证据链完整性", "suspended"),
];

function grant(accountId: string, workflowId: string, nodeId: string, perm: NodePermDto, grantedBy: string): NodeGrantDto {
  return { grantId: `${accountId}::${workflowId}::${nodeId}`, accountId, workflowId, nodeId, perm, source: "role", grantedBy, grantedAt: FIXTURE_AT, revision: 1 };
}

export const FIXTURE_GRANTS: NodeGrantDto[] = [
  grant("ac-lw", "wf-feature", "n1", "approve", "seed"),
  grant("ac-dev", "wf-feature", "n2", "run", "seed"),
  grant("ac-yz", "wf-feature", "n3", "approve", "seed"),
  grant("ac-conn", "wf-feature", "n4", "approve", "seed"),
  grant("ac-orch", "wf-feature", "n1", "manage", "seed"),
  grant("ac-gate", "wf-unit", "n1", "run", "seed"),
  grant("ac-gate", "wf-unit", "n2", "run", "seed"),
  grant("ac-lw", "wf-bugfix", "n1", "run", "seed"),
  grant("ac-dev", "wf-bugfix", "n2", "run", "seed"),
  grant("ac-gate", "wf-bugfix", "n3", "approve", "seed"),
  grant("ac-arch", "wf-legacy", "n1", "run", "seed"),
  grant("ac-yz", "wf-legacy", "n2", "approve", "seed"),
  grant("ac-arch", "wf-legacy", "n3", "run", "seed"),
  grant("ac-dev", "wf-legacy", "n4", "run", "seed"),
  grant("ac-gate", "wf-legacy", "n5", "approve", "seed"),
  grant("ac-conn", "wf-legacy", "n6", "approve", "seed"),
  grant("ac-gate", "wf-cve", "n1", "run", "seed"),
  grant("ac-arch", "wf-cve", "n2", "run", "seed"),
  grant("ac-dev", "wf-cve", "n3", "run", "seed"),
  grant("ac-yz", "wf-review", "n2", "approve", "seed"),
  grant("ac-arch", "wf-review", "n3", "run", "seed"),
];

export const FIXTURE_AUDIT: GrantAuditDto[] = [
  { auditId: "ga-1", action: "grant", accountId: "ac-conn", workflowId: "wf-legacy", nodeId: "n6", perm: "approve", actor: "ac-orch", occurredAt: "2026-09-02T08:12:00.000Z" },
  { auditId: "ga-2", action: "raise", accountId: "ac-lw", workflowId: "wf-legacy", nodeId: "n1", perm: "run", actor: "ac-orch", occurredAt: "2026-09-02T08:03:00.000Z" },
];

/** 未登录身份：只读可用，写操作一律被拒（与后端 fail closed 一致）。 */
export function anonymousActor(): ActorDto {
  return { accountId: null, name: "未登录", handle: "", role: null, state: null, anonymous: true, canManageAccounts: false, grantCount: 0 };
}

export function actorFor(handle: string | null, accounts: AccountDto[], grants: NodeGrantDto[]): ActorDto {
  if (handle === null || handle.trim() === "") return anonymousActor();
  const record = accounts.find((item) => item.handle.toLowerCase() === handle.trim().toLowerCase());
  if (record === undefined) return { ...anonymousActor(), handle };
  const own = grants.filter((item) => item.accountId === record.accountId);
  return {
    accountId: record.accountId,
    name: record.name,
    handle: record.handle,
    role: record.role,
    state: record.state,
    anonymous: false,
    canManageAccounts: record.state === "active" && own.some((item) => item.perm === "manage"),
    grantCount: own.length,
  };
}

export function accountsSnapshot(
  handle: string | null,
  accounts: AccountDto[],
  grants: NodeGrantDto[],
  audit: GrantAuditDto[],
  /* 账户级审计由调用方维护；fixture 路径同样要给出，
     否则冻结契约上的字段在本地模式下会缺失，界面据此渲染出空历史——
     那会被误读成"没有发生任何变更"，而不是"这条路径没实现它"。 */
  accountAudit: AccountAuditDto[] = [],
): AccountsDto {
  return {
    contractVersion: "1.0",
    actor: actorFor(handle, accounts, grants),
    accounts,
    grants,
    audit,
    accountAudit,
    /* 总数与列表同源：fixture 路径下没有服务端分页，列表就是全部，
       因此两者相等。给出这两个字段的理由与 accountAudit 相同——
       冻结契约上的字段在本地模式缺失会让界面走不到"这是最新一页"的分支。 */
    auditTotal: audit.length,
    accountAuditTotal: accountAudit.length,
    permRank: { ...PERM_RANK },
    /* 目录可用性同样必须给出，理由与上面的 accountAudit 完全相同：
       冻结契约上的字段若在本地模式缺失，界面的告警分支就永远走不到——
       "没有任何人有管理权"这个形态在演示模式下无法复现，
       而它恰好是运维最需要看懂的形态。
       演示数据是**可用**的目录（有在职持 manage 的账户），
       因此这里给出 healthy 的真值，而不是留空让界面去猜。 */
    directory: directoryHealthFor(accounts, grants),
  };
}

/**
 * 演示模式下的目录可用性判定，与后端 `AccountsService.directoryHealth` 同源：
 * 空目录 / 无人在职持 manage 即不可用。
 *
 * 前端不应自行推断存储层事实，但演示模式没有后端可问——
 * 这里的判据只用于让「坏目录」这一形态在演示模式下可见，
 * 不参与任何真实判定（真实判定始终来自 AF API 返回的 directory 字段）。
 *
 * 与后端的**唯一**差别：后端还要求 manage 落在真实责任位上
 * （`realSlots`，见 client.ts 的 holdsManageGrant 注释说明为何此处刻意不抄）。
 * 该差别在所有可达输入上不产生分歧，详见那里。
 */
export function directoryHealthFor(
  accounts: AccountDto[],
  grants: NodeGrantDto[],
): DirectoryHealthDto {
  if (accounts.length === 0) {
    return {
      healthy: false,
      code: "empty",
      reason:
        "账户目录为空：没有任何已登记身份，因此任何写操作都无法通过身份校验，也无法创建第一个账户（创建本身就需要已登记身份）。这通常意味着存储文件被外部改坏；请把 account_settings.singleton.seeded 置为 false 触发重新播种，或从备份恢复 af_governance.json。",
    };
  }
  const hasRealManager = accounts.some(
    (account) =>
      account.state === "active" &&
      grants.some((grant) => grant.accountId === account.accountId && grant.perm === "manage"),
  );
  if (!hasRealManager) {
    return {
      healthy: false,
      code: "no-manager",
      reason:
        "目录里没有任何「在职且持 manage」的账户：所有账户与授权变更都会被拒，且无法通过界面自救（管理权是自救的前提）。请检查 node_grants 里的 manage 授权与 accounts 的 state，恢复至少一位在职管理者后重启。",
    };
  }
  return { healthy: true, code: "ok", reason: null };
}
