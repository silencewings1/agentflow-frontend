/**
 * 一次性跑完 `scripts/*.test.ts` 的全部守卫，并汇总结果。
 *
 * ## 为什么需要这条命令
 *
 * 这些守卫此前**没有任何入口**：既没有 npm script，两份 AGENTS.md 也没写，
 * 于是它们只在我（写它们的人）手工敲 `for f in scripts/*.test.ts` 时才跑。
 * 后果有二，都很实际：
 *
 * ① **忘记跑就等于没有**。守卫拦的是"改坏后才显现"的缺陷——
 *   那种改动最常见的来源恰恰是**没打算动守卫的那次重构**。
 *   没人跑它，等于它在 CI 与日常开发里都不存在。
 *
 * ② **单个守卫失败容易被淹没**。20 个脚本各自 exit 1，
 *   在一屏输出里与 19 个成功混在一起，很容易被当成"跑过了"。
 *
 * ## 与「逐条判据自检」的关系
 *
 * 第 156/157 轮发现：守卫的判据可以被改成恒真从而**永远不再报警**。
 * 那属于代码评审要抓的事，无法靠另一条判据兜住；
 * 但**「守卫根本没被运行」是更常见也更容易修的失效**，就是这条命令要解决的。
 *
 * ## 为什么自己实现而不用 glob runner
 *
 * 守卫是 `node --experimental-strip-types` 直接跑的 `.ts`，不经 vitest
 * （它们要读源码文本、并用 `process.exit` 汇报），与 vitest 的运行模型不同。
 * 这里保持同样的调用方式，避免"经由 npm test 跑"与"手工跑"出现差异——
 * 那正是最容易产生"我以为跑了"的地方。
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'scripts')

const files = readdirSync(dir)
  .filter((name) => name.endsWith('.test.ts') && name !== 'run-all-guards.ts')
  .sort()

const failed: string[] = []
for (const name of files) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', join(dir, name)], {
    encoding: 'utf8',
    cwd: resolve(here, '..'),
  })
  /* 必须用 status 而不是 r.error：spawn 成功但子进程非 0 退出时
     status 才是判据。这一点在第 156 轮踩过——当时用管道看 $?，
     读到的是 tail 的退出码而不是 node 的，于是把崩溃当成了通过。 */
  /* 自检：判据不得被改成恒真/恒假（第 156 轮那条失效模式在 runner 上同样成立，
     已实测：改成恒真后，一个必假的守卫也会被报成通过、退出码 0）。
     因此把判据提成纯函数并双向喂输入。 */
  const passed = (status: number | null): boolean => status === 0
  if (!passed(0) || passed(1)) {
    console.error('run-all-guards: 判据已被废掉（对 0 与 1 的判定不成立）——本 runner 的结论不可信')
    process.exit(2)
  }
  const ok = passed(r.status)
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` (exit ${r.status})`}`)
  if (!ok) {
    failed.push(name)
    const detail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
    if (detail !== '') console.log(detail.split('\n').map((l) => `      ${l}`).join('\n'))
  }
}

console.log(summary(failed.length, files.length))
process.exit(failed.length === 0 ? 0 : 1)

function summary(failedCount: number, total: number): string {
  return failedCount === 0
    ? `\n守卫：${total}/${total} 全部通过`
    : `\n守卫：${total - failedCount}/${total} 通过，${failedCount} 个失败`
}
