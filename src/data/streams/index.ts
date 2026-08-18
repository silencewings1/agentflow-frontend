import { conversation, type AgentEvent } from "../mock";

/** 按会话所属编排取事件流。去除各编排专属叙事后，统一返回默认演示流，
    保证界面中每种事件卡片都能渲染。 */
export function conversationOf(_wfId: string | undefined): AgentEvent[] {
  return conversation;
}
