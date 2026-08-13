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

/** 编排 id → 该编排的执行过程（不含开场的用户消息与任务契约） */
const bodyOf: Record<string, AgentEvent[]> = {
  "wf-bugfix": bugfixStream,
  "wf-cve": cveStream,
  "wf-unit": unitStream,
  "wf-review": reviewStream,
  "wf-legacy": legacyStream,
};

/**
 * 按会话所属编排取整条正文：开场（用户消息 + 任务契约）与执行过程都随编排变化。
 * 未登记的编排回落到默认的需求开发演示流，保证界面不会因缺数据而空掉。
 */
export function conversationOf(wfId: string | undefined): AgentEvent[] {
  const opening = openingOf(wfId);
  const body = wfId ? bodyOf[wfId] : undefined;
  /* 没有专属正文时沿用默认流的执行过程（e2 起），开场仍按编排替换 */
  return opening
    ? [...opening, ...(body ?? conversation.slice(2))]
    : conversation;
}
