/* WP5 统一 diff 解析器自检脚本。
   前端没有测试运行器（package.json 无 test 脚本，也无 vitest/jest 配置），
   因此本文件是一个自包含的 Node 断言脚本，不新增任何依赖：
     node --experimental-strip-types scripts/diffParser.test.ts
   diffParser.ts 的 import 只有 `import type`，会被 Node 类型擦除去掉，
   所以运行时不存在无扩展名导入解析问题。 */
import assert from "node:assert/strict";
import { parseUnifiedDiff } from "../src/api/diffParser.ts";

/* 1) 真实 unified diff：hunk 头 + add/del/ctx + 行号 */
const single = [
  "diff --git a/src/example.ts b/src/example.ts",
  "index 1111111..2222222 100644",
  "--- a/src/example.ts",
  "+++ b/src/example.ts",
  "@@ -1,4 +1,5 @@ export function main() {",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " return a + b;",
  " }",
].join("\n");

const lines = parseUnifiedDiff(single);
assert.deepEqual(
  lines,
  [
    { type: "hunk", text: "@@ -1,4 +1,5 @@ export function main() {" },
    { type: "ctx", n: 1, text: "const a = 1;" },
    { type: "del", n: 2, text: "const b = 2;" },
    { type: "add", n: 2, text: "const b = 3;" },
    { type: "add", n: 3, text: "const c = 4;" },
    { type: "ctx", n: 4, text: "return a + b;" },
    { type: "ctx", n: 5, text: "}" },
  ],
  "单文件补丁应解析出 hunk/add/del/ctx 且行号正确",
);

/* 文件级元信息头（diff --git / index / --- / +++）必须被跳过 */
assert.equal(lines.filter((l) => l.type === "hunk").length, 1);
assert.equal(lines.some((l) => l.text.includes("diff --git") || l.text.includes("index ")), false, "元信息头不应出现在结果中");

/* 2) 多文件补丁：第二个文件头之后的 hunk 仍需正确解析 */
const multi = [
  "diff --git a/a.txt b/a.txt",
  "index 1111111..2222222 100644",
  "--- a/a.txt",
  "+++ b/a.txt",
  "@@ -1,2 +1,2 @@",
  "-old a",
  "+new a",
  " ctx a",
  "diff --git a/b.txt b/b.txt",
  "new file mode 100644",
  "index 0000000..3333333",
  "--- /dev/null",
  "+++ b/b.txt",
  "@@ -0,0 +1,2 @@",
  "+first b",
  "+second b",
].join("\n");

const multiLines = parseUnifiedDiff(multi);
assert.equal(multiLines.filter((l) => l.type === "hunk").length, 2, "多文件补丁应有 2 个 hunk");
assert.deepEqual(
  multiLines,
  [
    { type: "hunk", text: "@@ -1,2 +1,2 @@" },
    { type: "del", n: 1, text: "old a" },
    { type: "add", n: 1, text: "new a" },
    { type: "ctx", n: 2, text: "ctx a" },
    { type: "hunk", text: "@@ -0,0 +1,2 @@" },
    { type: "add", n: 1, text: "first b" },
    { type: "add", n: 2, text: "second b" },
  ],
  "第二个文件的元信息头应被跳过，hunk 行号从新头重新开始",
);

/* 3) malformed / 空输入：返回 [] 且不抛错 */
for (const bad of ["", "   \n  ", "not a diff at all", "diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x", "@@ garbage @@"]) {
  let result: unknown;
  assert.doesNotThrow(() => { result = parseUnifiedDiff(bad); }, `输入 ${JSON.stringify(bad)} 不应抛错`);
  assert.deepEqual(result, [], `输入 ${JSON.stringify(bad)} 应返回空数组`);
}
assert.deepEqual(parseUnifiedDiff(null as unknown as string), [], "null 输入应返回空数组");
assert.deepEqual(parseUnifiedDiff(undefined as unknown as string), [], "undefined 输入应返回空数组");

/* 4) \ No newline at end of file：跳过，且不推进行号 */
const noNewline = [
  "diff --git a/x.txt b/x.txt",
  "index 1..2 100644",
  "--- a/x.txt",
  "+++ b/x.txt",
  "@@ -1 +1 @@",
  "-old",
  "+new",
  "\\ No newline at end of file",
].join("\n");
const noNewlineLines = parseUnifiedDiff(noNewline);
assert.deepEqual(
  noNewlineLines,
  [
    { type: "hunk", text: "@@ -1 +1 @@" },
    { type: "del", n: 1, text: "old" },
    { type: "add", n: 1, text: "new" },
  ],
  "\\ No newline 标记应被跳过",
);
assert.equal(noNewlineLines.some((l) => l.text.includes("No newline")), false);

/* 5) CRLF 输入也能解析 */
const crlf = "--- a/x\r\n+++ b/x\r\n@@ -1 +1 @@\r\n-old\r\n+new\r\n";
assert.deepEqual(
  parseUnifiedDiff(crlf),
  [
    { type: "hunk", text: "@@ -1 +1 @@" },
    { type: "del", n: 1, text: "old" },
    { type: "add", n: 1, text: "new" },
  ],
  "CRLF 补丁应正常解析",
);

console.log("single :", JSON.stringify(lines));
console.log("multi  :", JSON.stringify(multiLines));
console.log("nonewln:", JSON.stringify(noNewlineLines));
console.log("empty  :", JSON.stringify(parseUnifiedDiff("")), JSON.stringify(parseUnifiedDiff("not a diff")));
console.log("\ndiffParser.test.ts: all assertions passed");
