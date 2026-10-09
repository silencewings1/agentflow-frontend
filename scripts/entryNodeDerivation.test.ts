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
   因此文案必须说清是入口，否则用户会去给别的节点申请权限。 */
assert.match(
  app,
  /入口责任位上没有执行权限/,
  "拒绝理由必须明确指出是入口责任位缺失权限",
);

console.log(
  "entryNodeDerivation.test: 入口责任位口径一致"
    + "（后端白名单 flow|approve、前端黑名单 !=fail 且经边种类全集复核为等价，"
    + "阈值同为 run，判定同落在入口集合上）",
);
