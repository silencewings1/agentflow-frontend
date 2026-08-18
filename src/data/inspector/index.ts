import { defaultBundle, type InspectorBundle } from "./bundle";

/** 按会话所属编排取检查面板现场。去除各编排专属数据后，统一返回默认现场。 */
export function inspectorOf(_wfId: string | undefined): InspectorBundle {
  return defaultBundle;
}

export type { InspectorBundle };
