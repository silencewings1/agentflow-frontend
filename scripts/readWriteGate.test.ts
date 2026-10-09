/* 读/写闸门口径守卫。
   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/readWriteGate.test.ts

   为什么需要它：多用户改造的既定口径是「**读不设墙、写全量有门槛**」
   （用户口径「访问和创建任务时才需要校验权限」，见
   doc/implementation-plan.md §12.14.2）。
   这条口径决定了「权限」在本项目里的含义：它是「能不能**做**」，
   不是「能不能**看**」。

   它有一条现实风险：界面/注释很容易写成"按身份过滤任务""别人看不到我的任务"，
   读代码的人会据此推断存在一条并不存在的数据隔离，进而：
     - 以为把任务列表暴露给任何已登记身份是安全的（**确实如此**，但要说清）；
     - 或者反过来，以为读路径已经有隔离，于是在写路径上放松。

   因此本脚本把三件事钉住：
     ① 服务端读路径**不接收**身份（bootstrap / listTasks 签名里没有 actor）；
     ② 服务端写路径的身份闸门确实存在且按 HTTP 方法生效；
     ③ 前端**不得**声称按身份过滤任务（源码里不允许出现这类断言性文案）。

   ①③ 是"同一判定的两份实现"之外的另一类守卫：它守的是**主张与代码一致**。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(resolve(here, p), "utf8");

const bootstrapSvc = read("../../packages/af/af-api/src/task/bootstrap-service.ts");
const taskSvc = read("../../packages/af/af-api/src/task/task-service.ts");
const handler = read("../../packages/af/af-api/src/http/handler.ts");
const appTsx = read("../src/App.tsx");

/* ── ① 读路径不接收身份 ───────────────────────────────────────────────
   判据是**签名**而不是实现：只要 bootstrap()/listTasks() 的参数里出现 actor，
   "读不设墙"就已经被推翻，无论内部有没有真的用它。 */
{
  const m = bootstrapSvc.match(/async bootstrap\(\s*([^)]*)\)/);
  assert.ok(m, "af-api bootstrap-service.ts 里找不到 bootstrap() 方法");
  const params = m![1]!.trim();
  assert.equal(params, "", `BootstrapService.bootstrap() 不应接收参数（读路径与身份无关），实际收到: ${params}`);

  const m2 = taskSvc.match(/async listTasks\(\s*([^)]*)\)/);
  assert.ok(m2, "af-api task-service.ts 里找不到 listTasks() 方法");
  const params2 = m2![1]!.trim();
  assert.equal(params2, "", `TaskService.listTasks() 不应接收参数（读路径与身份无关），实际收到: ${params2}`);

  /* bootstrap 组装处也不得把身份透传进去（防止有人"顺手"加一个）。 */
  assert.ok(
    /new BootstrapService\(\{[\s\S]*?\}\)/.test(read("../../packages/af/af-api/src/http/services.ts")),
    "services.ts 里找不到 BootstrapService 的构造",
  );
  assert.ok(
    !/new BootstrapService\(\{[\s\S]{0,400}?actor/.test(read("../../packages/af/af-api/src/http/services.ts")),
    "BootstrapService 的构造参数里出现了 actor —— 读路径不设墙的口径被破坏",
  );
}

/* ── ② 写路径的身份闸门按 HTTP 方法生效 ───────────────────────────────
   这是"读不设墙"的**对偶**：正因为读放开了，写必须一条不漏。
   兜底闸门按方法判定，而不是按路径枚举 —— 按路径枚举会漏（历史上
   POST /tasks 曾整条漏接）。 */
{
  /* 只取**闸门那一行**：`method === 'GET'` 在 handler 里另有读分派用途
     （bootstrap/accounts 的路由），全局搜 method === 会把两者混为一谈。 */
  const gateLine = handler
    .split("\n")
    .find((line) => /method === 'POST'/.test(line) && /method === 'DELETE'/.test(line));
  assert.ok(gateLine, "handler.ts 里找不到「按写方法生效」的兜底闸门（POST…DELETE 同一行）");
  for (const want of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(gateLine!.includes(`'${want}'`), `兜底闸门漏了写方法 ${want}（实际: ${gateLine!.trim()}）`);
  }
  assert.ok(
    !/'GET'/.test(gateLine!),
    "兜底闸门不应覆盖 GET —— 读路径是开放的（否则登录页无法列账户）",
  );
  assert.ok(
    /const auth = await assertActor\(\{ accounts: services\.accounts, actorHandle: actor \}\)/.test(handler),
    "兜底闸门没有复用 assertActor —— 拒绝码会与逐条守卫不一致，界面需要两套处置文案",
  );
}

/* ── ③ 前端不得声称按身份过滤任务 ──────────────────────────────────────
   这是一条"文案与代码一致"的断言。注释里的假隔离比没有注释更糟：
   它会被后来者当成既有事实，据此做出错误的安全推断。

   判据必须精确到**断言语气**，不能只看关键词：一段**驳斥**假隔离的注释
   里必然引用旧说法（"原注释写成按身份过滤任务"），那是正确的文字，
   把它也判红等于让守卫无法描述自己防的是什么。
   因此：先剥掉注释的**否定/引用**上下文，只在肯定断言上判定。 */
{
  /* 一行里若出现这些词，说明它在否认或引用该说法，不属于"声称"。 */
  const isRebutting = (line: string): boolean =>
    /不是|不接收|不按|无关|并不|没有|原注释|写成|并不可见|不存在|错|假/.test(line);

  const claims = appTsx
    .split("\n")
    .filter((line) => /按身份(过滤|隔离|区分)|身份不同.{0,8}(看到|范围)|看不到别人|只看到自己/.test(line))
    .filter((line) => !isRebutting(line));
  assert.deepEqual(
    claims,
    [],
    `App.tsx 出现"任务列表按身份隔离"类断言，但服务端并不按身份过滤任务：\n  ${claims.join("\n  ")}`,
  );

  /* 正向：登录后确实重新读取了 bootstrap（身份变了要重绘，与过滤无关）。 */
  assert.ok(
    /void loadBootstrap\(\)/.test(appTsx),
    "App.tsx 登录后没有重新读取 bootstrap —— 身份切换后就绪态不会重绘",
  );
}

console.log("readWriteGate: PASS（读不设墙 / 写全量有门槛 / 前端未声称假隔离）");
