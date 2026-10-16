import { useCallback, useEffect, useState } from "react";
import {
  listProvisionSpaces,
  listProvisionSessions,
  provisionUser,
  removeProvisionUser,
  getKcUser,
  setKcUserEnabled,
  revokeProvisionSession,
  PortalAdminError,
  type ProvisionSpace,
  type ProvisionSession,
  type KcUserView,
} from "../api/portal";

/**
 * 门户管理区的另外两页（PORTAL-PLAN G5/§3.4）：
 * - 用户生命周期：空间 × 成员矩阵 + 新增用户（含 platformAdmin 勾选）+
 *   移除 + Keycloak 身份查询/停用/恢复（agent G2 端点）；
 * - 会话：清单 + 单会话吊销（DELETE /admin/provision/sessions/{id}）。
 *
 * 数据源与 SpacesBoard 相同的网关反代（/admin/provision/*，会话 cookie 鉴权，
 * 不带 Authorization——token 只留给脚本，不进浏览器）。所有写动作失败时把
 * 401/403 明确呈现为「需要平台管理员会话」（PortalAdminError.authDenied），
 * 不做笼统报错；不可逆动作一律先过 window.confirm 二次确认。
 *
 * 写动作以重读为准，不做本地乐观改写（与 SpacesBoard/MembersPane 同规矩）。
 */
export type AdminToast = (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;

/** 把管理面错误统一译成可读文案；401/403 明确指向会话，502 指向 agent 部署。 */
function adminErrorText(error: unknown): string {
  if (error instanceof PortalAdminError) {
    if (error.authDenied) return "需要平台管理员会话——当前身份未持 platform-admin，或登录已过期（重新登录后重试）。";
    if (error.status === 502) return "供给代理（provision-agent）不可达——管理面未部署或 agent 离线。";
    return error.message;
  }
  return error instanceof Error ? error.message : "管理面不可达";
}

/* ------------------------------ 用户生命周期页 ------------------------------ */

export function UsersLifecycle({ onToast }: { onToast: AdminToast }) {
  const [spaces, setSpaces] = useState<ProvisionSpace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ space: "", subject: "", username: "", handle: "", displayName: "", password: "", platformAdmin: false });
  /** Keycloak 身份查询的最近一次结果（含查询目标），放在页内而不是弹窗。 */
  const [kcQuery, setKcQuery] = useState<{ username: string; result: KcUserView | null; error: string | null } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSpaces(await listProvisionSpaces());
      setError(null);
    } catch (e) {
      setError(adminErrorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const addUser = () =>
    withBusy(async () => {
      try {
        await provisionUser({
          space: form.space,
          ...(form.subject.trim() ? { subject: form.subject.trim() } : {}),
          username: form.username,
          handle: form.handle,
          displayName: form.displayName,
          ...(form.password ? { password: form.password } : {}),
          ...(form.platformAdmin ? { platformAdmin: true } : {}),
        });
        onToast({ tone: "ok", title: "用户已供给", body: `${form.handle} → ${form.space}（账号/身份/映射三步完成${form.platformAdmin ? "，已授 platform-admin" : ""}）` });
        setAdding(false);
        setForm({ space: "", subject: "", username: "", handle: "", displayName: "", password: "", platformAdmin: false });
        await refresh();
      } catch (e) {
        onToast({ tone: "warn", title: "供给失败", body: adminErrorText(e) });
      }
    });

  const removeUser = (subject: string, handle: string) =>
    withBusy(async () => {
      try {
        await removeProvisionUser(subject);
        onToast({ tone: "ok", title: "用户已移除", body: `${handle}：会话吊销、AF 账号停用、映射已删。` });
        await refresh();
      } catch (e) {
        onToast({ tone: "warn", title: "移除失败", body: adminErrorText(e) });
      }
    });

  const queryKcUser = (username: string) =>
    withBusy(async () => {
      try {
        setKcQuery({ username, result: await getKcUser(username), error: null });
      } catch (e) {
        setKcQuery({ username, result: null, error: adminErrorText(e) });
      }
    });

  const setEnabled = (username: string, enable: boolean) =>
    withBusy(async () => {
      try {
        await setKcUserEnabled(username, enable);
        onToast({ tone: "ok", title: enable ? "身份已恢复" : "身份已停用", body: `Keycloak 用户 ${username} 已${enable ? "恢复" : "停用"}。` });
        if (kcQuery?.username === username) void queryKcUser(username);
      } catch (e) {
        onToast({ tone: "warn", title: enable ? "恢复失败" : "停用失败", body: adminErrorText(e) });
      }
    });

  return (
    <div className="portal__board">
      <div className="portal__boardHead">
        <span className="portal__muted">{spaces === null ? (error ?? "读取中…") : `${spaces.length} 个空间的成员矩阵`}</span>
        <div className="portal__boardActions">
          <button className="portal__btn" onClick={() => setAdding(true)} disabled={busy}>
            新增用户
          </button>
          <button className="portal__btn" onClick={() => void refresh()} disabled={busy}>
            刷新
          </button>
        </div>
      </div>

      {spaces === null && error !== null && <p className="portal__error" role="alert">{error}</p>}

      {/* 空间 × 成员矩阵：每空间一张卡，行内给出移除入口；停用/查询走页顶工具。 */}
      {spaces?.map((s) => (
        <div key={s.space} className="portal__spaceCard">
          <div className="portal__spaceHead">
            <strong className="portal__spaceName">{s.space}</strong>
            <span className="portal__statePill" data-running={s.running}>
              {s.running ? "运行中" : "已下线（卷保留）"}
            </span>
            <span className="portal__muted portal__small">{s.members.length} 个成员</span>
          </div>
          <table className="portal__table">
            <thead>
              <tr>
                <th>成员</th>
                <th>登录标识</th>
                <th>subject</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.subject}>
                  <td>{m.displayName ?? m.afHandle}</td>
                  <td className="portal__mono">{m.afHandle}</td>
                  <td className="portal__mono portal__small">{m.subject.slice(0, 12)}…</td>
                  <td>
                    <button
                      className="portal__btn portal__small"
                      disabled={busy || !s.running}
                      onClick={() => {
                        if (!window.confirm(`从「${s.space}」移除 ${m.afHandle}？会话吊销、账号停用、映射删除，动作不可逆。`)) return;
                        void removeUser(m.subject, m.afHandle);
                      }}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
              {s.members.length === 0 && (
                <tr>
                  <td colSpan={4} className="portal__muted portal__small">无成员映射</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {adding && (
        <div className="portal__formCard">
          <strong>新增用户到空间</strong>
          <p className="portal__muted portal__hint">供给是三步幂等动作：建/复用 Keycloak 身份 → 建 AF 账号 → 写映射。password 留空时由 agent 生成初始密码（返回体携带）。</p>
          <label className="portal__field">
            目标空间
            <input className="portal__input" value={form.space} onChange={(e) => setForm({ ...form, space: e.target.value })} placeholder="af" />
          </label>
          <label className="portal__field">
            subject（可选；缺省由 Keycloak 新建身份生成）
            <input className="portal__input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </label>
          <label className="portal__field">
            登录名（Keycloak username）
            <input className="portal__input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="portal__field">
            登录标识（handle，ASCII name@domain）
            <input className="portal__input" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />
          </label>
          <label className="portal__field">
            显示名
            <input className="portal__input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <label className="portal__field">
            初始密码（留空由 agent 生成）
            <input className="portal__input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          </label>
          <label className="portal__field portal__field--check">
            <input type="checkbox" checked={form.platformAdmin} onChange={(e) => setForm({ ...form, platformAdmin: e.target.checked })} />
            授予平台管理员（platform-admin realm 角色；登录后落在管理门户）
          </label>
          <div className="portal__formActions">
            <button className="portal__btn portal__btn--primary" disabled={busy || !form.space || !form.username || !form.handle} onClick={() => void addUser()}>
              提交供给
            </button>
            <button className="portal__btn" onClick={() => setAdding(false)}>取消</button>
          </div>
        </div>
      )}

      {/* Keycloak 身份查询/停用/恢复：作用在身份层（realm），不依赖某个空间在线。 */}
      <div className="portal__formCard">
        <strong>Keycloak 身份查询</strong>
        <p className="portal__muted portal__hint">按登录名查询身份并给出停用/恢复入口。停用后该用户无法再登录（已发 access token 到期自然失效）。</p>
        <KcQueryRow onQuery={(u) => void queryKcUser(u)} initial={kcQuery?.username ?? ""} />
        {kcQuery?.error && <p className="portal__error" role="alert">{kcQuery.error}</p>}
        {kcQuery?.result && (
          <div className="portal__kcResult">
            <span className="portal__mono">{kcQuery.result.username}</span>
            <span className="portal__statePill" data-running={kcQuery.result.enabled}>{kcQuery.result.enabled ? "已启用" : "已停用"}</span>
            {kcQuery.result.email && <span className="portal__muted portal__small">{kcQuery.result.email}</span>}
            {kcQuery.result.enabled ? (
              <button className="portal__btn portal__btn--danger portal__small" disabled={busy} onClick={() => { if (!window.confirm(`停用 Keycloak 身份 ${kcQuery.result!.username}？该用户将无法再登录。`)) return; void setEnabled(kcQuery.result!.username, false); }}>
                停用
              </button>
            ) : (
              <button className="portal__btn portal__small" disabled={busy} onClick={() => void setEnabled(kcQuery.result!.username, true)}>
                恢复
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 身份查询输入行：单独提出以持有输入态，查询结果仍由页级 state 承载。 */
function KcQueryRow({ onQuery, initial }: { onQuery: (username: string) => void; initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="portal__inlineRow">
      <input
        className="portal__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="alice"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onQuery(value.trim());
        }}
      />
      <button className="portal__btn" disabled={!value.trim()} onClick={() => onQuery(value.trim())}>
        查询
      </button>
    </div>
  );
}

/* --------------------------------- 会话页 --------------------------------- */

export function SessionsPage({ onToast }: { onToast: AdminToast }) {
  const [sessions, setSessions] = useState<ProvisionSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSessions(await listProvisionSessions());
      setError(null);
    } catch (e) {
      setError(adminErrorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = (row: ProvisionSession) => {
    setBusy(true);
    void (async () => {
      try {
        await revokeProvisionSession(row.sessionId);
        onToast({ tone: "ok", title: "会话已吊销", body: `subject ${row.subject.slice(0, 12)}… 的会话已吊销。` });
        await refresh();
      } catch (e) {
        onToast({ tone: "warn", title: "吊销失败", body: adminErrorText(e) });
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="portal__board">
      <div className="portal__boardHead">
        <span className="portal__muted">{sessions === null ? (error ?? "读取中…") : `${sessions.length} 个活跃会话`}</span>
        <button className="portal__btn" onClick={() => void refresh()} disabled={busy}>
          刷新
        </button>
      </div>

      {sessions === null && error !== null && <p className="portal__error" role="alert">{error}</p>}

      {sessions !== null && (
        <table className="portal__table">
          <thead>
            <tr>
              <th>subject</th>
              <th>access 过期</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.sessionId}>
                <td className="portal__mono">{s.subject.slice(0, 18)}…</td>
                <td>{new Date(s.accessTokenExpiresAt).toLocaleString()}</td>
                <td>
                  <button
                    className="portal__btn portal__btn--danger portal__small"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`吊销该会话（subject ${s.subject.slice(0, 12)}…）？该用户将被强制重新登录。`)) return;
                      revoke(s);
                    }}
                  >
                    吊销
                  </button>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={3} className="portal__muted portal__small">当前无活跃会话</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
