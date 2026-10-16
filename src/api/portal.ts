/**
 * 门户层的网关直连调用（PORTAL-PLAN G4/G5）。
 *
 * 与 AF API（/api/af/v1，走 api/client.ts）刻意分开：
 * - `/oidc/me` 是**网关**端点，不在 AF API 路径下，返回的也不是 AfResponse
 *   包裹（直接返回 { subject, handle, platformAdmin }），套进 client.ts 的
 *   request<T> 会把「未认证 401」误当异常体系处理——门户的分流恰恰需要
 *   把 401 读成「未登录」这个**事实**而不是错误。
 * - `/admin/provision/*` 是网关反代（G10 已收紧为会话 cookie + platformAdmin，
 *   Bearer 直通仅留给脚本），浏览器语义下靠同源 cookie，fetch 默认
 *   same-origin 自带凭据，**不再带 Authorization 头**——token 不进 bundle。
 *
 * 401 的整页跳转语义在这里只对 /oidc/me 提供「显式返回 null」的形态：
 * 调用方（Portal）先经 AF API 的 /accounts 确认已登录，此时 /oidc/me 若仍
 * 401 属于「不该发生」的态，静默按未知处理即可，不该把用户甩去登录页。
 */

/** GET /oidc/me 的返回（网关 G1 契约：未认证 401 JSON；认证 200）。 */
export type PortalMe = { subject: string; handle: string | null; platformAdmin: boolean };

/** 网关反代的统一信封（与 provision-agent 的 { ok, data } 同构）。 */
type AdminEnvelope<T> = { ok: true; data: T } | { ok: false; error?: { message?: string } };

/**
 * GET /oidc/me。
 * @returns 已认证 → 身份快照；401（未登录）→ null；其余异常向上抛。
 */
export async function fetchPortalMe(): Promise<PortalMe | null> {
  const res = await fetch("/oidc/me", { headers: { accept: "application/json" } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`身份查询失败（HTTP ${res.status}）`);
  return (await res.json()) as PortalMe;
}

/** 管理面调用失败的两种专属形态：会话层（需要管理员登录）与业务层。 */
export class PortalAdminError extends Error {
  readonly status: number;
  /** true = 401/403：缺平台管理员会话，文案必须明确指向这一点而不是笼统报错。 */
  readonly authDenied: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PortalAdminError";
    this.status = status;
    this.authDenied = status === 401 || status === 403;
  }
}

/**
 * 编译期注入的管理 token（本地开发无 Keycloak 的逃生舱）。非空时随请求带
 * Authorization: Bearer 直通（网关对 Bearer 保持现状转发，agent 侧自验）；
 * 空 = 部署形态，靠同源会话 cookie（fetch 默认 same-origin 自带凭据），
 * **不**带 Authorization——token 不再是 bundle 的唯一依赖路径（G10）。
 */
const PROVISION_TOKEN = (import.meta.env.VITE_AF_PROVISION_TOKEN as string | undefined) || "";

/**
 * 管理面 fetch（同源 cookie 通道；配置了 token 时退回 Bearer 直通）。
 *
 * 502 是网关「provision-agent 不可达/未部署」的语义（反代上游连接失败），
 * 与 401/403 的「没有管理员会话」呈现完全不同，必须分开说清。
 */
async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      ...(PROVISION_TOKEN ? { authorization: `Bearer ${PROVISION_TOKEN}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new PortalAdminError(res.status, "需要平台管理员会话（当前身份无平台管理权限或登录已过期）");
  }
  let body: AdminEnvelope<T> | null = null;
  try {
    body = (await res.json()) as AdminEnvelope<T>;
  } catch {
    // 502 plain text（"provision agent unavailable"）等非 JSON 响应走这里。
  }
  if (!res.ok) {
    throw new PortalAdminError(res.status, body && !body.ok && body.error?.message ? body.error.message : `管理面请求失败（HTTP ${res.status}）`);
  }
  if (body && body.ok) return body.data;
  throw new PortalAdminError(res.status, body && !body.ok && body.error?.message ? body.error.message : "管理面返回了无法解析的响应");
}

/** 空间视图：provision-agent GET /admin/provision/spaces 的行（SpaceView 同构）。 */
export type ProvisionSpace = {
  space: string;
  container: string;
  running: boolean;
  bootstrapOk: boolean | null;
  accounts: number | null;
  members: Array<{ subject: string; afHandle: string; displayName?: string }>;
};

/** 会话行：GET /admin/provision/sessions 的行（网关 sessions 清单投影）。 */
export type ProvisionSession = { sessionId: string; subject: string; accessTokenExpiresAt: number };

/** Keycloak 用户安全投影：GET /admin/provision/kc-users/{username} 的 user。 */
export type KcUserView = {
  id: string;
  username: string;
  enabled: boolean;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  createdTimestamp: number | null;
};

/** POST /admin/provision/users 入参（agent G2 契约，platformAdmin 可选）。 */
export type ProvisionUserInput = {
  space: string;
  subject?: string;
  username: string;
  handle: string;
  displayName: string;
  password?: string;
  platformAdmin?: boolean;
};

export function listProvisionSpaces(): Promise<ProvisionSpace[]> {
  return adminFetch<{ spaces: ProvisionSpace[] }>("/admin/provision/spaces").then((d) => d.spaces);
}

export function listProvisionSessions(): Promise<ProvisionSession[]> {
  return adminFetch<{ sessions: ProvisionSession[] }>("/admin/provision/sessions").then((d) => d.sessions);
}

/** 新建空间（agent 侧补建 owner 映射；owner 三元组允许为空 = 仅建空间）。 */
export function createProvisionSpace(input: { space: string; ownerHandle?: string; ownerDisplayName?: string; ownerUsername?: string }): Promise<Record<string, unknown>> {
  return adminFetch<Record<string, unknown>>("/admin/provision/spaces", { method: "POST", body: JSON.stringify(input) });
}

/** 下线空间（卷保留，不可逆：调用方必须先过二次确认）。 */
export function decommissionProvisionSpace(space: string): Promise<Record<string, unknown>> {
  return adminFetch<Record<string, unknown>>(`/admin/provision/spaces/${encodeURIComponent(space)}/decommission`, { method: "POST" });
}

export function provisionUser(input: ProvisionUserInput): Promise<Record<string, unknown>> {
  return adminFetch<Record<string, unknown>>("/admin/provision/users", { method: "POST", body: JSON.stringify(input) });
}

export function removeProvisionUser(subject: string): Promise<Record<string, unknown>> {
  return adminFetch<Record<string, unknown>>(`/admin/provision/users/${encodeURIComponent(subject)}`, { method: "DELETE" });
}

export function getKcUser(username: string): Promise<KcUserView> {
  return adminFetch<{ user: KcUserView }>(`/admin/provision/kc-users/${encodeURIComponent(username)}`).then((d) => d.user);
}

export function setKcUserEnabled(username: string, enable: boolean): Promise<{ username: string; enabled: boolean }> {
  return adminFetch<{ username: string; enabled: boolean }>(`/admin/provision/kc-users/${encodeURIComponent(username)}/${enable ? "enable" : "disable"}`, { method: "POST" });
}

export function revokeProvisionSession(sessionId: string): Promise<Record<string, unknown>> {
  return adminFetch<Record<string, unknown>>(`/admin/provision/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}
