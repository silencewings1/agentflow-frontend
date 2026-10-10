/**
 * 守卫：`disabled` 的控件不得看起来可用。
 *
 * ## 为什么需要这条守卫
 *
 * `disabled` 只影响点击派发，**不影响渲染**。本仓库有若干控件是"标签/卡片"
 * 形态（`.tag`、`.profilePick__item`、`.flagBtn`、`.iconBtn`、`.permCell`、
 * `.permRow__revoke`），它们的常态样式本来就带强调色与 `cursor: pointer`，
 * 于是"被禁用"与"可用"在屏幕上完全一致。实测两处（真实后端 + 无头浏览器）：
 *
 *   ① 成员与权限矩阵·非管理者：44 个格子全部 disabled，却仍 `cursor: pointer`，
 *      悬停时边框转 accent 并抬起；收回按钮被 `.permRow:hover` 提到 opacity 1
 *      并染上 rose。点下去无请求、无提示、什么都不发生。
 *   ② 新建任务·冻结编排：32 个控件全部 disabled 且 opacity 1 + pointer，
 *      其中角色标签连 title 都没有。面板写明「展开只用于查看节点分工」，
 *      却给出一整屏看起来可点的控件。
 *
 * 这是前端 AGENTS.md §4.3 直接禁止的形态。比"可点然后报错"更糟：
 * 报错至少说明原因，而这里连"被拒绝"都没有发生。
 *
 * ## 这条守卫检查什么
 *
 * 纯静态检查 CSS：凡是 JSX 里出现 `disabled=` 的类名，必须在 CSS 里能找到
 * 使其**在视觉上与可用态不同**的规则——要么 `:disabled` 改变 opacity/颜色/
 * 指针，要么被同一选择器组里的基础类覆盖（如 `.btn:disabled`），
 * 要么用了 `pointer-events: none`（等价强度：事件根本不落到元素上）。
 *
 * ## 为什么值得写成守卫
 *
 * 这个缺陷的成因正是"逐处补漏"：`#72` 只给 `input[data-fixed]` 补了收缩守卫，
 * 于是同类问题在别的控件上重演；本次也只覆盖了 `.permCell`/`.permRow__revoke`，
 * 直到把 JSX 与 CSS 全面对表才发现 `.tag`/`.profilePick__item`/`.flagBtn`/
 * `.iconBtn` 四个类名**从未有过** `:disabled` 规则。守卫把"补漏"变成"对表"。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail === "" ? "" : `\n      ${detail}`}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(SRC);

/* ── 1. 收集 JSX 中带 disabled= 的类名 ──────────────────────────────────── */
const jsxClasses = new Set<string>();
for (const f of files.filter((p) => p.endsWith(".tsx"))) {
  const txt = readFileSync(f, "utf8");
  /* 只在 `className="..."` 与 `disabled={` 同处一个开标签内时才算。
     用非贪婪匹配到最近的 `>`，避免跨元素误配。 */
  for (const m of txt.matchAll(/className="([^"]+)"[^>]*?disabled=\{/gs)) {
    for (const c of m[1].split(/\s+/)) if (c !== "") jsxClasses.add(c);
  }
}
check(`收集到 JSX 中带 disabled= 的类名（${jsxClasses.size} 个）`, jsxClasses.size > 0);

/* ── 2. 读 CSS（去注释） ────────────────────────────────────────────────── */
const cssFiles = files.filter((p) => p.endsWith(".css") || p.endsWith(".css.ts"));
const rawCss = cssFiles.map((p) => readFileSync(p, "utf8")).join("\n");
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");

/* ── 3. 逐个类名要求"受阻有视觉差异" ─────────────────────────────────────
   三种可接受形态：
     a. `.X:disabled` 或 `.X[disabled]` 自己带规则；
     b. 出现在某条含 `:disabled` 的**选择器组**里（`.a:disabled, .b:disabled`）；
     c. 该选择器组里另有一个"基础类"能覆盖它——本仓库的 `.btn` 家族即如此
        （`.btn--outline` 依赖 `.btn:disabled`）。用 `pointer-events: none`
        的规则同样算数，且强度更高。 */
const disabledSelectors: string[] = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1];
  const body = m[2];
  if (!/:disabled|\[disabled/.test(sel)) continue;
  disabledSelectors.push(`${sel}{${body}}`);
}
check("CSS 里存在 disabled 相关规则", disabledSelectors.length > 0);

const coveredByGroup = (cls: string): boolean => {
  for (const rule of disabledSelectors) {
    const [selRaw, bodyRaw] = [
      rule.slice(0, rule.indexOf("{")),
      rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}")),
    ];
    const parts = selRaw.split(",").map((s) => s.trim());
    const hit = parts.some((p) => new RegExp(`\\.${cls.replace(/[-_]/g, "[-_]")}(?![-\\w])`).test(p));
    if (!hit) continue;
    /* 必须真的产生视觉差异。只写 cursor 不够——指针不改变观感，
       悬浮仍会让它看起来像"正在响应"。 */
    const changesLook = /opacity|background|color|border|filter|visibility/.test(bodyRaw);
    const killsEvents = /pointer-events\s*:\s*none/.test(bodyRaw);
    if (changesLook || killsEvents) return true;
  }
  return false;
};

/* 基础类回退：`.btn--outline` 的受阻由 `.btn:disabled` 承担。
   从类名里剥掉 `--` 后缀与 `-sm`/`-block` 这类尺寸修饰再试一次。 */
const coveredByBase = (cls: string): boolean => {
  const bases = new Set<string>();
  if (cls.includes("--")) bases.add(cls.split("--")[0] ?? "");
  for (const suf of ["-sm", "-block", "-lg"]) {
    if (cls.endsWith(suf)) bases.add(cls.slice(0, -suf.length));
  }
  if (/^[a-zA-Z]+--/.test(cls) === false && cls.includes("-")) bases.add(cls.split("-")[0] ?? "");
  /* 双下划线是 BEM 元素（`permRow__revoke`），其"基"只看自身，不跨块回退：
     元素级的受阻必须自己声明，避免 `permRow` 的规则被误当成覆盖了子元素。 */
  if (cls.includes("__")) bases.delete(cls.split("__")[0] ?? "");
  for (const b of bases) {
    if (b === "" || b === cls) continue;
    if (coveredByGroup(b)) return true;
  }
  return false;
};

/* 只保留**结构性**的两条通路：类名自己有规则，或它依赖的基础类（`.btn`）
   有规则。不要在此处再放"已知合法"白名单兜底——初版有这么一份
   （`KNOWN_COVERED`），后果是：把 `.tag:disabled` 整条删掉后，`.tag` 因为在
   白名单里而被放行，守卫对**它要防的那个缺陷本身**全绿（实测注入 A 全通过）。
   一个在白名单里的类名等于不受检查，所以这份清单只能记录"哪些是基础类"，
   不能记录"哪些不用管"。 */
const missing: string[] = [];
for (const cls of [...jsxClasses].sort()) {
  if (coveredByGroup(cls)) continue;
  if (coveredByBase(cls)) continue;
  missing.push(cls);
}
check(
  "每个带 disabled= 的类名都有「受阻可观」的 :disabled 规则",
  missing.length === 0,
  `缺规则的类名：${missing.join(", ")}`,
);

/* 反向自检：两条通路都必须被真正检验，否则守卫可能恒真或恒假。
   做法是临时往 `disabledSelectors` 里塞一条**人造**规则，看判定是否随之改变。
   `coveredByGroup` 读的是这份数组，因此不需要落盘即可自检。 */
function probeWith(cls: string, ruleBody: string): boolean {
  const saved = disabledSelectors.slice();
  disabledSelectors.length = 0;
  disabledSelectors.push(`.${cls}:disabled { ${ruleBody} }`);
  const r = coveredByGroup(cls);
  disabledSelectors.length = 0;
  disabledSelectors.push(...saved);
  return r;
}

check(
  "反向自检：只改 cursor 的规则不算覆盖",
  probeWith("probe-cursor", "cursor: not-allowed;") === false,
  "只改指针被误判为覆盖——守卫会对「仍看起来可用」放行",
);
check(
  "反向自检：改 opacity 的规则算覆盖",
  probeWith("probe-opacity", "opacity: 0.5;") === true,
  "改 opacity 未被认作覆盖——守卫会恒假、永不通过",
);
check(
  "反向自检：pointer-events: none 也算覆盖（事件不落到元素上）",
  probeWith("probe-pe", "pointer-events: none;") === true,
  "pointer-events: none 未被认作覆盖",
);

console.log(failures === 0 ? "\ndisabledAffordance: 全部通过" : `\ndisabledAffordance: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
