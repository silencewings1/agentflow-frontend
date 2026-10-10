/* 治理动作的责任位准入守卫。
   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/governanceAdmission.test.ts

   为什么需要它：后端在 2026-10 给 11 条治理写路由补齐了「责任位」闸门
   （见 doc/implementation-plan.md §12.23.31 / §12.23.32）。在此之前那些路由
   只校验「是不是已登记账户」，因此界面**不需要**按权限置灰它们——一个能创建
   任务的账户，在界面里点什么都只是走个流程。

   补齐之后出现一个新的失效面：**界面照常可点、点了必然 403**。
   前端 AGENTS.md §4.3 明确禁止这种呈现：

     「任何会造成不可逆后果的操作，在前置条件未满足时必须显式呈现受阻，
       而不是照常可点然后报错。」

   本脚本把「界面判据」与「后端档位」的一致性钉住，因为这两份实现分处两个
   仓库（主仓库 handler.ts / 前端 App.tsx），没有任何机制会提醒它们失配：
   后端改档位，前端不会报错；前端改档位，后端也不会。

   检查项：
     ① 后端每条治理写路由的**实际档位**（从 handler.ts 读）与下方登记表一致；
     ② 前端 canGovernanceAction 的调用点数量与登记表一致（漏改一个分支 = 漏一个动作）；
     ③ primaryAction 的返回值必须带 `blocked` 字段（否则 govHint 无法说出原因）；
     ④ App.tsx 不得把受阻理由只放进 title —— §4.3 要求「显式呈现」。
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(resolve(here, p), "utf8");

const handler = read("../../packages/af/af-api/src/http/handler.ts");
const app = read("../src/App.tsx");
/* 模型配置的准入呈现住在 Settings.tsx，不在 App.tsx —— 平台级路由的受阻态
   只有在这个文件里才看得到。 */
const settings = read("../src/components/Settings.tsx");
const sidebar = read("../src/components/Sidebar.tsx");

/* ── 登记表：后端路由 → 档位 ──────────────────────────────────────────
   档位口径由用户确认（「审查/判据/计划裁决=approve，澄清/规格/编译=run，
   方案/计划=manage」，见 §12.23.31）。任务级路由用「任一节点持有该档」判定；
   只有节点审查要求**被审节点**上持 approve（后端 URL 里带 nodeId）。 */
/* git 写操作为 run 而不是 manage：判据来自种子授权 seedGrantsFor
   （`node.kind === 'git'` → delivery → run）。见 §12.23.34。 */
const EXPECTED: Array<{ route: string; level: "run" | "approve" | "manage"; byNode?: boolean }> = [
  { route: "work-specs", level: "run" },
  { route: "clarifications", level: "run" },
  { route: "compile", level: "run" },
  { route: "proposals", level: "manage" },
  { route: "plans", level: "manage" },
  { route: "plan-decisions", level: "approve" },
  { route: "criterion-assessments", level: "approve" },
  { route: "evidence", level: "approve" },
  { route: "supervisor", level: "manage" },
  { route: "git-operations", level: "run" },
  { route: "cancel", level: "manage" },
  { route: "archive", level: "manage" },
  { route: "unarchive", level: "manage" },
  { route: "start", level: "run" },
  { route: "continue", level: "run" },
  { route: "review", level: "approve", byNode: true },
];

/* ① 后端档位与登记表一致。
   从 handler.ts 里抓 `guard(segments[1]!, '<level>'...)`，并把出现处与路由名关联：
   做法是先按 `segments[2] === 'X'` 切块，再在块内找 guard 调用。 */
const postStart = handler.indexOf("if (method === 'POST') {");
const postEnd = handler.indexOf("if (method === 'PUT') {");
assert.ok(postStart > -1 && postEnd > postStart, "找不到 POST 块");
const postBlock = handler.slice(postStart, postEnd);
const blocks = postBlock.split(/\n    if \(/).slice(1);

const actual = new Map<string, { level: string; byNode: boolean }>();
for (const block of blocks) {
  if (!/segments\[0\] === 'tasks'/.test(block)) continue;
  const guard = block.match(/await guard\(segments\[1\]!, '([a-z]+)'(, segments\[3\]!)?\)/);
  if (!guard) continue;
  const entry = { level: guard[1]!, byNode: guard[2] !== undefined };
  /* 一个块可以覆盖多条路由名：archive/unarchive 共用一个 guard
     （`(segments[2] === 'archive' || segments[2] === 'unarchive')`）。
     逐条登记，否则 unarchive 会被报成"缺少闸门"。 */
  const seg2 = [...block.matchAll(/segments\[2\] === '([a-z-]+)'/g)].map((m) => m[1]!);
  /* 节点审查没有 segments[2]，它的路由名在 segments[4]；
     且那一片段是 'review'，因此单独登记到 canonical 名 'review'。 */
  /* 节点审查的 segments[2] 是 'nodes'（父段），真正的动作名在 segments[4]。
     判据用 segments[4] 是否存在，而不是 seg2 是否为空 —— 上一版写成空判断，
     结果 'nodes' 被当成路由名登记，'review' 永远找不到。 */
  const seg4 = block.match(/segments\[4\] === '([a-z-]+)'/);
  if (seg4) {
    actual.set(seg4[1]!, entry);
    continue;
  }
  for (const name of seg2) actual.set(name, entry);
}
/* evidence-matrix/materialize 与 evidence/materialize 是同一处理器的两种拼写，
   登记 canonical 名即可（前端与登记表统一用 evidence）。 */
if (actual.has("evidence-matrix")) {
  actual.set("evidence", actual.get("evidence-matrix")!);
  actual.delete("evidence-matrix");
}

for (const { route, level, byNode } of EXPECTED) {
  const found = actual.get(route);
  assert.ok(found, `后端缺少 ${route} 的权限闸门（登记表要求 ${level}）`);
  assert.equal(
    found.level, level,
    `${route} 的档位是 ${found.level}，登记表要求 ${level}。` +
      `若这是有意变更，请同步更新本脚本的 EXPECTED 与前端 canGovernanceAction 的调用点。`,
  );
  assert.equal(
    found.byNode, byNode === true,
    `${route} 的 ${byNode ? "应当" : "不应当"}精确到节点（byNode=${found.byNode}）`,
  );
}

/* ② primaryAction 里**每一个**治理动作分支都必须经过 gated()。
   上一版写成"gated() 调用数 >= 6"——注入实测：删掉一个分支的 gated 后
   计数从 7 降到 6，仍然满足 `>= 6`，守卫**放行**了真正的回归。
   数量阈值永远滞后于分支总数，因此改为**结构性判据**：
   该函数体内不允许出现任何直接 `return { ... label: ... }` 的动作分支
   （唯一允许的是 `return null`）。谁新增分支时忘了套 gated，这里立刻变红。 */
const actionStart = app.indexOf("const primaryAction = useMemo(");
const actionEnd = app.indexOf("}, [approveAndContinueTask", actionStart);
assert.ok(actionStart > -1 && actionEnd > actionStart, "找不到 primaryAction 函数体");
const actionBody = app.slice(actionStart, actionEnd);
const unguarded = [...actionBody.matchAll(/return \{[^}]*?label:/g)].map((m) => m[0].slice(0, 60));
assert.deepEqual(
  unguarded, [],
  `primaryAction 里有 ${unguarded.length} 个动作分支没经过 gated()，它们会照常可点：\n  ` +
    unguarded.join("\n  "),
);
const gatedCalls = [...actionBody.matchAll(/return gated\("/g)];

/* ③ primaryAction 的返回类型必须带 blocked。 */
assert.ok(
  /const primaryAction = useMemo\(\(\): \{ label: string; disabled: boolean; onClick: \(\) => void; blocked: string \| null \}/.test(app),
  "primaryAction 的返回类型缺少 blocked 字段；govHint 将无法说出受阻原因",
);

/* ④ 受阻理由必须可见，不能只挂 title。
   判据两条：govHint 里优先返回 primaryAction.blocked；且渲染处用了 data-blocked。 */
assert.ok(
  /if \(primaryAction\?\.blocked\) return primaryAction\.blocked/.test(app),
  "govHint 没有优先返回 primaryAction.blocked —— 受阻理由不会显示在常驻提示位上",
);
assert.ok(
  /data-blocked=\{primaryAction\.blocked !== null\}/.test(app),
  "治理动作按钮没有 data-blocked 受阻态；AGENTS.md §4.3 要求受阻必须显式呈现",
);

/* ⑤ 判据必须与后端同源：前端不得把档位写反。
   抽查最容易写反的一处 —— compile 是 run 不是 manage（本脚本的登记表曾错成
   manage，见 §12.23.33 的修正记录），若前端把它写成 manage，能创建任务却
   只有 run 的账户会看到一个恒久置灰的「检查执行计划」。 */
const compileGate = app.match(/gated\("(\w+)", \{ label: govBusy === "compile"/);
assert.ok(compileGate, "找不到 compilePlan 的 gated 调用");
assert.equal(compileGate[1], "run", `compile 的前端档位是 ${compileGate[1]}，应为 run`);

/* ⑥ 远端写入的两个分支必须是 run（交付角色执行 git 节点，§12.23.34）。
   上一版只核对了后端档位，前端这两处**没有断言**：
   注入实测把前端 git 档位从 run 改回 manage，守卫仍然全绿。
   ——"只守住两份实现中的一份"等于没守住，因为失配恰恰发生在两份之间。 */
const planGate = app.match(/gated\("(\w+)", \{ label: planningOperation/);
assert.ok(planGate, "找不到 planGitOperation 的 gated 调用");
assert.equal(planGate[1], "run", `远端写入（计划）的前端档位是 ${planGate[1]}，应为 run`);

const confirmGate = app.match(/gated\("(\w+)", \{\s*label: confirmingOperationId/);
assert.ok(confirmGate, "找不到 confirmGitOperation 的 gated 调用");
assert.equal(confirmGate[1], "run", `远端写入（确认）的前端档位是 ${confirmGate[1]}，应为 run`);

/* ⑦ 平台级写路由（编排结构 / 模型配置）必须按 canManageAccounts 判权。
   上面 ①② 只扫 `segments[0] === 'tasks'`——那是**任务责任位**那根轴。
   §12.23.37 的两条缺陷（`POST /workflows` 与 `/model-providers`）都长在轴外，
   历轮扫描全绿却漏掉它们：**扫描范围本身就决定了能看见什么**。
   这里不再只扫任务级，而是把平台级那两条也钉住。 */
/* 判据必须**绑定到具体路由块**，不能只查 `handler.includes(marker)`。
   上一版就是 includes：只要文件里**任何地方**出现过 `guardPlatformWrite`
   （包括定义处、另一条路由、甚至注释），四条断言就全绿。
   注入实测：把 `POST /model-providers` 的闸门调用删掉，检查 ⑦ 仍然通过
   —— 守卫报告"平台级 4 条路由已核对"，而被核对的那一条其实已经没了。
   这与 §12.23.37 发现的老问题同源：**判据的范围决定它能看见什么**。
   现在按方法定位块、在块内找该路由与它的闸门调用，缺一即红。 */
const methodBlocks: Array<[string, string, string]> = [
  ["POST", "if (method === 'POST') {", "if (method === 'PUT') {"],
  ["PUT", "if (method === 'PUT') {", "if (method === 'DELETE') {"],
  /* DELETE 是最后一个方法块，没有后继方法标记可作结束边界，
     用它唯一拥有的 `writeNotFound(res, 'route not found: ' + method ...` 收尾
     （该文本在文件里只出现在方法块内的兜底分支中）。 */
  ["DELETE", "if (method === 'DELETE') {", "function queryWindow("],
];
function blockFor(method: string, routeNeedle: string): string {
  const [m, startMarker, endMarker] = methodBlocks.find((b) => b[0] === method) ?? [];
  assert.ok(m !== undefined, `找不到 ${method} 块标记`);
  const start = handler.indexOf(startMarker!);
  const end = handler.indexOf(endMarker!);
  assert.ok(start > -1 && end > start, `找不到 ${method} 块`);
  const block = handler.slice(start, end);
  /* 路由块是 method 块内以 `if (` 起头的段落。
     注意**同一路由名可能出现在多个块里**：`segments[0] === 'workflows'`
     既有 `/workflows/validate`（有意不设闸门，纯校验）也有 `/workflows`（要闸门）。
     因此取"包含 routeNeedle 的**全部**块"，再要求其中**至少一个**含 marker，
     而不是取第一个匹配块 —— 取第一个会撞上 validate 块，误报闸门缺失。
     反过来，若所有含该路由名的块都没有 marker，那才是真的缺失。 */
  const parts = block.split(/\n    if \(/).slice(1);
  const hits = parts.filter((part) => part.includes(routeNeedle));
  assert.ok(hits.length > 0, `${method} ${routeNeedle} 找不到对应的路由块（路由可能被改名或删除）`);
  return hits.join('\n    if (');
}
/* routeNeedle 用**源码里的判定文本**（`segments[0] === 'workflows'`），
   不是 URL 写法：URL 是 `POST /workflows`，源码里是 `segments[0] === 'workflows'`。
   用 URL 去匹配源码永远匹配不上——上一版若直接这么写就会静默漏检。 */
for (const [method, routeNeedle, marker] of [
  ["POST", "segments[0] === 'workflows'", "guardWorkflowWrite"],
  ["POST", "segments[0] === 'model-providers'", "guardPlatformWrite"],
  ["PUT", "segments[0] === 'model-providers'", "guardPlatformWrite"],
  ["DELETE", "segments[0] === 'model-providers'", "guardPlatformWrite"],
] as const) {
  const block = blockFor(method, routeNeedle);
  assert.ok(
    block.includes(marker),
    `${method} ${routeNeedle} 的路由块里找不到 ${marker} —— 平台级闸门被移除或挪走了（§12.23.37）`,
  );
}
/* 前端必须用**同一个判据**呈现受阻，否则界面事实与服务端不一致：
   非管理者会看到可点的按钮，填完表单才收到 403。 */
assert.ok(
  /canManage=\{actor\?\.canManageAccounts === true\}/.test(settings),
  "ModelsPane 没有从 actor.canManageAccounts 取管理权 —— 判据与服务端不同源，"
  + "非管理者的受阻态会与写路径不一致",
);
assert.ok(
  /data-blocked=\{!canManage\}/.test(settings),
  "模型配置的写控件缺 data-blocked 受阻态；AGENTS.md §4.3 要求前置条件未满足时显式呈现受阻",
);
/* 受阻态不能只是"置灰可点"：必须在派发前就拦住，否则用户填完整张表单才收到 403。 */
assert.ok(
  /if \(!canManage\) \{[\s\S]{0,220}return;/.test(settings),
  "模型配置的写操作没有在派发前拦住无管理权的身份 —— 用户会白填一整张表单",
);

/* ⑧ 会话列表的行内动作（取消运行 / 归档 / 恢复）必须有准入呈现。
   后端这三条路由要求 manage；界面此前**没有**对应呈现：零授权身份
   照样能点，走完二次确认才收到 403 —— AGENTS.md §4.3 明令禁止的形态。
   同一文件里 newTaskAdmission 早就做对了，行内动作漏了（§12.23.49）。

   判据绑定到**具体元素**而不是"文件里出现过某字符串"：
   本仓库已因 includes 式的宽松判据吃过亏（§12.23.41），
   因此这里要求 data-blocked 与说明原因的 title 同时出现在
   `.sess__act` 那一个按钮上。 */
assert.ok(
  /canManageSession/.test(sidebar),
  "Sidebar 没有接收 canManageSession —— 行内动作的准入判据缺失（§12.23.49）",
);
assert.ok(
  /className="sess__act"[\s\S]{0,600}?data-blocked=\{!canManageSession/.test(sidebar),
  "会话行内动作按钮缺 data-blocked 受阻态；AGENTS.md §4.3 要求前置条件未满足时显式呈现受阻",
);
assert.ok(
  /canManageSession\(s\.workflow\)\.allowed\s*\n?\s*\?\s*actionLabel\(s\)/.test(sidebar),
  "行内动作按钮的 title 必须在受阻时改说原因 —— 只置灰不说原因，用户会以为是界面故障",
);
/* 准入必须在二次确认**之前**：放在之后会先问「确定取消？」再 403。 */
assert.ok(
  /const runAction = \(s: Session\) => \{[\s\S]{0,320}?if \(!canManageSession\(s\.workflow\)\.allowed\) return;[\s\S]{0,120}?window\.confirm/.test(sidebar),
  "准入必须拦在 window.confirm 之前 —— 否则用户先被问「确定取消？」再收到 403",
);
/* 判据源在 App 侧，与 canGovernanceAction 同源（都在 App.tsx 里按 grant 判）。 */
assert.ok(
  /canManageSession = useCallback\([\s\S]{0,900}?permRank\(grant\.perm\) >= permRank\("manage"\)/.test(app),
  "App.tsx 的 canManageSession 判据与后端档位不同源（应判 manage）",
);

console.log(`治理动作准入守卫：${EXPECTED.length} 条后端路由档位一致、${gatedCalls.length} 处前端调用点已加准入、平台级 4 条路由与前端受阻态已核对。`);
