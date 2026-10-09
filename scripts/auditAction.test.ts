/* 账户审计 action 判据的跨仓库一致性自检。
   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/auditAction.test.ts

   为什么需要它：账户审计的 `action` 有两种成因——「停用/恢复」（state）
   与「资料变更」（update），而界面（MembersPane 的 AccountAuditRow）正是
   按 action 选文案："停用了 / 恢复了" 与 "修改了 … 的状态"。

   这条分类曾经由**调用方声明**：PUT /accounts/:id 传 "update"、
   POST /accounts/:id/state 传 "state"，于是同一个动作在审计里留下两种说法
   （缺陷 #46）。现在两边都改为**由"实际改了什么"推出**，判据唯一。

   前端是独立构建（无法 import af-storage），且演示模式没有后端可问，
   因此这份判据在前端 fixture 与后端实现里各有一份。复制不可避免，
   但漂移的后果不对等：dev 模式给出"修改了"、真实环境给出"停用了"，
   两边看起来都没坏，读审计的人却会得到相反结论。所以这里逐项比对。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const frontendSrc = read("../src/api/client.ts");
const backendStore = read("../../packages/af/af-storage/src/store.ts");
const backendRepo = read("../../packages/af/af-api/src/repositories/accounts-repository.ts");

/* 判据本身：只有 state **单独**变化才算停用/恢复。
   三份实现必须写出同一个表达式——比对表达式而不是比对行为，
   因为这里没有运行器可以驱动它们，而表达式就是这条判据的全部内容。 */
const JUDGEMENT = "changedFields.length === 1 && changedFields[0] === 'state' ? 'state' : 'update'";
const JUDGEMENT_FE = 'changedFields.length === 1 && changedFields[0] === "state" ? "state" : "update"';

for (const [label, src, needle] of [
  ["af-storage store.ts（权威实现）", backendStore, JUDGEMENT],
  ["af-api 内存替身", backendRepo, JUDGEMENT],
  ["前端 fixture", frontendSrc, JUDGEMENT_FE],
] as const) {
  assert.ok(src.includes(needle), `${label} 未按唯一判据推出 action（期望出现：${needle}）`);
}

/* 反向断言：这三处都不得再接受调用方传入的 action。
   只查"新判据在不在"是不够的——旧参数若还留着并被使用，
   新判据就成了摆设（这正是缺陷 #46 修复前的形状：两处都在，取的是参数）。 */
assert.ok(
  !/fixtureWriteAccount\(\s*accountId\s*,\s*input\s*,\s*"update"\s*\)/.test(frontendSrc),
  '前端 PUT 仍在向 fixtureWriteAccount 声明 action',
);
assert.ok(
  !/fixtureWriteAccount\(\s*accountId\s*,\s*\{\s*state\s*\}\s*,\s*"state"\s*\)/.test(frontendSrc),
  '前端 POST /state 仍在向 fixtureWriteAccount 声明 action',
);

/* action 的取值域必须与 DTO 一致：多一个少一个都会让界面落到兜底分支。 */
const dto = read("../src/api/types.ts");
const actionType = dto.match(/action:\s*"create"\s*\|\s*"update"\s*\|\s*"state"/);
assert.ok(actionType, 'AccountAuditDto.action 的取值域变了，界面分支需同步');
const beTypes = read("../../packages/af/af-storage/src/types.ts");
assert.ok(
  /z\.enum\(\['create',\s*'update',\s*'state'\]\)/.test(beTypes),
  'af-storage 的 account audit action 取值域与前端 DTO 不一致',
);

console.log("auditAction.test: 三份实现的 action 判据同源（state 单独变化才算停用/恢复），且无调用方声明式残留");
