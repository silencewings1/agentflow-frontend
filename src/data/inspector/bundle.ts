/* ==================== 各编排的检查面板数据（Inspector） ====================
   检查面板回答的是「这条任务改了什么、凭什么可信、怎么走到这一步」。
   这些问题的答案属于具体某条会话 —— 切到「开源漏洞整改」却看到征集重构的
   文件树与证据链，面板就从「可核验」退化成了摆设。

   五类数据必须成套替换，缺一类就会露出破绽：
     files    改了哪些文件（文件树，带 added/modified 标记）
     diffs    逐行改动，key 必须与 files 里的路径完全一致
     evidence 证据链，每条带出处/版本/责任人三元组
     replay   任务回放，按步查证
     terminal 终端现场

   约定：evidence 的 id 用该编排前缀（如 bf-ev-1），避免跨会话串号。
   ========================================================================= */

import type { DiffLine, FileNode } from "../mock";
import { diffs, fileTree, terminalLog } from "../mock";
import type { EvidenceItem, ReplayStep } from "../settings";
import { evidenceChain, replaySteps } from "../settings";

/** 一条会话在检查面板里的完整现场 */
export interface InspectorBundle {
  files: FileNode[];
  diffs: Record<string, DiffLine[]>;
  evidence: EvidenceItem[];
  replay: ReplayStep[];
  terminal: string[];
}

/** 默认现场：需求开发（wf-feature），沿用既有演示数据 */
export const defaultBundle: InspectorBundle = {
  files: fileTree,
  diffs,
  evidence: evidenceChain,
  replay: replaySteps,
  terminal: terminalLog,
};
