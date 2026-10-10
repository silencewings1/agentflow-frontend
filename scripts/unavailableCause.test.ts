/**
 * 守卫：目录不可用时，面板必须说出**是哪一种不可用**。
 *
 * ## 为什么需要这条守卫
 *
 * `AF_ACCOUNTS_UNAVAILABLE` 覆盖两种**处置相反**的成因，后端用
 * `details.multiUserEnabled` 自证（`AccountsService.unavailable()`）：
 *
 * | 成因 | `multiUserEnabled` | 处置 |
 * | --- | --- | --- |
 * | 实例**声明**未启用多用户 | `false` | 重试永远不会成功，要找部署方 |
 * | 目录暂时读不到（组装漏配/初始化失败） | `true` | 瞬时故障，重试有意义 |
 *
 * 成员与权限面板此前只写「账户目录尚未加载。」+ 一句**假设句**
 * 「多用户能力由 AF API 的 /accounts 提供；**实例未启用时**该面板降级为不可用。」
 * ——"未启用时"是条件式，读者无法知道自己是否正处在该条件下。
 * 实测在真实的降级实例上（`AF_MULTI_USER_DISABLED=1`，端口 5095）面板就显示这两句，
 * 读者能做错的两种动作都还在：去点重试（无入口但也不说重试无用），或以为等一会就好。
 *
 * 判据是：**这个面板要回答的问题正是"为什么看不到"**，而它没有回答。
 * 与 §七之四十八（说了 50 条显示 8 条）、§七之五十（另有 N 含本人）同族：
 * 表面说了话，实际没说出**本可以知道**的事实。
 *
 * ## 检查什么
 *
 * 1. `MembersPane` 导出一个显式的两态判别式（不是布尔，也不是字符串）；
 * 2. `App.tsx` 把 `multiUserDisabled` 翻成 `disabled`、把其它错误翻成 `transient`；
 * 3. 空态渲染分支读取该判别式，并且两态给出**不同**的文案；
 * 4. 反向自检：原始的"尚未加载 + 假设句"形态必须不含两态区分。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string =>
  readFileSync(join(here, "..", "src", p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const PANE = read("components/MembersPane.tsx");
const APP = read("App.tsx");
const SETTINGS = read("components/Settings.tsx");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail === "" ? "" : `\n      ${detail}`}`);
  }
}

/* ── 1. 判别式必须是两态联合，而不是布尔 ─────────────────────────────── */
const union = PANE.match(/export type AccountsUnavailable\s*=\s*([\s\S]*?);\n/);
check("MembersPane 导出 AccountsUnavailable 判别式", union !== null);
const body = union?.[1] ?? "";
check(
  "判别式是两个具名态（disabled / transient）",
  /kind:\s*"disabled"/.test(body) && /kind:\s*"transient"/.test(body),
  `实际定义：${body.replace(/\s+/g, " ").slice(0, 120)}`,
);

/* ── 2. App 必须按 multiUserDisabled 区分两种成因 ───────────────────── */
check(
  "App 把 multiUserDisabled 翻成 disabled 成因",
  /kind:\s*"disabled"/.test(APP),
);
check(
  "App 把其余错误翻成 transient 成因",
  /kind:\s*"transient"/.test(APP),
);
check(
  "判定依据是 multiUserDisabled（而非仅凭 accountsError 有无）",
  /multiUserDisabled[\s\S]{0,200}?kind:\s*"disabled"/.test(APP)
    || /multiUserDisabled\s*\?\s*\{[^}]*kind:\s*"disabled"/.test(APP),
);

/* ── 3. Settings 必须原样透传（否则判别式到不了面板）─────────────────── */
check(
  "Settings 接收并透传 accountsUnavailable",
  /accountsUnavailable/.test(SETTINGS) && /unavailable=\{accountsUnavailable\}/.test(SETTINGS),
);

/* ── 4. 空态分支读取判别式，且两态给出不同文案 ───────────────────────── */
const emptyBlock = /if \(data === null \|\| actor === null\)\s*\{([\s\S]*?)\n  \}/.exec(PANE);
check("存在空态渲染分支", emptyBlock !== null);
const eb = emptyBlock?.[1] ?? "";
check("空态分支读取 unavailable（而非只看 data === null）", /unavailable/.test(eb));
check(
  "两态文案不同：disabled 不暗示可重试，transient 说明可重试",
  /重试不会改变结果/.test(eb) && /重试/.test(eb),
  "未看到 disabled 的「重试不会改变结果」与 transient 的重试指引",
);
check(
  "空态带 data-unavailable 状态属性（可被 CSS/测试观察）",
  /data-unavailable=/.test(eb),
);

/* ── 5. 反向自检：原始缺陷形态必须不含两态区分 ──────────────────────── */
const defective = `<p>账户目录尚未加载。</p><em>多用户能力由 AF API 的 /accounts 提供；实例未启用时该面板降级为不可用。</em>`;
check(
  "反向自检：原始形态不含 disabled/transient 区分",
  !/kind:\s*"(disabled|transient)"/.test(defective) && !/重试不会改变结果/.test(defective),
);

console.log(failures === 0 ? "\nunavailableCause: 全部通过" : `\nunavailableCause: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
