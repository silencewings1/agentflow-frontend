/* 编排显示名投影自检脚本。
   前端没有测试运行器，因此与 nodeLabels 相关脚本一样是自包含的 Node 断言脚本：
     node --experimental-strip-types scripts/workflowLabels.test.ts

   为什么需要它（缺陷 #51）：
   `WorkflowDefinitionDto.presentation` 在契约里是**可选**的，而 AF API **从不填它**
   （后端全仓无赋值点）。`mappers.ts` 原先写 `presentation?.name ?? dto.workflowId`，
   于是接真实后端时恒走 fallback，把内部 id 当编排名给用户看：
     - 新建任务对话框： 「standard-code-change 11 节点 · 4 门禁」
     - 入口无权限的拒绝理由：「在『standard-code-change』的入口责任位上没有执行权限」
   而本地 fixture **填了** presentation（显示「标准代码变更」），所以这个缺口
   **只在接真实后端时出现**——设计演示里一切正常，正是它长期留存的原因。
   因此这里固定两件事：(a) 投影表覆盖真实后端的 id；(b) mapper 不再退化成裸 id。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { workflowDisplayName, nodeDisplayName } from "../src/api/nodeLabels.ts";

const here = dirname(fileURLToPath(import.meta.url));
const mappers = readFileSync(resolve(here, "../src/api/mappers.ts"), "utf8");
const labels = readFileSync(resolve(here, "../src/api/nodeLabels.ts"), "utf8");

/* ── (a) 行为：真实后端的 id 必须给出中文名，且不能是 id 本身 ── */
const REAL_BACKEND_ID = "standard-code-change";
const shown = workflowDisplayName(REAL_BACKEND_ID);
assert.equal(shown, "标准代码变更", `真实后端的 ${REAL_BACKEND_ID} 应有中文显示名`);
assert.notEqual(shown, REAL_BACKEND_ID, "不能把内部 id 当编排名显示给用户");
assert.ok(!shown.includes("standard-code-change"), "显示名里不应残留内部 id");

/* fixture 用到的编排 id 与 data/workflows.ts 的展示名一致（两套模式同名）。 */
const FIXTURE_IDS: Array<[string, string]> = [
  ["wf-feature", "需求开发"],
  ["wf-unit", "单元测试"],
  ["wf-bugfix", "缺陷修复"],
  ["wf-legacy", "存量系统逆向重构"],
  ["wf-cve", "开源漏洞整改"],
  ["wf-review", "AI 代码审核"],
  ["wf-custom", "自定义编排"],
];
for (const [id, name] of FIXTURE_IDS) {
  assert.equal(workflowDisplayName(id), name, `${id} 应显示为「${name}」`);
}

/* ── 优先级：已知 id 的本地文案优先于后端 presentation.name ──
   后端一旦开始发 presentation，两份文案可能不一致；已知 id 必须唯一同名，
   否则"同一个编排在 fixture 模式与真实模式下叫两个名字"。 */
assert.equal(
  workflowDisplayName(REAL_BACKEND_ID, "后端另一个名字"),
  "标准代码变更",
  "已知 id 应优先用本地投影，保证两种模式下同名",
);
assert.equal(
  workflowDisplayName("unknown-workflow", "后端给的名字"),
  "后端给的名字",
  "未知 id 应回退到后端 presentation.name",
);

/* ── 未知 id 退化为带前缀的通用名，而不是把裸 id 当标题 ──
   注意断言的是"不等于裸 id"而不是"不含 id"：`编排 brand-new-flow` 里**保留**了
   id 是有意的——未知编排仍要可辨识，用户报障时能说出是哪一个。这与 nodeLabels
   的 `节点 ${nodeId}` 一致。断言"不含 id"会把这个合理设计判成错误
   （我第一版就是这么写的，被这条断言自己拦下）。 */
const unknown = workflowDisplayName("brand-new-flow");
assert.notEqual(unknown, "brand-new-flow", "未知 id 不应把裸内部标识当标题显示");
assert.match(unknown, /^编排 /, "未知 id 应退化为带前缀的通用名");
assert.ok(unknown.includes("brand-new-flow"), "未知 id 应在通用名里保留，便于报障定位");

/* ── (b) 结构：mappers 的 fallback 不能再是裸 dto.workflowId ──
   行为断言只能覆盖投影表本身；这条钉住"调用点确实接上了投影"。
   只改投影表而 mapper 仍写 `presentation?.name ?? dto.workflowId`，
   上面所有行为断言仍会全绿（它们直接调用函数），而界面照旧显示裸 id。 */
assert.match(
  mappers,
  /name:\s*workflowDisplayName\(dto\.workflowId/,
  "mappers.ts 的编排名必须经 workflowDisplayName，否则接真实后端时退化成裸 id",
);
const bareFallback = /name:\s*presentation\?\.name\s*\?\?\s*dto\.workflowId/;
assert.ok(
  !bareFallback.test(mappers),
  "mappers.ts 不应再出现 `presentation?.name ?? dto.workflowId`：presentation 后端从不填，等价于永远显示内部 id",
);
assert.match(
  mappers,
  /import\s*\{[^}]*workflowDisplayName[^}]*\}\s*from\s*"\.\/nodeLabels\.ts"/,
  "mappers.ts 应显式 import workflowDisplayName",
);

/* ── 与节点名投影的一致性：两者都不应把内部 id 当标题 ── */
assert.notEqual(nodeDisplayName("requirements"), "requirements", "节点名也应有中文投影");
assert.ok(labels.includes("WORKFLOW_DISPLAY_NAME"), "nodeLabels.ts 应含编排名投影表");

/* ── (c) 不得把兜底值当成治理事实显示（缺陷 #52）──
   同一根因的另一面：presentation 后端从不填，于是 maxRetry/onExhaust 各自兜底成
   `1` 与「人工接管」。那不是默认值而是**凭空造出的事实**——实测节点级 retryPolicy
   为 1/2/3 混杂（requirements 是 2 次），界面却写「重试上限 1 次」。
   编排级本就没有这个字段，因此没有"正确的默认值"，只能如实说明"服务端未给出"。
   这条钉两件事：mapper 必须记下"服务端给没给"，界面必须据此分流。 */
const workflowUi = readFileSync(resolve(here, "../src/components/Workflow.tsx"), "utf8");
const workflowTypes = readFileSync(resolve(here, "../src/data/workflows.ts"), "utf8");

assert.match(
  mappers,
  /retryPolicyKnown:/,
  "mappers.ts 必须记录重试策略是否来自服务端（否则界面无从区分真值与兜底）",
);
assert.match(
  mappers,
  /retryPolicyKnown:\s*presentation\?\.maxRetry\s*!==\s*undefined/,
  "retryPolicyKnown 必须由 presentation 是否真给出决定，不能恒为 true",
);
assert.match(
  workflowTypes,
  /retryPolicyKnown\?:\s*boolean/,
  "Workflow 类型应声明 retryPolicyKnown",
);
assert.match(
  workflowUi,
  /value\.retryPolicyKnown\s*\?/,
  "Workflow.tsx 的编排策略必须按 retryPolicyKnown 分流，不能直接打印兜底值",
);
/* 反向断言：不得再出现"无条件打印 maxRetry 次"的写法。 */
assert.ok(
  !/<dd className="mono">\{value\.maxRetry\} 次<\/dd>/.test(workflowUi),
  "Workflow.tsx 不应无条件显示 `{value.maxRetry} 次`：服务端未给出时那是个凭空兜底的数",
);
assert.ok(
  workflowUi.includes("服务端未给出"),
  "服务端未给出时必须如实说明，而不是显示一个看起来像事实的默认值",
);

console.log("workflowLabels 自检通过：投影覆盖真实后端 id，mapper 已接上投影且无裸 id 回退；");
console.log("重试策略如实标注来源，不把兜底值当治理事实显示。");
