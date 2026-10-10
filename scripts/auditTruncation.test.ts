/**
 * 守卫：界面说「显示了多少条」时，那个数字必须等于它真的渲染了多少条。
 *
 * ## 为什么需要这条守卫
 *
 * 审计面板的正文写死了「此处仅显示最新 **50** 条」，而渲染用的是
 * `.slice(0, 8)`。50 是**服务端页大小**（`GET /accounts` 恒返 50 条），
 * 8 才是读者在屏幕上看到的东西。后果是同一屏上自相矛盾：
 *
 *     授权变更记录  共 227 条，显示最新 8 条     ← 小节标题
 *     …（8 行）
 *     目录共 227 条授权变更，此处仅显示最新 50 条；…  ← 脚注
 *
 * 这不是排版问题。本项目的首要主张是「留痕优先」，而"到底显示了多少、
 * 还有多少没显示"正是这个面板要回答的核心问题。两个相邻句子给出不同答案时，
 * 读者无法判断该信哪一个，也就无法判断自己有没有看到全部治理事实。
 *
 * 更糟的是它属于**看起来更精确**的那类错误：50 是个具体的、貌似经过计算的
 * 数字，比"若干条"更让人信服，因此更不容易被怀疑。
 *
 * ## 这条守卫检查什么
 *
 * 静态检查：`MembersPane.tsx` 里渲染审计行数的地方与所有"显示最新 N 条"
 * 文案，必须引用**同一个具名常量**，不得各写各的字面量。
 * 并且那个常量必须真的被用于 `slice`。
 *
 * 为什么是静态检查而不是运行时断言：运行时只能在特定数据下看到某一档文案
 * （`Total > len` 与 `Total > 8` 两条分支互斥），漏掉的分支不会被覆盖。
 * 静态检查能同时覆盖两条分支，因为它们共享同一个常量。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/* 必须**剥掉注释**再检查：源码里保留了本次缺陷的说明（「原先写死了
   「仅显示最新 50 条」」），不剥的话那些注释会被当成真实文案，
   让守卫对一处已经修好的代码误报（实测：3 条假失败，全部来自注释）。
   JSX 注释与块注释同形，因此这一条替换能一并覆盖两者。 */
const RAW = readFileSync(join(here, "..", "src", "components", "MembersPane.tsx"), "utf8");
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail === "" ? "" : `\n      ${detail}`}`);
  }
}

/* ── 1. 存在一个具名常量表达"界面渲染多少条" ──────────────────────────── */
const declMatch = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)/g;
let rowsConst: { name: string; value: number } | null = null;
for (const m of SRC.matchAll(declMatch)) {
  if (/ROW|SHOWN|LIMIT|PAGE/i.test(m[1])) {
    rowsConst = { name: m[1], value: Number(m[2]) };
    break;
  }
}
check(
  "存在表达「界面渲染多少条」的具名常量",
  rowsConst !== null,
  "未找到形如 AUDIT_ROWS_SHOWN = 8 的常量声明",
);
if (rowsConst !== null) {
  const { name, value } = rowsConst;
  console.log(`      （读出 ${name} = ${value}）`);

  /* ── 2. 该常量必须真的用于渲染切片 ─────────────────────────────────── */
  const sliceUses = [...SRC.matchAll(/\.slice\(0,\s*([A-Za-z_$][\w$]*)\)/g)].map((m) => m[1]);
  const auditSlices = sliceUses.filter((s) => s === name).length;
  check(
    "审计渲染的 slice 使用该常量（而不是字面量）",
    auditSlices >= 2,
    `slice(0, ${name}) 出现 ${auditSlices} 次，期望 ≥2（账户审计 + 授权审计）`,
  );

  /* ── 3. 所有"显示最新 N 条"文案都必须引用它，不得写字面量 ───────────── */
  /* 文案可能写成 `共 X 条，显示最新 ${...} 条`（模板串）或
     `本页显示最新 N 条（共 X 条）`（JSX 文本）。两种都要覆盖。 */
  const claimRe = /显示最新\s*\{?([^}）\n]*?)\}?\s*条/g;
  const bad: string[] = [];
  for (const m of SRC.matchAll(claimRe)) {
    const inner = (m[1] ?? "").trim();
    /* 合法形态：里面出现该常量名（可能在 Math.min(...) 里）。 */
    if (inner.includes(name)) continue;
    /* 纯数字字面量 ⇒ 就是本次缺陷的形态。 */
    if (/^\d+$/.test(inner)) bad.push(`显示最新 ${inner} 条（字面量）`);
    else bad.push(`显示最新 ${inner} 条（未引用 ${name}）`);
  }
  check(
    "每条「显示最新 N 条」文案都引用该常量",
    bad.length === 0,
    bad.join("；"),
  );

  /* ── 4. 反向自检 ─────────────────────────────────────────────────────
     确认第 3 条真的会拦下本次缺陷的原始形态。 */
  const original = "此处仅显示最新 50 条；";
  const originalInner = /显示最新\s*([^条]*)条/.exec(original)?.[1]?.trim() ?? "";
  check(
    "反向自检：原始缺陷文案（写死的 50）会被判为不合规",
    /^\d+$/.test(originalInner) && !originalInner.includes(name),
    `解析出的内层为 "${originalInner}"，未被识别为字面量`,
  );

  /* ── 5. 这两处不得再用其它数字当"页内显示量" ─────────────────────────
     服务端页大小（50）是被允许出现在**其它**语境里的（例如"服务端只回一页"），
     但不允许再出现在"显示最新"文案里——第 3 条已覆盖。这里额外确认
     常量值本身没有退化成服务端页大小（那会让"显示 50 条"再次说谎）。 */
  check(
    `常量值 ${value} 反映界面真实渲染量（不应等于服务端页大小 50）`,
    value !== 50,
    "常量值等于服务端页大小，说明它记录的是服务端行为而非界面行为",
  );
}

console.log(failures === 0 ? "\nauditTruncation: 全部通过" : `\nauditTruncation: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
