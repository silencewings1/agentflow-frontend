/* ================================================================
   登录运行态：所有账户参与同一个项目，各自在不同节点承担不同职责
   设计主张：一个项目（实现用户认证模块），一条流水线（需求开发），
   不同账户登录后看到自己在该流程中的节点 —— 审批通过后推进到下一节点。
   ================================================================ */

import type { AgentEvent, Session, SessionState } from "./mock";
import type { Workflow, WfNode } from "./workflows";
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

/* ================================================================
   节点总结 mock 数据：每个节点的任务项逐条明细 + 节点交付物。
   设计主张：审批人不需要翻聊天记录 —— 一张节点总结卡片回答
   「从哪来（上游交付）、干了什么（任务项逐条）、到哪去（下游所需）」。
   ================================================================ */

/** 节点总结数据：tasks 为逐条任务项；deliverables 为本节点最终交付物
 *  （同时充当「下游节点需要本节点交付什么」的数据来源） */
const NODE_SUMMARIES: Record<string, {
  deliverables: string[];
  tasks: { text: string; status: "done" | "active" | "todo"; note?: string }[];
}> = {
  /* ---- n1 源码解析（李雯 · 需求）—— 工作流起点，无上游 ---- */
  "wf-legacy.n1": {
    deliverables: ["《源码解析报告》", "《模块依赖清单》"],
    tasks: [
      { text: "导入存量系统源码 v2.3.1，建立代码基线快照", status: "done", note: "git tag legacy-baseline" },
      { text: "按模块整理包结构，识别出 12 个业务模块与 4 个公共组件", status: "done" },
      { text: "绘制订单、库存、结算 3 条核心调用链路图", status: "done" },
      { text: "盘点外部依赖：2 个数据库、3 个中间件、1 个支付网关", status: "done" },
      { text: "标记无法解析的混淆代码位置，共 17 处", status: "done", note: "已登记待人工排查" },
      { text: "输出《源码解析报告》与《模块依赖清单》", status: "active" },
    ],
  },
  /* ---- n2 需求逆向（杨知远 · 审查）—— 含人工检查点 ---- */
  "wf-legacy.n2": {
    deliverables: ["《业务规则清单》", "《接口行为说明》"],
    tasks: [
      { text: "从订单模块抽取业务规则 8 条（满减、限购、拆单）", status: "done" },
      { text: "从库存模块抽取业务规则 6 条（预占、回补、告警阈值）", status: "done" },
      { text: "标注 11 个对外接口的边界行为与错误码语义", status: "done" },
      { text: "区分代码事实 21 处与合理推断 5 处", status: "done" },
      { text: "标记 3 处尚无源码佐证的推断，待人工裁决", status: "done", note: "见下方检查点" },
      { text: "输出《业务规则清单》与《接口行为说明》", status: "done" },
    ],
  },
  /* ---- n3 架构设计（周林 · 编排）---- */
  "wf-legacy.n3": {
    deliverables: ["《架构设计说明书》v1.0", "14 个接口契约", "ADR-001 ~ 005"],
    tasks: [
      { text: "确定新系统四层结构：接入 / 服务 / 领域 / 基础设施", status: "done" },
      { text: "划分 6 个服务模块并定义职责边界", status: "done" },
      { text: "定义 14 个核心接口契约（REST 8 个 + 事件 6 个）", status: "done" },
      { text: "制定数据迁移方案：按业务域拆分为 3 库", status: "done" },
      { text: "沉淀关键技术决定 ADR-001 ~ ADR-005", status: "done" },
      { text: "输出《架构设计说明书》v1.0 并提交 G1 门禁", status: "done" },
    ],
  },
  /* ---- n4 测试驱动开发（陈硕 · 开发）---- */
  "wf-legacy.n4": {
    deliverables: ["feat/legacy-refactor 分支", "《单元测试报告》"],
    tasks: [
      { text: "按《业务规则清单》先写用例，新增 32 个", status: "done" },
      { text: "保留 8 个预期失败用例作为实现路标", status: "done" },
      { text: "实现订单服务核心逻辑，8/8 用例转通过", status: "done" },
      { text: "实现库存服务预占与回补，6/6 用例转通过", status: "done" },
      { text: "单元覆盖率从 78% 提升至 89%（目标 85%）", status: "done" },
      { text: "推送可编译分支并附《单元测试报告》", status: "done" },
    ],
  },
  /* ---- n5 集成验证（林晓 · 测试）---- */
  "wf-legacy.n5": {
    deliverables: ["《集成验证报告》", "《性能基线报告》"],
    tasks: [
      { text: "搭建集成环境，灌入 3 个月脱敏生产数据", status: "done" },
      { text: "执行跨模块集成测试 48 条：48 通过 / 0 失败", status: "done" },
      { text: "跑通 6 条核心业务路径冒烟测试", status: "done" },
      { text: "性能压测下单峰值 1200 TPS，达标（≥ 1000）", status: "done" },
      { text: "新旧系统并行对账 7 天，数据差异 0 条", status: "done" },
      { text: "输出《集成验证报告》与《性能基线报告》", status: "done" },
    ],
  },
  /* ---- n6 交付验收（赵远 · 交付）—— 工作流终点，无下游 ---- */
  "wf-legacy.n6": {
    deliverables: ["需求 / 设计 / 验证 / 运维四类材料", "回滚方案"],
    tasks: [
      { text: "汇总需求材料：业务规则清单、接口行为说明", status: "done" },
      { text: "汇总设计材料：架构设计说明书、ADR 决定记录", status: "done" },
      { text: "汇总验证材料：集成验证报告、覆盖率报告", status: "done" },
      { text: "编写运维材料：部署手册、回滚方案、应急预案", status: "done" },
      { text: "核对证据链：7 条必需证据全部闭环", status: "done" },
      { text: "提交人工验收，等待最终裁决", status: "done", note: "见下方检查点" },
    ],
  },
};

/** 组装一张「节点总结」事件：上游信息 + 本节点任务项明细 + 下游预告。
 *  上游交付物取自上游节点的 deliverables；下游所需取自本节点 deliverables
 *  —— 交接物链条首尾相接，与主控契约的产物推导一致。 */
export function buildNodeSummary(
  wf: Workflow,
  nodeIndex: number,
  state: "running" | "review",
): AgentEvent {
  const node = wf.nodes[nodeIndex] ?? wf.nodes[0];
  const prevNode = nodeIndex > 0 ? wf.nodes[nodeIndex - 1] : null;
  const nextNode = nodeIndex < wf.nodes.length - 1 ? wf.nodes[nodeIndex + 1] : null;
  const summary = NODE_SUMMARIES[`${wf.id}.${node.id}`];

  const peerOf = (n: WfNode) => {
    const acc = n.assignee ? accountById(n.assignee) : undefined;
    return {
      name: n.name,
      assignee: acc?.name ?? "未指派",
      role: acc?.role ?? n.role,
    };
  };

  return {
    id: `nsum-${wf.id}-${node.id}-${state}`,
    kind: "node-summary",
    node: node.name,
    state,
    prev: prevNode
      ? {
          ...peerOf(prevNode),
          outputs:
            NODE_SUMMARIES[`${wf.id}.${prevNode.id}`]?.deliverables ??
            wf.orchestrator.contracts[prevNode.id]?.outputs ?? [],
        }
      : null,
    tasks: summary?.tasks ?? [
      { text: node.desc, status: state === "review" ? "done" : "active" },
    ],
    next: nextNode
      ? {
          ...peerOf(nextNode),
          needs:
            summary?.deliverables ??
            wf.orchestrator.contracts[node.id]?.outputs ?? [],
        }
      : null,
  };
}

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

  /* 3. 当前节点状态 — 需要审批时出 checkpoint + approval，否则出执行计划 */
  const isApproval = node.approval || node.gate !== undefined;

  if (isApproval) {
    const q = getQuestion(wf.id, node.id, node.name);

    /* 节点总结先行：审批人就着「上游交付 + 任务项明细 + 下游预告」做判定 */
    events.push(buildNodeSummary(wf, nodeIndex, "review"));

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

  /* 不需要审批：节点正在执行。先出全局进度，再出节点总结明细；
     「完成后交付给谁」已由总结卡片的下游区块说明，不再重复一条文本 */
  events.push({
    id: `login-plan-${accountId}`,
    kind: "plan",
    steps: [
      ...prevNodes.map((n) => ({ label: n.name, status: "done" as const })),
      { label: node.name, status: "active" as const },
      ...wf.nodes.slice(nodeIndex + 1).map((n) => ({ label: n.name, status: "todo" as const })),
    ],
  });

  events.push(buildNodeSummary(wf, nodeIndex, "running"));

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

/** 审批通过后，推入下一节点的运行事件。
 *  流转时先给出下一节点的总结卡片（上游=刚通过的节点，任务项、下游预告），
 *  让「流转到下一个节点」在会话流里有明确的现场，而不只是一句文字。 */
export function postApprovalEvents(
  wf: Workflow,
  fromNodeIndex: number,
  accountId: string,
): AgentEvent[] {
  const acc = accountById(accountId);
  const accName = acc?.name ?? "当前账户";

  const nextIndex = fromNodeIndex + 1;
  const nextNode = wf.nodes[nextIndex] ?? null;
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
  const nextIsApproval = nextNode.approval || nextNode.gate !== undefined;
  const nsum = buildNodeSummary(wf, nextIndex, nextIsApproval ? "review" : "running");

  if (isMine) {
    if (nextIsApproval) {
      const q = getQuestion(wf.id, nextNode.id, nextNode.name);
      return [
        {
          id: `post-reasoning-${Date.now()}`,
          kind: "reasoning",
          title: `进入「${nextNode.name}」节点`,
          body: `上一节点已通过审批，推进到「${nextNode.name}」（你负责）。`,
          ms: 600,
        },
        nsum,
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
        id: `post-reasoning-${Date.now()}`,
        kind: "reasoning",
        title: `进入「${nextNode.name}」节点`,
        body: `上一节点已通过审批，推进到「${nextNode.name}」（你负责）。`,
        ms: 600,
      },
      nsum,
    ];
  }

  return [
    nsum,
    {
      id: `post-handoff-${Date.now()}`,
      kind: "text",
      body: `已通过审批。「${nextNode.name}」已交付给 ${nextAssignee?.name ?? "下一执行者"}${nextAssignee ? `（${accountRoleLabel[nextAssignee.role]}）` : ""}，等待其处理。`,
    },
  ];
}

/* ================================================================
   每账户的任务列表 mock：除「当前进行中」的主任务外，再补几条
   「已完成 / 待处理」的辅助任务 —— 让不同角色登录后看到的任务列表
   覆盖 running / review / done / idle 多态，而不只是一条。
   设计主张：所有任务都归属同一个「存量系统逆向重构」项目，
   只是工作项不同、责任角色不同 —— 保持「所有用户参与一个项目」。
   ================================================================ */

/** 一条辅助任务（非当前进行中的主任务） */
export interface ExtraTask {
  title: string;
  state: SessionState;
  time: string;
  bucket: Session["bucket"];
  diff: { added: number; removed: number; files: number };
  turns: number;
}

/** 按账户索引的辅助任务：每个账户 2 条已完成（昨天）+ 1 条待处理（更早） */
const EXTRA_TASKS: Record<string, ExtraTask[]> = {
  /* 杨知远 · 审查：负责需求逆向审批，历史做过架构评审与缺陷复核 */
  "ac-yz": [
    { title: "存量系统逆向重构 · 架构设计评审", state: "done", time: "昨天 09:42", bucket: "昨天", diff: { added: 6, removed: 0, files: 1 }, turns: 3 },
    { title: "存量系统逆向重构 · 缺陷修复复核", state: "done", time: "昨天 16:20", bucket: "昨天", diff: { added: 12, removed: 4, files: 2 }, turns: 2 },
    { title: "存量系统逆向重构 · 验收口径终审", state: "idle", time: "周一", bucket: "更早", diff: { added: 0, removed: 0, files: 0 }, turns: 0 },
  ],
  /* 李雯 · 需求：负责源码解析，历史做过需求确认与口径补录 */
  "ac-lw": [
    { title: "存量系统逆向重构 · 需求清单确认", state: "done", time: "昨天 10:15", bucket: "昨天", diff: { added: 8, removed: 2, files: 1 }, turns: 2 },
    { title: "存量系统逆向重构 · 验收口径补录", state: "done", time: "昨天 14:05", bucket: "昨天", diff: { added: 5, removed: 0, files: 1 }, turns: 1 },
    { title: "存量系统逆向重构 · 需求变更评估", state: "idle", time: "周三", bucket: "更早", diff: { added: 0, removed: 0, files: 0 }, turns: 0 },
  ],
  /* 周林 · 编排：负责架构设计，历史做过契约下发与调度复盘 */
  "ac-orch": [
    { title: "存量系统逆向重构 · 节点契约下发", state: "done", time: "昨天 09:10", bucket: "昨天", diff: { added: 24, removed: 3, files: 3 }, turns: 4 },
    { title: "存量系统逆向重构 · 偏差调度复盘", state: "done", time: "昨天 17:45", bucket: "昨天", diff: { added: 3, removed: 1, files: 1 }, turns: 1 },
    { title: "存量系统逆向重构 · 阶段二排期", state: "idle", time: "周四", bucket: "更早", diff: { added: 0, removed: 0, files: 0 }, turns: 0 },
  ],
  /* 陈硕 · 开发：负责测试驱动开发，历史做过订单/库存重写 */
  "ac-dev": [
    { title: "存量系统逆向重构 · 订单服务重写", state: "done", time: "昨天 11:30", bucket: "昨天", diff: { added: 186, removed: 42, files: 6 }, turns: 5 },
    { title: "存量系统逆向重构 · 库存预占修复", state: "done", time: "昨天 15:50", bucket: "昨天", diff: { added: 34, removed: 9, files: 3 }, turns: 2 },
    { title: "存量系统逆向重构 · 结算服务重写", state: "idle", time: "周二", bucket: "更早", diff: { added: 0, removed: 0, files: 0 }, turns: 0 },
  ],
  /* 林晓 · 测试：负责集成验证，历史做过集成基线与性能压测 */
  "ac-gate": [
    { title: "存量系统逆向重构 · 集成测试基线", state: "done", time: "昨天 10:40", bucket: "昨天", diff: { added: 52, removed: 6, files: 4 }, turns: 3 },
    { title: "存量系统逆向重构 · 性能压测验收", state: "done", time: "昨天 16:05", bucket: "昨天", diff: { added: 4, removed: 0, files: 1 }, turns: 1 },
    { title: "存量系统逆向重构 · 回归用例扩充", state: "idle", time: "周五", bucket: "更早", diff: { added: 0, removed: 0, files: 0 }, turns: 0 },
  ],
  /* 赵远 · 交付：负责交付验收，历史做过阶段归档与回滚演练 */
  "ac-conn": [
    { title: "存量系统逆向重构 · 阶段一交付归档", state: "done", time: "昨天 09:55", bucket: "昨天", diff: { added: 18, removed: 2, files: 2 }, turns: 3 },
    { title: "存量系统逆向重构 · 回滚方案演练", state: "done", time: "昨天 15:10", bucket: "昨天", diff: { added: 7, removed: 0, files: 1 }, turns: 1 },
    { title: "存量系统逆向重构 · 上线材料齐备性核查", state: "idle", time: "周三", bucket: "更早", diff: { added: 0, removed: 0, files: 0 }, turns: 0 },
  ],
};

/** 取某账户的辅助任务列表；无记录时返回空数组 */
export function loginExtraTasks(accountId: string): ExtraTask[] {
  return EXTRA_TASKS[accountId] ?? [];
}
