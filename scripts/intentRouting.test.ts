/* 输入区意图路由自检脚本。
   前端没有测试运行器，因此与其它守卫脚本一样是自包含的 Node 断言脚本：
     node --experimental-strip-types scripts/intentRouting.test.ts

   为什么需要它（用户实测反馈：真实模式下「新建任务无法运行」）：
   `runTurn` 的 http 分支原本只 `push()` 一条提示就 `return`，什么也不做。
   而空态（Welcome）的输入区与种子卡片都接到 `runTurn`，于是用户在空态里
   写下意图、点发送，实际发生的是：
     - 一个写请求都没发出（实测 0 个）；
     - 输入框被 `Composer.submit` 里的 `setValue("")` 清空，字**消失**了；
     - 提示 Toast 3.6s 后自动消失，页面回到原样。
   用户看到的就是「点了发送，字没了，什么都没发生」。

   这条路径在 fixture 模式下完全正常（`runTurn` 会跑演示流），所以只要用
   `npm run dev` 的 fixture 形态验收就发现不了——正是它长期留存的原因。
   真实模式下唯一合法的落点是新建任务，因此这里钉住三件事：
     (a) http 分支必须把意图交给创建入口，而不是丢弃；
     (b) 交给入口的必须是**用户写的那段话**，不能是常量或空串；
     (c) 对话框确实接收并用作任务目标初值。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(resolve(here, "../src/App.tsx"), "utf8");
const newTask = readFileSync(resolve(here, "../src/components/NewTask.tsx"), "utf8");

/* 注释里会出现 `runTurn`、`setNewTaskIntent` 等词，先剥掉注释再断言，
   否则「写注释说明不该这么写」反而会让断言变绿（历史上踩过这个坑）。 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const appBody = stripComments(app);
const newTaskBody = stripComments(newTask);

/* ── (a) http 分支必须改道到创建入口，而不是丢弃 ── */
const runTurnStart = appBody.indexOf("const runTurn = useCallback(");
assert.notEqual(runTurnStart, -1, "找不到 runTurn 定义，断言锚点失效");
/* 取 http 分支的整段：从 mode === "http" 到它自己的 return */
const httpBranchStart = appBody.indexOf('afApi.mode === "http"', runTurnStart);
assert.notEqual(httpBranchStart, -1, "找不到 runTurn 里的 http 分支");
const httpBranch = appBody.slice(httpBranchStart, appBody.indexOf("return;", httpBranchStart) + 8);

assert.match(
  httpBranch,
  /setNewTaskOpen\(\s*true\s*\)/,
  "真实模式下输入区提交必须打开新建任务入口；只弹提示就等于把用户的输入丢掉",
);
assert.match(
  httpBranch,
  /setNewTaskIntent\(/,
  "真实模式下必须把用户写的意图存下来带进创建流程",
);

/* ── (b) 带过去的必须是用户写的那段话（不是常量、不是空串） ── */
const intentCall = httpBranch.match(/setNewTaskIntent\(([^)]*)\)/);
assert.ok(intentCall, "找不到 setNewTaskIntent 调用");
const intentArg = intentCall[1].trim();
assert.equal(
  intentArg,
  "prompt",
  `意图必须原样传用户写下的 prompt，当前传的是 \`${intentArg}\``,
);

/* ── (c) 对话框接收并用作任务目标初值 ── */
assert.match(
  newTaskBody,
  /initialPrompt\s*=\s*""/,
  "NewTaskDialog 需要 initialPrompt 参数（缺省空串，保持「不预填演示任务」的原有约束）",
);
/* 只断言「用了 initialPrompt」不够：`useState("")` 换成常量也能让正则通过。
   这里直接钉住初值表达式本身。 */
assert.match(
  newTaskBody,
  /useState\(\s*initialPrompt\s*\)/,
  "任务目标必须以 initialPrompt 为初值，否则意图虽然传进来了却被丢掉",
);

/* ── (d) 改道必须发生在弹提示**之前** ──
   只断言「分支里有 setNewTaskOpen」还不够：把改道写在 `push(...)` 之后
   （或写进某个不会被执行的角落）同样能让上面几条变绿，但用户拿到的仍是
   「只有提示、没有入口」。顺序才是这条不变量的实质。 */
const orderRoute = httpBranch.indexOf("setNewTaskIntent(");
const orderOpen = httpBranch.indexOf("setNewTaskOpen(");
const orderNotice = httpBranch.indexOf("push(");
assert.notEqual(orderNotice, -1, "http 分支应当向用户说明为什么改道");
assert.ok(
  orderRoute < orderNotice,
  "必须先完成改道（存意图）再弹提示，否则提示会先于入口出现",
);
assert.ok(
  orderOpen < orderNotice,
  "必须先打开创建入口再弹提示，否则用户看到的仍只有一条提示",
);

/* ── (e) 意图必须在两种收尾路径都被清掉，不能复现到下一条任务 ── */
const clearSites = (appBody.match(/setNewTaskIntent\(\s*""\s*\)/g) ?? []).length;
assert.ok(
  clearSites >= 2,
  `意图至少要在「关闭对话框」与「创建成功」两处清掉，当前只有 ${clearSites} 处`,
);

console.log("intentRouting: 5 组断言通过");
