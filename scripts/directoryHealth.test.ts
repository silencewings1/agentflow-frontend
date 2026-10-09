/* 目录可用性判据的跨仓库一致性自检。

   前端没有测试运行器，因此这是一个自包含的 Node 断言脚本，不新增依赖：
     node --experimental-strip-types scripts/directoryHealth.test.ts

   为什么需要它：`directoryHealth` 的判据（空目录 / 无人在职持 manage）
   在后端 `af-api/src/task/accounts-service.ts` 与前端
   `src/api/fixtures/accounts.ts` 里各有一份实现——前端是独立构建，
   演示模式没有后端可问，所以复制不可避免。但两份实现必须**结论一致**，
   否则同一个目录在真实模式与演示模式下会给出不同答案，
   而用户看到的界面长得一模一样、只是结论相反。

   历史上这类"两份字面量"已经出过问题（见 permissionRank.test.ts 的注释），
   因此这里按同样的办法把两处**逐项比对**：
   (a) 两侧的判定分支集合一致（empty / no-manager / ok 一个不少）；
   (b) 两侧都按 state === active 过滤停用账户——漏掉这条会把"唯一管理者已停用"
       误判成目录健康，而那种状态下所有写操作都会被拒；
   (c) 两侧的文案都写出可执行的处置（否则运维不知道下一步该做什么）。
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const frontendSrc = readFileSync(resolve(here, "../src/api/fixtures/accounts.ts"), "utf8");
const backendSrc = readFileSync(
  resolve(here, "../../packages/af/af-api/src/task/accounts-service.ts"),
  "utf8",
);

/** 取出某个函数体（从声明起到下一个顶层 `}` 或 `\n}` 结尾）。 */
const bodyOf = (source: string, marker: string, label: string): string => {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${label} 中找不到 ${marker}`);
  /* 取足够长的片段：这些函数都不长，用下一条函数声明或文件末尾截断。 */
  const rest = source.slice(start);
  const nextFn = rest.slice(marker.length).search(/\n(export )?(async )?function |\n  private (async )?[a-z]/);
  return nextFn < 0 ? rest : rest.slice(0, marker.length + nextFn);
};

const frontendFn = bodyOf(frontendSrc, "export function directoryHealthFor", "前端 fixtures/accounts.ts");
const backendFn = bodyOf(backendSrc, "private async directoryHealth(", "af-api accounts-service.ts");

/* (a) 三个分支两侧都要有。
   用带引号的字面量匹配 code 值：`code: "empty"` / `code: 'empty'` 都算。 */
for (const code of ["empty", "no-manager", "ok"]) {
  assert.ok(
    new RegExp(`code:\\s*['"]${code}['"]`).test(frontendFn),
    `前端 fixture 缺少 code=${code} 分支；后端有而前端没有时，演示模式会给出与真实模式不同的结论`,
  );
  assert.ok(
    new RegExp(`code:\\s*['"]${code}['"]`).test(backendFn),
    `后端 directoryHealth 缺少 code=${code} 分支（前端有）`,
  );
}

/* (b) 两侧都必须在判定"谁算管理者"时过滤掉停用账户。
   这是最容易被漏掉、后果最重的一条：把停用账户算作覆盖，
   会让"唯一管理者已被停用"误判为目录健康——而那种状态下
   所有写操作都以 AF_PERMISSION_DENIED 被拒，且没有自救途径。 */
const activeFilterPattern = /state === ['"]active['"]/;
assert.ok(
  activeFilterPattern.test(backendFn),
  "后端 directoryHealth 必须按 state === 'active' 过滤（停用账户不算管理能力）",
);
assert.ok(
  activeFilterPattern.test(frontendFn),
  "前端 fixture 的 directoryHealthFor 必须同样按 state === 'active' 过滤，"
    + "否则演示模式会把「唯一管理者已停用」显示成健康目录",
);

/* (b2) 两侧都只看 manage 等级的授权。 */
for (const [fn, label] of [[backendFn, "后端"], [frontendFn, "前端 fixture"]] as const) {
  assert.ok(
    /['"]manage['"]/.test(fn),
    `${label} 的管理者判定必须只认 manage 等级（更低的等级不能管理账户）`,
  );
}

/* (c) 不可用的两个分支都要给出可执行的处置。
   只写"目录不可用"而不说该动什么是没有用的——这正是该字段存在的理由。 */
assert.ok(/seeded/.test(backendFn) && /seeded/.test(frontendFn),
  "空目录的说明必须指出 account_settings.singleton.seeded（否则运维不知道如何触发重新播种）");
assert.ok(/node_grants/.test(backendFn) && /node_grants/.test(frontendFn),
  "无管理者的说明必须指出 node_grants（否则运维不知道该检查哪里）");
assert.ok(/self不|自救/.test(backendFn) && /自救/.test(frontendFn),
  "无管理者的说明必须点明「无法通过界面自救」，否则运维会反复尝试界面操作");

/* (d) 健康分支两侧都必须返回 reason: null —— 有 healthy=true 却带 reason
   会让界面在正常状态下渲染出一条空告警。 */
for (const [fn, label] of [[backendFn, "后端"], [frontendFn, "前端 fixture"]] as const) {
  assert.ok(
    /healthy:\s*true[^}]*reason:\s*null/.test(fn),
    `${label} 的健康分支必须同时给出 reason: null`,
  );
}

/* (e) 后端多一道「manage 必须落在真实责任位」的过滤，前端 fixture 没有。
    这不是遗漏，而是**刻意保留**的等价写法——但等价性有前提：
    授权入口只接受编排目录里存在的节点，因此不存在"目录外的 manage"，
    过滤与不过滤是同一个谓词。这条断言把那个前提钉住。

    为什么必须钉：该前提一旦失效（例如将来允许"预先授权尚未登记的编排"），
    前端的"不过滤"就会把悬空授权持有者显示成管理者，
    而真实后端拒绝该授权——两边对同一事实给出相反结论，
    且两边看起来都没坏。这正是本项目反复出现的缺陷形态。
    因此这里断言：授权入口的 workflowId/nodeId 取自 refs 全集（而非任意输入）。 */
const membersPane = readFileSync(resolve(here, "../src/components/MembersPane.tsx"), "utf8");
const apiClient = readFileSync(resolve(here, "../src/api/client.ts"), "utf8");

assert.ok(
  /realSlots/.test(backendFn) || /holdsRealManage/.test(
    readFileSync(resolve(here, "../../packages/af/af-api/src/task/accounts-service.ts"), "utf8"),
  ),
  "后端的管理者判定应保留真实责任位过滤；若已移除，本文件的等价性前提需重新论证",
);
/* 断言必须锚在 `return refs` 这个**取值来源**上，而不是范围里是否出现过 refs。
   第一版写成 /const assignable[\s\S]{0,400}refs/，结果注入"改成任意目标"后仍然全绿——
   因为 useMemo 的依赖数组 `[active, refs, grantIndex]` 里还有一个 refs。
   那是依赖声明，不是取值来源；断言落在它上面就钉不住真正要防的事。 */
assert.ok(
  /const assignable[\s\S]{0,400}?return refs\b/.test(membersPane),
  "授权入口（assignable）必须 `return refs`——这是「前端不过滤 realSlots 仍与后端等价」"
    + "的唯一依据。若授权入口改为接受任意 workflowId/nodeId，"
    + "必须在 client.ts 的 holdsManageGrant 补上 realSlots 过滤，否则演示模式与真实后端分叉",
);
assert.ok(
  /function nodeRefs[\s\S]{0,400}workflow\.nodes\.map/.test(membersPane),
  "nodeRefs 必须是编排目录节点的全集（无过滤），否则 refs 不再等价于后端的 realSlots",
);
assert.ok(
  /workflowTemplates\.map/.test(apiClient),
  "演示模式的编排目录必须由 workflowTemplates 展开（目录外的授权目标因此不可能被构造）",
);

/* ── 登录页在目录不可用时必须给出可执行指引（缺陷 #54）──
   empty 状态下没有任何账户，此时"请联系责任人先创建一个"是一条做不到的指引
   ——责任人本身也是账户，同样不存在。而后端已在 directory.reason 里写好具体
   恢复步骤（改 seeded / 恢复备份），登录页原先**完全没有读 directory**，
   等于把唯一有用的那句话丢了。
   这里钉三件事：Login 接收 directory、判据由 directory.healthy 推导、
   缺真值时不显示那句做不到的指引。 */
const login = readFileSync(resolve(here, "../src/components/Login.tsx"), "utf8");
const app = readFileSync(resolve(here, "../src/App.tsx"), "utf8");

assert.match(
  login,
  /directory\?:\s*DirectoryHealthDto/,
  "Login 应接收 directory DTO：成因与恢复步骤只有后端知道，前端不该自己编一句",
);
assert.match(
  login,
  /directoryUnhealthy\s*=\s*[^;]*directory[^;]*\.healthy/,
  "Login 的 directoryUnhealthy 必须由 directory.healthy 推导（不能恒 false）",
);
/* 那句"请联系责任人"必须只在目录**健康**时才出现。 */
assert.match(
  login,
  /directoryUnhealthy[\s\S]{0,300}请联系责任人先创建一个/,
  "「请联系责任人先创建一个」必须与目录不可用互斥：empty 状态下责任人并不存在（缺陷 #54）",
);
assert.match(
  app,
  /<Login[\s\S]{0,400}directory=\{accountsData\?\.directory/,
  "App.tsx 必须把目录健康判定传给 Login，否则登录页无从区分成因",
);

/* ── 两句提示必须互斥（缺陷 #53）──
   文件自己的注释写的是"目录自身不可用时**优先**说这件事：它比『你没有管理权』更根本"，
   但代码原先把两句**并列**渲染，于是在 no-manager 状态下用户同时看到：
     ① 目录里没有任何「在职且持 manage」的账户……无法通过界面自救
     ② 需要变更时，请让持有该权限的责任人操作
   而此刻根本不存在这样的人——第②句是一条做不到的指引。
   empty 分支同理（连账户都没有）。
   这里钉住互斥：第二句必须带 `!directoryUnhealthy` 条件。 */
assert.match(
  membersPane,
  /directoryUnhealthy/,
  "MembersPane 应把「目录不可用」提成一个判据（两种成因都算），用于与权限提示互斥",
);
/* 判据必须由 directory.healthy 推导，不能恒 false。
   第一版只断言 /directoryUnhealthy/ 出现——注入 `= false` 后仍全绿，
   因为判断"字段名有没有出现"钉不住"取值从哪来"（与 workflowLabels.test.ts
   的 presentationKnown 是同一个坑，那里也栽过一次）。 */
assert.match(
  membersPane,
  /directoryUnhealthy\s*=\s*[^;]*directory[^;]*\.healthy/,
  "directoryUnhealthy 必须由 directory.healthy 推导，否则互斥条件形同虚设（恒 false 时缺陷 #53 复现）",
);
assert.match(
  membersPane,
  /!canManage\s*&&\s*!directoryUnhealthy/,
  "「你没有可编排权限，请让责任人操作」必须与「目录不可用」互斥："
    + "no-manager/empty 时不存在可找的责任人，这句话是做不到的指引（缺陷 #53）",
);
/* 反向断言：不得再出现无条件的 !canManage 提示分支。 */
assert.ok(
  !/\{!canManage && \(/.test(membersPane),
  "不应再有裸 `{!canManage && (` 分支：会与目录不可用的提示同时出现",
);

/* ── 同一错误码覆盖两种处置时，必须能分流（缺陷 #55）──
   AF_GRANT_NOT_FOUND 同时表示：
     ① 收回一条不存在的授权     → 处置是"刷新"（可能已被他人收回）
     ② 给一个已从编排移除的责任位授权 → 处置是"换节点"（刷新无效）
   后端已用 details.reason='slot-unknown' 自证成因（在 accounts-service 里）。
   这里钉住前端确实按它分流——只说"提示存在"是不够的，必须走对的处置。 */
const errorText = readFileSync(resolve(here, "../src/api/error-text.ts"), "utf8");
assert.match(
  errorText,
  /details\?\.reason === "slot-unknown"/,
  "前端必须按 details.reason='slot-unknown' 分流 AF_GRANT_NOT_FOUND，"
    + "否则责任位已被移除的用户会被引导去反复刷新（缺陷 #55）",
);
assert.match(
  errorText,
  /slot-unknown[\s\S]{0,300}AF_GRANT_SLOT_UNKNOWN/,
  "分流后必须给出「责任位已不在编排中」的专有文案，而不是复用「可能已被收回」",
);
/* 反向：通用文案不应再被当成唯一处置（保留它是为了收回应答）。 */
assert.match(
  errorText,
  /AF_GRANT_NOT_FOUND: "找不到该节点授权，可能已被收回。"/,
  "「收回」路径的通用文案应保留：它不是错文案，只是覆盖不了另一种成因",
);

console.log(
  "directoryHealth.test: 前端 fixture 与后端 directoryHealth 判据一致"
    + "（分支 empty/no-manager/ok 齐备、都按 state===active 过滤、只看 manage、"
    + "不可用分支均给出可执行处置、健康分支 reason 为 null）",
);
