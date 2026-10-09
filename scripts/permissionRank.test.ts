/* 权限梯度跨仓库一致性自检。
   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/permissionRank.test.ts

   为什么需要它：梯度次序（view < run < approve < manage）在前端 fixture、
   af-api 与 af-storage 里各有一份字面量——前端是独立构建，无法 import
   af-storage 的常量，所以复制本身不可避免。但"高级含低级"这条语义的
   唯一依据就是这个次序，一旦某一份被改动而其他没跟上，界面图例与判权
   会对同一个事实给出不同结论，且两边看起来都没坏。
   因此这里把前端那份与**后端权威来源逐项比对**，让漂移立刻变红。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const frontendSrc = readFileSync(resolve(here, "../src/api/fixtures/accounts.ts"), "utf8");
const backendSrc = readFileSync(
  resolve(here, "../../packages/af/af-storage/src/types.ts"),
  "utf8",
);

const parse = (source: string, label: string): Record<string, number> => {
  const m = source.match(/\{\s*view:\s*(\d+),\s*run:\s*(\d+),\s*approve:\s*(\d+),\s*manage:\s*(\d+)\s*\}/);
  assert.ok(m, `${label} 中找不到权限梯度字面量`);
  return { view: Number(m![1]), run: Number(m![2]), approve: Number(m![3]), manage: Number(m![4]) };
};

const fe = parse(frontendSrc, "前端 fixtures/accounts.ts");
const be = parse(backendSrc, "af-storage types.ts (权威来源)");

assert.deepEqual(fe, be, `前端梯度 ${JSON.stringify(fe)} 与后端权威来源 ${JSON.stringify(be)} 不一致`);

/* 次序本身也要断言：数值相等但次序乱掉同样是语义错误。 */
assert.ok(fe.view < fe.run, "view 应低于 run");
assert.ok(fe.run < fe.approve, "run 应低于 approve");
assert.ok(fe.approve < fe.manage, "approve 应低于 manage");

console.log(`permissionRank.test: 前端与后端梯度一致（${JSON.stringify(fe)}），且次序正确`);
