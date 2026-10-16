import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icons";
import {
  listProvisionSpaces,
  listProvisionSessions,
  createProvisionSpace,
  decommissionProvisionSpace,
  provisionUser,
  removeProvisionUser,
  PortalAdminError,
  type ProvisionSpace,
  type ProvisionSession,
} from "../api/portal";

/**
 * 空间管理面板（ADMIN-CONSOLE-PLAN R1/R6 只读视图 + R2/R3 操作入口；
 * PORTAL-PLAN G5 起也是门户「空间总览」页的宿主——主体逻辑抽成 SpacesBoard，
 * 设置浮层与本组件各自只做薄壳）。
 *
 * 数据来源：网关反代的 /admin/provision/*。鉴权**两种模式并存**（G10 收紧后）：
 * - 部署形态：无 token，靠浏览器同源会话 cookie（网关校验 platformAdmin），
 *   fetch 默认 same-origin 自带凭据，不带 Authorization 头；
 * - 本地开发（无 Keycloak）：仍可配置 VITE_AF_PROVISION_TOKEN 走 Bearer 直通。
 *   token 从「唯一路径」降级为「逃生舱」，不再烧进公开 bundle 依赖链。
 * agent 未部署且无 cookie 时以 502/401 呈现「管理面不可用」，不再整面板替换。
 *
 * 展示口径：空间卡片（健康/账号数/成员映射）+ 活跃会话；写动作（新建/下线
 * 空间、供给/移除成员）直发 agent，结果以重读为准，不做本地乐观改写
 * （与 MembersPane 同规矩）。
 */
export type Toast = (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;

/** 把 agent 调用失败翻译成可读文案；401/403 明确指向「缺管理员会话」，
    502 明确指向「agent 未部署」。PortalAdminError 已经携带可读 message，
    这里只补两类需要换语境的成因（数据面 vs 会话面）。 */
function adminErrorText(error: unknown): string {
  if (error instanceof PortalAdminError) {
    if (error.status === 502) return "供给代理（provision-agent）不可达——管理面未部署或 agent 离线。";
    return error.message;
  }
  return error instanceof Error ? error.message : "管理面不可达";
}

/**
 * 空间总览主体：空间卡片 + 新建/下线 + 成员供给/移除 + 活跃会话。
 * 设置浮层与门户管理区共用同一份数据与动作，避免两处各养一套判据漂移。
 */
export function SpacesBoard({ onToast }: { onToast: Toast }) {
  const [spaces, setSpaces] = useState<ProvisionSpace[] | null>(null);
  const [sessions, setSessions] = useState<ProvisionSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ space: "", username: "", handle: "", displayName: "" });
  const [newSpace, setNewSpace] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, sess] = await Promise.all([
        listProvisionSpaces(),
        listProvisionSessions().catch(() => null),
      ]);
      setSpaces(s);
      setError(null);
      setSessions(sess);
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

  const addUser = (form: { space: string; username: string; handle: string; displayName: string }) =>
    withBusy(async () => {
      try {
        await provisionUser({ space: form.space, username: form.username, handle: form.handle, displayName: form.displayName });
        onToast({ tone: "ok", title: "成员已供给", body: `${form.handle} → ${form.space}（账号/身份/映射三步完成）` });
        setAdding(false);
        setForm({ space: "", username: "", handle: "", displayName: "" });
        await refresh();
      } catch (e) {
        onToast({ tone: "warn", title: "供给失败", body: adminErrorText(e) });
      }
    });

  const removeUser = (subject: string, handle: string) =>
    withBusy(async () => {
      try {
        await removeProvisionUser(subject);
        onToast({ tone: "ok", title: "成员已移除", body: `${handle}：会话吊销、AF 账号停用、映射已删` });
        await refresh();
      } catch (e) {
        onToast({ tone: "warn", title: "移除失败", body: adminErrorText(e) });
      }
    });

  const createSpace = () =>
    withBusy(async () => {
      try {
        await createProvisionSpace({ space: newSpace });
        onToast({ tone: "ok", title: "空间已创建", body: `${newSpace} 已就绪；可继续为它供给成员。` });
        setCreating(false);
        setNewSpace("");
        await refresh();
      } catch (e) {
        onToast({ tone: "warn", title: "创建失败", body: adminErrorText(e) });
      }
    });

  const decommission = (space: string) =>
    withBusy(async () => {
      try {
        await decommissionProvisionSpace(space);
        onToast({ tone: "ok", title: "空间已下线", body: `${space}：容器已停、映射与成员账号已处理（卷保留）。` });
        await refresh();
      } catch (e) {
        onToast({ tone: "warn", title: "下线失败", body: adminErrorText(e) });
      }
    });

  return (
    <div className="portal__board">
      <div className="portal__boardHead">
        <span className="portal__muted">
          {spaces === null ? (error ?? "读取中…") : `${spaces.length} 个空间 · ${sessions?.length ?? "?"} 个活跃会话`}
        </span>
        <div className="portal__boardActions">
          <button className="portal__btn" onClick={() => setCreating(true)} disabled={busy}>
            <Icon.Plus size={14} />
            <span>新建空间</span>
          </button>
          <button className="portal__btn" onClick={() => void refresh()} disabled={busy}>
            <Icon.RefreshCw size={14} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {spaces === null && error !== null && <p className="portal__error" role="alert">{error}</p>}

      {creating && (
        <div className="portal__formCard">
          <strong>新建工作空间</strong>
          <p className="portal__muted portal__hint">空间名即容器/上游名（如 af）。初始成员可稍后在空间卡片里供给。</p>
          <label className="portal__field">
            空间名
            <input className="portal__input" value={newSpace} onChange={(e) => setNewSpace(e.target.value)} placeholder="af" />
          </label>
          <div className="portal__formActions">
            <button className="portal__btn portal__btn--primary" disabled={busy || !newSpace.trim()} onClick={() => void createSpace()}>
              提交创建
            </button>
            <button className="portal__btn" onClick={() => setCreating(false)}>取消</button>
          </div>
        </div>
      )}

      {spaces?.map((s) => (
        <div key={s.space} className="portal__spaceCard">
          <div className="portal__spaceHead">
            <strong className="portal__spaceName">{s.space}</strong>
            <span className="portal__statePill" data-running={s.running}>
              {s.running ? (s.bootstrapOk === true ? "运行中 · bootstrap ok" : "运行中 · 探针未过") : "已下线（卷保留）"}
            </span>
            {s.accounts !== null && <span className="portal__muted portal__small">{s.accounts} 个账号</span>}
            <span className="portal__muted portal__small portal__mono">{s.container}</span>
            {s.running && (
              <button
                className="portal__btn portal__btn--danger portal__small"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`下线空间「${s.space}」？容器将停止、成员账号与映射会被处理；卷保留但不可自动恢复。`)) return;
                  void decommission(s.space);
                }}
              >
                下线空间
              </button>
            )}
          </div>
          <table className="portal__table">
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
                  <td className="portal__mono">{m.afHandle}</td>
                  <td>
                    <button
                      className="portal__btn portal__small"
                      disabled={busy || !s.running}
                      onClick={() => {
                        if (!window.confirm(`从「${s.space}」移除 ${m.afHandle}？会话将被吊销、AF 账号停用、映射删除。`)) return;
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
                  <td colSpan={3} className="portal__muted portal__small">
                    无成员映射
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {adding ? (
        <div className="portal__formCard">
          <strong>新增成员到空间</strong>
          <label className="portal__field">
            目标空间
            <input className="portal__input" value={form.space} onChange={(e) => setForm({ ...form, space: e.target.value })} placeholder="af" />
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
          <div className="portal__formActions">
            <button className="portal__btn portal__btn--primary" disabled={busy || !form.space || !form.username || !form.handle} onClick={() => void addUser(form)}>
              提交供给
            </button>
            <button className="portal__btn" onClick={() => setAdding(false)}>取消</button>
          </div>
        </div>
      ) : (
        <button className="portal__btn" disabled={busy} onClick={() => setAdding(true)}>
          <Icon.Plus size={14} />
          <span>新增成员到空间</span>
        </button>
      )}

      {sessions !== null && sessions.length > 0 && (
        <>
          <h3 className="portal__sectionTitle">活跃会话</h3>
          <table className="portal__table">
            <thead>
              <tr>
                <th>subject</th>
                <th>access 过期</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td className="portal__mono">{s.subject.slice(0, 18)}…</td>
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

/**
 * 设置浮层里的空间面板（原 SpacesPane 出口，签名不变）。
 * G10 之前这里是「无 token = 整面板显示未部署」；G10 之后 token 只是逃生舱，
 * 部署形态靠会话 cookie，因此薄壳直接渲染同一块 SpacesBoard。
 */
export function SpacesPane({ onToast }: { onToast: Toast }) {
  return <SpacesBoard onToast={onToast} />;
}
