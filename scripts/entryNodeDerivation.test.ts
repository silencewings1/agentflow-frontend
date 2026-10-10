/* 入口责任位的推导口径自检脚本。
     node --experimental-strip-types scripts/entryNodeDerivation.test.ts

   守的是什么：创建任务时只在**入口责任位**上校验权限
   （用户明确口径：「创建任务的时候校验第一个节点的权限即可」）。
   前端的「新任务」按钮是否可点，就取决于它自己算出的入口集合。

   而入口集合有两份实现：
     · 后端：workflow.entryNodeIds（声明值），准入判定走 createExecutablePlan
     · 前端：App.tsx 的 canCreateWith **自行推导**，谓词是 kind !== 'fail'
   后端图模型的谓词是 isMainEdgeKind = kind === 'flow' || kind === 'approve'（**白名单**）。
   前端是**黑名单**（!= 'fail'）。

   今天两者等价（EDGE_KINDS = flow|fail|approve，fail 是唯一的非主执行边），
   因此这不是一个正在出错的缺陷，而是**一个判定的两份实现**——
   后端新增任何 kind 时二者会静默分歧：前端把新 kind 当主执行入边（该节点不算入口），
   后端白名单不算它（该节点仍是入口）。此时按钮的可用性与服务端裁决相反，
   而错误的按钮状态正是本项目反复记过的一类缺陷（见 §12.23.21）。

   本脚本把「两份实现必须同口径」钉住：既固定今天的等价性，
   也固定前端谓词必须与后端的白名单语义一致，而不是"只要不是 fail 就算"。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const app = read("../src/App.tsx");
const graph = read("../../packages/af/af-contract/src/workflow-graph.ts");
const schema = read("../../packages/af/af-contract/src/workflow-schema.ts");

/* ① 后端是白名单：isMainEdgeKind 必须显式列出主执行边种类，
   而不是写成"不等于 fail"。写成黑名单会让后端自己也失去这个性质。 */
const mainEdgeFn = /export function isMainEdgeKind\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(graph);
assert.ok(mainEdgeFn, "找不到 isMainEdgeKind：后端的图模型依赖它区分主执行边与回退边");
assert.match(
  mainEdgeFn[1]!,
  /kind === 'flow'/,
  "isMainEdgeKind 必须显式包含 'flow'（白名单语义），不能改成 \"!= 'fail'\"："
    + "黑名单在后端新增边种类时会静默把新种类也当主执行边",
);
assert.match(
  mainEdgeFn[1]!,
  /kind === 'approve'/,
  "isMainEdgeKind 必须显式包含 'approve'：审批边也是主执行边",
);
assert.ok(
  !/!==\s*'fail'|!=\s*"fail"/.test(mainEdgeFn[1]!),
  "isMainEdgeKind 不得退回\"不等于 fail\"的黑名单写法",
);

/* ② 边种类的全集必须被本脚本知晓：新增 kind 时这里要红，
   提醒复核前后端两份谓词是否仍然等价。 */
const kindsMatch = /const EDGE_KINDS = \[([^\]]*)\]/.exec(schema);
assert.ok(kindsMatch, "找不到 EDGE_KINDS：边种类的权威全集在 workflow-schema.ts");
const kinds = kindsMatch[1]!.split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
assert.deepEqual(
  [...kinds].sort(),
  ["approve", "fail", "flow"],
  `边种类全集变了（当前 ${JSON.stringify(kinds)}）：`
    + "前端的黑名单谓词与后端的白名单谓词此时很可能不再等价，"
    + "必须复核 App.tsx 的入口推导并同步本脚本——"
    + "否则按钮可用性会与服务端准入裁决相反",
);

/* ③ 前端确实在自行推导入口，且用的是黑名单谓词。
   把它写出来是为了让「这是第二份实现」这件事无法被忽略：
   一旦前端改成直接读服务端 entryNodeIds，下面的断言会红，提醒更新本脚本。 */
assert.match(
  app,
  /const entryIds = wf\.nodes/,
  "找不到 App.tsx 里的入口推导：前端准入判定依赖它算出入口责任位",
);
assert.match(
  app,
  /edge\.kind !== "fail" && edge\.to === node\.id/,
  "前端入口谓词变了：必须与后端 isMainEdgeKind（flow|approve 白名单）同口径，"
    + "否则按钮可用性会与服务端裁决相反",
);

/* ④ 准入阈值必须与后端一致：后端创建任务时要求入口节点上的 'run'
   （handler.ts 的 assertWorkflowPermission(required: 'run')）。
   前端若用别的等级，会出现「界面允许、服务端拒绝」或反之。 */
assert.match(
  app,
  /permRank\(grant\.perm\) >= permRank\("run"\)/,
  "前端准入阈值必须是 run 级：与后端创建任务的 required:'run' 同口径",
);
const handler = read("../../packages/af/af-api/src/http/handler.ts");
assert.match(
  handler,
  /assertWorkflowPermission\(\{[\s\S]{0,400}?required: 'run'/,
  "后端创建任务必须仍要求入口节点的 run；阈值变了要同步前端与本脚本",
);

/* ⑤ 判定必须落在**入口集合**上，而不是"整条编排任一节点"。
   后端用 nodeIds: entry.entryNodeIds（入口集合）；前端也必须只看入口。
   若前端改成看全部节点，会出现"在别的责任位有权限就能建任务"的越权放行。 */
assert.match(
  handler,
  /nodeIds: entry\.entryNodeIds/,
  "后端创建任务必须只看入口责任位（entry.entryNodeIds），"
    + "不能放宽成整条编排任一节点",
);
assert.match(
  app,
  /entryIds\.some\(/,
  "前端必须对**入口集合**判定（entryIds.some），而不是对全部节点",
);

/* ⑥ 拒绝理由要指向入口责任位：用户口径是"只校验第一个节点"，
   因此文案必须说清是入口，否则用户会去给别的节点申请权限。

   断言写成"入口责任位…没有执行权限"这一**结构**，而不是某一整句原文：
   原文案被改过一次合理的（§12.23.54），若锚定整句，守卫会把文案改进
   误判成回归，久而久之就会被人直接改断言绕过。 */
assert.match(
  app,
  /入口责任位[^`]{0,40}上没有执行权限/,
  "拒绝理由必须明确指出是入口责任位缺失权限",
);

/* ⑥b 受阻文案**不得描述成功后的行为**。
   初版写的是「…没有执行权限，创建的任务将由该责任位开始执行。」——
   后半句与置灰状态自相矛盾：按钮不可点，任务根本不会被创建，
   用户却读到"创建的任务"已经存在，会以为任务在路上（§12.23.54）。
   现实测后端在该情形返回 AF_PERMISSION_DENIED，0 个任务被创建。

   判据：用 `reason: \`…\`` 模板截出受阻文案本体（**不含**注释——
   注释里会引用旧文案作说明，若整文件搜就会假绿），
   要求其中不出现"创建的任务"/"任务将由"这类描述既有产出的措辞。 */
const reasonTemplates = [...app.matchAll(/reason:\s*`([^`]*)`/g)].map((m) => m[1]!);
assert.ok(reasonTemplates.length > 0, "未找到任何 reason 模板，本项会空转");
for (const tpl of reasonTemplates) {
  assert.ok(
    !/创建的任务|任务将由|后续任务/.test(tpl),
    `受阻文案描述了成功后的行为（写成"该任务会怎样"），与置灰状态矛盾：${tpl.slice(0, 60)}`,
  );
}

/* ⑦ 上面 ①～⑥ 只证明「两份**实现**的口径一致」（谓词、阈值、判定落点）。
   但"实现一致"不等于"结果一致"——谓词相同而输入的字段名不同（例如
   前端读 `node.id`、后端投影是 `node.nodeId`），推导出的集合仍会不同，
   且这种错法**不会报错**：前端算出一个空集合或错集合，
   按钮的可用性与服务端裁决相反。
   本仓库已有真实数据可对照：`tests/fixtures/bootstrap.json` 是 bootstrap 的
   实际响应（含 `entryNodeIds` 声明值）。用它做一次**逐编排的实际比对**，
   比只比实现更接近"用户看到的按钮是不是对的"。

   **本项证据的边界（必须写清，否则会被读成比实际更强的保证）**：
   该 fixture 冻结在 `standard-code-change` **v1、9 节点**；
   而真实实例当前是 **v3、11 节点**（多了两道 `*-review` 审批节点与
   `prepare-change-set`）。fixture 与实况的这一差异**是既有的**，
   由 `http-integration.spec.ts` 的 fixture 一致性用例管理——那里
   只 seed v1，因此两份在**那个作用域内**是一致的。
   所以本项比对覆盖的是 v1 的图形态，**不能**据此声称
   "v3 的推导也已验证"。v3 的实况比对在 §12.23.48 单独做过；
   若日后把 v3 图形态写进 fixture，本项会自动覆盖到。 */
const bootstrap = JSON.parse(read("../../packages/af/af-api/tests/fixtures/bootstrap.json")) as {
  data?: { workflows?: Array<{ workflowId: string; nodes: Array<{ nodeId: string }>; edges: Array<{ to: string; kind: string }>; entryNodeIds: string[] }> };
};
const workflows = bootstrap.data?.workflows ?? [];
assert.ok(workflows.length > 0, "bootstrap fixture 里应至少有一条编排，否则本项比对是空转的");

/* 除 v1 fixture 外，再用一份 **v3 图形态**（11 节点 / 15 边）做比对。
   为什么值得加第二份：v1 是 9 节点（bootstrap 投影），v3 是 11 节点
   （多两道 `*-review` 审批节点与 `prepare-change-set`），
   两者的图**规模与节点集不同**，推导要在这两种形态下都成立。

   （更正一处早先写错的理由：本项最初写成"v1 里没有 approve 边，
   所以碰不到白名单/黑名单的分歧点"。实测 v1 **有**一条
   `prepare-change-set → publish-via-mcp` 的 `approve` 边，
   该分歧点在 v1 上同样被覆盖 —— 加 v3 的理由是"多一种图规模"，
   不是"补上 v1 缺失的分歧点"。把理由写错会让后来人以为
   v1 的 approve 边不存在，从而在别处做出错误推断。） */
const v3 = JSON.parse(read("../../packages/af/af-api/tests/fixtures/bootstrap-v3-graph.json")) as {
  data: { workflows: Array<{ workflowId: string; nodes: Array<{ nodeId: string }>; edges: Array<{ to: string; kind: string }>; entryNodeIds: string[] }> };
};
const v3Workflows = v3.data.workflows;
assert.ok(v3Workflows.length > 0, "v3 图 fixture 为空，本项比对会空转");
assert.ok(
  v3Workflows.some((wf) => wf.edges.some((e) => e.kind === "approve")),
  "v3 fixture 必须含至少一条 approve 边，否则它与 v1 一样碰不到谓词分歧点",
);

let compared = 0;
for (const wf of [...workflows, ...v3Workflows]) {
  /* 用与 App.tsx 相同的规则重算（节点字段名必须是 nodeId，与真实响应一致）。 */
  const derived = wf.nodes
    .filter((node) => !wf.edges.some((edge) => edge.kind !== "fail" && edge.to === node.nodeId))
    .map((node) => node.nodeId);
  assert.deepEqual(
    derived,
    wf.entryNodeIds,
    `${wf.workflowId}: 前端推导 [${derived}] 与服务端 entryNodeIds [${wf.entryNodeIds}] 不一致`
      + " —— 按钮可用性会与服务端裁决相反",
  );
  compared += 1;
}
/* 反向自检：确认上面的比对**真的能发现差异**，否则它可能因为
   字段名写错（两边都取到 undefined 或空数组）而"恰好通过"。
   这是本仓库反复记过的一类空转（见 §12.23.38 附）。 */
const probe = workflows[0]!;
const wrongDerived = probe.nodes.slice(1).map((node) => node.nodeId);
assert.notDeepEqual(
  wrongDerived,
  probe.entryNodeIds,
  "比对方法自检失败：去掉一个节点后仍与 entryNodeIds 相同，"
    + "说明该编排只有一个可推导节点或比对没有真正生效",
);

console.log(
  "entryNodeDerivation.test: 入口责任位口径一致"
    + "（后端白名单 flow|approve、前端黑名单 !=fail 且经边种类全集复核为等价，"
    + "阈值同为 run，判定同落在入口集合上；"
    + `并以 bootstrap 实况数据逐编排比对 ${String(compared)} 条实际推导结果）`,
);
