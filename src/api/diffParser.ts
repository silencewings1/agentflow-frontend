import type { DiffLine } from "../data/mock";

/* 把后端返回的原始 unified diff 文本解析为 DiffView 可直接渲染的行。
   设计约束：只呈现真实补丁，绝不合成 —— 解析失败时返回空数组而不是造行。
   DiffLine 的 text 不带 +/-/空格 标记（标记由 DiffView 按 type 单独渲染）。

   解析以 hunk 头声明的旧/新行数为界，而不是靠前缀猜：
   `@@ -a,b +c,d @@` 之后按 `+`/`-`/` ` 逐个消费，直到 b 与 d 都用尽。
   这样既能正确处理内容本身以 `--- ` 开头的删除行，也能在多文件补丁中
   自然地在 hunk 结束时停下，避免把下一个文件的元信息头当成补丁内容。 */

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * 解析 `git diff` 输出的 unified diff 文本。
 *
 * - `@@ -a,b +c,d @@` → `{ type: "hunk", text }`（保留原始 hunk 头）
 * - `+` 行 → `add`，`-` 行 → `del`，` ` 行 → `ctx`
 * - 行号：add/ctx 用「新文件侧」行号（从 `+c` 起推进）；del 用「旧文件侧」行号
 *   （从 `-a` 起推进），与 src/data/mock.ts 中既有 diff 数据的语义一致。
 * - `\ No newline at end of file` 与文件级元信息头一律跳过。
 * - 空/空白/无 hunk 的输入 → `[]`；任何异常都被吞掉并返回 `[]`，绝不抛出。
 */
export function parseUnifiedDiff(patch: string): DiffLine[] {
  try {
    if (typeof patch !== "string" || patch.trim() === "") return [];
    const lines = patch.split("\n");
    const out: DiffLine[] = [];

    let oldN = 0;
    let newN = 0;
    let oldLeft = 0;
    let newLeft = 0;
    let inHunk = false;

    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

      const hunk = HUNK_RE.exec(line);
      if (hunk) {
        oldN = Number(hunk[1]);
        oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
        newN = Number(hunk[3]);
        newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
        inHunk = true;
        out.push({ type: "hunk", text: line });
        continue;
      }

      if (!inHunk) continue;

      /* hunk 已按声明行数消费完毕：跳过 \ No newline，其余交给下一轮（下一个
         hunk 头或下一个文件的元信息头）。 */
      if (oldLeft <= 0 && newLeft <= 0) {
        inHunk = false;
        if (line.startsWith("\\")) continue;
        // 当前行可能是新的 hunk 头（已在上面处理）或元信息头，下一轮自然处理。
        i -= 1;
        continue;
      }

      if (line.startsWith("\\")) continue; // \ No newline at end of file

      if (line.startsWith("+")) {
        out.push({ type: "add", n: newN, text: line.slice(1) });
        newN += 1;
        newLeft -= 1;
      } else if (line.startsWith("-")) {
        out.push({ type: "del", n: oldN, text: line.slice(1) });
        oldN += 1;
        oldLeft -= 1;
      } else if (line.startsWith(" ")) {
        out.push({ type: "ctx", n: newN, text: line.slice(1) });
        oldN += 1;
        newN += 1;
        oldLeft -= 1;
        newLeft -= 1;
      } else if (line === "") {
        // 部分工具会剥掉上下文空行的前导空格；按空上下文处理。
        out.push({ type: "ctx", n: newN, text: "" });
        oldN += 1;
        newN += 1;
        oldLeft -= 1;
        newLeft -= 1;
      } else {
        // 无法识别的行：结束当前 hunk，交给下一轮重新判断。
        inHunk = false;
      }
    }

    return out;
  } catch {
    return [];
  }
}
