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

/** 默认现场：与默认演示流一致 */
export const defaultBundle: InspectorBundle = {
  files: fileTree,
  diffs,
  evidence: evidenceChain,
  replay: replaySteps,
  terminal: terminalLog,
};
