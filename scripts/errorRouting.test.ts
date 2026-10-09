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

console.log(
  "errorRouting.test: 同码多因分流一致（AF_ACCOUNTS_UNAVAILABLE→details.multiUserEnabled、"
    + "AF_PERMISSION_DENIED→details.reason；后端标识与前端字面量逐字一致）",
);
