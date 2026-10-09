import { useCallback, useMemo, useState } from "react";
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
  onSetAccountState,
  onSetGrant,
}: {
  data: AccountsDto | null;
  actor: ActorDto | null;
  /** 实时编排目录：责任位矩阵的唯一节点来源（见 nodeRefs 的说明）。 */
  workflows: Workflow[];
  onToast: Toast;
  onRefresh: () => Promise<void>;
  onCreateAccount: (input: AccountInputDto) => Promise<void>;
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

  /** 已授权的责任位，按编排分组 —— 矩阵只显示"这个人实际被分到了什么"。 */
  const assigned = useMemo(() => {
    if (!active) return [];
    const mine = refs.filter((ref) => grantIndex.has(`${active.accountId}::${ref.workflowId}::${ref.nodeId}`));
    const byWorkflow = new Map<string, { workflowName: string; nodes: NodeRef[] }>();
    for (const ref of mine) {
      if (!byWorkflow.has(ref.workflowId)) {
        byWorkflow.set(ref.workflowId, { workflowName: ref.workflowName, nodes: [] });
      }
      byWorkflow.get(ref.workflowId)!.nodes.push(ref);
    }
    return [...byWorkflow.entries()].map(([workflowId, group]) => ({ workflowId, ...group }));
  }, [active, refs, grantIndex]);

  /** 尚未授予的责任位（"可授权节点"区）。 */
  const assignable = useMemo(() => {
    if (!active) return [];
    return refs
      .filter((ref) => !grantIndex.has(`${active.accountId}::${ref.workflowId}::${ref.nodeId}`))
      .slice(0, 12);
  }, [active, refs, grantIndex]);

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

  /** 统一的写操作包装：失败按服务端错误码如实呈现，绝不静默吞掉。 */
  const run = async (key: string, action: () => Promise<void>, onOk?: () => void) => {
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
    } finally {
      setBusy(null);
    }
  };

  const cycle = (ref: NodeRef) => {
    if (!active) return;
    const current = grantFor(active.accountId, ref);
    /* 四级循环 → 收回：loop 到 manage 再点一次就是"收回授权"。
       把收回放在循环末尾而不是单独按钮，是因为它和升降级是同一件事的程度变化。 */
    const ladder: (NodePermDto | null)[] = [...NODE_PERM_ORDER, null];
    const next = current === null ? "view" : ladder[ladder.indexOf(current.perm) + 1] ?? null;
    const label = next === null ? "收回授权" : current === null ? `授予「${NODE_PERM_LABEL[next]}」` : `调整为「${NODE_PERM_LABEL[next]}」`;
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
        body: `${active.name} × ${ref.nodeName}（${ref.workflowName}）`,
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
      <div className="split__detail memberDetail">
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
              {active.state === "active" && active.accountId !== actor.accountId ? (
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={!canManage || busy === `state-${active.accountId}`}
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
              ) : active.state === "suspended" ? (
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={!canManage || busy === `state-${active.accountId}`}
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
              ) : null}
            </header>

            <div className="permLegend">
              {NODE_PERM_ORDER.map((perm) => (
                <span key={perm} className="permLegend__item" data-perm={perm}>
                  <i />
                  {NODE_PERM_LABEL[perm]}
                </span>
              ))}
              {/* 层级用**权限名**而不是代数表达：`0 < 1 < 2 < 3` 对用户没有意义，
                  而「可见 < 可执行 < 可裁决 < 可编排」本身就是这套语义的完整说明。 */}
              <span className="permLegend__hint">
                点击调整 · 高级含低级（{NODE_PERM_ORDER.map((perm) => NODE_PERM_LABEL[perm]).join(" < ")}）
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
            ) : assigned.length === 0 ? (
              <div className="permEmpty">
                <Icon.Nodes size={20} />
                <p>该账户尚未被授予任何节点。</p>
                <em>从下方「可授权节点」中选择起点 —— 没有操作者的节点不允许进入编排。</em>
              </div>
            ) : (
              assigned.map((group) => (
                <section key={group.workflowId} className="permGroup">
                  <SectionLabel text={group.workflowName} hint={`${group.nodes.length} 个节点`} />
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
                                  data-perm={on ? perm : undefined}
                                  disabled={!canManage || busy === key}
                                  aria-label={`${ref.nodeName} ${NODE_PERM_LABEL[perm]}`}
                                  onClick={() => cycle(ref)}
                                >
                                  {on ? <Icon.Check size={12} /> : below ? <span className="mono">·</span> : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}

            <section className="permGroup">
              <SectionLabel text="可授权节点" hint="点击加入矩阵" />
              <div className="permAdd">
                {assignable.length === 0 ? (
                  <p className="permAdd__empty">全部责任位都已覆盖。</p>
                ) : (
                  assignable.map((ref) => (
                    <button
                      key={`${ref.workflowId}-${ref.nodeId}`}
                      className="permAdd__chip"
                      disabled={!canManage || busy !== null}
                      onClick={() => cycle(ref)}
                      title={`${ref.workflowName} · ${ref.nodeName}`}
                    >
                      <Icon.Plus size={11} />
                      {ref.nodeName}
                      <i className="mono">{ref.workflowName}</i>
                    </button>
                  ))
                )}
              </div>
            </section>

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
                  而本项目的主张是留痕优先——把一页当成全部等于在治理事实上说假话。 */}
              {accountAuditTotal > accountAudit.length ? (
                <p className="permAudit__truncated">
                  目录共 {accountAuditTotal} 条账户变更，此处仅显示服务端返回的最新 {accountAudit.length} 条；
                  更早的记录仍保留在治理存储中，可经 API 读取。
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
                  目录共 {auditTotal} 条授权变更，此处仅显示服务端返回的最新 {audit.length} 条；
                  更早的记录仍保留在治理存储中，可经 API 读取。
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
