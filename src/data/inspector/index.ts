/* 编排 → 检查面板现场的登记表。
   与 data/streams/index.ts 同构：装配放在独立文件，各数据文件只管自己那一份。 */

import { bugfixBundle } from "./bugfix";
import { defaultBundle, type InspectorBundle } from "./bundle";
import { cveBundle } from "./cve";
import { legacyBundle } from "./legacy";
import { reviewBundle } from "./review";
import { unitBundle } from "./unit";

const byWorkflow: Record<string, InspectorBundle> = {
  "wf-bugfix": bugfixBundle,
  "wf-cve": cveBundle,
  "wf-unit": unitBundle,
  "wf-review": reviewBundle,
  "wf-legacy": legacyBundle,
};

/**
 * 按会话所属编排取检查面板现场。
 * 未登记的编排回落到需求开发的默认现场，保证面板不会空掉。
 */
export function inspectorOf(wfId: string | undefined): InspectorBundle {
  return (wfId ? byWorkflow[wfId] : undefined) ?? defaultBundle;
}

export type { InspectorBundle };
