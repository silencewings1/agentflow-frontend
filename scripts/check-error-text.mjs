/**
 * 检查 src/api/error-text.ts 的映射是否覆盖后端全部错误码。
 *
 * 背景：后端 message 是工程口径（英文），界面文案由前端负责。若后端新增错误码而
 * 前端未同步登记，界面会退回展示英文原文——这正是这次要修的问题，且它是**静默
 * 退化**：不报错、不影响构建，只在用户看到英文时才暴露。
 *
 * 前端没有测试框架（见 package.json 的 scripts，只有 build/lint/preview），因此
 * 这里用一个零依赖的静态核对脚本承担该约束，用法与 lint 一致。
 *
 * 用法：node scripts/check-error-text.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

/** 从后端 errors.ts 提取 AF_ERROR_CODES 全集。 */
function backendCodes() {
  const path = resolve(repoRoot, "packages/af/af-api/src/errors.ts");
  const src = readFileSync(path, "utf8");
  const block = src.match(/AF_ERROR_CODES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error(`无法在 ${path} 中定位 AF_ERROR_CODES`);
  return [...block[1].matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1]);
}

/** 从 error-text.ts 提取已登记的错误码键。 */
function mappedCodes() {
  const path = resolve(here, "../src/api/error-text.ts");
  const src = readFileSync(path, "utf8");
  const block = src.match(/ERROR_CODE_TEXT[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error(`无法在 ${path} 中定位 ERROR_CODE_TEXT`);
  return new Set([...block[1].matchAll(/^\s*(AF_[A-Z_]+):/gm)].map((m) => m[1]));
}

const backend = backendCodes();
const mapped = mappedCodes();
const missing = backend.filter((code) => !mapped.has(code));

if (missing.length > 0) {
  console.error(`错误码映射缺失 ${missing.length} 项（后端有、前端 ERROR_CODE_TEXT 未登记）：`);
  for (const code of missing) console.error(`  - ${code}`);
  console.error("\n界面会退回展示后端英文 message。请在 src/api/error-text.ts 补齐中文说明。");
  process.exit(1);
}

console.log(`错误码映射完整：后端 ${backend.length} 个码全部已登记中文说明。`);
