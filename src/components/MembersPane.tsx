import { useCallback, useMemo, useState } from "react";
import { Icon, type IconName } from "./Icons";
import {
  ACCOUNT_ROLE_LABEL,
  ACCOUNT_ROLE_ORDER,
  NODE_PERM_LABEL,
  NODE_PERM_ORDER,
  permRank,
  AfApiError,
  errorText,
  type AccountDto,
  type AccountInputDto,
  type AccountRoleDto,
  type AccountsDto,
  type ActorDto,
  type GrantAuditDto,
  type NodeGrantDto,
  type NodePermDto,
} from "../api";
import { workflowTemplates, type WfNode } from "../data/workflows";

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

function nodeRefs(): NodeRef[] {
  return workflowTemplates.flatMap((workflow) =>
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
  onToast,
  onRefresh,
  onCreateAccount,
  onSetAccountState,
  onSetGrant,
}: {
  data: AccountsDto | null;
  actor: ActorDto | null;
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
  const [busy, setBusy] = useState<string | null>(null);

  /* 空数组回落必须是**稳定引用**：写成 `data?.accounts ?? []` 会在每次渲染
     新建一个数组，让下面所有 useMemo 的依赖每帧都变、缓存彻底失效。 */
  const EMPTY: never[] = [];
  const accounts = data?.accounts ?? EMPTY;
  const grants = data?.grants ?? EMPTY;
  const audit = data?.audit ?? EMPTY;

  /* 选中项的回落：账户被停用或服务端目录变化时，避免右列指向一个不存在的账户。
     这是渲染期的纯派生，不用 effect —— 用 effect 会多渲染一帧空态。 */
  const active = useMemo(
    () => accounts.find((account) => account.accountId === selectedId) ?? accounts[0],
    [accounts, selectedId],
  );

  const refs = useMemo(() => nodeRefs(), []);

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
        body: errorText(apiError?.code, apiError?.message ?? "未知错误"),
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
    if (name.length === 0 || handle.length === 0) {
      onToast({ tone: "warn", title: "创建账户失败", body: "名称与登录标识都必须填写。" });
      return;
    }
    void run(
      "create-account",
      () => onCreateAccount({ name, handle, role: draftRole, duty: "自定义账户，尚未填写职责说明。" }),
      () => {
        setCreating(false);
        setDraftName("");
        setDraftHandle("");
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
        {!canManage && (
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
              <span className="permLegend__hint">
                点击调整 · 高级含低级（{NODE_PERM_ORDER.map((perm) => `${permRank(perm)}`).join(" < ")}）
              </span>
            </div>

            {assigned.length === 0 ? (
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
                            <i className="mono">{ref.workflowId} · {ref.nodeId}</i>
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
              <SectionLabel text="授权变更记录" hint="与证据链三元组呼应" />
              <div className="permAudit">
                {audit.length === 0 ? (
                  <p className="permAudit__empty">尚无授权变更。</p>
                ) : (
                  audit.slice(0, 8).map((row) => (
                    <AuditRow key={row.auditId} row={row} accounts={accounts} />
                  ))
                )}
              </div>
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

function AuditRow({ row, accounts }: { row: GrantAuditDto; accounts: AccountDto[] }) {
  const account = accounts.find((item) => item.accountId === row.accountId);
  const actionText =
    row.action === "grant" ? "授予" : row.action === "revoke" ? "收回" : row.action === "raise" ? "升级为" : "降级为";
  const actor = accounts.find((item) => item.accountId === row.actor);
  return (
    <div className="permAudit__row">
      <span className="mono">{row.occurredAt.slice(11, 16)}</span>
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
