/* 默认目标分支名自检脚本。
   前端没有测试运行器，因此与 stageMapper.test.ts 一样是自包含的 Node 断言脚本：
     node --experimental-strip-types scripts/branchNaming.test.ts
   覆盖点：命名形态、日期格式、序号避重与补空缺、**用户段由登录身份推导**。 */
import assert from "node:assert/strict";
import { branchDateStamp, branchUserFromActor, defaultTargetBranch } from "../src/data/branchNaming.ts";

const day = new Date(2026, 8, 9); // 2026-09-09 本地时间

/* 测试用的登录身份。分支名里的用户段来自它，不再是固定常量——
   这一点是本文件最要紧的断言：多用户下所有人都顶着同一个名字，
   会让归属失真（审计里看不出是谁的工作），并让不同用户对同名分支反复授权。 */
const actor = (handle: string, accountId = "ac-x") => ({ handle, accountId, anonymous: false });
const lw = actor("liwen@agentflow.dev", "ac-lw");

assert.equal(branchDateStamp(day), "260909", "日期应格式化为 YYMMDD");

assert.equal(defaultTargetBranch([], day, lw), "dev-liwen-260909-a", "空列表应给出 a");

assert.equal(
  defaultTargetBranch(["dev-liwen-260909-a"], day, lw),
  "dev-liwen-260909-b",
  "已有 a 时顺延到 b",
);

assert.equal(
  defaultTargetBranch(["dev-liwen-260909-a", "dev-liwen-260909-b", "dev-liwen-260909-c"], day, lw),
  "dev-liwen-260909-d",
  "已有 a/b/c 时顺延到 d",
);

/* 中间空缺应被填补，而不是一路递增出 d */
assert.equal(
  defaultTargetBranch(["dev-liwen-260909-a", "dev-liwen-260909-c"], day, lw),
  "dev-liwen-260909-b",
  "b 空缺时应复用 b",
);

/* 其他日期、其他用户、其他仓库的分支都不应影响今天的序号 */
assert.equal(
  defaultTargetBranch(["dev-liwen-260908-a", "dev-other-260909-a", "feature/x"], day, lw),
  "dev-liwen-260909-a",
  "只有同前缀同日期才占用序号",
);

/* 大小写与空白应被容忍 */
assert.equal(
  defaultTargetBranch(["  DEV-LIWEN-260909-A  "], day, lw),
  "dev-liwen-260909-a",
  "前缀匹配应大小写不敏感并忽略空白",
);

/* 序号用尽后进入双字母 */
const many = Array.from({ length: 26 }, (_, i) => `dev-liwen-260909-${String.fromCharCode(97 + i)}`);
assert.equal(defaultTargetBranch(many, day, lw), "dev-liwen-260909-aa", "单字母用尽后进入 aa");

/* ── 用户段必须按身份推导（本文件存在的核心理由）──
   原先用固定常量 `DEFAULT_BRANCH_USER = "zhhge"`，于是**任何**登录者
   打开新建任务弹窗，默认分支都是 `dev-zhhge-…`（别人的名字）。
   分支名会被写入治理事实，并进 `externalWrite.allowedBranches` 授权放行，
   因此这不只是显示问题。 */
assert.equal(
  branchUserFromActor(lw),
  "liwen",
  "用户段必须取自登录身份（handle 的 @ 前段），不能是固定值",
);
/* 不同身份必须得到不同前缀——这条直接钉住"所有人共用一个名字"的缺陷。 */
const zy = actor("yz@agentflow.dev", "ac-yz");
assert.equal(defaultTargetBranch([], day, zy), "dev-yz-260909-a", "换一个身份必须换一个前缀");
assert.notEqual(
  defaultTargetBranch([], day, lw).split("-")[1],
  defaultTargetBranch([], day, zy).split("-")[1],
  "两个不同登录者不得得到同一个用户段",
);

/* handle 缺失时退化到 accountId（仍要稳定且可区分，不能退化成空） */
assert.equal(branchUserFromActor(actor("", "ac-ops")), "ac-ops", "handle 为空时应退化到 accountId");
/* 匿名（未登记/未登录）用固定兜底，且必须是一个合法分支片段 */
assert.equal(branchUserFromActor(null), "anon", "无身份时用 anon");
assert.equal(branchUserFromActor({ anonymous: true, handle: "x@y.z" }), "anon", "匿名不得泄漏 handle");
assert.equal(
  defaultTargetBranch([], day, null).split("-")[1],
  "anon",
  "未传身份时兜底为 anon，而不是某个具体人的名字",
);

/* 归一化：分支名只允许小写字母/数字/连字符，`@` `/` `+` 空格等必须被处理掉 */
for (const [input, expected] of [
  ["Li.Wen+test@agentflow.dev", "li-wen-test"],
  ["  spaced@x.dev  ", "spaced"],
  ["weird@@x.dev", "weird"],
] as const) {
  const got = branchUserFromActor(actor(input));
  assert.equal(got, expected, `用户段 ${JSON.stringify(input)} 应归一化为 ${expected}，实际 ${got}`);
  assert.match(got, /^[a-z0-9-]+$/, `用户段 ${got} 必须是合法分支片段（小写字母/数字/连字符）`);
}

/* 退化链要分清：`@` 前段为空（畸形 handle）时退到 accountId——
   仍是一个**稳定且可归属**的标识，比直接 anon 更有用；
   只有连 accountId 都没有、或归一化后为空时，才落到 anon。 */
assert.equal(branchUserFromActor(actor("@@x.dev", "ac-dev")), "ac-dev", "handle 畸形时应退到 accountId");
assert.equal(branchUserFromActor(actor("-@x.dev", "ac-dev")), "ac-dev", "同上（归一化后为空也退 accountId）");
assert.equal(
  branchUserFromActor({ handle: "@@x.dev", accountId: "", anonymous: false }),
  "anon",
  "handle 与 accountId 都无法产出标识时才用 anon",
);

/* 归一化后不得残留分隔符导致 `dev--…` 这种畸形名 */
for (const [handle, accountId] of [
  ["@@x.dev", ""],
  ["-@x.dev", ""],
  ["---@x.dev", ""],
  ["@@@", "-"],
] as const) {
  const name = defaultTargetBranch([], day, { handle, accountId, anonymous: false });
  assert.ok(!name.includes("--"), `分支名不得出现连续连字符：${name}（handle=${JSON.stringify(handle)}）`);
  assert.match(name, /^dev-[a-z0-9-]+-\d{6}-[a-z]+$/, `分支名形态应合法，实际 ${name}`);
}

console.log(
  "branchNaming.test.ts: all assertions passed"
    + "（形态/日期/序号避重与补空缺，且用户段由登录身份推导、匿名兜底为 anon）",
);
