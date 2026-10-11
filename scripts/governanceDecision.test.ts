/**
 * 前端治理判据的**判定逻辑**判据（第 228 轮）。
 *
 * ## 缺陷是怎么发现的
 *
 * 既有守卫 `governanceAdmission.test.ts` 已经把 `canGovernanceAction`
 * 的**接线**钉得很死：调用点数量、handleCheckpoint 的判断顺序、
 * GovernanceView / RuntimeConsole 必须接收它。
 *
 * 但全部是「**它被用了吗**」，没有一条是「**它算得对吗**」。
 * 于是把它的**判定逻辑**改成恒定，两次注入都是零反对：
 *
 *   ① `permRank(grant.perm) >= permRank(required) || true`（永远放行）
 *   ② `permRank(grant.perm) >= 999`（永远拒绝）
 *
 * 两次都是：tsc 0 错误、守卫 22/22、scripts 7 passed。
 *
 * 这与第 220 轮那批「承诺写在注释里却无测试」是同一类，
 * 但更隐蔽一层：**接线判据会给���一种强烈的「已经测过了」的错觉**——
 * 它确实测了，而且测得很细，只是测的不是这件事。
 *
 * ## 为什么这道闸值得单独测
 *
 * 它是后端 `guard(...)` 在前端的镜像。后端那道闸第 227 轮量过，
 * 双向都有测试；前端这一道若恒真，用户会看到**所有治理按钮都可点**，
 * 点下去被后端 403——这不是安全问题（后端会兜住），
 * 但它是**明确的 UX 缺陷**：界面在撒谎。
 * 而 §12 有一条硬约束：**前端判据不得比后端更严**，
 * 也不得比后端更松到「永远放行」。
 *
 * @module agentflow-frontend/scripts/governance-decision
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { strict as assert } from 'node:assert'

const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')

/** 取出 canGovernanceAction 的函数体。 */
function bodyOf(name: string): string {
  const i = app.indexOf(`const ${name} = useCallback(`)
  assert.ok(i >= 0, `App.tsx 里找不到 ${name}`)
  let depth = 0
  let seen = false
  for (let k = i; k < app.length; k += 1) {
    if (app[k] === '(' || app[k] === '{') { depth += 1; seen = true }
    else if (app[k] === ')' || app[k] === '}') {
      depth -= 1
      if (seen && depth === 0) return app.slice(i, k + 1)
    }
  }
  return app.slice(i)
}

const body = bodyOf('canGovernanceAction')

console.log('治理判据的判定逻辑（第 228 轮）')

/* ── ① 档位比较必须是单调的 >= ──────────────────────────────────────────
   改成 > 会误伤**恰好等权**的调用（持有 run 的去跑 run 档动作）。 */
{
  const has = /permRank\(grant\.perm\)\s*>=\s*permRank\(required\)/.test(body)
  assert.ok(
    has,
    'canGovernanceAction 必须按「档位单调 >=」判定：\n' +
      '  · 改成 > 会误伤恰好等权的授权（持有 run 却不能跑 run 档动作）；\n' +
      '  · 改成 || true / 常数则永远放行，界面在撒谎（后端会 403）。\n' +
      '  当前实现里找不到 `permRank(grant.perm) >= permRank(required)`。',
  )
}

/* ── ② 恒真捷径：不允许出现 || true 之类让它失效的写法 ───────────────── */
{
  const shortcut = /permRank\(grant\.perm\)\s*>=\s*permRank\(required\)\s*\|\|\s*(true|1)\b/.test(body)
  assert.ok(!shortcut, 'canGovernanceAction 的档位比较被接上了恒真捷径（|| true）——判据已恒真。')
  const impossible = /permRank\(grant\.perm\)\s*>=\s*\d{3,}\b/.test(body)
  assert.ok(!impossible, 'canGovernanceAction 的档位阈值写成了不可能达到的常数——判据已恒假。')
}

/* ── ③ fail-closed 与 fail-open 的方向都要有判据 ─────────────────────────
   目录不可用时**放行**（交给后端兜底）是刻意的：硬判会把演示界面锁死。
   但停用身份必须拒——这一侧不能被顺手删掉。 */
{
  assert.ok(
    /actor\.state === "suspended"\)\s*return\s*\{\s*allowed:\s*false/.test(body.replace(/\s+/g, ' ')),
    'canGovernanceAction 删掉了「停用身份返回 allowed:false」——误伤方向无人反对。',
  )
}

/* ── ④ 判据必须真的用了 grants（不能自己恒真返回）─────────────────────── */
{
  const usesGrants = /grants\.some\(/.test(body)
  assert.ok(usesGrants, 'canGovernanceAction 不再遍历 grants 求值——判据已与授权数据脱钩。')
  const accountScoped = /grant\.accountId === actor\.accountId/.test(body.replace(/\s+/g, ' '))
  assert.ok(accountScoped, 'canGovernanceAction 未按 accountId 过滤 grants——会读到别人的授权。')
}

/* ── ⑤ 反向自检：判据对「人为差异」敏感（否则上面全部恒真）────────────── */
{
  const before = body.length
  assert.ok(before > 400, `canGovernanceAction 的函数体异常短（${before} 字符），提取可能失败。`)
  /* 人造样本：把 >= 换成 || true，本脚本的判据 ① 必须失败。 */
  const mutated = body.replace(
    /permRank\(grant\.perm\)\s*>=\s*permRank\(required\)/,
    'permRank(grant.perm) >= permRank(required) || true',
  )
  assert.notEqual(mutated, body, '人造样本没能改掉档位比较——判据 ① 的正则已与实际写法脱节。')
  assert.ok(
    !/permRank\(grant\.perm\)\s*>=\s*permRank\(required\)\s*\|\|\s*(true|1)\b/.test(mutated) === false,
    '判据 ② 对人造的 || true 样本没有反应——它恒真。',
  )
}

console.log('  ✓ 5 条判据全部通过')
