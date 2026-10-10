/* 设计令牌消费自检。
   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/cssTokens.test.ts

   为什么需要它：AGENTS.md §二「验证纪律」把"新增 CSS 后必须确认所用的每个
   `var(--token)` 真实存在"列为**提交前必查项**，§九 的自检清单也再列了一遍，
   原因是这里出过两次真实事故（`--surface-1` / `--line-2` 直接使用但从未定义），
   表现都是**静默降级**——页面上不会有任何报错，只是主题切换时错位、
   或者某个设计意图（等宽字体、过渡动画）根本没生效。

   靠人眼在 2000+ 行 CSS 里逐个搜索是不可靠的，所以这里把它变成可执行的断言。

   覆盖两类问题，因为它们的失效方式不同：

   1. **无 fallback 的未定义令牌** —— 整条声明解析失败。
      `font-family: var(--mono)` ⇒ 字体静默继承父级；
      `transition: transform var(--t-fast)` ⇒ 过渡不存在，属性突变。
      这类最难发现：页面上"看起来能用"，只是设计意图没了。

   2. **带 fallback 的未定义令牌** —— §九 明确禁止的写法。
      `var(--text-5, var(--text-4))` 视觉上等于 `--text-4`，
      保留 fallback 会让读者以为存在一个更淡的令牌，误导后续维护。

   同时记录**合法例外**，避免守卫变成"噪音"而被人关掉：
   - `--i` / `--si` / `--gi`：运行期由 JS 注入的错峰序号（列出入场动画）；
   - 局部作用域定义：§6.3 的 `--layer` 间接层模式，如 `--swatch` / `--now`,
     它们在 `[data-*]` 选择器里定义、由规则统一消费，不属"缺失"。
   例外的判定方式是"是否真的有人定义它"，而不是硬编码白名单——
   白名单会随着代码演进过期，而"有没有定义"永远是真问题。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../src");

/** 递归收集 src 下所有 CSS 文件。 */
const cssFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith(".css") ? [p] : [];
  });

/** 去掉注释，避免把注释里提到的令牌名当成真实使用（本文件也大量提到它们）。 */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const files = cssFiles(srcDir);
assert.ok(files.length > 0, "找不到任何 CSS 文件——守卫的路径假设已经过期");

/* 令牌的定义位置不限于 index.css：§6.3 允许在局部作用域用 `--layer` 间接层
   定义自定义属性（`--swatch` / `--now` 就是这样）。因此"是否定义"要在
   **全部 CSS** 里判定，而不是只查 index.css——否则守卫会把合法用法误报成缺陷。 */
const allCss = files.map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");
const defined = new Set<string>();
for (const m of allCss.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);

/** 运行期由 JS 注入，CSS 里定义不了。 */
const runtimeInjected = new Set(["--i", "--si", "--gi"]);

type Use = { token: string; file: string; line: number; hasFallback: boolean };

/* 逐个 `var(--x, fallback)` 解析出令牌名与是否带 fallback。
   `var(--x` 之后可能紧跟 `,` 或 `)`；用非贪婪匹配到第一个逗号或右括号。 */
const uses: Use[] = [];
for (const file of files) {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
      uses.push({
        token: m[1],
        file: file.replace(resolve(here, "..") + "/", ""),
        line: i + 1,
        hasFallback: m[2] === ",",
      });
    }
  });
}

assert.ok(uses.length > 100, `只解析到 ${uses.length} 处 var() 用法，解析逻辑可能已失效`);

const missing = uses.filter((u) => !defined.has(u.token) && !runtimeInjected.has(u.token));

/* 分类报告：无 fallback 的更严重（声明整条失效）。 */
const hardFailures = missing.filter((u) => !u.hasFallback);
const maskedFailures = missing.filter((u) => u.hasFallback);

const describe = (list: Use[]): string =>
  list.map((u) => `  ${u.file}:${u.line}  var(${u.token}${u.hasFallback ? ", …" : ""})`).join("\n");

assert.equal(
  hardFailures.length,
  0,
  `以下位置使用了**从未定义且没有 fallback** 的令牌，整条声明会解析失败：\n${describe(hardFailures)}\n` +
    `正确处理：在 index.css 的 :root 里补齐令牌（主题无关的）或在两套配色中各补一个值，` +
    `而不是给使用处加 fallback 掩盖（AGENTS.md §九）。`,
);

assert.equal(
  maskedFailures.length,
  0,
  `以下位置使用了**从未定义、但用 fallback 掩盖**的令牌（AGENTS.md §九 明确禁止）：\n${describe(maskedFailures)}\n` +
    `正确处理：若 fallback 那个值就是想要的，直接写它；若确实需要新的一级，补令牌定义。`,
);

/* 反向自检：守卫必须真的能发现缺失令牌，否则上面两条断言可能因为
   **解析逻辑失效而恒真**（例如正则改动后不再匹配 `var(`，uses 变空，
   missing 也变空，于是"全部有定义"永远成立）。

   做法：拿一个**确实在用**的令牌，在内存里把它从"已定义"集合中移除，
   再走一遍同样的判定，确认它会落进 missing。
   这不是形式主义——本仓库已经有过三次"守卫不承重"的真实教训
   （锚在标识符而非调用点、锚在注释而非承重语句、切片为空），
   所以每个守卫都必须证明自己会因为目标缺陷而变红。 */
const probeToken = uses[0].token;
assert.ok(
  defined.has(probeToken),
  `反向自检前提失败：样本令牌 ${probeToken} 竟未定义`,
);
const definedWithoutProbe = new Set(defined);
definedWithoutProbe.delete(probeToken);
const probeMissing = uses.filter((u) => !definedWithoutProbe.has(u.token) && !runtimeInjected.has(u.token));
assert.ok(
  probeMissing.some((u) => u.token === probeToken),
  `反向自检失败：移除 ${probeToken} 的定义后判定仍认为它有定义，` +
    `说明 missing 的计算不承重（恒为空），上面的断言等于没测`,
);

console.log(
  `cssTokens: ${files.length} 个 CSS 文件、${uses.length} 处 var() 用法、` +
    `${defined.size} 个已定义令牌，全部有定义 ✓`,
);
