/**
 * 目标功能分支默认名生成（纯函数，可独立测试）。
 *
 * 规则：`dev-<用户>-<YYMMDD>-<序号>`，例如 `dev-zhhge-260909-a`。
 * 只负责给用户一个不会撞车的起点，用户可在新建任务弹窗里自行改写。
 *
 * 序号从当天已有分支里推导，并**填补空缺**而不是简单取最大值加一：
 * 中间的分支被归档或删除后，复用空出来的字母比继续递增更不容易累积长序号，
 * 同时仍不会与已知分支重名。
 * @module @agentflow/frontend/data/branchNaming
 */

/** 分支名里的用户标识。当前为固定值；接入登录态后由会话身份替换。 */
export const DEFAULT_BRANCH_USER = "zhhge";

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
 */
export function defaultTargetBranch(existingBranches: readonly string[] = [], now: Date = new Date()): string {
  const prefix = `dev-${DEFAULT_BRANCH_USER}-${branchDateStamp(now)}`;
  return `${prefix}-${nextSequence(prefix, existingBranches)}`;
}
