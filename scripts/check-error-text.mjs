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
import { readFileSync, readdirSync } from "node:fs";
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

/**
 * 从后端源码扫描 DAG/WorkSpec 校验码全集。
 *
 * 这些码散落在 af-contract / af-api / af-orchestrator 的校验器与测试里，不像
 * AF_ERROR_CODES 那样有单一的数组常量，因此按「前缀_后缀」形态扫描字符串字面量。
 */
function backendValidationCodes() {
  const codes = new Set();
  const roots = ["af-contract", "af-api", "af-orchestrator"].map((pkg) =>
    resolve(repoRoot, `packages/af/${pkg}/src`),
  );
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 包或目录不存在时跳过，不因此让校验失败
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(resolve(dir, entry.name));
      } else if (entry.name.endsWith(".ts")) {
        const text = readFileSync(resolve(dir, entry.name), "utf8");
        for (const m of text.matchAll(/['"](WORKFLOW|WORKSPEC|DAG)_[A-Z][A-Z0-9_]*(?:_[A-Z0-9]+)*['"]/g)) {
          const code = m[0].slice(1, -1);
          if (code.length > 8) codes.add(code);
        }
      }
    }
  };
  for (const root of roots) walk(root);
  return [...codes];
}

/** 从 error-text.ts 提取已登记的校验码键。 */
function mappedValidationCodes() {
  const path = resolve(here, "../src/api/error-text.ts");
  const src = readFileSync(path, "utf8");
  const block = src.match(/VALIDATION_CODE_TEXT[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error(`无法在 ${path} 中定位 VALIDATION_CODE_TEXT`);
  return new Set([...block[1].matchAll(/^\s*((?:WORKFLOW|WORKSPEC|DAG)_[A-Z_]+):/gm)].map((m) => m[1]));
}

const backend = backendCodes();
const mapped = mappedCodes();
const missing = backend.filter((code) => !mapped.has(code));

const validation = backendValidationCodes();
const mappedValidation = mappedValidationCodes();
const missingValidation = validation.filter((code) => !mappedValidation.has(code));

if (missing.length > 0 || missingValidation.length > 0) {
  if (missing.length > 0) {
    console.error(`错误码映射缺失 ${missing.length} 项（后端有、前端 ERROR_CODE_TEXT 未登记）：`);
    for (const code of missing) console.error(`  - ${code}`);
  }
  if (missingValidation.length > 0) {
    console.error(`校验码映射缺失 ${missingValidation.length} 项（后端有、前端 VALIDATION_CODE_TEXT 未登记）：`);
    for (const code of missingValidation) console.error(`  - ${code}`);
  }
  console.error("\n界面会退回展示后端英文原文。请在 src/api/error-text.ts 补齐中文说明。");
  process.exit(1);
}

console.log(
  `映射完整：错误码 ${backend.length}/${backend.length}、校验码 ${validation.length}/${validation.length} 全部已登记中文说明。`,
);
