/**
 * 目标功能分支默认名生成（纯函数，可独立测试）。
 *
 * 规则：`dev-<用户>-<YYMMDD>-<序号>`，例如 `dev-lw-260909-a`。
 * 只负责给用户一个不会撞车的起点，用户可在新建任务弹窗里自行改写。
 *
 * 序号从当天已有分支里推导，并**填补空缺**而不是简单取最大值加一：
 * 中间的分支被归档或删除后，复用空出来的字母比继续递增更不容易累积长序号，
 * 同时仍不会与已知分支重名。
 *
 * ⚠️ 多用户相关：`<用户>` 必须来自**当前登录身份**，不能是固定值。
 * 见 `branchUserFromActor` 的说明。
 * @module @agentflow/frontend/data/branchNaming
 */

/** 未登记（匿名）或身份信息不足时使用的兜底标识。 */
export const FALLBACK_BRANCH_USER = "anon";

/**
 * 由当前登录身份推导分支名里的用户标识。
 *
 * 为什么必须按身份推导：分支名是**可归属的工作产物**，
 * 它随任务一起写入治理事实，并被 `externalWrite.allowedBranches` 授权放行。
 * 用一个固定常量意味着**所有人**的默认分支都顶着同一个人的名字——
 * 多用户下这既让归属失真（审计里看不出是谁的工作），
 * 又让不同用户对同名分支反复授权，是真实的协作冲突来源。
 *
 * 取值优先级：
 *   1. `handle` 的 `@` 前段（`liwen@agentflow.dev` → `liwen`）——这是登录凭据，最稳定；
 *   2. 退化到 `accountId`（handle 缺失时仍能给出稳定标识）；
 *   3. 都没有（匿名）→ `anon`。
 *
 * 结果会归一化成 git 分支名允许的字符集（小写字母、数字、连字符）。
 */
export function branchUserFromActor(
  actor: { handle?: string | null; accountId?: string | null; anonymous?: boolean } | null | undefined,
): string {
  if (actor == null || actor.anonymous === true) return FALLBACK_BRANCH_USER;
  const handle = (actor.handle ?? "").trim();
  /* 取 `@` 前段：分支名里带完整域名既长又可能含不允许的字符。 */
  const localPart = handle.includes("@") ? handle.slice(0, handle.indexOf("@")) : handle;

  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  /* 逐级尝试，**每一级都要先归一化再判断是否可用**：
     若只在"字面为空"时才降级，`-@x.dev` 这种畸形 handle 会取到 `-`，
     归一化后成空串，于是直接落到 anon——明明有可用的 accountId 却被丢掉。
     归一无结果就换下一级，才是文档里写的优先级。 */
  for (const candidate of [localPart, actor.accountId ?? ""]) {
    const normalized = normalize(candidate);
    if (normalized !== "") return normalized;
  }
  return FALLBACK_BRANCH_USER;
}

/** @deprecated 固定用户标识已废弃（多用户下会让所有人共用同一个名字）。
 *  仅为兼容可能的外部引用保留；新代码请用 `branchUserFromActor`。 */
export const DEFAULT_BRANCH_USER = FALLBACK_BRANCH_USER;

/** 本地日期 → YYMMDD。用本地时间而非 UTC：分支名是给人看的，应贴合当天。 */
export function branchDateStamp(now: Date = new Date()): string {
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** 序号序列：a…z，用尽后 aa…az、ba…（演示场景远达不到，但保持确定行为）。 */
function sequenceLabel(index: number): string {
  let value = index;
  let label = "";
  do {
    label = String.fromCharCode(97 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

/** 从已知分支名里解析出该前缀已占用的序号集合。 */
function usedSequences(prefix: string, existing: readonly string[]): Set<string> {
  const used = new Set<string>();
  for (const branch of existing) {
    const match = new RegExp(`^${prefix}-([a-z]+)$`).exec(branch.trim());
    if (match !== null && match[1] !== undefined) used.add(match[1]);
  }
  return used;
}

/** 取第一个未被占用的序号，避免与已知分支重名。 */
function nextSequence(prefix: string, existing: readonly string[]): string {
  const used = usedSequences(prefix, existing);
  for (let index = 0; index < 26 * 27; index += 1) {
    const label = sequenceLabel(index);
    if (!used.has(label)) return label;
  }
  return "a";
}

/**
 * 生成默认目标分支名。
 * @param existingBranches 当前已知的目标分支（含历史任务），用于避开重名。
 * @param now 注入时钟，便于测试与确定性。
 * @param actor 当前登录身份；缺省或匿名时用 `anon`。
 *   **必须由调用方传入真实身份**，否则多用户下所有人的默认分支属于同一个人。
 */
export function defaultTargetBranch(
  existingBranches: readonly string[] = [],
  now: Date = new Date(),
  actor: { handle?: string | null; accountId?: string | null; anonymous?: boolean } | null | undefined = null,
): string {
  const prefix = `dev-${branchUserFromActor(actor)}-${branchDateStamp(now)}`;
  return `${prefix}-${nextSequence(prefix, existingBranches)}`;
}
