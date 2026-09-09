/* 默认目标分支名自检脚本。
   前端没有测试运行器，因此与 stageMapper.test.ts 一样是自包含的 Node 断言脚本：
     node --experimental-strip-types scripts/branchNaming.test.ts
   覆盖点：命名形态、日期格式、序号避重与补空缺。 */
import assert from "node:assert/strict";
import { defaultTargetBranch, branchDateStamp } from "../src/data/branchNaming.ts";

const day = new Date(2026, 8, 9); // 2026-09-09 本地时间

assert.equal(branchDateStamp(day), "260909", "日期应格式化为 YYMMDD");

assert.equal(defaultTargetBranch([], day), "dev-zhhge-260909-a", "空列表应给出 a");

assert.equal(
  defaultTargetBranch(["dev-zhhge-260909-a"], day),
  "dev-zhhge-260909-b",
  "已有 a 时顺延到 b",
);

assert.equal(
  defaultTargetBranch(["dev-zhhge-260909-a", "dev-zhhge-260909-b", "dev-zhhge-260909-c"], day),
  "dev-zhhge-260909-d",
  "已有 a/b/c 时顺延到 d",
);

/* 中间空缺应被填补，而不是一路递增出 d */
assert.equal(
  defaultTargetBranch(["dev-zhhge-260909-a", "dev-zhhge-260909-c"], day),
  "dev-zhhge-260909-b",
  "b 空缺时应复用 b",
);

/* 其他日期或其他用户的分支不应影响今天的序号 */
assert.equal(
  defaultTargetBranch(["dev-zhhge-260908-a", "dev-other-260909-a", "feature/x"], day),
  "dev-zhhge-260909-a",
  "只有同前缀同日期才占用序号",
);

/* 大小写与空白应被容忍 */
assert.equal(
  defaultTargetBranch(["  DEV-ZHHGE-260909-A  "], day),
  "dev-zhhge-260909-a",
  "前缀匹配应大小写不敏感并忽略空白",
);

/* 序号用尽后进入双字母 */
const many = Array.from({ length: 26 }, (_, i) => `dev-zhhge-260909-${String.fromCharCode(97 + i)}`);
assert.equal(defaultTargetBranch(many, day), "dev-zhhge-260909-aa", "单字母用尽后进入 aa");

console.log("branchNaming.test.ts: all assertions passed");
