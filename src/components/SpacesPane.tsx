import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icons";

/**
 * 空间管理面板（ADMIN-CONSOLE-PLAN R1/R6 只读视图 + R2/R3 操作入口）。
 *
 * 数据来源：网关反代的 /admin/provision/*（provision-agent，Bearer token）。
 * v1 简化：token 由部署方注入为 VITE_AF_PROVISION_TOKEN（编译期常量，与
 * VITE_AF_API_BASE_URL 同模式）；token 未配置时整面板显示「管理面未部署」，
 * 而不是报错——不部署 agent = 无此功能，是合法形态（§2.3 缺省即 404）。
 *
 * 展示口径：空间卡片（健康/账号数/成员映射）+ 活跃会话；写动作（加入成员）
 * 直发 agent，结果以重读为准，不做本地乐观改写（与 MembersPane 同规矩）。
 */
type Space = {
  space: string;
  container: string;
  running: boolean;
  bootstrapOk: boolean | null;
  accounts: number | null;
  members: Array<{ subject: string; afHandle: string; displayName?: string }>;
};
type SessionRow = { sessionId: string; subject: string; accessTokenExpiresAt: number };
type Toast = (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;

const TOKEN = import.meta.env.VITE_AF_PROVISION_TOKEN as string | undefined;

export function SpacesPane({ onToast }: { onToast: Toast }) {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ space: "", username: "", handle: "", displayName: "" });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
  };

  const refresh = useCallback(async () => {
    if (!TOKEN) return;
    try {
      const [s, sess] = await Promise.all([
        fetch("/admin/provision/spaces", { headers }).then((r) => r.json()),
        fetch("/admin/sessions", { headers }).then((r) => r.json()),
      ]);
      if (s.ok) setSpaces(s.data.spaces);
      else setError(s.error?.message ?? "读取失败");
      if (sess.ok) setSessions(sess.data.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "管理面不可达");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!TOKEN) {
    return (
      <div className="spacesPane">
        <p className="text-muted">
          供给代理（provision-agent）未配置管理令牌——空间管理面未部署。
          这是合法形态：不部署 agent 时此面板无数据源。部署方法见 deploy/ADMIN-CONSOLE-PLAN.md。
        </p>
      </div>
    );
  }

  const addUser = async () => {
    setBusy(true);
    try {
      const res = await fetch("/admin/provision/users", {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (j.ok) {
        onToast({ tone: "ok", title: "成员已供给", body: `${form.handle} → ${form.space}（账号/身份/映射三步完成，Keycloak ${j.data.kcCreated ? "新建" : "复用"}）` });
        setAdding(false);
        setForm({ space: "", username: "", handle: "", displayName: "" });
        await refresh();
      } else {
        onToast({ tone: "warn", title: "供给失败", body: j.error?.message ?? `HTTP ${res.status}` });
      }
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (subject: string, handle: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/admin/provision/users/${encodeURIComponent(subject)}`, { method: "DELETE", headers });
      const j = await res.json();
      if (j.ok) {
        onToast({ tone: "ok", title: "成员已移除", body: `${handle}：会话吊销 ${j.data.revoked}、AF 账号停用、映射已删` });
        await refresh();
      } else {
        onToast({ tone: "warn", title: "移除失败", body: j.error?.message ?? `HTTP ${res.status}` });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="spacesPane">
      <div className="spacesPane__head">
        <span className="text-muted">
          {spaces === null ? (error ?? "读取中…") : `${spaces.length} 个空间 · ${sessions?.length ?? "?"} 个活跃会话`}
        </span>
        <button className="btn" onClick={() => void refresh()} disabled={busy}>
          <Icon.RefreshCw size={14} />
          <span>刷新</span>
        </button>
      </div>

      {spaces?.map((s) => (
        <div key={s.space} className="card" style={{ padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong className="serif">{s.space}</strong>
            <span
              style={{
                fontSize: 12,
                padding: "1px 8px",
                borderRadius: 999,
                background: s.running ? "color-mix(in srgb, var(--green) 16%, transparent)" : "var(--muted)",
                color: s.running ? "var(--green)" : "var(--muted-foreground)",
              }}
            >
              {s.running ? (s.bootstrapOk === true ? "运行中 · bootstrap ok" : "运行中 · 探针未过") : "已下线（卷保留）"}
            </span>
            {s.accounts !== null && <span className="text-small text-muted">{s.accounts} 个账号</span>}
            <span className="text-small text-muted mono">{s.container}</span>
          </div>
          <table className="table table-sm" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>成员</th>
                <th>登录标识</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.subject}>
                  <td>{m.displayName ?? m.afHandle}</td>
                  <td className="mono">{m.afHandle}</td>
                  <td>
                    <button
                      className="btn"
                      style={{ fontSize: 12 }}
                      disabled={busy || !s.running}
                      onClick={() => void removeUser(m.subject, m.afHandle)}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
              {s.members.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted text-small">
                    无成员映射
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {adding ? (
        <div className="card" style={{ padding: "10px 12px", display: "grid", gap: 8 }}>
          <strong>新增成员到空间</strong>
          <label className="form-label">
            目标空间
            <input
              className="form-control"
              value={form.space}
              onChange={(e) => setForm({ ...form, space: e.target.value })}
              placeholder="af"
            />
          </label>
          <label className="form-label">
            登录名（Keycloak username）
            <input className="form-control" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="form-label">
            登录标识（handle，ASCII name@domain）
            <input className="form-control" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />
          </label>
          <label className="form-label">
            显示名
            <input className="form-control" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || !form.space || !form.username || !form.handle} onClick={() => void addUser()}>
              提交供给
            </button>
            <button className="btn" onClick={() => setAdding(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" disabled={busy} onClick={() => setAdding(true)}>
          <Icon.Plus size={14} />
          <span>新增成员到空间</span>
        </button>
      )}

      {sessions !== null && sessions.length > 0 && (
        <>
          <h3>活跃会话</h3>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>subject</th>
                <th>access 过期</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td className="mono">{s.subject.slice(0, 18)}…</td>
                  <td>{new Date(s.accessTokenExpiresAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
