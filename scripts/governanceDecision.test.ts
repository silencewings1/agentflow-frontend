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

import { readFileSync, readdirSync } from 'node:fs'
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

/* ── ⑥ 接收方的 can() 必须都**传下去 nodeId**（第 82、230 轮）──────────
   第 228 轮补了 canGovernanceAction **自身**的判定逻辑判据，
   但它有**多个接收方**，每个都包了一层 can() 助手。

   ## 第 82 轮：只测到一份
   两份 can() 逐字相同，既有守卫对 GovernanceView 有 can() 形态判据，
   对 RuntimeConsole **只有「接收了 canGovernanceAction」这一条接线判据**。
   同一处改动（nodeId 写成 undefined）：

     GovernanceView -> 红
     RuntimeConsole -> **守卫 23/23 全绿**

   ## 第 230 轮：我修它的判据**又留了同一个形态的旁路**
   上一轮我写下「要么逐处写，要么写成遍历」，然后自己**逐处写**了——
   在判据里手列了两个文件名。于是**新增第三个接收方**时，
   它自动落在判据之外，守卫依然 23/23 全绿。

   ⇒ 判据的**目标集合必须从代码推导，不能手列**。
     「谁接收了这个 prop」是可以从 props 类型里读出来的，
     判据应当**按这个规则自己枚举**，
     而不是把当前恰好存在的文件名抄一遍——
     后者会把「今天的清单」固化成「永远正确的清单」。
   ⇒ 这与第 218/223/224 轮那条教训是同一条线的**第四次**：
     判据只要依赖「我抄下来的现状」，抄漏就会变成盲区。 */
{
  const compDir = resolve(process.cwd(), 'src/components')
  /** 判据自己枚举接收方：props 类型里出现 `canGovernanceAction?:` 即算。 */
  const receivers = readdirSync(compDir)
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => /canGovernanceAction\?:/.test(readFileSync(resolve(compDir, f), 'utf8')))
    .sort()

  assert.ok(receivers.length >= 2, `自动枚举到的接收方只有 ${receivers.length} 个（${receivers.join(', ')}）——枚举规则可能已失效。`)

  for (const name of receivers) {
    const src = readFileSync(resolve(compDir, name), 'utf8')
    assert.ok(
      /const can = \(required: "run" \| "approve" \| "manage", nodeId\?: string\) =>/.test(src),
      `${name} 缺少 can() 助手签名——请同步本守卫与组件实现。`,
    )
    assert.ok(
      /canGovernanceAction\?\.\(required,\s*nodeId\)/.test(src),
      `${name} 的 can() **没有把 nodeId 传下去**：` +
        '节点级判据退化为编排级判据，用户会看到自己「在别的节点有权限」也能裁决当前节点。',
    )
  }
  console.log(`  · ⑥ 自动枚举接收方：${receivers.join(', ')}`)
}

/* ── ⑦ 反向自检：判据 ⑥ 对「人为差异」敏感 ────────────────────────────── */
{
  const src = readFileSync(resolve(process.cwd(), 'src/components/RuntimeConsole.tsx'), 'utf8')
  const mutated = src.replace(
    /canGovernanceAction\?\.\(required,\s*nodeId\)/,
    'canGovernanceAction?.(required, undefined)',
  )
  assert.notEqual(mutated, src, '人造样本没能改掉 RuntimeConsole 的传参——判据 ⑥ 的正则已脱节。')
  assert.ok(
    !/canGovernanceAction\?\.\(required,\s*nodeId\)/.test(mutated),
    '判据 ⑥ 对人造样本没有反应——它恒真。',
  )
}

/* ── ⑧ 反向自检：**新增一个接收方**时判据 ⑥ 会不会自动跟过去 ──────────
   这是第 230 轮的直接对照：上一轮的判据是手列文件名，
   于是「新增第三份」完全落在判据之外。
   这里造一份人造接收方，走**判据自己的枚举函数**，
   断言它确实会被收进集合——
   若枚举规则已失效（如 props 写法变了），这条会先红。 */
{
  const enumReceivers = (src: Record<string, string>): string[] =>
    Object.keys(src).filter((f) => /canGovernanceAction\?:/.test(src[f]!)).sort()

  const real: Record<string, string> = {}
  const compDir = resolve(process.cwd(), 'src/components')
  for (const f of readdirSync(compDir)) {
    if (f.endsWith('.tsx')) real[f] = readFileSync(resolve(compDir, f), 'utf8')
  }
  const before = enumReceivers(real)
  assert.ok(before.includes('RuntimeConsole.tsx'), '枚举函数没能识别既有的 RuntimeConsole——枚举规则已失效。')

  const withThird = { ...real, 'InjectedThird.tsx': 'canGovernanceAction?: (x: string) => void' }
  const after = enumReceivers(withThird)
  assert.ok(
    after.includes('InjectedThird.tsx'),
    '新增一份接收方后，判据 ⑥ 的枚举没有把它收进来——它又变回手列清单了。',
  )
  assert.equal(after.length, before.length + 1, '枚举结果数量不对，判据 ⑥ 的遍历前提已失效。')
}

/* ── ⑨ 所有「从 actor 取管理权」的组件都必须同源（第 232 轮）──────────────
   `actor.canManageAccounts` 是后端算好的字段（`holdsRealManage`，
   第 215 轮实测过），前端各处都应**直接取它**，不得自行推导。

   ## 缺陷（第 85 处）
   既有守卫对 `ModelsPane` 有**逐字**判据：
       /canManage=\{actor\?\.canManageAccounts === true\}/
   对 `MembersPane` 却**只查了提示分支**，没查 `canManage` 的**来源**：

       const canManage = actor?.canManageAccounts === true;   ← 无任何判据

   把它改成 `const canManage = true`，**守卫 23/23 全绿**。

   MembersPane 是**多用户账户管理的核心界面**（建号、停用、授权都在里面），
   它整块的管理准入就来自这一行。

   ## 为什么用**枚举**而不是加一条 MembersPane 专用判据
   同第 230/231 轮那条教训：手列清单会把「今天的组件」固化成清单。
   这里按**规则**枚举——凡是自己算 `canManage` / `canManageSession`
   且读取 `actor.canManageAccounts` 的组件，都必须保持那一行原样。
   ──────────────────────────────────────────────────────────────── */
{
  const compDir = resolve(process.cwd(), 'src/components')
  /** 按规则找出「自己取管理权」的组件：出现 canManage…= 且同时读 actor.canManageAccounts */
  const managers = readdirSync(compDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => [f, readFileSync(resolve(compDir, f), 'utf8')] as const)
    .filter(([, src]) => /const canManage\w*\s*=|const canManage\w* =/.test(src))
    .filter(([, src]) => /canManageAccounts/.test(src))
    .map(([f]) => f)
    .sort()

  assert.ok(
    managers.includes('MembersPane.tsx'),
    `枚举到的「自取管理权」组件里没有 MembersPane.tsx（实际：${managers.join(', ') || '无'}）——枚举规则可能已失效。`,
  )

  for (const name of managers) {
    const src = readFileSync(resolve(compDir, name), 'utf8')
    assert.ok(
      /actor\?\.canManageAccounts === true/.test(src.replace(/\s+/g, ' ')),
      `${name} 的管理权判据不再直接从 actor.canManageAccounts 取——` +
        '若是自行推导（甚至写成常量 true），非管理者会看到可点的管理按钮，' +
        '填完表单才收到 403。',
    )
  }
  console.log(`  · ⑨ 枚举「自取管理权」组件：${managers.join(', ')}`)
}

/* ── ⑩ 反向自检：判据 ⑨ 对「人为差异」敏感 ─────────────────────────────── */
{
  const src = readFileSync(resolve(process.cwd(), 'src/components/MembersPane.tsx'), 'utf8')
  const mutated = src.replace(/actor\?\.canManageAccounts === true/, 'true')
  assert.notEqual(mutated, src, '人造样本没能改掉 MembersPane 的管理权来源——判据 ⑨ 的正则已脱节。')
  assert.ok(
    !/actor\?\.canManageAccounts === true/.test(mutated.replace(/\s+/g, ' ')),
    '判据 ⑨ 对人造样本没有反应——它恒真。',
  )
}

console.log('  ✓ 10 条判据全部通过')
