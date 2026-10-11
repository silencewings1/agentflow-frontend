/**
 * 判据：`AF_ACCOUNT_BUILTIN` 的文案不得对用户行为下**排他断言**。
 *
 * ## 背景（第 176 轮）
 *
 * 原句是「内置账户不可删除，**只能停用**」。中文里「A，只能 B」读作
 * "除了 B 之外都不可为"，而实测内置账户的 `name` / `duty` / `role`
 * **三者都放行**（真实后端逐项验过）。`MembersPane:728` 的注释也把
 * 「改名称/职责/角色」明确归入**可逆**一类、与「停用」并列。
 * 那句话因此在**约束用户行为**，而它描述的约束并不存在。
 *
 * ## 为什么判据只针对这一个码
 *
 * `AF_ACCOUNT_BUILTIN` 在服务端 `errors.ts` 之外**一次都不出现**，
 * 前端也没有任何 `errorText` 分流会路由到它——
 * 它是全表里**唯一**既不由服务端返回、也不由前端合成的孤儿码。
 * 所以它当前**读不到**，文案对不对都没有实际后果。
 *
 * 另三个「服务端不产生」的码性质相反，它们是 `errorText` 内部的**分流目标**
 * （`AF_SELF_SUSPEND` / `AF_GRANT_SLOT_UNKNOWN` / `AF_ACCOUNTS_DISABLED`），
 * 由后端的 `details` 自证成因后前端合成出来，本就不该由服务端返回。
 * 把它们一并纳入会让判据失去意义——它们**必须**有文案。
 *
 * ## 判据的形态
 *
 * 不用「文案里不许出现某些词」——全表有 24 行含排他措辞，
 * 其中大多数是对的（那些码真的会被返回）。
 * 真正的不变量是：**一个永不返回的码，它的文案不该描述用户能做什么**。
 * 因此只对这一个孤儿码断言「不含排他断言」。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/api/error-text.ts', import.meta.url))
const source = readFileSync(SRC, 'utf8')

/** 取出某个码对应的中文文案（兼容换行写法）。 */
function copyOf(code: string): string {
  // 模板串里不必转义引号，那三个 \" 会同时触发 oxlint 的 no-useless-escape
  const m = new RegExp(`${code}:\\s*(?:\\n\\s*)?"([^"]*)"`).exec(source)
  assert.ok(m, `无法在 ${SRC} 定位 ${code} 的文案`)
  return m[1]!
}

/** 排他性措辞：断言"除此之外都不可为 / 不做某事"。 */
const EXCLUSIVE = ['只能', '仅限', '不可', '不得', '无法', '仅能']

const ORPHAN = 'AF_ACCOUNT_BUILTIN'

const copy = copyOf(ORPHAN)
for (const word of EXCLUSIVE) {
  if (copy.includes(word)) {
    console.error(`✗ ${ORPHAN} 的文案含排他断言「${word}」，但该码服务端永不返回、也没有分流会路由到它。`)
    console.error(`  当前文案：${copy}`)
    console.error('  它不该描述用户能做什么——真实约束只有一条：不存在删除接口。')
    process.exit(1)
  }
}

/* 反向自检：判据必须真的会红。若上面那段恒真，这条守卫等于不存在。 */
assert.ok(EXCLUSIVE.length >= 5, '排他措辞表本身不能为空')
assert.ok(
  EXCLUSIVE.some((w) => '内置账户不可删除，只能停用'.includes(w)),
  '判据自检失败：原句「内置账户不可删除，只能停用」本应被判红',
)

console.log(`孤儿码文案检查通过：${ORPHAN} 不含排他断言（判据自检 ${EXCLUSIVE.length} 项已红）。`)
