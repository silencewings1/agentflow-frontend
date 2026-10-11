/**
 * 守卫：`vitest.config.ts` 的 `test.include` 必须覆盖**每一个**真实存在的 spec。
 *
 * ## 为什么这条守卫不能住在 vitest 里（第 159 轮的教训）
 *
 * 我第一版把它写成了 `scripts/test-coverage.spec.ts`，跑在 vitest 内部。
 * 然后用它要防的那个场景去试它 —— 把 include 收窄成
 * `packages/af/af-api/tests/**`：
 *
 *     No test files found, exiting with code 1
 *     filter: scripts/test-coverage.spec.ts
 *
 * 退出码确实是 1，看着"抓到了"。但那是 **vitest 找不到文件**报的，
 * **守卫本身根本没被执行**：它住在 `scripts/` 下，而收窄后 `scripts/`
 * 已不在 include 范围内。
 *
 * 真实场景更糟：收窄后跑的是那 411 条用例，守卫不在其中，
 * 于是**仍然没有任何东西报警**——我以为的"防线"在真正需要它的时刻
 * 自动消失了。
 *
 * ⇒ **住在被守护对象内部的守卫，保护不了那个对象。**
 * 所以这条守卫必须待在 vitest **之外**。本文件正是在
 * `npm run guard` 下跑的，那条命令由 `run-all-guards.ts` 驱动，
 * 与 `test.include` 毫无关系。
 *
 * ## 它防的是什么

 * `vitest run` 的退出码只回答"跑到的那些有没有失败"，
 * **不回答**"该跑的有没有都跑到"。实测：
 *
 *     include 收窄成只留 af-api:
 *     Test Files  46 passed (46)
 *          Tests  411 passed (411)
 *     退出码 = 0        ← 少跑 375 条，没有任何报警
 *
 * 与"把某条判据写成恒真"相比，这条更危险：那种要改代码才成立，
 * 而这一条只要一次配置改动（或一条错误的 glob）就成立，
 * 且改的人通常**完全没察觉自己改了测试范围**。
 *
 * ## 为什么不用"写死应有 N 条"

 * 写死数字会在每加一个用例时立刻变成噪音，反而让人习惯性忽略；
 * 改配置的人只要顺手把数字调小，判据就跟着失效。
 * 这里的判据是**结构性的**：枚举磁盘上真实存在的 spec，
 * 要求 include 逐个覆盖。这个结论在任何用例数下都成立。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirnameOf(import.meta.url)
/** 前端子模块的根；主仓库是它的父目录。 */
const subRepo = resolve(here, '..')
const mainRepo = resolve(subRepo, '..')

function dirnameOf(url: string): string {
  return fileURLToPath(new URL('.', url))
}

let failures = 0

function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures++
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
  if (!ok) console.log(`      ${detail}`)
}

function collectSpecs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    /* 两个子模块各有自己的测试套件与运行方式
       （AGENTS.md §六：`cd deepseek-harness && pnpm run test`），
       把它们算进来等于要求 AF 的 vitest 去跑 DSH 的上千个用例——
       那是错的诉求，不是缺陷。 */
    if (name === 'deepseek-harness' || name === 'agentflow-frontend') continue
    /* experiments/phase1.6 的两个 spec 有意不在 `npm test` 内：
       它们起真实 HTTP 服务与子进程，由 acceptance.md 记录的
       run-w7-local.sh / run-w7-ui.sh 单独驱动。 */
    if (name === 'experiments') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectSpecs(full, acc)
    else if (name.endsWith('.spec.ts')) acc.push(full)
  }
  return acc
}

/* glob 只支持 `*`（单层）与 `**`（多层），这里按段比对即可，
   不必引入依赖。`*` 不跨 `/`，这一点与 glob 的真实语义一致。 */
function matches(pattern: string, relPath: string): boolean {
  const pat = pattern.split('/')
  const seg = relPath.split('/')
  let i = 0
  for (; i < pat.length; i++) {
    const p = pat[i]!
    if (p === '**') return true
    const s = seg[i] ?? ''
    if (p.includes('*')) {
      const rx = new RegExp('^' + p.split('*').map(escapeRx).join('[^/]*') + '$')
      if (!rx.test(s)) return false
    } else if (p !== s) return false
  }
  return i === pat.length
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

console.log('守卫：后端测试范围不被悄悄削减')

/* ── 判据自检：把匹配函数提成纯函数并双向喂输入 ────────────────────────────
   第 156 轮证明判据可以改成恒真从而永远不再报警，且实测可行。
   这里不依赖"别的判据能发现"——直接给本判据自己装一个探针。 */
check(
  '判据自检：单层 * 不跨 `/`（af-* 不能匹配 af-api/af-storage）',
  matches('packages/af/*/tests/**', 'packages/af/af-api/tests/a.spec.ts') === true
  && matches('packages/*/tests/**', 'packages/af/af-api/tests/a.spec.ts') === false,
  '匹配函数把 * 当成了跨层通配，或反过来完全失效',
)
check(
  '判据自检：不匹配的模式必须返回 false',
  matches('packages/af/*/tests/**', 'scripts/x.spec.ts') === false,
  '匹配函数对任意路径都返回 true——它已失去把关能力',
)

const configPath = join(mainRepo, 'vitest.config.ts')
const configRaw = readFileSync(configPath, 'utf8')

const includeMatch = /include:\s*\[([\s\S]*?)\]/.exec(configRaw)
if (includeMatch === null) {
  check('vitest.config.ts 显式声明 test.include', false, '没找到 include 配置')
} else {
  check('vitest.config.ts 显式声明 test.include', true, '')

  const patterns = [...includeMatch[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
  check('include 至少有一条模式', patterns.length > 0, `实际 ${patterns.length} 条`)

  const specs = collectSpecs(mainRepo).map((f) => f.slice(mainRepo.length + 1))
  check(
    '磁盘上确实存在 spec 文件（若为 0，说明 include 或目录结构已失效）',
    specs.length > 50,
    `实际找到 ${specs.length} 个`,
  )

  /* ── 判据②：不得有被跳过的用例 ────────────────────────────────────────────
     include 正确不代表内容正确。第 159 轮实测：把一个文件的 8 条 it 全部改成
     it.skip 之后——

         Test Files  96 passed | 1 skipped (97)
              Tests  778 passed | 8 skipped (786)
         退出码 = 0

     整个文件的覆盖凭空消失，而套件**仍然报绿**。
     那 8 条守的正是 §152–155 的判权不变量（no-manager、悬空 manage、
     无人可 manage、并发原子性），且**没有第二处覆盖**——
     去掉它们不会让任何其它测试变红，于是"无人验证"这件事完全隐形。

     与判据①不同，这条**不需要**运行时信息：vitest 的跳过是源码里的
     `it.skip` / `describe.skip` / `xit` / `xdescribe`，静态就能看见。 */
  const skipPattern = /\b(?:it|test|describe)\.skip\b|\bxit\b|\bxdescribe\b/
  const skippedIn: string[] = []
  for (const rel of specs) {
    const raw = readFileSync(join(mainRepo, rel), 'utf8')
    /* 去掉注释后再扫：`it.skip` 出现在解释为什么这么写的段落里是正常的，
       只有**代码里**的 skip 才会真的让用例不跑。 */
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const [i, line] of code.split('\n').entries()) {
      if (skipPattern.test(line)) skippedIn.push(`${rel}:${i + 1}  ${line.trim().slice(0, 60)}`)
    }
  }
  check(
    `没有任何用例被跳过（发现 ${skippedIn.length} 处 skip/xit/xdescribe）`,
    skippedIn.length === 0,
    skippedIn.slice(0, 8).join('\n      ') + (skippedIn.length > 8 ? `\n      …（另有 ${skippedIn.length - 8} 处）` : ''),
  )

  const missed = specs.filter((rel) => !patterns.some((p) => matches(p, rel)))
  check(
    `include 覆盖全部 ${specs.length} 个 spec（漏掉 ${missed.length} 个，它们会被静默跳过）`,
    missed.length === 0,
    missed.slice(0, 8).join('\n      ') + (missed.length > 8 ? `\n      …（另有 ${missed.length - 8} 个）` : ''),
  )
}

if (failures > 0) {
  console.log(`backendTestCoverage: ${failures} 项失败`)
  process.exit(1)
}