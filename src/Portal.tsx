import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import "./App.css";
import { afApi, AfApiError, errorText, type AccountsDto, type TaskSummaryDto, type NodeGrantDto } from "./api";
import { fetchPortalMe, type PortalMe } from "./api/portal";
import { SpacesBoard } from "./components/SpacesPane";
import { UsersLifecycle, SessionsPage } from "./components/PortalAdmin";
import { Toasts, type Toast } from "./components/Toasts";

/**
 * 管理区渲染错误边界：React 19 下未捕获的渲染错误会卸载整棵根节点——
 * 表现是「页面空白，点什么都没反应」（G9 上线实测反馈）。管理页的数据是
 * 异步拉取的第三方形状，边界把崩溃圈在单个页签内：其它页签与工作台仍可用，
 * 且错误本身有出口（重载本页签），而不是整个门户静默死掉。
 */
class SectionBoundary extends Component<{ section: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[portal] section ${this.props.section} crashed`, error, info.componentStack);
  }
  render() {
    if (this.state.error !== null) {
      return (
        <div className="portal__error" role="alert">
          「{this.props.section}」页渲染出错：{this.state.error.message}
          <button className="portal__btn portal__small" onClick={() => this.setState({ error: null })}>重载本页</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 门户视图（PORTAL-PLAN G4/G5/§3.2）：登录后的默认落点。
 *
 * 分层口径（R1）：普通用户看「工作台」——我的任务（责任位过滤 v1：任务
 * workflowId 的任一节点持 grant 即可见）+ 点入 /console 工位；持 platform-admin
 * 的用户额外可见「平台管理」区（空间总览 / 用户生命周期 / 会话）。
 *
 * 登录态判定不走壳（App.tsx 只做 pathname 路由）：
 * 1) GET /accounts（AF API，client.ts）——401 时该通道**整页跳登录**并带回
 *    return_to（当前路径），门户只需渲染「跳转登录中」占位（P7 判据）；
 *    403（实例未启用多用户或映射被删）→ 显式降级界面，不报错白屏（P5 口径）；
 * 2) GET /oidc/me（网关）——platformAdmin 分流判据；accounts 已通过时它
 *    401 属「不该发生」，静默按未知身份处理，不与通道 1 双跳竞争。
 *
 * 「全部任务」开关：仅 canManageAccounts（容器内责任位事实）或 platformAdmin
 * （网关身份层事实）可见。门户分流只认后者；容器内权限如实呈现，不额外推断。
 */

/* 任务状态 → 中文标签。与 Console.tsx 的 govBar 同一语义集；门户独立成页，
   复制这份小映射比从 Console 反向抽公共层更稳（Console 拆分最小化原则）。 */
const taskStateLabels: Record<string, string> = {
  created: "任务壳",
  draft: "草稿",
  planning: "规划中",
  awaiting_plan_approval: "等待计划审批",
  ready: "已就绪",
  queued: "排队中",
  running: "执行中",
  blocked_unavailable: "能力不可用",
  needs_reconcile: "等待对账",
  compiler_rejected: "编译拒绝",
  stale: "已过期",
  awaiting_human: "等待人工",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function taskStateLabel(value: string): string {
  return taskStateLabels[value] ?? value;
}

/* 状态语气：pass/失败/受阻三色与 Console 的 taskStatusTone 同语义。 */
function taskStateTone(value: string): string {
  if (value === "completed") return "completed";
  if (value === "failed" || value === "compiler_rejected" || value === "cancelled") return "failed";
  if (value === "awaiting_human" || value === "blocked_unavailable" || value === "needs_reconcile") return "warn";
  if (value === "running" || value === "queued" || value === "planning") return "running";
  return "draft";
}

/* 更新时间 → 相对时间。与 Console.tsx 的 relativeTimeLabel 同逻辑复制：
   门户每 30 秒重算一次即可（工作台不是实时监控面，列表级精度足够）。 */
function relativeTimeLabel(iso: string, nowMs: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "未知";
  const seconds = Math.max(0, Math.round((nowMs - at) / 1000));
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; code: string | undefined; message: string; retryable: boolean };

type PortalSection = "home" | "spaces" | "users" | "sessions";

/** 会话内轮询间隔：列表「刚刚/x 分钟前」的刷新节奏。 */
const PORTAL_REFRESH_MS = 30_000;

export default function Portal() {
  /* 顶部切换：platformAdmin 才有管理区；普通用户锁在 home。 */
  const [section, setSection] = useState<PortalSection>("home");
  const [accounts, setAccounts] = useState<Load<AccountsDto>>({ status: "loading" });
  const [tasks, setTasks] = useState<Load<TaskSummaryDto[]>>({ status: "loading" });
  const [me, setMe] = useState<PortalMe | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /* nowMs 只用于相对时间标注的随轮询刷新；独立于数据 state，避免列表重排。 */
  const [nowMs, setNowMs] = useState(() => Date.now());

  /* 门户轻提示：与 Console 的 Toasts 组件同源复用（同一样式系统），
     管理页写动作的成功/失败经这里出账，不再用 alert 打断。 */
  const pushToast = useCallback((t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => {
    const id = `p${++portalToastSeq}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3600);
  }, []);

  const loadAccounts = useCallback(async () => {
    setAccounts({ status: "loading" });
    try {
      setAccounts({ status: "ready", data: await afApi.getAccounts() });
    } catch (error: unknown) {
      const apiError = error instanceof AfApiError ? error : undefined;
      /* 401 已由 client 整页跳 /oidc/login（return_to=当前路径）；这里渲染
         占位的窗口极短。403 = 映射被删/实例未启用多用户 → 显式降级界面。 */
      setAccounts({
        status: "error",
        code: apiError?.code,
        message: errorText(apiError?.code, apiError?.message, apiError?.details),
        retryable: apiError?.status !== 403,
      });
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasks({ status: "loading" });
    try {
      setTasks({ status: "ready", data: await afApi.listTasks() });
    } catch (error: unknown) {
      const apiError = error instanceof AfApiError ? error : undefined;
      setTasks({ status: "error", code: apiError?.code, message: errorText(apiError?.code, apiError?.message), retryable: apiError?.status !== 403 });
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadTasks();
    /* /oidc/me 静默兜底：accounts 已通过后 401 属不该发生，按未知身份处理。 */
    void fetchPortalMe().then(setMe).catch(() => setMe(null));
  }, [loadAccounts, loadTasks]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), PORTAL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  /* 我的任务过滤（v1 责任位口径，PORTAL-PLAN §3.3）：
     task.workflowId 的编排里**任一节点**被当前 actor 持 grant（source
     owner/role 均算、perm 任意档——view 是最低档，「持 grant 即 ≥ view」恒真）
     即可见。关联键是 workflowId：grants 行与任务都带它，直接交集；accountId
     以 accounts.actor.accountId 关联（匿名/未登录时为 null，一票不可见）。 */
  const visibleTasks = useMemo(() => {
    const data = tasks.status === "ready" ? tasks.data : [];
    const acc = accounts.status === "ready" ? accounts.data : null;
    if (!acc || acc.actor.anonymous || acc.actor.accountId === null) return [];
    const accountId = acc.actor.accountId;
    const granted = new Set<string>();
    for (const grant of acc.grants as NodeGrantDto[]) {
      if (grant.accountId === accountId) granted.add(grant.workflowId);
    }
    return data.filter((task) => granted.has(task.workflowId));
  }, [tasks, accounts]);

  /* 「全部任务」开关的呈现权：两个独立事实源任一为真即可——canManageAccounts
     是容器内责任位事实（可能因实例形态而缺），platformAdmin 是网关身份层
     事实（门户分流判据）。两者都不为真时开关整个不渲染。 */
  const canSeeAll = useMemo(() => {
    const acc = accounts.status === "ready" ? accounts.data : null;
    return (acc?.actor.canManageAccounts === true || me?.platformAdmin === true) && !(acc?.actor.anonymous ?? true);
  }, [accounts, me]);

  const actor = accounts.status === "ready" ? accounts.data.actor : null;
  /* 顶栏身份优先用网关身份层（handle 与登录态同源）；容器内 name 作补充。 */
  const identityLabel = me?.handle ?? actor?.handle ?? actor?.name ?? null;

  /* 列表按开关渲染；「与我相关」的边界必须如实标注为责任位可见，不做 assignee 假象。 */
  const shownTasks = showAll && canSeeAll ? (tasks.status === "ready" ? tasks.data : []) : visibleTasks;

  if (accounts.status === "loading" || (accounts.status === "error" && tasks.status === "loading")) {
    return (
      <div className="portal">
        <p className="portal__checking">正在确认当前身份…</p>
      </div>
    );
  }

  /* 401 已被 client 整页跳登录（AF_UNAUTHENTICATED）；这一帧只是跳转发生前的
     占位。用**错误码**判定而不是文案匹配——文案归 errorText 管，会随文案更新漂移。 */
  if (accounts.status === "error" && accounts.code === "AF_UNAUTHENTICATED") {
    return (
      <div className="portal">
        <p className="portal__checking">正在跳转登录…</p>
      </div>
    );
  }

  /* 403：无映射（映射被删/空间下线）或实例未启用多用户 → 显式降级界面。
     不报错白屏（P5 口径）：这是可解释的「身份未接入」，不是故障。 */
  if (accounts.status === "error" && !accounts.retryable) {
    return (
      <div className="portal">
        <div className="portal__degraded">
          <h1>当前身份未接入任何工作空间</h1>
          <p>
            平台侧没有当前身份到工作空间的映射（可能所在空间已下线，或尚未开通）。
            任务与治理操作都发生在工作空间内部，因此这里暂时无可展示的内容。
          </p>
          <p className="portal__muted portal__small">{accounts.message}</p>
          <div className="portal__formActions">
            <button className="portal__btn" onClick={() => void loadAccounts()}>重试</button>
            <a className="portal__btn" href="/logout">登出</a>
          </div>
        </div>
      </div>
    );
  }

  const platformAdmin = me?.platformAdmin === true;
  const sections: Array<{ id: PortalSection; label: string; adminOnly?: boolean }> = [
    { id: "home", label: "工作台" },
    { id: "spaces", label: "空间总览", adminOnly: true },
    { id: "users", label: "用户生命周期", adminOnly: true },
    { id: "sessions", label: "会话", adminOnly: true },
  ];

  return (
    <div className="portal">
      <header className="portal__topbar">
        <div className="portal__brand">
          <strong className="portal__brandName">AgentFlow 门户</strong>
          {identityLabel && <span className="portal__muted portal__small">{identityLabel}</span>}
          {platformAdmin && <span className="portal__statePill" data-running="true">平台管理员</span>}
        </div>
        <nav className="portal__tabs">
          {sections.filter((s) => !s.adminOnly || platformAdmin).map((s) => (
            <button
              key={s.id}
              className="portal__tab"
              data-active={section === s.id}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="portal__topActions">
          <a className="portal__btn portal__small" href="/logout">登出</a>
        </div>
      </header>

      <main className="portal__main">
        {section === "home" && (
          <>
            {/* 我的空间：进入 AgentFlow 工作台的显式入口（G9 用户实测反馈：
               只有任务列表时，用户不知道「去哪个平台干活」的入口在哪）。
               工作台本身是用户映射所指向的那个容器（一人一空间的容器即其
               私有开发空间）；「我的空间」名 v1 门户不可知（空间是部署层
               概念，/api/af/v1 无此字段），管理员可从空间总览页签读出。 */}
            <div className="portal__spaceBar">
              <div className="portal__spaceInfo">
                <span className="portal__spaceLabel">我的开发空间</span>
                <span className="portal__muted portal__small">
                  {me?.handle
                    ? `${me.handle} · 独立容器（隔离单元：容器 = 工作空间）`
                    : "独立容器（隔离单元：容器 = 工作空间）"}
                </span>
              </div>
              <a className="portal__btn portal__enter" href="/console">
                进入 AgentFlow 工作台 →
              </a>
            </div>
            <div className="portal__listHead">
              <h2 className="portal__sectionTitle">{showAll ? "全部任务" : "我的任务"}</h2>
              <div className="portal__boardActions">
                {canSeeAll && (
                  <label className="portal__field--check">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                    全部任务（不受责任位过滤）
                  </label>
                )}
                <button className="portal__btn portal__small" onClick={() => void loadTasks()}>刷新</button>
              </div>
            </div>
            {!showAll && shownTasks.length > 0 && (
              <p className="portal__muted portal__hint">
                口径：与我相关 = 我持有的责任位（所在空间的节点授权）覆盖的编排上有活动的任务；不含指派语义（v1 无 assignee）。
              </p>
            )}
            {tasks.status === "loading" && <p className="portal__muted">读取任务列表…</p>}
            {tasks.status === "error" && (
              <p className="portal__error" role="alert">
                {tasks.message} {tasks.retryable && <button className="portal__btn portal__small" onClick={() => void loadTasks()}>重试</button>}
              </p>
            )}
            {tasks.status === "ready" && shownTasks.length === 0 && (
              /* 空态必须可执行（AGENTS.md §4.3 同款判据）：只说"没有任务"让人
                 不知道该做什么——把「为什么可能为空」的两种成因与对应动作写明：
                 没有任务（等任务创建/找有权限的人建）vs 有任务但责任位未覆盖
                 （找空间管理员在成员面板申请节点授权）。 */
              <div className="portal__empty">
                <p className="portal__emptyTitle">
                  {showAll ? "当前没有任务。" : "「与我相关」暂时没有任务"}
                </p>
                <p className="portal__muted">
                  {showAll
                    ? "工作空间里还没有任何任务。任务由持有编排入口责任位的成员创建（控制台 → 新建任务）。"
                    : "两种可能：① 工作空间里还没有任务——由持有入口责任位的成员在控制台创建后，这里就会出现；② 已有任务但你未持有其编排上任何节点的授权——联系空间管理员，在控制台的「设置 → 成员」里为你授权对应责任位（view 及以上即可见）。"}
                </p>
                <p className="portal__muted portal__small">
                  判定口径：与我相关 = 我持有的责任位（所在空间的节点授权）覆盖的编排上有活动的任务；不含指派语义（v1 无 assignee）。
                </p>
              </div>
            )}
            {shownTasks.map((task) => (
              <button
                key={task.taskId}
                className="portal__taskRow"
                onClick={() => {
                  /* 进入工位：Console 挂载时消费 ?task= 并清参数（Console.tsx）。 */
                  window.location.href = `/console?task=${encodeURIComponent(task.taskId)}`;
                }}
              >
                <span className="portal__taskTitle">{task.title}</span>
                <span className="portal__statePill" data-running={taskStateTone(task.state) === "running"} data-tone={taskStateTone(task.state)}>
                  {taskStateLabel(task.state)}
                </span>
                <span className="portal__muted portal__small portal__mono">{task.workflowId}</span>
                <span className="portal__muted portal__small portal__taskTime">更新于 {relativeTimeLabel(task.updatedAt, nowMs)}</span>
              </button>
            ))}
          </>
        )}
        {section === "spaces" && <SectionBoundary section="空间总览"><SpacesBoard onToast={pushToast} /></SectionBoundary>}
        {section === "users" && <SectionBoundary section="用户生命周期"><UsersLifecycle onToast={pushToast} /></SectionBoundary>}
        {section === "sessions" && <SectionBoundary section="会话"><SessionsPage onToast={pushToast} /></SectionBoundary>}
      </main>

      <Toasts items={toasts} />
    </div>
  );
}

/* 门户 toast 序号：与 Console 的 toastSeq 各自独立计数，互不影响。 */
let portalToastSeq = 0;
