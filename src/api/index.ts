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
export { normalizeAttemptTrace, normalizeSkillOutput, normalizePlanPayload, normalizeProposalPayload } from "./types";
export type * from "./types";
