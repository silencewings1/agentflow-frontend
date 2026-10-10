/**
 * 守卫：登录页「另有 N 个账户已停用（名单）」的 N 与名单必须都不含当前身份。
 *
 * ## 为什么需要这条守卫
 *
 * `Login.tsx` 在两条相邻的段落里各说了一件事：
 *
 *   ① 当前身份「李雯」已停用，不能登录。…        ← 点名当前身份
 *   ② 另有 6 个账户已停用（李雯、王勖、…）        ← 复述含当前身份的整张表
 *
 * ② 用的是 `accounts.filter(state === 'suspended')`，**包含当前身份**。
 * 于是措辞与计数同时错：
 *   - 「另有」= 除已提到的之外，而名单第一项就是刚被提到的那个，语义矛盾；
 *   - 说「另有 6 个」，实际除她之外只有 5 个；
 *   - 读者想弄清"还有谁也停用了"，第一个看到的却是自己。
 *
 * 这与 §七之四十八（审计面板「说了 50 条只显示 8 条」）同族：
 * **数字与措辞断言了一个没有真正计算过的事实**。
 *
 * 边界情形也要对：若当前身份是**唯一**的停用者，这段话必须整块消失
 * （确实没有"另有"），而不是留下「另有 0 个账户已停用（）」。
 *
 * ## 静态检查的理由
 *
 * 运行时要造出"当前身份已停用"需要真的停用一个账户再登录，
 * 而这正是本项目里最不该被测试反复触发的治理操作。
 * 语料是纯字面量，静态检查既充分又不产生副作用。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(here, "..", "src", "components", "Login.tsx"), "utf8");
/* 剥注释：源码里保留了本次缺陷的说明（含「另有 6 个账户已停用（李雯、…）」原样引用），
   不剥会被当成真实文案。教训来自 §七之四十八 的守卫误报。 */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail === "" ? "" : `\n      ${detail}`}`);
  }
}

/* ── 1. 必须存在一个"排除当前身份"的派生名单 ─────────────────────────── */
/* 锚点必须落在**承重**的那一行：`=[\s\S]{0,400}?` 这种宽松跨度会先匹配到
   前面无关的 const（实测匹配到了 directoryUnhealthy），于是后面四条检查
   全部对着错误的变量名判据。改为直接锚 `actor?.state === "suspended"`
   这一段特征串——它在本文件里只出现于这一处派生。 */
const derived = /const\s+([A-Za-z_$][\w$]*)\s*=\s*actor\?\.state\s*===\s*"suspended"[\s\S]{0,200}?accountId\s*!==\s*actor\.accountId/.exec(SRC);
check(
  "存在排除当前身份的停用名单",
  derived !== null,
  "未找到形如 suspended.filter(a => a.accountId !== actor.accountId) 的派生",
);

const derivedName = derived?.[1] ?? null;
if (derivedName !== null) {
  console.log(`      （读出派生名单名 ${derivedName}）`);

  /* ── 2. 该派生必须只在当前身份确实停用时生效 ─────────────────────────
     若恒排除当前身份，则当**别人**停用、当前身份在职时，
     会把在职身份从名单里错误排除（若他在名单里本就不该出现）；
     更重要的是排除条件绑定在 `actor?.state === "suspended"` 上，
     语义是"当前身份也在停用名单里，故需从'另有'中剔除"。 */
  const guard = new RegExp(
    String.raw`const\s+` + derivedName + String.raw`\s*=[\s\S]{0,200}?actor\?\.state\s*===\s*"suspended"`,
  );
  check(
    "派生名单以「当前身份已停用」为条件",
    guard.test(SRC),
    `未在 ${derivedName} 的定义里看到 actor?.state === "suspended" 判断`,
  );

  /* ── 3. 渲染「另有 N 个」时必须用该派生，而不是含本人的全表 ─────────── */
  const claim = /另有\s*\{([^}]*)\}\s*个账户已停用/.exec(SRC);
  check(
    "「另有 N 个」的 N 来自该派生名单",
    claim !== null && claim[1]!.includes(derivedName),
    claim === null
      ? "未找到「另有 {…} 个账户已停用」文案"
      : `N 的表达式为 "${claim[1]}"，未引用 ${derivedName}`,
  );

  /* ── 4. 名单本身也必须来自该派生 ───────────────────────────────────── */
  const list = /另有[\s\S]{0,200}?\.map\(\(account\)\s*=>\s*account\.name\)/.exec(SRC);
  check(
    "「另有」的名单来自该派生名单",
    list !== null && list[0]!.includes(derivedName),
    list === null
      ? "未找到名单的 .map(account => account.name)"
      : "名单表达式里未引用 " + derivedName,
  );

  /* ── 5. 整块必须由该名单的长度把关（唯一停用者时整块消失）──────────── */
  const gate = new RegExp(String.raw`\{` + derivedName + String.raw`\.length\s*>\s*0\s*&&`);
  check(
    "整块由该派生名单的长度把关（唯一停用者时整块消失）",
    gate.test(SRC),
    `未找到 {${derivedName}.length > 0 && …} 形式的渲染条件`,
  );

  /* ── 6. 反向自检：还原缺陷形态必须被判为不合规 ─────────────────────── */
  const defective = `{suspended.length > 0 && (<p>另有 {suspended.length} 个账户已停用（{suspended.map((account) => account.name).join("、")}）</p>)}`;
  const dClaim = /另有\s*\{([^}]*)\}\s*个账户已停用/.exec(defective);
  check(
    "反向自检：原始缺陷形态（用含本人的 suspended）会被判为不合规",
    dClaim !== null && !dClaim[1]!.includes(derivedName) && dClaim[1]!.includes("suspended"),
    `解析出的 N 为 "${dClaim?.[1]}"，未被识别为含本人全表`,
  );
}

console.log(failures === 0 ? "\nsuspendedList: 全部通过" : `\nsuspendedList: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
