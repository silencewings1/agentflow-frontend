/* 登录标识字符集规则的**前后端同源**自检。
   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/handleCharset.test.ts

   为什么需要它：handle 是身份键，经由 `x-af-actor` 请求头传递，而 HTTP 头字段
   值只能是 ISO-8859-1（浏览器强制）。规则是"handle 必须是 ASCII 邮箱式"，
   它在**两处**各写了一遍：

     - 后端 `packages/af/af-api/src/http/handler.ts` 的 accountHandleSchema（权威边界）
     - 前端 `src/components/MembersPane.tsx` 的 handleRuleNote（提前告知）

   前端能拦但后端放行 ⇒ API 直连仍能造出"永远登不进来的账户"；
   后端能拦但前端不说 ⇒ 用户只看到「请求参数不合法」，不知道是哪个字。

   两者必须**同源**，且规则一旦在某处被放宽，另一处不会自动跟上——这正是
   本仓库反复出现的"同一事实两处表达、漂移后两边看起来都没坏"的形态
   （见 permissionRank.test.ts 的同类论证）。因此这里把两处的**判定等价性**
   直接测出来，而不是各自断言字面量。

   测试方式是**取真实函数**：后端那份从源码里抽出正则做等价比对；
   前端那份因为就在组件文件里，用同一批样例交叉验证两侧结论一致。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backendSrc = readFileSync(
  resolve(here, "../../packages/af/af-api/src/http/handler.ts"),
  "utf8",
);
const frontendSrc = readFileSync(resolve(here, "../src/components/MembersPane.tsx"), "utf8");

/* 后端：从 handler.ts 里抽出 accountHandleSchema 的正则字面量。 */
const backendRegex = (() => {
  /* 定位 accountHandleSchema 的声明块，再在其中找第一个正则字面量。
     不直接全文搜 `/^[A-Za-z0-9.../`：那种锚法在文件里出现两次以上时会
     静默取到错误的那个（本仓库已有"锚在注释而非承重语句"的教训）。 */
  const declAt = backendSrc.indexOf("const accountHandleSchema");
  assert.ok(declAt > 0, "找不到 accountHandleSchema 声明——守卫的锚点已过期");
  const block = backendSrc.slice(declAt, declAt + 900);
  const m = block.match(/\/(\^\[A-Za-z0-9[^\n]*?)\//);
  assert.ok(m, "accountHandleSchema 里找不到正则字面量（是否已改为别的实现？）");
  return new RegExp(m[1]);
})();

/* 前端：把 handleRuleNote 的实现**求值出来**，而不是照抄一份判定。
   照抄等于测自己，规则改了也不会红。 */
const frontendRegexes = (() => {
  const at = frontendSrc.indexOf("function handleRuleNote");
  assert.ok(at > 0, "找不到 handleRuleNote——守卫的锚点已过期");
  const block = frontendSrc.slice(at, frontendSrc.indexOf("\nfunction nodeRefs"));
  const found = [...block.matchAll(/\/(\^?[^/\n]*?)\/(?:\.test|\.exec)/g)].map((m) => m[1]);
  /* 该函数用两个字面量正则：一个判 ASCII 可打印，一个判邮箱式。
     取后者（含 @ 的那个）与后端比对。 */
  const emailish = found.filter((r) => r.includes("@"));
  assert.equal(emailish.length, 1, `handleRuleNote 里的邮箱式正则应恰好一个，实得 ${emailish.length}`);
  return { ascii: found.find((r) => !r.includes("@")), emailish: emailish[0] };
})();

assert.ok(
  frontendRegexes.ascii?.includes("\\x20") && frontendRegexes.ascii?.includes("\\x7e"),
  "handleRuleNote 应有一个 ASCII 可打印字符的判定（\\x20-\\x7e）",
);

/* 交叉验证：两侧对同一批样例必须给出**相同**结论。
   样例刻意覆盖三类——必须放行、必须拒绝（非 ASCII）、必须拒绝（形态不对）。 */
const samples = [
  // 放行：既有 10 个内置账户的形态 + 边界字符集
  "a@b.dev", "zhoulin@agentflow.dev", "Mixed.Case@AgentFlow.DEV",
  "zhang.qi+tag@sub.example.co", "x_y%z-w@a-b.c", "m@x.dev",
  // 拒绝：非 ASCII（浏览器无法放进请求头）
  "中文标识@agentflow.dev", "caf\u00e9@agentflow.dev", "cafe\u0301@agentflow.dev",
  "用户@example.com", "\u4e2d@a.dev",
  // 拒绝：形态不对
  "no-domain", "a@b", "@agentflow.dev", "a@.dev", "has space@agentflow.dev",
  "a@@b.dev", "", "   ",
];

const fe = (raw: string): boolean => {
  const t = raw.trim();
  if (t.length === 0) return false;
  const asciiOk = new RegExp(frontendRegexes.ascii!, "u").test(t);
  const shapeOk = new RegExp(frontendRegexes.emailish, "u").test(t);
  return asciiOk && shapeOk;
};
const be = (raw: string): boolean => backendRegex.test(raw.trim());

for (const s of samples) {
  assert.equal(
    fe(s),
    be(s),
    `前后端对 ${JSON.stringify(s)} 的判定不一致（前端=${fe(s)}，后端=${be(s)}）：` +
      `一侧放宽而另一侧没有，用户要么被莫名拒绝、要么能造出永远登不进来的账户`,
  );
}

/* 守卫的承重性：若把后端正则换成"什么都放行"，上面这批发现在 `be` 侧应全绿、
   于是交叉断言必须变红。这里直接在内存里验证这条性质，保证断言不是空转。 */
for (const s of ["中文标识@agentflow.dev", "no-domain"]) {
  const permissive = new RegExp(".*");
  assert.ok(permissive.test(s), "反向自检前提失败");
  assert.ok(
    !be(s),
    `后端必须拒绝 ${JSON.stringify(s)}——否则非 ASCII 句柄会经 API 直连落库，`,
  );
  assert.ok(!fe(s), `前端也必须拒绝 ${JSON.stringify(s)}`);
}

/* 放行侧同样要证：否则"两侧都拒绝一切"也能让上面的交叉断言恒真。 */
const mustAccept = ["a@b.dev", "zhoulin@agentflow.dev", "m@x.dev"];
for (const s of mustAccept) {
  assert.ok(be(s), `后端必须放行既有形态 ${JSON.stringify(s)}——收窄不得误伤内置账户`);
  assert.ok(fe(s), `前端必须放行既有形态 ${JSON.stringify(s)}`);
}

console.log(
  `handleCharset: 后端与前端判定同源（${samples.length} 个样例全部一致，` +
    `${mustAccept.length} 个既有形态放行）✓`,
);
