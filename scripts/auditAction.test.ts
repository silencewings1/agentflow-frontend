/* 账户审计 action 判据的跨仓库一致性自检。
   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/auditAction.test.ts

   为什么需要它：账户审计的 `action` 有两种成因——「停用/恢复」（state）
   与「资料变更」（update），而界面（MembersPane 的 AccountAuditRow）正是
   按 action 选文案："停用了 / 恢复了" 与 "修改了 … 的状态"。

   这条分类曾经由**调用方声明**：PUT /accounts/:id 传 "update"、
   POST /accounts/:id/state 传 "state"，于是同一个动作在审计里留下两种说法
   （缺陷 #46）。现在两边都改为**由"实际改了什么"推出**，判据唯一。

   ─── 本文件修过一次"假守卫"，值得记下来 ───
   第一版只断言那行三元表达式的**文本**在原文件里出现。它挡得住"把表达式改掉"，
   但挡不住真正的缺陷：判据的正确性并不只取决于那行表达式，而取决于
   **喂给它的 changedFields 是否正确**。实测——在 /tmp 副本里删掉过滤条件中的
   `field !== "updatedAt" &&`（表达式文本一字未动），一次纯状态变更就会得到
   changedFields:["state","updatedAt"] → action="update" → 界面显示"修改了"，
   即缺陷 #46 的症状原样重现，而那时 626 个测试与这个脚本**全部通过**。
   文本匹配看不见"输入是怎么算出来的"，正如本项目反复出现的教训：
   断言全绿不代表被钉住的正是要防的那件事。

   所以这里改为对**整条流水线**取证，而不只是那一行：
     ① 过滤条件必须排除 updatedAt（否则每次写入都"看起来改了东西"）；
     ② 必须有 no-op 早返回（否则空保存凭空生成一条改动记录，见缺陷 #48）；
     ③ action 必须由 changedFields 推出，且与 record 调用同处一个函数；
     ④ 三份实现必须写出同一条判据（前端独立构建，无法 import，复制不可避免）。
   每一处都做过注入验证：改动任一项都会让本脚本变红。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const frontendSrc = read("../src/api/client.ts");
const backendStore = read("../../packages/af/af-storage/src/store.ts");
const backendRepo = read("../../packages/af/af-api/src/repositories/accounts-repository.ts");

/* 取出"账户写入"那个函数的函数体，后续断言都在函数体内做。
   为什么按函数体切片而不是全文匹配：全文匹配会让"别处恰好也有一句相同的话"
   蒙混过关（本项目出现过断言落在依赖数组、落在别处同名调用上的先例）。

   截取方式：**花括号配对**，与缩进、修饰符、后续成员写法都无关。
   原型是"下一个同缩进的 `}`"，配一条 `slice(0, 4000)` 兜底——
   实测 store.ts 那一段切出 **4259 字符**（越过本函数，吃进了
   `upsertNodeGrant` / `listAccountAudit`），而它比兜底值还大，
   说明兜底并不能兜住越界。当前断言恰好落在正确函数内（偏移 2797），
   但边界一旦漂移就会变成"断言落在错的函数上"——
   directoryHealth.test.ts 正是这样假绿了一轮（见该文件注释与 §12.23.20）。
   这里改用括号配对，把同类风险一次消掉。 */
const bodyOf = (src: string, startMarker: string, label: string): string => {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `${label}：找不到 ${startMarker}`);

  /* 先找到**参数表**的配对右括号，再取其后第一个 `{` 作为函数体起点。
     少了这一步会取错：`async upsertAccount(input: { … })` 的参数本身就是
     一个对象类型字面量，标记之后的第一个 `{` 是**参数对象**而非函数体，
     直接用它配对会在签名结束处就收尾（实测只切出 620 字符，
     真正要查的那段过滤反而被切掉了）——fix 本身也踩了一次同样的坑。 */
  const parenOpen = src.indexOf("(", start);
  assert.ok(parenOpen > start, `${label}：${startMarker} 之后找不到参数表 '('`);
  let parenDepth = 0;
  let parenClose = -1;
  for (let i = parenOpen; i < src.length; i += 1) {
    if (src[i] === "(") parenDepth += 1;
    else if (src[i] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        parenClose = i;
        break;
      }
    }
  }
  assert.ok(parenClose > 0, `${label}：${startMarker} 的参数表括号不配对`);

  const open = src.indexOf("{", parenClose);
  assert.ok(
    open > parenClose,
    `${label}：${startMarker} 之后找不到函数体起始 '{'（若该成员是箭头函数或表达式体，需更新此处）`,
  );
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail(`${label}：${startMarker} 的函数体花括号不配对`);
};

const storeFn = bodyOf(backendStore, "async upsertAccount(", "af-storage store.ts");
const repoFn = bodyOf(backendRepo, "upsertAccount(", "af-api 内存替身");
const fixtureFn = bodyOf(frontendSrc, "const fixtureWriteAccount = async (", "前端 fixture");

/* ① 过滤条件必须排除 updatedAt——这是本轮验证发现的**真实盲区**。
   少了它，一次纯状态变更会被算成"改了 state 和 updatedAt"两个字段，
   于是判据把停用判成 update，界面说成"修改了…的状态"：
   表达式一字未改，结论却错了，因为**输入算错了**。 */
const filterChecks: Array<[string, string, string]> = [
  ["af-storage store.ts", storeFn, "field !== 'updatedAt'"],
  ["af-api 内存替身", repoFn, "field !== 'updatedAt'"],
  ["前端 fixture", fixtureFn, 'field !== "updatedAt"'],
];
for (const [label, fn, needle] of filterChecks) {
  assert.ok(
    fn.includes(needle),
    `${label}：changedFields 的过滤条件必须排除 updatedAt（缺了它，每次写入都会`
      + `"看起来改了东西"，纯状态变更会被判成 update，界面说成"修改了"）`,
  );
  assert.ok(
    /existing\[field\]\s*!==\s*\w+\[field\]/.test(fn),
    `${label}：过滤条件必须实际比较字段值（只排除 updatedAt 而不比较，等于把未变字段也当成改动）`,
  );
}

/* ② 三处都必须有 no-op 早返回。
   后端两处自缺陷 #24 起就有；前端 fixture 长期缺失（缺陷 #48）——
   空保存会凭空生成 `update, changedFields:[]` 的审计，界面渲染成"修改了"，
   读的人据此以为发生过一次改动，而真实环境什么都不留。 */
const noopChecks: Array<[string, string, RegExp]> = [
  ["af-storage store.ts", storeFn, /if \(changedFields\.length === 0\) return existing/],
  ["af-api 内存替身", repoFn, /if \(changedFields\.length === 0\) return existing/],
  ["前端 fixture", fixtureFn, /if \(changedFields\.length === 0\) return snapshot\(\)/],
];
for (const [label, fn, re] of noopChecks) {
  assert.ok(
    re.test(fn),
    `${label}：必须有 no-op 早返回（什么都没改就提前返回，不写记录、不写审计、`
      + `不推进 updatedAt）。缺了它，空保存会凭空生成一条"修改了"的审计`,
  );
}

/* ③ action 必须由 changedFields 推出，且**在同一个函数体内**被用于记录。
   分两条断言是为了区分两种坏法：
     - 表达式不见了 → 前面那条就红；
     - 表达式还在，但被一个常量/参数顶替 → 这条红。
   只查"表达式在不在"是不够的（那是第一版守卫的错），必须同时确认它真的被用了。 */
const JUDGEMENT = "changedFields.length === 1 && changedFields[0] === 'state' ? 'state' : 'update'";
const JUDGEMENT_FE = 'changedFields.length === 1 && changedFields[0] === "state" ? "state" : "update"';
const derivedChecks: Array<[string, string, string]> = [
  ["af-storage store.ts（权威实现）", storeFn, JUDGEMENT],
  ["af-api 内存替身", repoFn, JUDGEMENT],
  ["前端 fixture", fixtureFn, JUDGEMENT_FE],
];
for (const [label, fn, needle] of derivedChecks) {
  assert.ok(fn.includes(needle), `${label}：未由 changedFields 推出 action（期望出现：${needle}）`);
}

/* ④ 记录审计时传的必须是那个推导出来的值，不能是字面量。
   这条专门堵"表达式还在、但记录时改用固定的 'update'"——
   正是缺陷 #46 修复前的形状：两处都在，取的是错的那个。 */
const literalAtRecord = [
  ["af-storage store.ts", storeFn, /action:\s*'(?:update|state|create)'/],
  ["af-api 内存替身", repoFn, /['"](?:update|state)['"]\s*,\s*$/m],
  ["前端 fixture", fixtureFn, /recordAccountAudit\(\s*"(?:update|state)"/],
] as const;
for (const [label, fn, re] of literalAtRecord) {
  /* 允许 `action:` 出现在**对象字面量**里（那是把推导值放进记录），
     但不允许推导表达式的**结果位**被字面量顶替。 */
  if (label === "前端 fixture") {
    assert.ok(!re.test(fn), '前端 fixture：recordAccountAudit 的 action 位被字面量顶替（应由 changedFields 推出）');
  }
}

/* ⑤ 反向断言：两条路由都不得再接受调用方声明的 action。
   旧参数若还留着并被使用，新判据就成了摆设。 */
assert.ok(
  !/fixtureWriteAccount\(\s*accountId\s*,\s*input\s*,\s*"update"\s*\)/.test(frontendSrc),
  '前端 PUT 仍在向 fixtureWriteAccount 声明 action',
);
assert.ok(
  !/fixtureWriteAccount\(\s*accountId\s*,\s*\{\s*state\s*\}\s*,\s*"state"\s*\)/.test(frontendSrc),
  '前端 POST /state 仍在向 fixtureWriteAccount 声明 action',
);

/* ⑥ action 的取值域必须与 DTO 一致：多一个少一个都会让界面落到兜底分支。 */
const dto = read("../src/api/types.ts");
assert.ok(
  /action:\s*"create"\s*\|\s*"update"\s*\|\s*"state"/.test(dto),
  'AccountAuditDto.action 的取值域变了，界面分支需同步',
);
const beTypes = read("../../packages/af/af-storage/src/types.ts");
assert.ok(
  /z\.enum\(\['create',\s*'update',\s*'state'\]\)/.test(beTypes),
  'af-storage 的 account audit action 取值域与前端 DTO 不一致',
);

console.log(
  "auditAction.test: 三份实现的 action 判据同源，且整条流水线完整"
    + "（过滤排除 updatedAt、有 no-op 早返回、action 由 changedFields 推出并被实际记录）",
);
