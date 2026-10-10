/**
 * 守卫：收回授权后的那句文案，必须是**算出来的**，不是硬编码的。
 *
 * ## 为什么需要这条守卫
 *
 * 收回授权时界面原先恒定输出「该责任位已无操作者」。那个字符串在任何分支上
 * 都不读授权数据，因此它与事实无关、恒为真。实测（真实后端）撤回李雯在
 * `design-review` 的授权后，toast 这么写，而该位当时仍有周林（manage）与
 * 杨知远（approve）两人在承担。
 *
 * 这类文案比没有文案更糟：它把**可核验的假事实**用肯定语气说出来，
 * 读者据此会以为该节点没人了，进而重复授权或误判风险。
 *
 * ## 这条守卫为什么长这样
 *
 * `MembersPane.tsx` 是 .tsx，`node --experimental-strip-types` 不支持——
 * 于是不能在守卫里直接 import 那个组件。做法是：从**源码里**取出
 * `remainingOperators` 的函数体，剥掉 TypeScript 类型标注后 `new Function`
 * 执行，并用真实形状的目录数据驱动它。这保证测的是**仓库里当前那段实现**，
 * 而不是守卫里另抄一份逻辑（抄一份的守卫会在实现被改坏时照样通过）。
 *
 * 两个方向都必须覆盖：
 *   ① 该位还有别人 ⇒ 必须点名列出，且**不得**说"已无操作者"
 *   ② 该位确实没人 ⇒ 必须说"已无操作者"
 * 只测 ② 的话，把 `rest.length === 0` 写成恒真也能过；
 * 只测 ① 的话，把恒假也能过。两侧同时钉住才排除恒定输出。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "..", "src", "components", "MembersPane.tsx"), "utf8");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail === "" ? "" : `\n      ${detail}`}`);
  }
}

/* ── 1. 从源码取出 remainingOperators 的实现 ───────────────────────────── */

const anchor = "const remainingOperators = useCallback(";
const at = SRC.indexOf(anchor);
check("源码里能找到 remainingOperators 的定义", at !== -1);

if (at === -1) {
  console.error("\n找不到锚点，守卫无法承重（实现被改名或搬走了？）");
  process.exit(1);
}

/* 从 `(fresh:` 开始截到该箭头函数体结束。用配对括号扫描而不是正则，
   因为函数体内部有 for/if 多层嵌套，正则数不准。 */
const bodyStart = SRC.indexOf("=> {", at);
check("能定位到函数体起点", bodyStart !== -1);
let i = SRC.indexOf("{", bodyStart);
let depth = 0;
let bodyEnd = -1;
for (; i < SRC.length; i += 1) {
  const c = SRC[i];
  if (c === "{") depth += 1;
  else if (c === "}") {
    depth -= 1;
    if (depth === 0) {
      bodyEnd = i;
      break;
    }
  }
}
check("能扫描到函数体的配对右括号", bodyEnd !== -1);

/* 括号配对取出参数列表。`useCallback((a, b, c) => {…}, [])` 的形状意味着
   尾部还有一个 `,)`，必须靠配对扫描精确切到那对括号为止。 */
const pOpen = SRC.indexOf("(", at + anchor.length);
let pd = 0;
let pClose = -1;
for (let k = pOpen; k < SRC.length; k += 1) {
  if (SRC[k] === "(") pd += 1;
  else if (SRC[k] === ")") {
    pd -= 1;
    if (pd === 0) {
      pClose = k;
      break;
    }
  }
}
const params = SRC.slice(pOpen + 1, pClose);
const body = SRC.slice(SRC.indexOf("{", bodyStart), bodyEnd + 1);

/* 参数名不得写死：从源码里认出来，实现改名（如 fresh → dto）时守卫自动跟随。
   写死参数名会让守卫在重命名后静默失效——那是最坏的一种"绿"。 */
const paramNames = params
  .replace(/<[^>]*>/g, "")
  .split(",")
  .map((p) => p.split(":")[0]?.trim() ?? "")
  .filter((p) => p !== "");
check(
  `参数名从源码读出（${paramNames.join(", ")}）`,
  paramNames.length === 3,
  `预期 3 个参数，实得 ${paramNames.length}`,
);

/* 剥掉类型标注后执行。

   不要用「类型名清单」的方式做替换——试过，两种写法都错：
     ① `: string` 写在 `: Set<string>` 之前 ⇒ `Set<string>` 被啃成 `Set<>`；
     ② 按从长到短排好后，`Set<string>` 那一支末尾的 `\b` 又永远不成立
        （`>` 与 `(` 都不是词字符，两者之间**没有**词边界）。
   症状都在 `new Function` 里报成 "Unexpected token ')'"，很容易误判成
   函数体有问题。改成按**语法形状**匹配：`:` + 标识符 +（可选泛型）+（可选 []）。
   `\bas\b` 同理。遇到这两种之外的 TS 语法，`new Function` 会 fail loud。 */
const stripped = body
  .replace(/:\s*[A-Za-z_$][\w$]*(?:<[^>]*>)?(?:\[\])*/g, "")
  .replace(/\bas\s+[A-Za-z_$][\w$.]*(?:<[^>]*>)?/g, "")
  /* 表达式位置的泛型：`new Set<string>()`、`new Map<K, V>()`。
     它们**没有冒号**，因此上面那条标注替换够不着；留下的 `<string>`
     在 JS 里是语法错误，报在紧跟的 `)` 上（"Unexpected token ')'"），
     位置具有很强的误导性。这里按“`new` + 标识符 + 尖括号”精确切除。 */
  .replace(/\bnew\s+([A-Za-z_$][\w$]*)\s*<[^>]*>/g, "new $1");

let compute: ((fresh: unknown, ref: unknown, excluded: string) => Array<{ name: string }>) | null = null;
try {
  compute = new Function(
    `return function (${paramNames.join(", ")}) ${stripped}`,
  )() as typeof compute;
  check("从源码提取的实现可以执行", true);
} catch (error) {
  check("从源码提取的实现可以执行", false, String(error));
}

/* ── 2. 真实形状的数据驱动两个方向 ──────────────────────────────────────── */

if (compute !== null) {
  const REF = { workflowId: "wf-1", nodeId: "design-review" };

  /* 形状与 GET /accounts 的 data 一致：账户带 state，授权带 accountId。
     只保留实现真正读到的字段，避免守卫假装校验了它不看的字段。 */
  const directory = {
    accounts: [
      { accountId: "ac-lw", name: "李雯", state: "active" },
      { accountId: "ac-orch", name: "周林", state: "active" },
      { accountId: "ac-yz", name: "杨知远", state: "active" },
      { accountId: "ac-off", name: "停用者", state: "suspended" },
      { accountId: "ac-other", name: "别位持有人", state: "active" },
      { accountId: "ac-otherwf", name: "别编排持有人", state: "active" },
    ],
    grants: [
      { accountId: "ac-lw", workflowId: "wf-1", nodeId: "design-review", perm: "view" },
      { accountId: "ac-orch", workflowId: "wf-1", nodeId: "design-review", perm: "manage" },
      { accountId: "ac-yz", workflowId: "wf-1", nodeId: "design-review", perm: "approve" },
      /* 停用者：授权还在目录里，但行使不了，因此**不算**覆盖。
         这一条与后端 wouldOrphanDirectory 同源（它同样按 state 过滤），
         若实现漏了 state 判断，下面第 ③ 条会红。 */
      { accountId: "ac-off", workflowId: "wf-1", nodeId: "design-review", perm: "manage" },
      /* 别的责任位：不得被算进来。
         **必须由一个"在该位上没有授权"的人持有**——这里踩过一次：
         初版让 ac-orch 同时持有 design-review 与 implementation，
         而实现里按 accountId 去重，于是"漏掉 nodeId 过滤"这个注入
         被去重静默吸收，守卫照样全绿（实测：注入 C 全通过）。
         换句话说，那版数据无法区分"按责任位过滤"与"按人去重"。
         换成独立账户后，漏过滤 ⇒ 人数变 3 ⇒ ① 侧立刻红。 */
      { accountId: "ac-other", workflowId: "wf-1", nodeId: "implementation", perm: "manage" },
      /* 别的编排、同名节点：同样由一个独立账户持有，防止只按 nodeId 过滤
         而漏掉 workflowId。 */
      { accountId: "ac-otherwf", workflowId: "wf-2", nodeId: "design-review", perm: "manage" },
    ],
  };

  /* ① 撤掉李雯之后：还有周林与杨知远两人 */
  const rest = compute(directory, REF, "ac-lw");
  /* 比集合而不是比数组顺序：实现返回的是目录里的出现顺序，它与期望顺序
     没有约定；用 `sort()` 也会踩中文排序（码点序 ≠ 拼音序，实测
     "杨知远" 排在 "周林" 之前），那是断言写法的问题，不是实现的问题。 */
  const names = rest.map((a) => a.name).sort();
  const want = ["周林", "杨知远"].sort();
  check(
    "① 该位还有别人时，算出的正是剩下的人",
    JSON.stringify(names) === JSON.stringify(want),
    `实得 ${JSON.stringify(names)}，期望 ${JSON.stringify(want)}`,
  );
  check(
    "① 不得把停用者算作操作者",
    !names.includes("停用者"),
    `实得 ${JSON.stringify(names)}`,
  );
  check(
    "① 不得把别的责任位/别的编排算进来",
    names.length === 2,
    `实得 ${names.length} 人：${JSON.stringify(names)}`,
  );

  /* ② 撤掉李雯后、且该位再无他人 ⇒ 空数组（文案据此说"已无操作者"） */
  const soloDirectory = {
    accounts: directory.accounts,
    grants: [{ accountId: "ac-lw", workflowId: "wf-1", nodeId: "design-review", perm: "view" }],
  };
  const none = compute(soloDirectory, REF, "ac-lw");
  check(
    "② 该位确实没人时算出空（文案才说得出「已无操作者」）",
    none.length === 0,
    `实得 ${JSON.stringify(none.map((a) => a.name))}`,
  );

  /* ③ 全是被停用的授权 ⇒ 同样算出空。这一条把"按 state 过滤"钉死：
     若实现漏了 state 判断，它会返回 [停用者] 而这里红。 */
  const suspendedOnly = {
    accounts: directory.accounts,
    grants: [
      { accountId: "ac-lw", workflowId: "wf-1", nodeId: "design-review", perm: "view" },
      { accountId: "ac-off", workflowId: "wf-1", nodeId: "design-review", perm: "manage" },
    ],
  };
  const onlySuspended = compute(suspendedOnly, REF, "ac-lw");
  check(
    "③ 只剩停用者的授权 ⇒ 仍算作「无操作者」（与后端 wouldOrphanDirectory 同源）",
    onlySuspended.length === 0,
    `实得 ${JSON.stringify(onlySuspended.map((a) => a.name))}`,
  );

  /* ── 3. 文案必须是条件输出，不能是常量 ───────────────────────────────── */

  const toastStart = SRC.indexOf("const rest = remainingOperators(");
  check("收回分支确实调用了 remainingOperators 来算", toastStart !== -1);
  const toastSlice = SRC.slice(toastStart, toastStart + 900);
  check(
    "文案按 rest.length 分支（不是恒定一句）",
    /rest\.length === 0/.test(toastSlice),
    "未发现 rest.length === 0 的判定",
  );
  check(
    "「已无操作者」只出现在「没人」的那一侧",
    /rest\.length === 0\s*\?\s*`[^`]*已无操作者/.test(toastSlice.replace(/\s+/g, " ")),
    "「已无操作者」的判定结构变了，请人工确认它仍以 rest.length 为条件",
  );
  check(
    "「还有别人」的一侧会列出名字（而不是只说「还有人」）",
    /join\("、"\)/.test(toastSlice),
    "未发现对剩余操作者名字的 join",
  );

  /* ── 4. 反向自检：把实现改成硬编码，守卫必须红 ───────────────────────────
     直接改真实源码文件做注入是危险的（守卫会留在磁盘上）。
     这里改为对**内存里的字符串**做同样的提取流程，确认它能识别出坏实现。 */
  const badBody = `{
    return [{ name: "always" }];
  }`;
  const bad = new Function(`return function (${paramNames.join(", ")}) ${badBody}`)() as typeof compute;
  const badRest = bad(directory, REF, "ac-lw");
  check(
    "反向自检：恒定输出的实现会被 ② 侧断言判红",
    compute !== null && (badRest.length !== 0 && none.length === 0),
    "反向自检未能构造出差异——两条断言可能退化成同一个结论",
  );
}

console.log(failures === 0 ? "\noperatorCoverage: 全部通过" : `\noperatorCoverage: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
