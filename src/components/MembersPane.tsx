import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icons";
import {
  ACCOUNT_ROLE_LABEL,
  ACCOUNT_ROLE_ORDER,
  NODE_PERM_LABEL,
  NODE_PERM_ORDER,
  permRank,
  timeOnlyLabel,
  AfApiError,
  errorText,
  type AccountDto,
  type AccountInputDto,
  type AccountRoleDto,
  type AccountsDto,
  type ActorDto,
  type AccountAuditDto,
  type GrantAuditDto,
  type NodeGrantDto,
  type NodePermDto,
} from "../api";
import type { Workflow, WfNode } from "../data/workflows";

/**
 * 成员与权限：账户目录 + 节点授权矩阵。
 *
 * 设计主张（承 §4.1 的责任主体映射）：**权限不是围栏，是责任分配**。
 * 因此这一页的每个元素都在回答"谁负责这个责任位"，而不是"谁能进这个系统"：
 *
 * 1. 左列是账户（身份 × 角色 × 状态 × 职责），不是"用户管理"；
 * 2. 右列是**按编排展开的节点授权矩阵** —— 授权以 workflowId+nodeId 定位，
 *    同一账户在不同编排里持有不同等级，这正是"责任位"而非"权限包"的表达；
 * 3. 授权变更记录（audit）常驻可见，与证据链的「出处 / 版本 / 责任人」三元组
 *    呼应：授权本身也是需要可回溯的治理事实。
 *
 * 数据全部来自服务端 AccountsDto：本组件不持有跨组件状态，只渲染与派发。
 * 写操作一律以服务端返回的完整目录重绘，不做本地乐观改写 —— 本地改写会让
 * 「界面显示的权限」与「服务端判定的权限」在失败时静默分叉。
 */

type Toast = (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;

/** 编排节点 → 可授权的责任位。审批节点由审查/交付角色承担，与 assignableAccounts 同义。 */
interface NodeRef {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeName: string;
  role: WfNode["role"];
  gate?: string;
  approval?: boolean;
}

/**
 * 责任位清单**只能来自实时编排目录**（bootstrap 回读的服务端冻结编排），
 * 不能来自 `src/data/workflows.ts` 的演示模板：那是 wf-feature/n1 这类示例
 * 数据，真实实例里的编排是 standard-code-change/requirements 这类服务端事实。
 * 用演示模板渲染矩阵会显示一套不存在的节点，并把授权写到没有对应责任位的
 * 键上——界面看着正常，实际一条授权都不生效。
 */
/* 登录标识的**字符集**规则，与后端同源（handler.ts 的 accountHandleSchema）。

   为什么这条规则存在，以及为什么它必须在界面上主动说出来：
   handle 是身份键，经由 `x-af-actor` 请求头传递，而 HTTP 头字段值只能是
   ISO-8859-1（浏览器强制）。实测浏览器构造 `{'x-af-actor': '中文标识@…'}`
   会**直接抛 TypeError**，于是那个账户在登录页有个完全正常的按钮，
   点下去却没有任何反应；失败还被包装成 AF_NETWORK_ERROR，界面显示
   「无法连接 AF API，请确认后端已启动并检查网络」——把用户引向一个
   并不存在的问题。更隐蔽的是重音字符：同一个 `café` 由浏览器发（按
   latin-1 编码）能登录，由 curl 发（按 UTF-8 编码）就变成乱码而匿名，
   即"我是谁"取决于客户端用什么编码发头。

   因此这里不只是"校验一下"，而是**把一条从界面看不出来的规则显式呈现**：
   用户输入中文时界面本来毫无异样，只有等到该账户登录失败才会暴露。
   返回 null 表示没有问题。 */
function handleRuleNote(handle: string): string | null {
  const trimmed = handle.trim();
  if (trimmed.length === 0) return null;
  if (!/^[\x20-\x7e]+$/.test(trimmed)) {
    return "登录标识只能是 ASCII 字符（字母、数字与 . _ % + -）：它会作为请求头传递，中文等字符会导致该账户无法登录。中文姓名请填在「名称」里。";
  }
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(trimmed)) {
    return "登录标识需形如 name@domain（例如 zhangqi@agentflow.dev）。";
  }
  return null;
}

function nodeRefs(workflows: Workflow[]): NodeRef[] {
  return workflows.flatMap((workflow) =>
    workflow.nodes.map((node) => ({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: node.id,
      nodeName: node.name,
      role: node.role,
      ...(node.gate === undefined ? {} : { gate: node.gate }),
      ...(node.approval === undefined ? {} : { approval: node.approval }),
    })),
  );
}

const GLYPH_OF_ROLE: Record<AccountRoleDto, IconName> = {
  requirement: "Book",
  architecture: "Layers",
  development: "Pencil",
  testing: "Beaker",
  review: "Shield",
  delivery: "Cube",
  ops: "Cloud",
  orchestrator: "Nodes",
};

/** 账户状态到视觉语义：停用是软状态，历史授权与审计一律保留。 */
const ACCOUNT_STATE_LABEL: Record<AccountDto["state"], string> = {
  active: "在职",
  suspended: "停用",
};

export function MembersPane({
  data,
  actor,
  workflows,
  onToast,
  onRefresh,
  onCreateAccount,
  onUpdateAccount,
  onSetAccountState,
  onSetGrant,
}: {
  data: AccountsDto | null;
  actor: ActorDto | null;
  /** 实时编排目录：责任位矩阵的唯一节点来源（见 nodeRefs 的说明）。 */
  workflows: Workflow[];
  onToast: Toast;
  /** 重读账户目录；返回**刷新后的目录**，供失败补偿使用新值。 */
  onRefresh: () => Promise<AccountsDto | null>;
  onCreateAccount: (input: AccountInputDto) => Promise<void>;
  onUpdateAccount: (accountId: string, input: Partial<AccountInputDto>) => Promise<void>;
  onSetAccountState: (accountId: string, state: AccountDto["state"]) => Promise<void>;
  onSetGrant: (input: {
    accountId: string;
    workflowId: string;
    nodeId: string;
    perm: NodePermDto | null;
    expectedRevision?: number;
  }) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftHandle, setDraftHandle] = useState("");
  const [draftRole, setDraftRole] = useState<AccountRoleDto>("development");
  const [draftDuty, setDraftDuty] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  /* 编辑已有账户的草稿。与"新建"分开持有，因为二者可以同时展开，
     且编辑必须从**该账户的当前值**起步——若共用一份草稿，切账户时会带着
     上一个账户的值，改完提交就把 A 的职责写到 B 身上了。
     `editingId` 指明这份草稿属于哪个账户；与当前选中不一致时不渲染草稿。 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuty, setEditDuty] = useState("");
  const [editRole, setEditRole] = useState<AccountRoleDto>("development");
  /* 打开表单那一刻读到的 `updatedAt`（毫秒）。这就是"用户看到的版本"，
     保存时作为乐观并发前置条件回传。
     为什么不改用"提交时的最新值"：那样前置条件永远成立、冲突就检测不到。
     它与草稿是同一份快照，必须一起固化——草稿说"我基于这份内容修改"，
     这个时间戳说"我基于这个版本修改"，两者脱节就没有意义。 */
  const [editBase, setEditBase] = useState<number | null>(null);
  /* 打开表单那一刻三个字段的值。它与 `editBase` 是同一份快照的两个侧面：
     `editBase` 说"我基于哪个**版本**修改"，这个快照说"我基于哪些**值**修改"。
     冲突后要用它做**三方合并**（基准 / 我的草稿 / 对方的新值），判断用户
     到底动过哪个字段——没有它就只能整体覆盖草稿，那会抹掉用户正在输入的内容。 */
  const [editSnapshot, setEditSnapshot] = useState<{
    name: string; duty: string; role: AccountRoleDto;
  } | null>(null);

  /* 空数组回落必须是**稳定引用**：写成 `data?.accounts ?? []` 会在每次渲染
     新建一个数组，让下面所有 useMemo 的依赖每帧都变、缓存彻底失效。 */
  const EMPTY: never[] = [];
  const accounts = data?.accounts ?? EMPTY;
  const grants = data?.grants ?? EMPTY;
  const audit = data?.audit ?? EMPTY;
  const accountAudit = data?.accountAudit ?? EMPTY;
  /* 审计总数（含未返回的部分）。服务端只回一页，`total > 返回条数` 说明历史被截断。
     没有它时「这里只有这些」与「这里只是最新一页」在界面上无法区分，
     而审计表只增不删，超过上限是必然事件。 */
  const auditTotal = data?.auditTotal ?? audit.length;
  const accountAuditTotal = data?.accountAuditTotal ?? accountAudit.length;

  /* 选中项的回落：账户被停用或服务端目录变化时，避免右列指向一个不存在的账户。
     这是渲染期的纯派生，不用 effect —— 用 effect 会多渲染一帧空态。 */
  const active = useMemo(
    () => accounts.find((account) => account.accountId === selectedId) ?? accounts[0],
    [accounts, selectedId],
  );

  const refs = useMemo(() => nodeRefs(workflows), [workflows]);

  /* 切换账户时把右列滚回顶部。
     不这么做会有一种很难归因的体验问题：右列（身份头 + 图例 + 11 行矩阵 + 两份审计）
     比视口高，用户滚到下方后点左列的另一个账户，**右列保持原滚动位置**
     ——于是他看到的仍是几行长得差不多的矩阵行，而新账户的身份头（名字、职务、
     停用/恢复按钮）在视口之上。用户会得出「点了没反应」的结论，
     尽管数据其实已经换对了。实测：切换前 scrollTop 1257，切换后仍 1257。

     用 useEffect 而不是在 onClick 里设置，是为了让「选中项变化」这个事实
     本身驱动复位：无论变化来自点击、键盘、还是数据刷新导致的 active 改变，
     行为都一致。 */
  const detailRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [active?.accountId]);

  /* 授权索引：把 O(节点数 × 授权数) 的线性查找换成一次建表。
     编排有几十个节点、授权有几十条时这不是优化问题，而是每帧几十次遍历。
     键与后端的 grantId 同构（accountId::workflowId::nodeId），因此这里查到的
     责任位与服务端判定的责任位必然是同一个。 */
  const grantIndex = useMemo(() => {
    const index = new Map<string, NodeGrantDto>();
    for (const grant of grants) {
      index.set(`${grant.accountId}::${grant.workflowId}::${grant.nodeId}`, grant);
    }
    return index;
  }, [grants]);

  const grantFor = useCallback(
    (accountId: string, ref: NodeRef): NodeGrantDto | null =>
      grantIndex.get(`${accountId}::${ref.workflowId}::${ref.nodeId}`) ?? null,
    [grantIndex],
  );

  /**
   * 全部责任位，按编排分组 —— 矩阵**始终列出编排里的每一个节点**，
   * 不论该账户是否已被授权。
   *
   * 为什么不做「已授权矩阵 + 未授权 chips」两段式（这是本面板曾经的形态）：
   *
   * 1. **授权入口被硬截断就够不着了**。旧实现的未授权列表是 `.slice(0, 12)`，
   *    而它是界面上**唯一**的授权入口：一旦编排节点数超过 12，第 13 个及以后的
   *    节点在界面上没有任何入口可被授权，而后端 `POST /grants` 是接受的。
   *
   *    诚实标注证据强度：**在当前种子下（3 套编排共 11 个责任位）这条截断
   *    从未真正触发**（11 ≤ 12），因此它是一个**潜在缺陷**，不是已发生的故障。
   *    定为缺陷的理由是它的触发条件由**编排规模**决定，而编排是用户可编辑的
   *    （`workflows.ts` 的编辑函数就允许加节点）：种子大小不是安全边界，
   *    「后端能做、界面做不到」这层性质与当前有几个节点无关。
   *
   * 2. **两段式让"没授权"与"没这个节点"看起来一样**。未授权节点进的是
   *    底部的 chips，与矩阵不同构；读者要跨两个区块才能拼出"这个人在这套编排里
   *    到底占哪些位、空着哪些位"。责任位是同一张表，就该用同一张表表达。
   *
   * 3. 编制变了（新增编排/节点）时矩阵自动跟着长，不需要用户先"把节点加进来"。
   */
  const nodeGroups = useMemo(() => {
    const byWorkflow = new Map<string, { workflowName: string; nodes: NodeRef[] }>();
    for (const ref of refs) {
      if (!byWorkflow.has(ref.workflowId)) {
        byWorkflow.set(ref.workflowId, { workflowName: ref.workflowName, nodes: [] });
      }
      byWorkflow.get(ref.workflowId)!.nodes.push(ref);
    }
    return [...byWorkflow.entries()].map(([workflowId, group]) => ({ workflowId, ...group }));
  }, [refs]);

  const canManage = actor?.canManageAccounts === true;
  /* 目录可用性由后端判定（判据只有一份：空目录 / 无人在职持 manage）。
     界面不自行推断——它看不到存储层的事实，自行推断只会给出第二个答案。 */
  const directory = data?.directory;
  /**
   * 目录不可用（包括 `empty` 与 `no-manager` 两种成因）。
   *
   * 提出来是因为它决定**两句提示互斥**：目录本身有问题时，控件置灰的原因就是它，
   * 此时再说"你没有权限、请让责任人操作"是一条做不到的指引（见下方渲染处注释）。
   */
  const directoryUnhealthy = directory !== undefined && !directory.healthy;

  /**
   * 统一的写操作包装：失败按服务端错误码如实呈现，绝不静默吞掉。
   *
   * **被拒后必须把界面重新对齐到服务端事实**（不只是弹提示）。
   * 缺这一步会产生一个会持续存在的错误界面：用户在面板打开期间被降权或停用
   * （多用户里这随时会发生——别人改了你的授权，或撤回了目录），面板上那份
   * `actor` / `grants` 仍是打开时读到的旧值，于是 44 个权限格继续可点、
   * 「新建账户」继续可点，用户点下去才被后端拒。
   *
   * 实测（周林持 manage×11 → 后端把 11 条全降 view → **不刷新页面**）：
   *   修复前：`staleCellsEnabled: 44`、`newBtnDisabled: false`，
   *           点格子后弹「操作未生效…缺少该操作所需的权限」，
   *           **但界面不改**：再点第 4 格仍然发出请求、仍然只弹同一条提示。
   *           用户会一直点、一直被拒，且没有任何东西告诉他"你的权限已经没了"。
   *   修复后：同一次被拒后重读目录，`actor.canManageAccounts` 变 false，
   *           44 格转为受阻态并给出「当前账户没有「可编排」权限」的常驻说明。
   *
   * 这里与 AGENTS.md §4.3「前置条件未满足时必须显式呈现受阻，而不是照常可点
   * 然后报错」是同一处置：§4.3 管的是**已知**前置条件，本处管的是**前置条件在
   * 会话中途变了**因而界面还不知道。两者都要求界面最终呈现受阻，而不是停在
   * "可以点、点了报错"。
   *
   * 触发条件与 App.tsx 的 `realignAfterDenial` 保持一致（只看这两个码）：
   * 重读是"被拒"的补偿动作，不是无差别的失败重试——`AF_ACCOUNT_HANDLE_TAKEN`
   * 之类与身份无关的失败重读目录没有意义，只会让界面闪一下。
   */
  /* `onFail` 是**可选**的失败回调，只在调用方需要针对特定错误码做补偿时传。
     为什么不把错误整个抛出去让调用方 catch：`run` 的职责是"一次写操作 + 统一
     呈现"，5 个调用点里有 4 个只需要统一呈现；为第 5 个改成抛错会逼所有调用点
     都写一遍 try/catch，而它们并不关心错误码。 */
  const run = async (
    key: string,
    action: () => Promise<void>,
    onOk?: () => void,
    onFail?: (code: string | undefined, fresh: AccountsDto | null) => void,
  ) => {
    setBusy(key);
    try {
      await action();
      onOk?.();
    } catch (error: unknown) {
      const apiError = error instanceof AfApiError ? error : undefined;
      onToast({
        tone: "warn",
        title: "操作未生效",
        /* 必须把 details 一并传下去：AF_ACCOUNTS_UNAVAILABLE 覆盖两种**处置相反**的
           成因——实例声明未启用多用户（重试无用，要找部署方）vs 目录暂时读不到
           （稍后重试就有用）。后端已经用 details.multiUserEnabled 自证是哪一种，
           丢掉它就只能显示那条"若…否则…"的并列文案，用户会去反复重试一件徒劳的事。
           声明未启用的实例下**每一次写操作**（授权/建号/停用）都返回这个码，
           因此这不是边角情形。列表页的 loadAccounts 早已传了 details（见 App.tsx），
           这里漏掉就形成"同一个码在两条路径上给出两种处置"。 */
        body: errorText(apiError?.code, apiError?.message ?? "未知错误", apiError?.details),
      });
      /* `onFail` 必须在重读**之后**调用：它要基于刷新后的目录做补偿
         （编辑表单要拿新的 `updatedAt` 重建基线）。若排在前面，它读到的
         仍是冲突前的旧目录，于是"刷新基线"会拿到和原来一样的值——
         补偿动作看起来执行了，实际什么也没变，用户依旧每次 409。 */
      let fresh: AccountsDto | null = null;
      if (
        apiError?.code === "AF_PERMISSION_DENIED"
        || apiError?.code === "AF_ACCOUNT_SUSPENDED"
        || apiError?.code === "AF_ACCOUNT_CONFLICT"
      ) {
        /* 重读失败不再弹第二条提示：用户刚看到"操作未生效"，再叠一条
           "读取失败"只会让他分不清哪一条才是要处理的问题；
           而重读本身是补偿动作，失败时界面保持现状即可（下一次操作会再触发）。 */
        /* 接住返回值：`data` 是本次渲染闭包里的旧值，setState 要到下一次渲染
           才生效，因此补偿逻辑**不能**读 `data`，必须用这里显式拿回的新目录。 */
        fresh = await onRefresh().catch(() => null);
      }
      onFail?.(apiError?.code, fresh);
    } finally {
      setBusy(null);
    }
  };

  /**
   * 直接设定责任位档位。
   *
   * 旧实现是"点任意一格就按 可见→可执行→可裁决→可编排→收回 循环"，
   * 四个格子共用一个 `cycle()`。那有两条真实问题：
   *
   * 1. **格子看起来像选择器，行为却是步进器**。四个格子并排、每格一个权限名，
   *    任何人都会认为"点第 3 格 = 设为可裁决"。实际点第 3 格可能是"降到第 2 档"
   *    或"从可执行升到可裁决"，取决于当前值 —— 用户必须先在脑内算出当前位置，
   *    再数一下要点几次。四格矩阵的全部价值就是"一眼选定"，循环把它抵消了。
   * 2. **"收回"没有自己的位置**。它被藏在循环末尾，只能靠连点到达；
   *    而"收回授权"与"调整档位"是**后果不同**的两件事（前者让节点失去操作者，
   *    编排会因此进不去），不该由点击次数区分。
   *
   * 现在：点某格 = 设为该档；点当前已命中的格 = 收回。收回保留原有的一次确认语义，
   * 通过单独按钮与明确的 toast 文案表达。
   */
  const setPerm = (ref: NodeRef, next: NodePermDto | null) => {
    if (!active) return;
    const current = grantFor(active.accountId, ref);
    /* 无变化就不发请求：重复点同一格会产生一条 `reaffirm` 审计，
       而审计表只增不删——"用户点重了"不该在治理事实上留下一条变更记录。 */
    if (current?.perm === next) return;
    const label =
      next === null
        ? "收回授权"
        : current === null
          ? `授予「${NODE_PERM_LABEL[next]}」`
          : `调整为「${NODE_PERM_LABEL[next]}」`;
    void run(
      `${active.accountId}-${ref.workflowId}-${ref.nodeId}`,
      () => onSetGrant({
        accountId: active.accountId,
        workflowId: ref.workflowId,
        nodeId: ref.nodeId,
        perm: next,
        ...(current === null ? {} : { expectedRevision: current.revision }),
      }),
      () => onToast({
        tone: next === null ? "warn" : "ok",
        title: label,
        body: next === null
          ? `${active.name} × ${ref.nodeName}（${ref.workflowName}）· 该责任位已无操作者`
          : `${active.name} × ${ref.nodeName}（${ref.workflowName}）`,
      }),
    );
  };

  const submitAccount = () => {
    const name = draftName.trim();
    const handle = draftHandle.trim();
    const duty = draftDuty.trim();
    /* 职责说明是必填，不由前端代拟。
       这一条不是表单校验的形式要求：本设计的主张是「权限不是围栏，是责任分配」，
       而 duty 正是「这个人负责什么」的落点——它是账户在权限矩阵之外唯一的语义说明。
       前端代写一句「尚未填写职责说明」，等于在每个新建账户上盖一条看起来像
       真实说明的免责声明：它占着职责字段，却什么责任都没界定，
       日后没人能判断这是"确实没定"还是"当时没写"。宁可挡住提交，
       也不产出一条语义为空的记录。 */
    if (name.length === 0 || handle.length === 0 || duty.length === 0) {
      onToast({ tone: "warn", title: "创建账户失败", body: "名称、登录标识与职责说明都必须填写。" });
      return;
    }
    /* 字符集必须与后端同源校验。
       后端（handler.ts 的 accountHandleSchema）已经会以 400 拒绝，但等到
       那一步才说话，用户只看到一句「请求参数不合法」——他不知道是哪个字
       不合法、更不知道为什么。而这条规则**从界面上看不出来**：
       输入「张三@agentflow.dev」时一切正常，直到该账户登录时才发现
       （详见 handleRuleNote 的说明）。因此这里先说清楚，再让后端兜底。 */
    const handleProblem = handleRuleNote(handle);
    if (handleProblem !== null) {
      onToast({ tone: "warn", title: "创建账户失败", body: handleProblem });
      return;
    }
    void run(
      "create-account",
      () => onCreateAccount({ name, handle, role: draftRole, duty }),
      () => {
        setCreating(false);
        setDraftName("");
        setDraftHandle("");
        setDraftDuty("");
        onToast({ tone: "ok", title: "已创建账户", body: `${name} · ${ACCOUNT_ROLE_LABEL[draftRole]}` });
      },
    );
  };

  if (data === null || actor === null) {
    return (
      <div className="permEmpty">
        <Icon.Agent size={20} />
        <p>账户目录尚未加载。</p>
        <em>多用户能力由 AF API 的 /accounts 提供；实例未启用时该面板降级为不可用。</em>
      </div>
    );
  }

  return (
    <div className="split">
      {/* ------------ 左列：账户目录 ------------ */}
      <div className="split__list">
        {/* 目录自身不可用时**优先**说这件事：它比"你没有管理权"更根本。
            两种情形都会让控件置灰，但处置相反——"我没有管理权"要找管理员，
            "没有任何人有管理权"找谁都没用、只能修存储。只显示后者时，
            用户会反复点击、反复被拒，而真正的原因在任何地方都看不到。
            后端 DTO 的 directory 字段给出判定与处置，这里只负责呈现。 */}
        {directoryUnhealthy && (
          <p className="permNotice" data-tone="warn" role="alert">
            {directory?.reason ?? "账户目录当前不可用。"}
          </p>
        )}
        {/* 目录不可用时**不再补这句**。上面那段注释写的是"优先说更根本的"，
           但代码原先两句并列渲染，于是在 no-manager 状态下用户会同时看到：
             ① 目录里没有任何「在职且持 manage」的账户……无法通过界面自救（管理权是自救的前提）
             ② 请让持有该权限的责任人操作
           而此刻**根本不存在这样的人**——第②句是一条做不到的指引，
           比不提示更糟（用户会去找一个不存在责任人的授权）。
           empty 分支同理（连账户都没有）。
           因此这两句互斥：目录有问题时，置灰的原因就是目录本身。 */}
        {!canManage && !directoryUnhealthy && (
          <p className="permNotice" role="note">
            当前账户
            {actor.accountId === null ? "未登录" : `（${actor.name}）`}
            没有「可编排」权限，因此只能查看，不能增删账户或调整授权。
            需要变更时，请让持有该权限的责任人操作。
          </p>
        )}

        {ACCOUNT_ROLE_ORDER.map((role) => {
          const rows = accounts.filter((account) => account.role === role);
          if (rows.length === 0) return null;
          return (
            <section key={role}>
              <SectionLabel text={ACCOUNT_ROLE_LABEL[role]} />
              <div className="memberList">
                {rows.map((account, index) => {
                  const G = Icon[GLYPH_OF_ROLE[account.role]];
                  return (
                    <button
                      key={account.accountId}
                      className="memberRow"
                      data-active={account.accountId === active?.accountId ? "true" : undefined}
                      data-state={account.state}
                      style={{ "--i": index } as React.CSSProperties}
                      onClick={() => setSelectedId(account.accountId)}
                    >
                      <span className="memberRow__glyph" data-tint="accent">
                        <G size={15} />
                      </span>
                      <span className="memberRow__body">
                        <b>{account.name}</b>
                        <i className="mono">{account.handle}</i>
                      </span>
                      {account.state === "suspended" && <span className="memberRow__flag">停用</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        <button
          className="memberNew"
          disabled={!canManage || busy === "create-account"}
          {...(canManage ? {} : { "data-blocked": "true" })}
          title={canManage ? "创建新账户并分配责任位" : "创建账户需要管理权限（在至少一个真实责任位上持有「可编排」）"}
          onClick={() => setCreating((value) => !value)}
        >
          <Icon.Plus size={15} />
          <span>新建账户</span>
        </button>

        {creating && (
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              submitAccount();
            }}
          >
            <div className="form__row">
              <label>名称</label>
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="如：张启"
              />
            </div>
            <div className="form__row">
              <label>登录标识</label>
              <input
                value={draftHandle}
                onChange={(event) => setDraftHandle(event.target.value)}
                placeholder="如：zhangqi@agentflow.dev"
              />
              {/* 字符集提示常驻在输入框旁，而不是等提交被后端驳回才说。
                  理由是这条规则**看不出来**：用户输入「张三@agentflow.dev」
                  时界面毫无异样，直到点登录才发现登不进去。
                  见 handleRuleNote 的说明。 */}
              {handleRuleNote(draftHandle) !== null && (
                <em className="form__note" data-tone="warn">{handleRuleNote(draftHandle)}</em>
              )}
            </div>
            <div className="form__row">
              <label>职责说明</label>
              <input
                value={draftDuty}
                onChange={(event) => setDraftDuty(event.target.value)}
                placeholder="如：执行编译、测试与覆盖率检查，产出门禁裁决结论"
              />
            </div>
            <div className="form__row">
              <label>角色</label>
              <div className="permKinds">
                {ACCOUNT_ROLE_ORDER.map((role) => (
                  <button
                    type="button"
                    key={role}
                    className="permKind"
                    data-on={draftRole === role ? "true" : undefined}
                    onClick={() => setDraftRole(role)}
                  >
                    {ACCOUNT_ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn--accent btn--sm" type="submit" disabled={busy === "create-account"}>
              {busy === "create-account" ? "创建中…" : "创建账户"}
            </button>
          </form>
        )}
      </div>

      {/* ------------ 右列：节点授权矩阵 ------------ */}
      <div className="split__detail memberDetail" ref={detailRef}>
        {active === undefined ? (
          <div className="permEmpty">
            <Icon.Agent size={20} />
            <p>账户目录为空。</p>
            <em>先在左列创建一个账户，再为它分配责任位。</em>
          </div>
        ) : (
          <>
            <header className="memberHead">
              <span className="memberHead__glyph" data-tint="accent">
                {(() => {
                  const G = Icon[GLYPH_OF_ROLE[active.role]];
                  return <G size={18} />;
                })()}
              </span>
              <div className="memberHead__text">
                <h3>{active.name}</h3>
                <p>
                  <span className="mono">{active.handle}</span>
                  <i>·</i>
                  {ACCOUNT_ROLE_LABEL[active.role]}
                  <i>·</i>
                  {ACCOUNT_STATE_LABEL[active.state]}
                  {active.builtin && (
                    <>
                      <i>·</i>
                      内置
                    </>
                  )}
                </p>
                <em>{active.duty}</em>
              </div>
              {/* 编辑入口：与「停用」并列但**排在前面**。
                  排前面的理由不是重要性，而是**可逆性**——改名称/职责/角色可再次
                  改回，而停用会改变账户的可登录性。把不可逆的放在更右边，
                  减少误点代价。

                  它补的是一处能力不对等：后端 `PUT /accounts/:id` 早已存在，
                  而界面此前只能新建、不能修改；叠加"没有删除账户 API"
                  （开放项 1）与 `POST /accounts` 的 handle 查重
                  （命中即 409，实测确认），界面上把 duty 或 role 写错就**永久错**。 */}
              <button
                className="btn btn--ghost btn--sm"
                disabled={!canManage}
                {...(canManage ? {} : { "data-blocked": "true" })}
                title={
                  canManage
                    ? "修改名称、职责说明与角色；登录标识不可改（它是授权与审计的定位键）"
                    : "修改账户需要管理权限（在至少一个真实责任位上持有「可编排」）"
                }
                onClick={() => {
                  if (editingId === active.accountId) {
                    setEditingId(null);
                    /* 取消时清掉基准快照：它只对"这一次编辑"有意义，
                       留着会让下一次打开表单时用旧基准做三方合并。 */
                    setEditBase(null);
                    setEditSnapshot(null);
                    return;
                  }
                  /* 草稿从该账户当前值起步，避免"空表单保存成空值" */
                  setEditName(active.name);
                  setEditDuty(active.duty);
                  setEditRole(active.role);
                  /* 与草稿同一份快照：这个时间戳就是"用户看到的版本" */
                  setEditBase(Date.parse(active.updatedAt));
                  setEditSnapshot({ name: active.name, duty: active.duty, role: active.role });
                  setEditingId(active.accountId);
                }}
              >
                {editingId === active.accountId ? "取消" : "编辑"}
              </button>
              {/* 停用/恢复是**唯一**会改变账户可登录性的入口，因此它的三种情形
                  都必须显式呈现，不能靠"按钮消失"表达：

                   1. 不能停用自己 —— 旧实现直接不渲染按钮。按钮凭空消失时，
                      读者不知道是"我没有这个权限""这个人特殊"还是"界面出错"；
                      而按本仓库 §4.3「前置条件未满足必须显式受阻，而不是照常可点」，
                      正确做法是保留按钮但置为受阻并写明原因。
                   2. 已停用 → 恢复。
                   3. 可停用 → 停用。

                  `data-blocked` 必须覆盖**两种**受阻来源，而不只是"不能停用自己"：
                     · 身份受限（自己的账户）
                     · 权限不足（`!canManage`）
                  旧实现只给前者加标记，后者只是一个普通 `disabled` —— 同一个
                  「前置条件未满足」在同一个仓库里有了两种渲染（对比模型配置面板的
                  供应商登记按钮，那里两种来源都走 `data-blocked`）。两种渲染会让
                  读者以为"灰着"和"虚线着"是两种不同的状态，而它们本来就是同一件事。

                  `title` 说明后果而不是复述动作名：停用不影响历史授权与审计，
                  这是判断"能不能安全停用"的关键信息；权限不足时则直接说明缺什么。 */}
              {active.accountId === actor.accountId ? (
                <button
                  className="btn btn--ghost btn--sm"
                  disabled
                  aria-disabled="true"
                  data-blocked="true"
                  title="不能停用当前登录的账户"
                >
                  停用
                </button>
              ) : active.state === "active" ? (
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={!canManage || busy === `state-${active.accountId}`}
                  {...(canManage ? {} : { "data-blocked": "true" })}
                  title={
                    canManage
                      ? "停用后该账户不能登录；历史授权与审计保留"
                      : "停用账户需要管理权限（在至少一个真实责任位上持有「可编排」）"
                  }
                  onClick={() =>
                    void run(
                      `state-${active.accountId}`,
                      () => onSetAccountState(active.accountId, "suspended"),
                      () => onToast({
                        tone: "warn",
                        title: "已停用账户",
                        body: `${active.name} 的历史授权与审计保留，但不能登录。`,
                      }),
                    )
                  }
                >
                  停用
                </button>
              ) : (
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={!canManage || busy === `state-${active.accountId}`}
                  {...(canManage ? {} : { "data-blocked": "true" })}
                  title={
                    canManage
                      ? "恢复后该账户可以重新登录；停用期间的授权不回滚"
                      : "恢复账户需要管理权限（在至少一个真实责任位上持有「可编排」）"
                  }
                  onClick={() =>
                    void run(
                      `state-${active.accountId}`,
                      () => onSetAccountState(active.accountId, "active"),
                      () => onToast({ tone: "ok", title: "已恢复账户", body: `${active.name} 已可登录。` }),
                    )
                  }
                >
                  恢复
                </button>
              )}
            </header>

            {/* 编辑表单：只在 `editingId` 等于当前选中账户时渲染。
                这个判据（而不是一个布尔 `editing`）保证切账户时草稿不会串到
                另一个账户上——用布尔量时，切到 B 而 `editing` 仍为 true，
                表单会带着 A 的值出现，点保存就把 A 的职责写到 B 身上。

                登录标识不提供编辑：它是授权与审计记录的定位键，
                改动它会让历史审计里那些按 handle 记录的行产生歧义。
                不可编辑时要把理由写在界面上，而不是让输入框凭空消失。 */}
            {editingId === active.accountId && (
              <form
                className="form form--edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = editName.trim();
                  const duty = editDuty.trim();
                  /* 与新建同样的判据：`duty` 是"这个人负责什么"的落点，
                     空值等于在每个账户上盖一条看起来像说明的免责声明。
                     保存前先挡，而不是提交后被服务端拒。 */
                  if (name.length === 0 || duty.length === 0) {
                    onToast({ tone: "warn", title: "保存失败", body: "名称与职责说明都必须填写。" });
                    return;
                  }
                  void run(
                    `edit-${active.accountId}`,
                    () =>
                      onUpdateAccount(active.accountId, {
                        name,
                        duty,
                        ...(editRole === active.role ? {} : { role: editRole }),
                        /* 只在解析成功时带上：`Date.parse` 失败得到 NaN，
                           而 NaN 会被 JSON 序列化成 null，服务端 schema
                           （int / nonnegative）直接拒——那会让"时间戳解析不出来"
                           这种本地显示问题变成一个写不进去的硬错误。
                           解析不出来就退回"最后写入者赢"，与改动前行为一致。 */
                        ...(editBase !== null && Number.isFinite(editBase)
                          ? { expectedUpdatedAt: editBase }
                          : {}),
                      }),
                    () => {
                      setEditingId(null);
                      setEditBase(null);
                      setEditSnapshot(null);
                      onToast({ tone: "ok", title: "已保存账户", body: `${name} 的资料已更新。` });
                    },
                    (code, fresh) => {
                      /* 冲突后必须刷新**表单自己的基线**，否则用户永远 409。

                         这是"提示让人做一件他做不到的事"的又一例：冲突提示写的是
                         「请刷新后重试」，但界面上没有刷新入口，而真正过期的
                         不是目录列表、是**这份草稿的基线**——`editBase` 与三个
                         输入框都还是打开表单时的快照。只重读目录不会动草稿，
                         用户再点一次保存送出的仍是同一个过期 `editBase`，
                         于是**每次都 409**。

                         只在冲突时刷新：其它失败（权限不足、账户已停用、网络）
                         与"别人改过"无关，重设草稿会把用户写了一半的内容抹掉。 */
                      if (code !== "AF_ACCOUNT_CONFLICT") return;
                      const next = fresh?.accounts.find((a) => a.accountId === active.accountId);
                      if (next === undefined) return;
                      setEditBase(Date.parse(next.updatedAt));
                      /* 冲突后按**三方合并**（基准 / 我的草稿 / 对方的新值）逐字段处置，
                         而不是把草稿整体替换成对方的值：

                           · 用户**没动过**这个字段 ⇒ 采用对方的新值。
                             否则用户会用新基线提交旧内容，把对方刚改的值再退回去一次
                             ——把刚修掉的覆盖问题换个形式又做了一遍。
                           · 用户**动过**这个字段 ⇒ 保留用户的输入。
                             他的意图必须被尊重，不能被对方的值抹掉。

                         为什么必须区分这两者：早先的写法是无条件
                         `setEditName(next.name)` 等，"只刷新基线"和"顺手对齐草稿"
                         混在一起做，结果把用户已经输入的内容一并覆盖了。
                         用户随后保存 → 表单内容恰好等于服务端现值 → 服务端按
                         no-op 短路返回 ok → 界面弹出「已保存」，
                         而**用户实际什么都没改到**（实测：改的是一处也不改的假成功）。 */
                      const keep = (mine: string, base: string, theirs: string) =>
                        mine.trim() === base.trim() ? theirs : mine;
                      const snap = editSnapshot;
                      if (snap !== null) {
                        setEditName(keep(editName, snap.name, next.name));
                        setEditDuty(keep(editDuty, snap.duty, next.duty));
                        setEditRole(editRole === snap.role ? next.role : editRole);
                      } else {
                        /* 拿不到快照（理论上不该发生）时退回"只刷新基线、不动草稿"：
                           宁可让用户下次保存时被再拒一次，也不能猜他改过什么。 */
                        setEditName(next.name);
                        setEditDuty(next.duty);
                        setEditRole(next.role);
                      }
                    },
                  );
                }}
              >
                <div className="form__row">
                  <label>名称</label>
                  <input value={editName} onChange={(event) => setEditName(event.target.value)} />
                </div>
                <div className="form__row">
                  <label>职责说明</label>
                  <input value={editDuty} onChange={(event) => setEditDuty(event.target.value)} />
                </div>
                <div className="form__row">
                  <label>角色</label>
                  <div className="permKinds">
                    {ACCOUNT_ROLE_ORDER.map((role) => (
                      <button
                        type="button"
                        key={role}
                        className="permKind"
                        data-on={editRole === role ? "true" : undefined}
                        onClick={() => setEditRole(role)}
                      >
                        {ACCOUNT_ROLE_LABEL[role]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* `form__row--fixed` 供窄屏媒体查询使用：这一行是"只读值 + 较长说明"的
                    组合，同行放不下时应改为纵向堆叠，而不是把只读值压成 22px 宽
                    （实测过：600px 视口下输入框被说明文字挤到比自身内容还窄）。 */}
                <div className="form__row form__row--fixed">
                  <label>登录标识</label>
                  <input value={active.handle} disabled readOnly data-fixed="true" />
                  <em className="form__note">登录标识是授权与审计的定位键，不支持修改。</em>
                </div>
                <button
                  className="btn btn--accent btn--sm"
                  type="submit"
                  disabled={busy === `edit-${active.accountId}`}
                >
                  {busy === `edit-${active.accountId}` ? "保存中…" : "保存修改"}
                </button>
              </form>
            )}

            <div className="permLegend">
              {NODE_PERM_ORDER.map((perm) => (
                <span key={perm} className="permLegend__item" data-perm={perm}>
                  <i />
                  {NODE_PERM_LABEL[perm]}
                </span>
              ))}
              {/* 层级用**权限名**而不是代数表达：`0 < 1 < 2 < 3` 对用户没有意义，
                  而「可见 < 可执行 < 可裁决 < 可编排」本身就是这套语义的完整说明。
                  交互说明必须同时写出"怎么授予"与"怎么收回"——只说前者时，
                  收回授权这条路径只能靠试出来。 */}
              <span className="permLegend__hint">
                点格设定档位 · 高级含低级（{NODE_PERM_ORDER.map((perm) => NODE_PERM_LABEL[perm]).join(" < ")}）· 点行尾 ✕ 收回
              </span>
            </div>

            {refs.length === 0 ? (
              /* 编排目录不可用：必须与"这个人没被授权"分开呈现。两者的界面动作
                 完全不同——前者要重新读取编排，后者要去授权。 */
              <div className="permEmpty">
                <Icon.Nodes size={20} />
                <p>编排目录尚未就绪，无法列出责任位。</p>
                <em>责任位来自服务端冻结的编排事实；目录读回后这里会显示全部节点。</em>
              </div>
            ) : (
              <>
                {/* 覆盖度必须先说清楚"分子分母是什么"。只说「已覆盖 3 个」时，
                    读者会把它当成完成度；而这里的分母是**本套编排的全部责任位**，
                    与"这个人有多少权限"是两件事。 */}
                <p className="permSummary">
                  责任位覆盖 <b>{refs.filter((ref) => grantFor(active.accountId, ref) !== null).length}</b>
                  <i>/</i>
                  {refs.length}
                  <span>未授权的责任位在网格里以虚线格呈现，点击即可授予</span>
                </p>
                {nodeGroups.map((group) => (
                  <section key={group.workflowId} className="permGroup">
                    <SectionLabel
                      text={group.workflowName}
                      hint={`${group.nodes.filter((ref) => grantFor(active.accountId, ref) !== null).length}/${group.nodes.length} 已授权`}
                    />
                    <div className="permMatrix" data-busy={busy !== null || undefined}>
                      {group.nodes.map((ref) => {
                        const current = grantFor(active.accountId, ref);
                        const key = `${active.accountId}-${ref.workflowId}-${ref.nodeId}`;
                        return (
                          <div key={key} className="permRow" data-on={current ? "true" : undefined}>
                            <div className="permRow__node">
                              <b>{ref.nodeName}</b>
                              {/* 行内不再重复 workflowId：它由分组标题承载，每行都相同，
                                  重复只会挤掉区分度更高的 nodeId（requirements-review
                                  这类长 id 会被截成 requirements-re…）。
                                  这里显示 nodeId 而非中文名，是因为授权键的后半段就是它，
                                  排查「这条授权落在哪个责任位」时要能与接口原样对上。 */}
                              <i className="mono">{ref.nodeId}</i>
                              {ref.gate && <i className="mono">门禁 · {ref.gate}</i>}
                              {ref.approval && <i className="permRow__human">人工判定</i>}
                            </div>
                            <div className="permRow__cells">
                              {NODE_PERM_ORDER.map((perm) => {
                                const on = current?.perm === perm;
                                const below = current !== null && permRank(perm) < permRank(current.perm);
                                return (
                                  <button
                                    key={perm}
                                    className="permCell"
                                    data-on={on ? "true" : undefined}
                                    data-below={below && !on ? "true" : undefined}
                                    /* `data-below-perm` 必须真实携带档位：CSS 用它给"已被当前
                                       等级涵盖的下级"染上该档位的稀释色（四条规则见 settings.css）。
                                       旧实现只设 `data-below` 而不设它，于是那四条规则永不命中，
                                       降级格与"完全未授权"看起来一模一样——都只剩一个 `·`。
                                       而图例明写「高级含低级」，读者据此读矩阵会读错。 */
                                    {...(below && !on ? { "data-below-perm": perm } : {})}
                                    data-perm={on ? perm : undefined}
                                    disabled={!canManage || busy === key}
                                    aria-label={
                                      on
                                        ? `${ref.nodeName} 当前为${NODE_PERM_LABEL[perm]}，点击收回授权`
                                        : `${ref.nodeName} 设为${NODE_PERM_LABEL[perm]}`
                                    }
                                    title={
                                      on
                                        ? `${NODE_PERM_LABEL[perm]}（当前）· 点击收回`
                                        : `设为${NODE_PERM_LABEL[perm]}`
                                    }
                                    onClick={() => setPerm(ref, perm)}
                                  >
                                    {on ? <Icon.Check size={12} /> : below ? <span className="mono">·</span> : null}
                                  </button>
                                );
                              })}
                            </div>
                            {/* 收回是**后果不同**的操作（节点会失去操作者），
                                因此给它独立出口而不是藏在循环末尾。只在已授权时出现，
                                避免未授权行挂一个无意义的按钮。 */}
                            {current !== null && (
                              <button
                                className="permRow__revoke"
                                disabled={!canManage || busy === key}
                                onClick={() => setPerm(ref, null)}
                                aria-label={`收回 ${ref.nodeName} 的授权`}
                                title="收回该责任位的授权"
                              >
                                <Icon.X size={11} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </>
            )}

            <section className="permGroup">
              <SectionLabel
                text="账户变更记录"
                hint={
                  accountAuditTotal > 8
                    ? `共 ${accountAuditTotal} 条，显示最新 ${Math.min(8, accountAudit.length)} 条`
                    : "谁在何时被创建、改动或停用"
                }
              />
              <div className="permAudit">
                {accountAudit.length === 0 ? (
                  <p className="permAudit__empty">尚无账户变更。</p>
                ) : (
                  accountAudit.slice(0, 8).map((row) => (
                    <AccountAuditRow key={row.auditId} row={row} accounts={accounts} />
                  ))
                )}
              </div>
              {/* 截断必须说出来。审计表只增不删，因此这不是边界情况：
                  不说明时「只显示了 8 条」与「一共只有 8 条」长得完全一样，
                  而本项目的主张是留痕优先——把一页当成全部等于在治理事实上说假话。

                  此处**不得**再承诺"可经 API 读取"。旧文案写的是
                  「更早的记录仍保留在治理存储中，可经 API 读取」，但实测：
                  `GET /accounts` 恒返回 50 条，`?limit` / `?offset` / `?cursor` /
                  `?page` / `?since` 全部无效（仍 50 条），`/accounts/audit`、
                  `/audits` 等一律 `AF_ROUTE_NOT_FOUND` —— **当前没有任何读取入口**。

                  "保留在治理存储中"这一半是真的（持久化文件里 `grant_audit` 实存
                  141 条，`account_audit` 7 条，跨重启仍在）；"可经 API 读取"这一半
                  是假的。承诺一件做不到的事，比不承诺更坏：它会让读者以为
                  "需要时能查到"，于是不再对缺失的部分提出要求。 */}
              {accountAuditTotal > accountAudit.length ? (
                <p className="permAudit__truncated">
                  目录共 {accountAuditTotal} 条账户变更，此处仅显示最新 {accountAudit.length} 条；
                  更早的记录仍保存在治理存储中，但当前版本没有读取入口（界面与 API 均未开放）。
                </p>
              ) : accountAuditTotal > 8 ? (
                <p className="permAudit__truncated">
                  本页显示最新 8 条（共 {accountAuditTotal} 条）。
                </p>
              ) : null}
            </section>

            <section className="permGroup">
              <SectionLabel
                text="授权变更记录"
                hint={
                  auditTotal > 8
                    ? `共 ${auditTotal} 条，显示最新 ${Math.min(8, audit.length)} 条`
                    : "与证据链三元组呼应"
                }
              />
              <div className="permAudit">
                {audit.length === 0 ? (
                  <p className="permAudit__empty">尚无授权变更。</p>
                ) : (
                  audit.slice(0, 8).map((row) => (
                    <AuditRow key={row.auditId} row={row} accounts={accounts} />
                  ))
                )}
              </div>
              {auditTotal > audit.length ? (
                <p className="permAudit__truncated">
                  目录共 {auditTotal} 条授权变更，此处仅显示最新 {audit.length} 条；
                  更早的记录仍保存在治理存储中，但当前版本没有读取入口（界面与 API 均未开放）。
                </p>
              ) : auditTotal > 8 ? (
                <p className="permAudit__truncated">本页显示最新 8 条（共 {auditTotal} 条）。</p>
              ) : null}
            </section>

            <button className="btn btn--ghost btn--sm memberRefresh" onClick={() => void onRefresh()}>
              重新读取账户目录
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AccountAuditRow({ row, accounts }: { row: AccountAuditDto; accounts: AccountDto[] }) {
  const actor = accounts.find((item) => item.accountId === row.actor);
  /* 停用/恢复是最需要留痕的动作，因此单列一种说法；资料变更进一步说明改了哪些字段，
     使"改了什么"不必靠对比前后快照才能回答。 */
  const actionText = row.action === "create" ? "创建了" : row.action === "state" ? (row.account.state === "suspended" ? "停用了" : "恢复了") : "修改了";
  const FIELD_LABEL: Record<string, string> = {
    name: "姓名",
    handle: "登录标识",
    role: "角色",
    duty: "职责说明",
    state: "状态",
  };
  const changed = row.action === "update" && row.changedFields.length > 0
    ? row.changedFields.map((field) => FIELD_LABEL[field] ?? field).join("、")
    : null;
  return (
    <div className="permAudit__row">
      <span className="mono">{timeOnlyLabel(row.occurredAt)}</span>
      <b>{actor?.name ?? row.actor}</b>
      <i>{actionText}</i>
      <b>{row.account.name}</b>
      {changed !== null ? (
        <>
          <i>的</i>
          <span className="permAudit__perm">{changed}</span>
        </>
      ) : null}
    </div>
  );
}

function AuditRow({ row, accounts }: { row: GrantAuditDto; accounts: AccountDto[] }) {
  const account = accounts.find((item) => item.accountId === row.accountId);
  const actionText =
    row.action === "grant"
      ? "授予"
      : row.action === "revoke"
        ? "收回"
        : row.action === "raise"
          ? "升级为"
          : row.action === "lower"
            ? "降级为"
            : /* reaffirm：等级没有变化。不写"降级"或"升级"——那会凭空造出
                 一次从未发生的变更，而审计的价值就在于它记的是事实。
                 也不用"无变化"这类含糊说法，直接说明这次写入确认了原等级。 */
              "确认";
  const actor = accounts.find((item) => item.accountId === row.actor);
  return (
    <div className="permAudit__row">
      {/* 时间必须转本地时区：直接对 UTC ISO 串切片会在东八区整体偏 8 小时。 */}
      <span className="mono">{timeOnlyLabel(row.occurredAt)}</span>
      <b>{actor?.name ?? row.actor}</b>
      <i>{actionText}</i>
      <b>{account?.name ?? row.accountId}</b>
      <i>在</i>
      <b className="mono">
        {row.workflowId} · {row.nodeId}
      </b>
      <i>的</i>
      <span className="permAudit__perm">{NODE_PERM_LABEL[row.perm]}</span>
    </div>
  );
}

function SectionLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="secLabel">
      <span className="kicker">{text}</span>
      {hint && <span className="secLabel__hint">{hint}</span>}
      <span className="secLabel__rule" />
    </div>
  );
}
