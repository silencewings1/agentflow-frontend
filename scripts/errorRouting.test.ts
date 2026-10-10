/* 错误码「同码多因」分流的一致性自检。

   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/errorRouting.test.ts

   为什么需要它：有两个错误码各自覆盖**处置相反**的成因，界面必须按后端给出的
   判别标识分流，否则会把用户引向错误的下一步——

   - AF_ACCOUNTS_UNAVAILABLE：实例本就未启用多用户（重试无用，找部署方）
     vs 目录暂时读不到（重试就有用）。判别标识 details.multiUserEnabled。
   - AF_PERMISSION_DENIED：缺少管理权（去找持有「可编排」的责任人）
     vs 不能停用自己（**被拒的人就是那位责任人**）。判别标识 details.reason。

   第二例尤其容易退化：通用文案说"请让持有可编排权限的责任人授权"，
   而自我停用的人正是那个人——照做只会原地打转。
   `scripts/check-error-text.mjs` 只校验"每个后端码都有中文说明"，
   它无法发现分流被删掉（文案仍在、只是走不到），因此需要这份自检。

   两个方向都要守：
   (a) 分流条件与后端实际发出的标识字面量一致；
   (b) 专用文案确实存在且非空——分流到一条不存在的文案等于没有分流。
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const errorText = readFileSync(resolve(here, "../src/api/error-text.ts"), "utf8");
const backendAccounts = readFileSync(
  resolve(here, "../../packages/af/af-api/src/task/accounts-service.ts"),
  "utf8",
);

/** 断言：前端存在按 `details.<field> === <literal>` 的分流分支。 */
const assertRoutes = (code: string, field: string, literal: string) => {
  const pattern = new RegExp(
    `label\\s*===\\s*"${code}"\\s*&&\\s*details\\?\\.${field}\\s*===\\s*${literal}`,
  );
  assert.ok(
    pattern.test(errorText),
    `error-text.ts 缺少分流：${code} + details.${field} === ${literal}。`
      + `删掉它不会让任何既有检查变红（文案仍在，只是走不到），但用户会收到错误的处置。`,
  );
};

/** 断言：专用文案码已登记且内容非空。 */
const assertTextExists = (code: string, mustInclude: string[]) => {
  const m = errorText.match(new RegExp(`${code}:\\s*\\n?\\s*"([^"]+)"`));
  assert.ok(m, `error-text.ts 中找不到 ${code} 的文案`);
  const text = m![1]!;
  assert.ok(text.length > 0, `${code} 的文案为空`);
  for (const fragment of mustInclude) {
    assert.ok(
      text.includes(fragment),
      `${code} 的文案必须包含「${fragment}」（当前：${text}）`,
    );
  }
};

// ── AF_ACCOUNTS_UNAVAILABLE：声明未启用 vs 瞬时故障 ──
assertRoutes("AF_ACCOUNTS_UNAVAILABLE", "multiUserEnabled", "false");
assertTextExists("AF_ACCOUNTS_DISABLED", ["未启用", "重试不会改变结果"]);

// ── AF_PERMISSION_DENIED：不能停用自己 vs 缺少管理权 ──
assertRoutes("AF_PERMISSION_DENIED", "reason", '"self-suspend"');
assertTextExists("AF_SELF_SUSPEND", ["不能停用自己", "另一位"]);

/* 后端的判别标识必须与前端分流用的字面量逐字一致。
   这是跨仓库的接缝：后端改成 'self_suspend' 或 'selfSuspend' 时，
   前端分流会静默失效——用户拿回那条把他引向自己的通用文案，
   而两边各自的测试都还是绿的。 */
const backendEmit = backendAccounts.match(/reason:\s*'(self-suspend)'/);
assert.ok(
  backendEmit,
  "af-api 的自我停用拒绝必须带 details.reason='self-suspend'；"
    + "若改了字面量，前端的 error-text.ts 分流也要同步改，否则分流静默失效。",
);
assert.equal(
  backendEmit![1],
  "self-suspend",
  "后端发出的 details.reason 必须与前端分流字面量一致",
);

/* 通用 AF_PERMISSION_DENIED 文案不得断言"去找责任人授权"之外的可能——
   它必须保持为"缺少权限"这一成因的处置，不能为了兼顾自我停用而写含糊。
   这条守的是反向漂移：有人为了让自我停用也"说得通"而把通用文案改宽，
   于是真正的"缺权限"用户反而拿到不准确的处置。 */
assertTextExists("AF_PERMISSION_DENIED", ["缺少", "授权"]);

/* ── 降级实例不得停在登录页（缺陷 #65）─────────────────────────────
   上面那些断言只保证**文案**判对了成因。但"文案正确 + 页面是死路"仍然不可用：
   实测 `AF_MULTI_USER_DISABLED=1` 的实例上，界面停在登录页，页面上只有一个
   `disabled` 的「登录」按钮（该实例没有可选账户），而**后端是放行的**——
   同一实例上 `POST /tasks` 返回 `400 AF_INVALID_REQUEST`（权限判定已通过）。

   `doc/architecture.md` §8.1 写明降级例外的目的是「硬拦会让**既有部署整体不可用**」，
   所以卡在登录页正是它要避免的结果。因此必须断言：

   （a）渲染闸门把 `multiUserDisabled` 显式排除，使该形态能进控制台；
   （b）该状态确实由**后端的声明**驱动，而不是由"目录读不到"驱动——
       后者必须继续 fail closed（这条是安全方向，比 (a) 更不可失）。 */
const app = readFileSync(resolve(here, "../src/App.tsx"), "utf8");
assert.ok(
  /if \(!multiUserDisabled && \(accountsData === null/.test(app),
  "渲染闸门必须显式排除 multiUserDisabled：否则降级实例会停在只有一个 disabled 按钮的登录页"
    + "（后端已放行，界面却无法进入——正是 §8.1 说要避免的「既有部署整体不可用」）",
);
assert.ok(
  /setMultiUserDisabled\(apiError\?\.details\?\.multiUserEnabled === false\)/.test(app),
  "multiUserDisabled 必须由**后端声明**（details.multiUserEnabled === false）驱动，"
    + "不能由「目录读不到」驱动：后者要 fail closed，两者处置相反",
);
/* 反向判据同样要钉住：目录暂时读不到（无 details）时**不得**放行进控制台。
   写法上要求它与 multiUserEnabled === false 严格比较，而不是宽松的真值判断——
   `!apiError?.details?.multiUserEnabled` 会把「无 details」也算成降级，
   方向就反了。 */
assert.ok(
  !/setMultiUserDisabled\(!|setMultiUserDisabled\(apiError\?\.details\?\.multiUserEnabled\)/.test(app),
  "multiUserDisabled 不得用宽松真值判断：无 details（瞬时故障）时必须是 false，否则会把故障当成降级放行",
);

console.log(
  "errorRouting.test: 同码多因分流一致（AF_ACCOUNTS_UNAVAILABLE→details.multiUserEnabled、"
    + "AF_PERMISSION_DENIED→details.reason；后端标识与前端字面量逐字一致）",
);
