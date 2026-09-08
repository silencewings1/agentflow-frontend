import type { WorkSpecDraftInput } from "../api/types";

export type WorkSpecPreflightTone = "info" | "ok" | "warn";

export interface WorkSpecPreflightItem {
  label: string;
  detail: string;
  tone: WorkSpecPreflightTone;
}

export interface WorkSpecPreflight {
  inferred: WorkSpecPreflightItem[];
  boundaries: WorkSpecPreflightItem[];
  frozenChanges: WorkSpecPreflightItem[];
}

function hasCoverageTarget(draft: WorkSpecDraftInput): boolean {
  const text = [draft.objective, draft.background, ...(draft.doneCriteria ?? []).flatMap((item) => [item.description, item.expected])]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();
  return ["coverage", "覆盖率", "percent", "百分比", "%"].some((token) => text.includes(token));
}

/** Browser-only preview; server validation remains authoritative. */
export function deriveWorkSpecPreflight(draft: WorkSpecDraftInput): WorkSpecPreflight {
  const repository = draft.repository;
  const targetBranch = repository?.targetBranch?.trim();
  const repositoryRef = repository?.repositoryRef?.trim();
  const externalWrite = draft.constraints?.externalWrite;
  const writesRequireApproval = externalWrite?.requiresApproval !== false;
  const branchPermitted = !targetBranch || !externalWrite?.allowedBranches?.length || externalWrite.allowedBranches.includes(targetBranch);
  const scopeIsDescribed = (draft.scope?.included ?? []).some((item) => item.trim().length > 0);

  return {
    inferred: [
      {
        label: "覆盖率与测试目标",
        detail: hasCoverageTarget(draft)
          ? "草稿已表达测试或覆盖率目标；平台会把它作为完成证据的一部分。"
          : "未声明硬性覆盖率百分比；平台会按项目测试与证据默认策略处理，不会因此卡住需求门禁。",
        tone: "info",
      },
      {
        label: "测试工具与开发依赖",
        detail: "平台会优先沿用项目现有测试脚本；测试工具、开发依赖和文件布局属于可推断偏好，不要求在这里逐项确认。",
        tone: "info",
      },
      {
        label: "测试文件与命名",
        detail: "测试文件的放置与命名会跟随项目现有结构和模板默认策略；后续由实际测试证据证明结果。",
        tone: "info",
      },
    ],
    boundaries: [
      {
        label: "目标仓库",
        detail: repositoryRef ? `将绑定到 ${repositoryRef}。` : "尚未绑定目标仓库；保存时会使用当前任务的仓库绑定，请在创建任务时确认。",
        tone: repositoryRef ? "ok" : "warn",
      },
      {
        label: "目标分支",
        detail: targetBranch ? `变更将面向 ${targetBranch}。` : "尚未声明目标分支；保存时会使用当前任务的分支绑定，请在创建任务时确认。",
        tone: targetBranch ? "ok" : "warn",
      },
      {
        label: "远端写入",
        detail: writesRequireApproval
          ? (branchPermitted ? "远端写入仍需人工批准；平台不会因冻结 WorkSpec 自动推送、合并或发布。" : "当前目标分支与远端写入边界不一致；请先确认分支与授权范围。")
          : "当前草稿允许不经人工批准的远端写入；这属于高风险边界，冻结前必须重新确认。",
        tone: writesRequireApproval && branchPermitted ? "ok" : "warn",
      },
      {
        label: "变更范围",
        detail: scopeIsDescribed ? "草稿已声明变更范围；执行中仍会由计划、门禁和独立审查共同约束。" : "尚未描述变更范围；请补充要改什么和不改什么，避免后续计划出现范围冲突。",
        tone: scopeIsDescribed ? "ok" : "warn",
      },
    ],
    frozenChanges: [
      { label: "交付目标与完成判定", detail: "冻结后会成为可复核的完成依据；改变目标或验收含义需要创建新 revision。", tone: "info" },
      { label: "变更范围与交付物", detail: "冻结后用于约束计划、实现、测试和独立审查；扩大或缩小范围需要创建新 revision。", tone: "info" },
      { label: "仓库、分支与远端写入边界", detail: "冻结后会绑定后续 SCM 操作与人工批准；变更这些边界需要创建新 revision。", tone: "info" },
    ],
  };
}
