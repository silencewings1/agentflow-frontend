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
     静默取到错误的那个（本仓库已有"锚在注释而非承重语句"的教训）。

     锚点必须带**词尾**，否则 substring 匹配会漏（第 178 轮实测）：
     把声明改名成 `accountHandleSchemaRenamed` 后，
     `indexOf("const accountHandleSchema")` 依然命中它的**前缀**——
     守卫报告"后端与前端判定同源"却绿着，而它验的已是另一段代码。
     更进一步：把真 schema 挪到文件末尾、原位留一个同前缀的诱饵，
     守卫照样全绿，且毫无察觉地验证了**诱饵**。

     ⇒ 判据从"找得到前缀"收紧为"**恰有一个**整词匹配，且它确实带
     正则字面量"。多一个少一个都要红——那正是被篡改的信号。 */
  const ANCHOR = "const accountHandleSchema";
  const occurrences = [...backendSrc.matchAll(new RegExp(`\\b${ANCHOR}\\b\\s*=`, "g"))];
  assert.ok(
    occurrences.length === 1,
    `期望恰好 1 处 "${ANCHOR} =" 声明，实得 ${occurrences.length} 处。`
      + `\n0 处 = 声明被改名或删除；≥2 处 = 出现了同名或同前缀的诱饵，`
      + `守卫会取到错误的那一个（第 178 轮实测：真 schema 被挪走、留诱饵，守卫仍全绿）。`,
  );
  const declAt = occurrences[0]!.index!;
  assert.ok(declAt > 0, "找不到 accountHandleSchema 声明——守卫的锚点已过期");
  const block = backendSrc.slice(declAt, declAt + 900);
  const m = block.match(/\/(\^\[A-Za-z0-9[^\n]*?)\//);
  assert.ok(m, "accountHandleSchema 里找不到正则字面量（是否已改为别的实现？）");
  return new RegExp(m[1]);
})();

/* 前端：把 handleRuleNote 的实现**求值出来**，而不是照抄一份判定。
   照抄等于测自己，规则改了也不会红。 */
const frontendRegexes = (() => {
  /* 与后端锚点同一个理由（第 178 轮实测）：substring 匹配会被
     `handleRuleNoteExtra` 之类的前缀骗过，因此同样要求**整词且恰好一处**。 */
  const FN = "function handleRuleNote";
  const fns = [...frontendSrc.matchAll(new RegExp(`\\b${FN}\\s*\\(`, "g"))];
  assert.equal(
    fns.length, 1,
    `期望恰好 1 处 "${FN}(" 定义，实得 ${fns.length} 处。`
      + `\n0 处 = 被改名或删除；≥2 处 = 有同前缀的同名函数，守卫会取到错误的那个。`,
  );
  const at = fns[0]!.index!;
  assert.ok(at > 0, "找不到 handleRuleNote——守卫的锚点已过期");
  /* 终点锚点必须**整词**匹配（第 187 轮实测）。
     `indexOf("\nfunction nodeRefs")` 只做子串匹配，于是把
     `nodeRefsRenamed` 的**前缀**当成终点：
       改名后 indexOf 仍返回 2995，守卫照样全绿、不报红——
       窗口看似正常，实际终点落在一个**不存在的函数**上。

     这与第 178 轮修的**起点**锚点是同一个坑：那次修好了起点
     （`\bconst accountHandleSchema\b\s*=`），终点这条一直只补了
     "缺失"的情形（-1 → 报锚点过期），没补"同名/同前缀"的情形。
     ⇒ 两个锚点用**同一种**判据，才不会一边紧一边松。 */
  const endAt = findNextFunction(frontendSrc, at, "nodeRefs");
  assert.ok(
    endAt > at,
    `找不到 nodeRefs（handleRuleNote 的窗口终点）——守卫的锚点已过期或被改名。`
      + `缺失会让 slice(at, -1) 取到文件末尾，把别的函数的正则混进来，`
      + `而「恰好一个邮箱式正则」照样成立；被改名成 nodeRefsXxx 时，`
      + `子串匹配还会把那个新函数的前缀当成终点，同样不报红。`
      + `先修守卫，不要放宽断言。`,
  );
  const block = frontendSrc.slice(at, endAt);
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

/**
 * 从 `fromAt` 起找下一个 `function <name>(`，**整词**匹配。
 *
 * 为什么不能用 `indexOf("\nfunction " + name)`：那是子串匹配，
 * `nodeRefsRenamed` 的前缀也会命中，于是窗口终点落在一个
 * 不存在的函数上，而守卫**照常通过**（第 187 轮实测：
 * 把 nodeRefs 改名后 indexOf 仍返回原来的位置）。
 *
 * 与起点锚点的 `\bconst accountHandleSchema\b\s*=` 同一判据：
 * 一边紧一边松，等于两处锚点各有一半盲区。
 *
 * 返回 -1 表示**其后没有这个函数**（真缺失）；若存在同前缀的
 * 其它函数，返回那个位置的同时，`nodeRefs` 这个名字就不再匹配
 * 任何整词声明——调用方据此要求人来判，而不是默默取错窗口。
 */
function findNextFunction(source: string, fromAt: number, name: string): number {
  const decl = new RegExp(`^function ${name}\\s*\\(`, "gm")
  decl.lastIndex = fromAt
  const m = decl.exec(source)
  return m === null ? -1 : m.index
}
