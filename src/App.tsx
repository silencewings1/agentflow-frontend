import type { ReactElement } from "react";
import Portal from "./Portal";
import Console from "./Console";

/**
 * 应用外壳：按 pathname 分支到门户或控制台（PORTAL-PLAN G3/§3.2）。
 *
 * 为什么不用 react-router：只有两个视图且都由网关同源托管（SPA fallback
 * 保证 /portal、/console 直访都能拿到 index.html），一个 location.pathname
 * 判断就够；引入路由库反而让「登录态两视图各自拉取」的约定多出一层概念。
 *
 * 登录态不在壳里预检：Console 维持现状（自己拉 accounts 判断，未登录渲染
 * 内嵌登录页），Portal 也自行经 AF API + /oidc/me 判定——壳只负责路由，
 * 不持有任何状态。`?task=` 深链由 Console 挂载时自行消费（见 Console.tsx）。
 *
 * 说明：Console.tsx 里保留的是 `export default`（拆分最小化，组件内部
 * 一概未动），这里用具名导入对齐。两个分支互斥渲染，切换 = 整页跳转
 * （Portal 点任务走 location.href），不存在同 SPA 内热切换的路由需求。
 */
function App(): ReactElement {
  const path = window.location.pathname;
  if (path === "/" || path === "/portal" || path.startsWith("/portal/")) {
    return <Portal />;
  }
  return <Console />;
}

export default App;
