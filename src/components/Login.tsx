import { useMemo, useState } from "react";
import { Icon, type IconName } from "./Icons";
import {
  ACCOUNT_ROLE_LABEL,
  ACCOUNT_ROLE_ORDER,
  type AccountDto,
  type ActorDto,
  type DirectoryHealthDto,
} from "../api";

/**
 * 登录页：选择账户即登录。
 *
 * 设计主张：**权限不是围栏，是责任分配**。因此这一页不是一道"门槛"，而是
 * 一次明确的责任交接 —— 每个可选项都写清它负责什么，登录后该账户的节点授权
 * 直接决定界面上哪些动作可用。也正因如此，页面文案要说明"不同账户对应不同的
 * 节点操作权限"，而不是暗示"以下是你可用的功能"。
 *
 * 账户目录来自服务端（GET /accounts）：内置账户、停用状态与角色都由事实源
 * 决定，前端不维护第二份名单。停用账户仍列出但不可选——它的历史授权与审计
 * 必须继续可查，这与"不可用"是两件事。
 */
export function Login({
  accounts,
  loading,
  error,
  retryable,
  onLogin,
  onRetry,
  actor,
  directory,
}: {
  accounts: AccountDto[];
  loading: boolean;
  error: string | null;
  /** 重试是否有意义。目录不可用有两种成因，其中"部署方声明未启用"重试永远不会成功。 */
  retryable?: boolean;
  onLogin: (handle: string) => void;
  onRetry: () => void;
  /** 服务端已解析出的当前身份；停用时非 null，用于说明"你被停用了"而不是"未登录"。 */
  actor?: ActorDto | null | undefined;
  /**
   * 目录自身的健康判定（含成因与**可执行的**恢复步骤）。
   *
   * 必须传进来：`empty` 状态下没有任何账户，此时"请联系责任人先创建一个"是一条
   * 做不到的指引（责任人也是账户，同样不存在）；而两种成因处置完全不同——
   * 存储被改坏要找备份，尚未播种只需等。后端已经在 `${directory.reason}` 里
   * 写好了具体步骤，登录页却没有读它，等于把最有用的那句话丢了。
   */
  directory?: DirectoryHealthDto | null | undefined;
}) {
  const [selectedHandle, setSelectedHandle] = useState<string>("");

  /* 只允许登录在职账户：停用的账户在服务端写路径会被拒，
     在登录页就把它们标成不可选，比让人登录后再撞 403 更诚实。 */
  const selectable = useMemo(() => accounts.filter((account) => account.state === "active"), [accounts]);

  /* 目录不健康（empty / no-manager）时，下方那句提示必须换成后端给出的成因与
     恢复步骤——见 props 里 directory 的说明。 */
  const directoryUnhealthy = directory !== undefined && directory !== null && !directory.healthy;
  const selected = selectable.find((account) => account.handle === selectedHandle);

  const grouped = ACCOUNT_ROLE_ORDER.map((role) => ({
    role,
    rows: selectable.filter((account) => account.role === role),
  })).filter((group) => group.rows.length > 0);

  const suspended = accounts.filter((account) => account.state === "suspended");

  /* 「另有」的名单必须**排除当前身份**。
     上方那一句已经写过「当前身份「李雯」已停用，不能登录。」，
     若这里仍把她算进名单，就会得到：

         当前身份「李雯」已停用，不能登录。…
         另有 6 个账户已停用（李雯、王勖、…）

     两个问题叠在一起：措辞上「另有」指的是"除已提到的之外"，
     而她正是已提到的那个，语义自相矛盾；计数上"另有 6 个"实际只有 5 个。
     读者想弄清"还有谁也停用了"，第一个看到的却是自己。
     这类错误与 §七之四十八 同族：**数字与措辞断言了一个没算过的事实**。 */
  const otherSuspended = actor?.state === "suspended"
    ? suspended.filter((account) => account.accountId !== actor.accountId)
    : suspended;

  /* 账户角色 → 图标：角色决定它可被指派到哪类节点，用图标让这件事可扫视。
     这里刻意按角色而非按账户配图标，角色是责任位的属性，不是个人的装饰。 */
  const glyphOf = (role: AccountDto["role"]): IconName =>
    ({
      requirement: "Book",
      architecture: "Layers",
      development: "Pencil",
      testing: "Beaker",
      review: "Shield",
      delivery: "Cube",
      ops: "Cloud",
      orchestrator: "Nodes",
    })[role] as IconName;

  return (
    <div className="login">
      <div className="login__glow" aria-hidden />
      <div className="login__card">
        <div className="login__brand">
          <Icon.Logo size={28} className="login__logo" />
          <span className="kicker">AgentFlow</span>
        </div>
        <h1 className="serif login__title">选择登录账户</h1>
        <p className="login__sub">
          不同账户对应不同的节点操作权限。登录后可以看到该账户在每个节点上被授予的权限等级。
        </p>

        {loading && <p className="login__state">正在读取账户目录…</p>}

        {error !== null && (
          <div className="login__state" data-tone="warn" role="alert">
            <span>{error}</span>
            {/* 只在重试确实可能成功时才给按钮。
                不可重试的错误（如"本实例未启用多用户能力"）配一个"重试"按钮，
                等于让用户反复做一件注定无效的事；文案已经说了"重试不会改变结果"，
                按钮却在劝他重试，两者自相矛盾。 */}
            {retryable !== false && (
              <button className="btn btn--ghost btn--sm" onClick={onRetry}>
                重试
              </button>
            )}
          </div>
        )}

        {!loading && error === null && selectable.length === 0 && (
          <p className="login__state" data-tone="warn">
            {/* 目录不健康时用后端给出的成因与恢复步骤：那是**唯一**可执行的指引。
                只有目录健康却也没有在职账户时才退回到"联系责任人"——
                那种情形下确实存在别人可能有权限创建账户。
                原先无条件显示"请联系责任人先创建一个"，在 empty 状态下
                责任人本身就是不存在的账户，用户照做只会原地打转。 */}
            {directoryUnhealthy
              ? directory?.reason ?? "账户目录当前不可用。"
              : "账户目录中没有可用的在职账户，请联系责任人先创建一个。"}
          </p>
        )}

        {selectable.length > 0 && (
          <div className="login__accounts">
            {grouped.flatMap((group) => {
              const G = Icon[glyphOf(group.role)];
              return [
                <div key={`hd-${group.role}`} className="loginAccounts__groupHead">
                  <span className="kicker">{ACCOUNT_ROLE_LABEL[group.role]}</span>
                </div>,
                ...group.rows.map((account, index) => (
                  <button
                    key={account.accountId}
                    className="loginAccount"
                    data-on={selectedHandle === account.handle ? "true" : undefined}
                    style={{ "--i": index } as React.CSSProperties}
                    onClick={() => setSelectedHandle(account.handle)}
                  >
                    <span className="loginAccount__glyph" data-tint="accent">
                      <G size={18} />
                    </span>
                    <span className="loginAccount__body">
                      <b>{account.name}</b>
                      <i className="mono">{account.handle}</i>
                      {account.duty.length > 0 && <em>{account.duty}</em>}
                    </span>
                    <span className="loginAccount__layer">
                      {ACCOUNT_ROLE_LABEL[account.role]}
                    </span>
                  </button>
                )),
              ];
            })}
          </div>
        )}

        {actor?.state === "suspended" && (
          <p className="login__state" data-tone="warn" role="alert">
            <span>
              当前身份「{actor.name}」已停用，不能登录。
              历史授权与审计仍然保留，需要管理者恢复后才能继续。
            </span>
          </p>
        )}

        {otherSuspended.length > 0 && (
          <p className="login__foot login__foot--suspended">
            {/* 名单纯为「另有」时要说明它是"除当前身份之外"；否则当停用者只有自己时，
                这段会整块消失（正确——没有"另有"），而若有别人则计数必须对得上。 */}
            另有 {otherSuspended.length} 个账户已停用（
            {otherSuspended.map((account) => account.name).join("、")}
            ），其历史授权与审计仍可查询，但不能登录。
          </p>
        )}

        <button
          className="btn btn--accent login__btn"
          disabled={!selected}
          onClick={() => selected && onLogin(selected.handle)}
        >
          <Icon.Sparkle size={14} />
          登录
          {selected && ` · ${selected.name}`}
        </button>

        <p className="login__foot">
          登录后可在左下角退出当前账户，或在「成员与权限」中查看全部账户与节点授权矩阵。
        </p>
      </div>
    </div>
  );
}
