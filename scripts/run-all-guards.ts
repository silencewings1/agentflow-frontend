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
 * ## 三个"只在异常路径上出现"的失败模式（第 158 轮逐个复现后修掉）
 *
 * 1. **一个守卫都不剩** → 原实现报"0/0 全部通过"、退出 0。
 *    那是**最危险的假绿**：不是"验证通过"，而是"没有可验证的东西"。
 *    空目录通常意味着脚本被移动/改名/误删，此时唯一正确的回答是"我不知道去哪了"。
 *    现改为退出 3 并说明。
 * 2. **守卫挂死** → 原实现无限等待。后果不是"慢"，而是**永久挂起**：
 *    CI 与人都只能干等，而一个不会结束的 runner 往往被直接杀掉，
 *    于是它到底跑没跑完**无人知道**。现给每个守卫 60s 墙钟上限并 SIGKILL。
 *    超时**单列**而不并入失败——它不是"被否决"，而是"没得出结论"。
 * 3. **输出超长** → 原实现全量回显，实测一个刷 5000 行的守卫
 *    会把总结冲掉，而真正的失败原因（多在末尾）看不见。现只回显头 3 行 + 尾 17 行。
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

/* 一个守卫都不剩时报"全部通过"是最危险的假绿：那不是"验证通过"，
   而是"什么都没有可验证"。空目录通常意味着脚本被移动/改名/误删，
   此时唯一正确的回答是"我不知道守卫去哪了"（第 158 轮实测：0/0 → 退出码 0）。 */
if (files.length === 0) {
  console.error('run-all-guards: scripts/ 下没有任何守卫——无法声称通过')
  process.exit(3)
}

/* 单个守卫的墙钟上限。守卫是纯同步的源码文本检查，正常应在秒级完成；
   超过这个时间基本只有两种成因：脚本里引入了等待，或它自己死锁。
   不设上限的后果不是"慢"，而是**永久挂起**——CI 与人都只能干等，
   而一个不会结束的 runner 往往被直接杀掉，于是它到底跑没跑完**无人知道**
   （第 158 轮实测：挂死守卫会让 runner 无限等待）。 */
const PER_GUARD_TIMEOUT_MS = 60_000

/* 失败时最多回显多少行输出。实测一个守卫刷 5000 行会把总结冲掉，
   真正的失败原因（通常在最后几行或第一行）反而看不见。 */
const MAX_DETAIL_LINES = 20

const failed: string[] = []
const timedOut: string[] = []
for (const name of files) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', join(dir, name)], {
    encoding: 'utf8',
    cwd: resolve(here, '..'),
    timeout: PER_GUARD_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  /* 超时与失败要分开报。spawnSync 超时后 status 为 null，
     若与"退出码非 0"混为一谈，读者会以为守卫跑过并给出了结论——
     实际上它**根本没跑完**。 */
  const stuck = r.signal !== null || (r.error !== undefined && r.error !== null)
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
  if (stuck) {
    timedOut.push(name)
    console.log(`  ⏱ ${name} 超时（${PER_GUARD_TIMEOUT_MS / 1000}s 未结束，已终止）`)
    continue
  }
  const ok = passed(r.status)
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` (exit ${r.status})`}`)
  if (!ok) {
    failed.push(name)
    /* 只回显末尾若干行：守卫的判据失败信息通常在最后，
       而开头可能是成百上千行噪声，全打出来会把结论冲掉。 */
    const lines = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').filter((l) => l !== '')
    const shown = lines.length > MAX_DETAIL_LINES
      ? [...lines.slice(0, 3), `      …（省略 ${lines.length - MAX_DETAIL_LINES + 3} 行）`, ...lines.slice(-MAX_DETAIL_LINES + 3)]
      : lines
    if (shown.length > 0) console.log(shown.map((l) => `      ${l}`).join('\n'))
  }
}

console.log(summary(failed.length, timedOut.length, files.length))
process.exit(failed.length === 0 && timedOut.length === 0 ? 0 : 1)

function summary(failedCount: number, stuckCount: number, total: number): string {
  const passed = total - failedCount - stuckCount
  if (failedCount === 0 && stuckCount === 0) return `\n守卫：${total}/${total} 全部通过`
  const parts: string[] = []
  if (failedCount > 0) parts.push(`${failedCount} 个失败`)
  /* 超时必须单列：它不是"失败"，而是"没得出结论"——
     混进失败数会让人以为跑过了并被否决。 */
  if (stuckCount > 0) parts.push(`${stuckCount} 个超时未完成`)
  return `\n守卫：${passed}/${total} 通过，${parts.join('、')}`
}
