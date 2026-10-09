export { afApi, createAfApiClient } from "./client";
export { AfApiError } from "./client";
export { errorText } from "./error-text";
/* 多用户领域模型：角色/权限标签与梯度由 API 边界导出，组件不自行定义一份，
   否则界面文案与后端判定会各自漂移。 */
export {
  ACCOUNT_ROLE_LABEL,
  ACCOUNT_ROLE_ORDER,
  NODE_PERM_LABEL,
  NODE_PERM_ORDER,
  permRank,
} from "./fixtures/accounts";
export { toUiBootstrap, toTaskDetail, toTrajectory, toWorkflowDto, structuredToEvents } from "./mappers";
/* 时间显示投影：AF API 全部时间字段是 UTC ISO 串，展示前必须转本地时区。
   收敛到一处，避免各处自行 slice 出 8 小时偏差（见 timeLabels.ts 说明）。 */
export { dateOnlyLabel, dateTimeLabel, timeOnlyLabel } from "./timeLabels";
export { normalizeAttemptTrace, normalizeSkillOutput, normalizePlanPayload, normalizeProposalPayload } from "./types";
export type * from "./types";
