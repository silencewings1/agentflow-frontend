/* ======================= 各编排的完整事件流装配 =======================
   每套编排都有自己的一整条正文：从思考、计划、交接、工具调用，到门禁
   拦截、定向返工、复跑通过、受控写入与人工检查点。

   为什么不共用一套执行细节：会话标题写着「整改 fastjson 漏洞」、流水线
   显示「开源漏洞整改」，正文却在讲 QFII 重构 —— 这种自相矛盾会让整个
   界面的可信度归零。演示数据的一致性本身就是设计的一部分。

   每套都刻意保留一次失败返工：返工是路由而不是重试，只有把「重做什么、
   保留什么」都摊开，定向返工才不是一句空话。

   放在独立文件而不是 mock.ts 内，是为了避免与各 stream 的类型导入形成
   循环引用（stream 从 mock 取 AgentEvent 类型）。
   ==================================================================== */

import type { AgentEvent } from "../mock";
import { conversation, openingOf } from "../mock";
import { bugfixStream } from "./bugfix";
import { cveStream } from "./cve";
import { legacyStream } from "./legacy";
import { reviewStream } from "./review";
import { unitStream } from "./unit";

/** 编排 id → 该编排的执行过程（不含开场的用户消息与任务契约）。
    wf-feature（需求开发，默认）复用默认演示流的执行部分。 */
const bodyOf: Record<string, AgentEvent[]> = {
  "wf-bugfix": bugfixStream,
  "wf-cve": cveStream,
  "wf-unit": unitStream,
  "wf-review": reviewStream,
  "wf-legacy": legacyStream,
  "wf-feature": conversation.slice(2),
};

/** 每套编排都有专属开场：需求开发即默认演示流的前两条（用户消息 + 任务契约），
    其余由 mock.openings 按编排提供；未登记时返回 undefined。 */
const openingOfEither = (wfId: string | undefined): AgentEvent[] | undefined =>
  wfId === "wf-feature" ? conversation.slice(0, 2) : openingOf(wfId);

/**
 * 按会话所属编排取整条正文：开场与执行过程都随编排变化，全部登记在
 * bodyOf / 开场表中，装配一致，不再靠分叉回退。未登记的编排才回落到
 * 默认的需求开发演示流，保证界面不会因缺数据而空掉。
 */
export function conversationOf(wfId: string | undefined): AgentEvent[] {
  const opening = openingOfEither(wfId);
  const body = wfId ? bodyOf[wfId] : undefined;
  return opening && body ? [...opening, ...body] : conversation;
}