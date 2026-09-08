/* ================================================================
   登录运行态：所有账户参与同一个项目，各自在不同节点承担不同职责
   设计主张：一个项目（实现用户认证模块），一条流水线（需求开发），
   不同账户登录后看到自己在该流程中的节点 —— 审批通过后推进到下一节点。
   ================================================================ */

import type { AgentEvent } from "./mock";
import type { Workflow } from "./workflows";
import { workflowTemplates } from "./workflows";
import { accountById, accountRoleLabel } from "./accounts";

export interface LoginSetup {
  workflow: Workflow;
  /** 会话标题 */
  sessionTitle: string;
  /** 当前推进到哪个节点（索引） */
  wfStep: number;
  /** 进入登录态后推入事件流的事件 */
  events: AgentEvent[];
  /** 待审批事件 id（若有） */
  pendingApprovalId: string | null;
  /** 当前节点名称 */
  currentNodeName: string;
  /** 下一节点名称（审批后推进到此） */
  nextNodeName: string | null;
  /** 下一节点执行者名称 */
  nextAssigneeName: string | null;
}

/** 所有账户参与同一项目（存量系统逆向重构），各自在不同节点承担职责 */
const LOGIN_MAP: Record<string, {
  wfId: string;
  nodeId: string;
  taskTitle: string;
}> = {
  // 杨知远（审查）：需求逆向审批 —— 确认逆向出的业务规则与接口行为
  "ac-yz": {
    wfId: "wf-legacy",
    nodeId: "n2",
    taskTitle: "存量系统逆向重构",
  },
  // 李雯（需求）：源码解析执行中 —— 整理模块、调用关系与依赖
  "ac-lw": {
    wfId: "wf-legacy",
    nodeId: "n1",
    taskTitle: "存量系统逆向重构",
  },
  // 周林（编排）：架构设计执行中 —— 确定新系统结构与模块职责
  "ac-orch": {
    wfId: "wf-legacy",
    nodeId: "n3",
    taskTitle: "存量系统逆向重构",
  },
  // 陈硕（开发）：测试驱动开发执行中 —— 先写用例再实现代码
  "ac-dev": {
    wfId: "wf-legacy",
    nodeId: "n4",
    taskTitle: "存量系统逆向重构",
  },
  // 林晓（测试）：集成验证执行中 —— 跨模块业务流程与冒烟测试
  "ac-gate": {
    wfId: "wf-legacy",
    nodeId: "n5",
    taskTitle: "存量系统逆向重构",
  },
  // 赵远（交付）：交付验收审批 —— 四类材料交付人工验收
  "ac-conn": {
    wfId: "wf-legacy",
    nodeId: "n6",
    taskTitle: "存量系统逆向重构",
  },
};

/** 节点审批问题模板（服务存量系统逆向重构编排） */
const NODE_QUESTIONS: Record<string, {
  question: string;
  facts: { label: string; value: string; tone?: "ok" | "warn" | "info" }[];
  options: string[];
}> = {
  "wf-legacy.n2": {
    question: "需求逆向是否可以确认，进入架构设计？",
    facts: [
      { label: "业务规则", value: "23 条已抽取", tone: "ok" },
      { label: "接口行为", value: "11 个边界已标注", tone: "ok" },
      { label: "待确认", value: "3 处推断尚无源码佐证", tone: "warn" },
    ],
    options: ["确认需求，进入架构", "补充源码佐证", "退回源码解析"],
  },
  "wf-legacy.n3": {
    question: "架构设计是否通过，可以进入开发？",
    facts: [
      { label: "G1 门禁", value: "需求与设计 3/3 通过", tone: "ok" },
      { label: "模块职责", value: "6 个模块已划分", tone: "ok" },
      { label: "接口契约", value: "14 个接口已定义", tone: "ok" },
    ],
    options: ["架构通过，进入开发", "需要调整接口", "退回需求逆向"],
  },
  "wf-legacy.n4": {
    question: "测试驱动开发是否完成，可以进入集成验证？",
    facts: [
      { label: "G2 门禁", value: "测试驱动 2/2 通过", tone: "ok" },
      { label: "用例数", value: "32 个新增 · 8 个预期失败已转通过", tone: "ok" },
      { label: "覆盖率", value: "78% → 89%", tone: "ok" },
    ],
    options: ["开发完成，进入集成", "需要补充用例", "退回架构设计"],
  },
  "wf-legacy.n5": {
    question: "集成验证是否通过，可以进入交付？",
    facts: [
      { label: "G3 门禁", value: "集成验证通过", tone: "ok" },
      { label: "集成测试", value: "48 通过 / 0 失败", tone: "ok" },
      { label: "冒烟测试", value: "6 条业务路径全部通过", tone: "ok" },
    ],
    options: ["集成通过，进入交付", "需要补冒烟用例", "退回开发"],
  },
  "wf-legacy.n6": {
    question: "重构成果是否可以验收通过？",
    facts: [
      { label: "G4 门禁", value: "交付提交通过", tone: "ok" },
      { label: "交付材料", value: "需求/设计/验证/运维 4 类齐全", tone: "ok" },
      { label: "回滚方案", value: "已准备", tone: "ok" },
    ],
    options: ["同意验收通过", "需要补充材料", "退回集成验证"],
  },
};

function getQuestion(wfId: string, nodeId: string, nodeName: string) {
  const key = `${wfId}.${nodeId}`;
  return NODE_QUESTIONS[key] ?? {
    question: `「${nodeName}」是否完成，可以推进？`,
    facts: [{ label: "状态", value: "待审批", tone: "info" }],
    options: ["确认完成", "需要返工"],
  };
}

export function getLoginSetup(accountId: string): LoginSetup {
  const map = LOGIN_MAP[accountId] ?? LOGIN_MAP["ac-yz"];
  const wf = workflowTemplates.find((w) => w.id === map.wfId) ?? workflowTemplates[0];
  const nodeIndex = wf.nodes.findIndex((n) => n.id === map.nodeId);
  const node = wf.nodes[nodeIndex] ?? wf.nodes[0];
  const nextNode = wf.nodes[nodeIndex + 1] ?? null;

  const acc = accountById(accountId);
  const accName = acc?.name ?? "当前账户";
  const accRole = acc?.role ?? "orchestrator";

  const nextAssignee = nextNode?.assignee
    ? accountById(nextNode.assignee)?.name ?? null
    : null;

  const approvalId = `node-approval-${node.id}`;

  const events: AgentEvent[] = [];

  /* 1. 用户消息：任务描述 */
  events.push({
    id: `login-u-${accountId}`,
    kind: "user",
    text: map.taskTitle,
  });

  /* 2. 前序节点完成摘要 */
  const prevNodes = wf.nodes.slice(0, nodeIndex);
  if (prevNodes.length > 0) {
    events.push({
      id: `login-reasoning-${accountId}`,
      kind: "reasoning",
      title: `已完成 ${prevNodes.length} 个节点`,
      body: prevNodes.map((n) => {
        const assignee = n.assignee ? accountById(n.assignee) : null;
        return `${n.name}（${assignee?.name ?? "未指派"}${assignee ? ` · ${accountRoleLabel[assignee.role]}` : ""}）`;
      }).join(" → "),
      ms: 800,
    });
  }

  /* 3. 当前节点状态 — 需要审批时出 checkpoint + approval */
  const isApproval = node.approval || node.gate !== undefined;

  if (isApproval) {
    const q = getQuestion(wf.id, node.id, node.name);

    events.push({
      id: `login-ckpt-${accountId}`,
      kind: "checkpoint",
      node: node.name,
      question: q.question,
      facts: q.facts,
      options: q.options,
    });

    events.push({
      id: approvalId,
      kind: "approval",
      command: `批准节点「${node.name}」完成`,
      rationale: `该节点的产出已通过门禁核验，需要你（${accName} · ${accountRoleLabel[accRole]}）确认后才能进入下一节点${nextNode ? `「${nextNode.name}」` : ""}。`,
      risk: "low" as const,
    });

    return {
      workflow: wf,
      sessionTitle: map.taskTitle,
      wfStep: nodeIndex,
      events,
      pendingApprovalId: approvalId,
      currentNodeName: node.name,
      nextNodeName: nextNode?.name ?? null,
      nextAssigneeName: nextAssignee,
    };
  }

  /* 不需要审批：节点正在执行 */
  events.push({
    id: `login-plan-${accountId}`,
    kind: "plan",
    steps: [
      ...prevNodes.map((n) => ({ label: n.name, status: "done" as const })),
      { label: node.name, status: "active" as const },
      ...wf.nodes.slice(nodeIndex + 1).map((n) => ({ label: n.name, status: "todo" as const })),
    ],
  });

  events.push({
    id: `login-text-${accountId}`,
    kind: "text",
    body: `正在执行「${node.name}」节点。完成后将交付给${nextAssignee ? ` ${nextAssignee}` : "下一节点"}${nextNode ? `（${nextNode.name}）` : ""}。`,
  });

  return {
    workflow: wf,
    sessionTitle: map.taskTitle,
    wfStep: nodeIndex,
    events,
    pendingApprovalId: null,
    currentNodeName: node.name,
    nextNodeName: nextNode?.name ?? null,
    nextAssigneeName: nextAssignee,
  };
}

/** 审批通过后，推入下一节点的运行事件 */
export function postApprovalEvents(
  wf: Workflow,
  fromNodeIndex: number,
  accountId: string,
): AgentEvent[] {
  const acc = accountById(accountId);
  const accName = acc?.name ?? "当前账户";

  const nextNode = wf.nodes[fromNodeIndex + 1] ?? null;
  if (!nextNode) {
    return [
      {
        id: `post-done-${Date.now()}`,
        kind: "text",
        body: `工作流已全部完成。${accName} 的审批已记录入证据链。`,
      },
    ];
  }

  const nextAssignee = nextNode.assignee ? accountById(nextNode.assignee) : null;
  const isMine = nextNode.assignee === accountId;

  if (isMine) {
    const isApproval = nextNode.approval || nextNode.gate !== undefined;

    if (isApproval) {
      const q = getQuestion(wf.id, nextNode.id, nextNode.name);
      return [
        {
          id: `post-reasoning-${Date.now()}`,
          kind: "reasoning",
          title: `进入「${nextNode.name}」节点`,
          body: `上一节点已通过审批，推进到「${nextNode.name}」（你负责）。`,
          ms: 600,
        },
        {
          id: `post-ckpt-${Date.now()}`,
          kind: "checkpoint",
          node: nextNode.name,
          question: q.question,
          facts: q.facts,
          options: q.options,
        },
        {
          id: `node-approval-${nextNode.id}`,
          kind: "approval",
          command: `批准节点「${nextNode.name}」完成`,
          rationale: `需要你（${accName}）确认后才能继续推进。`,
          risk: "low" as const,
        },
      ];
    }

    return [
      {
        id: `post-text-${Date.now()}`,
        kind: "text",
        body: `上一节点已通过审批，正在执行「${nextNode.name}」（你负责）…`,
      },
    ];
  }

  return [
    {
      id: `post-handoff-${Date.now()}`,
      kind: "text",
      body: `已通过审批。「${nextNode.name}」已交付给 ${nextAssignee?.name ?? "下一执行者"}${nextAssignee ? `（${accountRoleLabel[nextAssignee.role]}）` : ""}，等待其处理。`,
    },
  ];
}
