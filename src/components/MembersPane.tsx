import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import {
  accounts,
  accountRoleLabel,
  accountStateLabel,
  ACCOUNT_ROLE_ORDER,
  initialAudit,
  initialGrants,
  nodePermLabel,
  nodePermRank,
  nodeRefs,
  type Account,
  type AccountRole,
  type GrantAudit,
  type NodeGrant,
  type NodePerm,
  type NodeRef,
} from "../data/accounts";

type Toast = (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;

const PERMS: NodePerm[] = ["view", "run", "approve", "manage"];

export function MembersPane({ onToast }: { onToast: Toast }) {
  const [accounts_, setAccounts] = useState<Account[]>(accounts);
  const [grants, setGrants] = useState<NodeGrant[]>(initialGrants);
  const [audit, setAudit] = useState<GrantAudit[]>(initialAudit);
  const [selected, setSelected] = useState<string>(() => {
    const q = new URLSearchParams(window.location.search).get("account");
    return q && accounts.some((a) => a.id === q) ? q : accounts[0].id;
  });
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState<AccountRole>("development");

  const nodeIndex = useMemo(() => nodeRefs(), []);
  const active = useMemo(
    () => accounts_.find((a) => a.id === selected) ?? accounts_[0],
    [accounts_, selected],
  );

  const activeNodes = useMemo(() => {
    const refs = nodeIndex.filter((n) =>
      grants.some((g) => g.accountId === active.id && g.workflowId === n.workflowId && g.nodeId === n.nodeId),
    );
    const byWf = new Map<string, { wf: string; nodes: NodeRef[] }>();
    for (const n of refs) {
      if (!byWf.has(n.workflowId)) byWf.set(n.workflowId, { wf: n.workflowName, nodes: [] });
      byWf.get(n.workflowId)!.nodes.push(n);
    }
    return [...byWf.values()];
  }, [grants, active.id, nodeIndex]);

  const grantOf = (n: NodeRef): NodePerm | null => {
    const rows = grants.filter(
      (g) => g.accountId === active.id && g.workflowId === n.workflowId && g.nodeId === n.nodeId,
    );
    if (!rows.length) return null;
    return rows.reduce((best, g) => (nodePermRank[g.perm] > nodePermRank[best] ? g.perm : best), rows[0].perm);
  };

  const cycle = (n: NodeRef) => {
    const cur = grantOf(n);
    const ladder: (NodePerm | null)[] = ["view", "run", "approve", "manage"];
    const next = cur === null ? "view" : cur === "manage" ? null : ladder[ladder.indexOf(cur) + 1];

    setGrants((prev) => {
      const same = (g: NodeGrant) =>
        g.accountId === active.id && g.workflowId === n.workflowId && g.nodeId === n.nodeId;
      const kept = prev.filter((g) => !(same(g) && (next === null || g.perm === cur)));
      if (next === null) return kept.filter((g) => !same(g));
      return [...kept, { accountId: active.id, workflowId: n.workflowId, nodeId: n.nodeId, perm: next, source: "owner" }];
    });

    setAudit((prev) => [
      {
        id: `ga-${Date.now()}`,
        at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        by: "杨知远",
        action: next === null ? "revoke" : cur === null ? "grant" : nodePermRank[next] > nodePermRank[cur] ? "raise" : "lower",
        accountId: active.id,
        nodeId: n.nodeId,
        nodeName: n.nodeName,
        perm: next ?? cur ?? "view",
      },
      ...prev,
    ]);

    onToast({
      tone: next === null ? "warn" : "ok",
      title: next === null ? "已收回授权" : `已${cur === null ? "授予" : "调整为"}「${nodePermLabel[next]}」`,
      body: `${active.name} × ${n.nodeName}（${n.workflowName}）`,
    });
  };

  const createAccount = () => {
    const name = draftName.trim() || "新成员";
    const id = `ac-${Date.now()}`;
    setAccounts((prev) => [
      ...prev,
      {
        id,
        name,
        handle: `${name.toLowerCase().replace(/\s+/g, ".")}@agentflow.dev`,
        role: draftRole,
        duty: "自定义账户，尚未填写职责说明。",
        glyph: "Agent",
        tint: "accent",
        state: "active",
        builtin: false,
      },
    ]);
    setSelected(id);
    setCreating(false);
    setDraftName("");
    onToast({ tone: "ok", title: "已创建账户", body: `${name} · ${accountRoleLabel[draftRole]}` });
  };

  return (
    <div className="split">
      {/* ------------ 左列：账户列表 ------------ */}
      <div className="split__list">
        {ACCOUNT_ROLE_ORDER.map((role) => {
          const rows = accounts_.filter((a) => a.role === role);
          if (!rows.length) return null;
          return (
            <section key={role}>
              <SectionLabel text={accountRoleLabel[role]} />
              <div className="memberList">
                {rows.map((a, i) => (
                  <button
                    key={a.id}
                    className="memberRow"
                    data-active={a.id === active.id ? "true" : undefined}
                    data-state={a.state}
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={() => setSelected(a.id)}
                  >
                    <span className="memberRow__glyph" data-tint={a.tint}>
                      {(() => {
                        const G = Icon[a.glyph];
                        return <G size={15} />;
                      })()}
                    </span>
                    <span className="memberRow__body">
                      <b>{a.name}</b>
                      <i className="mono">{a.handle}</i>
                    </span>
                    {a.state === "suspended" && (
                      <span className="memberRow__flag">停用</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        <button className="memberNew" onClick={() => setCreating((v) => !v)}>
          <Icon.Plus size={15} />
          <span>新建账户</span>
        </button>

        {creating && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              createAccount();
            }}
          >
            <div className="form__row">
              <label>名称</label>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="如：张启 · 后端负责人"
              />
            </div>
            <div className="form__row">
              <label>角色</label>
              <div className="permKinds">
                {ACCOUNT_ROLE_ORDER.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className="permKind"
                    data-on={draftRole === r ? "true" : undefined}
                    onClick={() => setDraftRole(r)}
                    title={accountRoleLabel[r]}
                  >
                    {accountRoleLabel[r]}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn--accent btn--sm" type="submit">
              创建账户
            </button>
          </form>
        )}
      </div>

      {/* ------------ 右列：权限矩阵 ------------ */}
      <div className="split__detail memberDetail">
        <header className="memberHead">
          <span className="memberHead__glyph" data-tint={active.tint}>
            {(() => {
              const G = Icon[active.glyph];
              return <G size={18} />;
            })()}
          </span>
          <div className="memberHead__text">
            <h3>{active.name}</h3>
            <p>
              <span className="mono">{active.handle}</span>
              <i>·</i>
              {accountRoleLabel[active.role]}
              <i>·</i>
              {accountStateLabel[active.state]}
            </p>
            <em>{active.duty}</em>
          </div>
        </header>

        <div className="permLegend">
          {PERMS.map((p) => (
            <span key={p} className="permLegend__item" data-perm={p}>
              <i />
              {nodePermLabel[p]}
            </span>
          ))}
          <span className="permLegend__hint">点击调整 · 高级含低级</span>
        </div>

        {activeNodes.length === 0 ? (
          <div className="permEmpty">
            <Icon.Nodes size={20} />
            <p>该账户尚未被授予任何节点。</p>
            <em>从下方「可授权节点」中选择起点 —— 没有操作者的节点不允许进入编排。</em>
          </div>
        ) : (
          activeNodes.map((group) => (
            <section key={group.wf} className="permGroup">
              <SectionLabel text={group.wf} hint={`${group.nodes.length} 个节点`} />
              <div className="permMatrix">
                {group.nodes.map((n) => {
                  const cur = grantOf(n);
                  return (
                    <div key={`${n.workflowId}-${n.nodeId}`} className="permRow" data-on={cur ? "true" : undefined}>
                      <div className="permRow__node">
                        <b>{n.nodeName}</b>
                        {n.gate && <i className="mono">门禁 · {n.gate}</i>}
                        {n.approval && <i className="permRow__human">人工判定</i>}
                      </div>
                      <div className="permRow__cells">
                        {PERMS.map((p) => {
                          const on = cur === p;
                          const lower = cur !== null && nodePermRank[p] < nodePermRank[cur];
                          return (
                            <button
                              key={p}
                              className="permCell"
                              data-on={on ? "true" : undefined}
                              data-below={lower && !on ? "true" : undefined}
                              data-below-perm={lower && !on ? p : undefined}
                              data-perm={on ? p : undefined}
                              aria-label={`${n.nodeName} ${nodePermLabel[p]}`}
                              onClick={() => cycle(n)}
                            >
                              {on ? <Icon.Check size={12} /> : lower ? <span className="mono">·</span> : null}
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
            {nodeIndex
              .filter(
                (n) =>
                  !grants.some(
                    (g) => g.accountId === active.id && g.workflowId === n.workflowId && g.nodeId === n.nodeId,
                  ),
              )
              .slice(0, 12)
              .map((n) => (
                <button
                  key={`${n.workflowId}-${n.nodeId}`}
                  className="permAdd__chip"
                  onClick={() => cycle(n)}
                  title={`${n.workflowName} · ${n.nodeName}`}
                >
                  <Icon.Plus size={11} />
                  {n.nodeName}
                  <i className="mono">{n.workflowName}</i>
                </button>
              ))}
          </div>
        </section>

        <section className="permGroup">
          <SectionLabel text="授权变更记录" hint="与证据链三元组呼应" />
          <div className="permAudit">
            {audit.slice(0, 6).map((a) => {
              const acc = accounts_.find((x) => x.id === a.accountId);
              const actionText =
                a.action === "grant" ? "授予" : a.action === "revoke" ? "收回" : a.action === "raise" ? "升级为" : "降级为";
              return (
                <div key={a.id} className="permAudit__row">
                  <span className="mono">{a.at}</span>
                  <b>{a.by}</b>
                  <i>{actionText}</i>
                  <b>{acc?.name ?? a.accountId}</b>
                  <i>在</i>
                  <b>{a.nodeName}</b>
                  <i>的</i>
                  <span className="permAudit__perm">{nodePermLabel[a.perm]}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
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
