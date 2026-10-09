/* 人工检查点的「判定人」归属自检脚本。
   前端没有测试运行器，因此与其它守卫脚本一样是自包含的 Node 断言脚本：
     node --experimental-strip-types scripts/checkpointAttribution.test.ts

   守的是什么：检查点是**人工检查层**，它的立命之处就是"谁判断、谁负责"。
   若界面把判定人显示成一个写死的 handle，多用户下就是**冒名**——
   杨知远点了批准，界面却写着别人的名字，而这个结论要"进入证据链"。

   这类缺陷不会报错：界面正常渲染、文案通顺、测试全绿。
   它只在"换一个人来用"时才显形。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

/** 取某个 interface 的**完整成员列表**：按花括号配对截取。
 *
 * 为什么不用 `[\\s\\S]{0,300}?` 这种长度窗口来"够到"字段——
 * 我第一版正是那样写的，它有一个和本轮正在修的缺陷**完全同形**的问题：
 * 窗口会越过该 interface 的收尾 `}` 吃进下一个 interface。
 * 实测：删掉 `NodeApprovalDto.actor` 后断言**仍然通过**，
 * 因为它匹配到的是紧随其后的 `GitOperationConfirmationDto.actor`。
 * 断言看起来在守 A，实际守的是 B（同 §12.23.20）。
 * 按花括号配对取，边界就是该 interface 本身。 */
const interfaceBodyOf = (source: string, name: string): string => {
  const marker = `interface ${name}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `找不到 ${marker}`);
  const open = source.indexOf("{", start);
  assert.ok(open > start, `${marker} 之后找不到 '{'`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert.fail(`${marker} 的花括号不配对`);
};

const stream = read("../src/components/Stream.tsx");
const app = read("../src/App.tsx");
const backendTaskService = read("../../packages/af/af-api/src/task/task-service.ts");
const backendDtos = read("../../packages/af/af-api/src/dto/task.ts");
const apiTypes = read("../src/api/types.ts");

/* ① 界面不得把判定人写死成某个具体身份。
   这是本文件存在的首要理由：写死在多用户下必然冒名，
   且因为"总有个名字显示"而看不出坏了。 */
const HARDCODED_IDENTITIES = [
  "me@agentflow.dev",
  "zhhge",
  "user@",
  "admin@",
];
for (const literal of HARDCODED_IDENTITIES) {
  assert.ok(
    !stream.includes(literal),
    `检查点渲染不得把判定人写死为 "${literal}"：多用户下这会把别人的判定`
      + `显示成这个人做的（界面正常、文案通顺，因此不会报错，只会冒名）`,
  );
}

/* ② 判定人必须有真实来源：事件自带，或来自 governance.approvals。
   取值顺序写在 Checkpoint 里，这里钉住"确实读了 approvals"这一环。 */
assert.match(
  stream,
  /approvalActorOf\s*[?:]|approvalActorOf\s*=/,
  "Stream 必须接收 approvalActorOf：判定人只能来自后端记录，不能凭空生成",
);
assert.match(
  stream,
  /e\.decidedBy\s*\?\?\s*approvalActorOf/,
  "Checkpoint 的判定人取值必须是「事件自带 ?? approvals 记录」——"
    + "少了后者，真实模式下（事件不带 decidedBy）永远显示不出判定人",
);
/* ③ 取不到时必须**明说未记录**，而不是退回一个具体名字。 */
assert.match(
  stream,
  /判定人未记录/,
  "取不到判定人时必须如实说「判定人未记录」：凭空给一个名字就是编造归属",
);

/* ④ App 侧必须真的把 approvals 接上（而不是只声明了 prop）。 */
assert.match(
  app,
  /approvalActorOf=\{[\s\S]{0,400}?approvals[\s\S]{0,200}?nodeApprovals/,
  "App 必须从 governance.approvals.nodeApprovals 构造 approvalActorOf；"
    + "只声明 prop 而不接线，等于这条链断在中间",
);
assert.match(
  app,
  /nodeApprovals[\s\S]{0,120}?nodeId === nodeId/,
  "approvalActorOf 必须按 nodeId 匹配（不同节点的批准人是不同的人）",
);

/** 断言某个 interface 的成员里有指定字段。
 *
 * 不能用 `(^|\\n)\\s*actor:` 这种"行首字段"写法：两份 DTO 的风格不同——
 * 后端 `dto/task.ts` 是多行声明，前端 `api/types.ts` 是**整行单行**声明
 * （`export interface NodeApprovalDto { approvalId: string; … actor: string; … }`）。
 * 只认行首会让前端那条**永远匹配不到**，脚本直接报红（我第一版就是这样，
 * 结果基线自己失败）。因此这里按"字段名 + 类型"在成员列表内匹配，
 * 两种风格都对，且因为已按花括号取出成员列表，不会越界到别的 interface。 */
const hasField = (interfaceBody: string, field: string, type: string): boolean =>
  new RegExp(`(^|[;{\\s])${field}\\s*:\\s*${type}`).test(interfaceBody);
/* ⑤ 跨仓库接缝：后端确实记录并暴露了真实 actor。
   若后端改了字段名而不自知，前端的归属会静默退化成"未记录"。 */
assert.ok(
  hasField(interfaceBodyOf(backendDtos, "NodeApprovalDto"), "actor", "string"),
  "后端 NodeApprovalDto 必须带 actor（真实批准人）；缺了它前端无从归属",
);
assert.match(
  backendTaskService,
  /actor:\s*event\.actor/,
  "后端必须把事件里的 actor 原样暴露出来，而不是留空或自行编一个",
);
assert.ok(
  hasField(interfaceBodyOf(apiTypes, "NodeApprovalDto"), "actor", "string"),
  "前端 DTO 声明必须与后端一致（否则取值时类型对不上、退回未记录）",
);

/* ⑥ 反向：不得再出现"拿一个常量当默认判定人"的写法。
   上一条只禁了具体字面量，这里禁掉这个**模式**。 */
assert.ok(
  !/decidedBy\s*\?\?\s*"/.test(stream),
  "判定人不得用字符串字面量兜底——兜底必须是 null/未记录，由界面如实呈现",
);

console.log(
  "checkpointAttribution.test: 判定人归属链完整"
    + "（界面无写死身份、取值走 approvals 的真实 actor、取不到时明说未记录，"
    + "且后端 DTO 与跨仓库字段名一致）",
);
