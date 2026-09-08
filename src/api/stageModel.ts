/* 阶段卡片模型：把真实 detail 里各节点 attempts[].structured 的异构交付物
   归一化成统一的舞台卡片契约。布局（WP3）与卡片渲染（WP4）只消费这里；
   字段名是冻结契约，改动会同时破坏两个下游工作包。

   契约增补（阶段 B2，交互重构）：新增 **可选** 字段 `attemptId`。
   加可选字段是冻结契约允许的增补方式——既有字段语义、顺序与必填性均未变，
   未提供该字段的调用方行为不变。它只用于让卡片按 attemptId 拉取自己的
   执行诊断轨迹（只读诊断，非治理事实），不得当作交付物/门禁结论的依据。 */
import type { CriterionAssessmentDto } from "./types";

export type StageKind =
  | "requirements" | "design" | "implementation"
  | "skill" | "gate" | "review" | "git-change-set" | "git-publish";

export type StageStatus = "accepted" | "rejected" | "running" | "pending" | "blocked";

export interface StageFact { label: string; value: string; mono?: boolean }
export interface StageList { label: string; items: string[] }
export interface StageFinding {
  id: string; severity: string; category?: string; path?: string;
  description: string; requiredAction?: string; evidenceRef?: string;
}
export interface StageGate {
  gateId: string; outcome: string;
  dimensions: Array<{ name: string; passed: boolean; note?: string }>;
}
export interface StageDiffFile { path: string; action: string; contentDigest: string }

export interface StageCardModel {
  nodeId: string;
  index: number;
  name: string;
  role: string;                 // Chinese role label, e.g. "需求" / "架构" / "开发" / "测试" / "审查" / "交付"
  kind: StageKind;
  schemaVersion: string;
  status: StageStatus;
  attemptOrdinal: number | null;
  /** 本卡片对应的 attemptId（阶段 B2 增补，可选）；仅用于拉取执行诊断轨迹，不参与治理判定。 */
  attemptId?: string;
  summary: string;              // long prose, may contain newlines
  facts: StageFact[];
  lists: StageList[];
  findings?: StageFinding[];
  criteria: CriterionAssessmentDto[];
  gate?: StageGate;
  diffFiles?: StageDiffFile[];
  evidenceRefs: string[];
}
