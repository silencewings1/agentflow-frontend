/**
 * 时间显示投影（纯展示层）。
 *
 * AF API 的所有时间字段都是 **UTC 的 ISO 8601 字符串**（`new Date(...).toISOString()`，
 * 形如 `2026-10-09T01:21:52.075Z`）。界面必须把它**转成观察者本地时间**再显示，
 * 不能直接截取字符串。
 *
 * 为什么单独立一个模块：直接对 ISO 串做 `slice(11, 16)` 会得到 UTC 的时分，
 * 在东八区表现为**整体偏差 8 小时**——一条 09:21 发生的授权变更会显示成 01:21。
 * 这类错误特别隐蔽：格式完全合法、不报任何错、单看一条也分辨不出，
 * 只有在"事件时间与操作时刻对不上"时才暴露，而那时排查方向往往会被引向业务逻辑。
 * 因此把转换收敛到一处，让"显示时间"只有一个入口。
 *
 * 与 `nodeLabels.ts` 同一取舍：这里只影响展示，不改动任何治理事实；
 * 排序、比较、审计仍以原始 UTC 值为准。
 * @module @agentflow/frontend/api/timeLabels
 */

/** 解析失败时的兜底：原样返回，绝不猜一个时间——显示错误的精确值比显示空白更危险。 */
function parse(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 完整时间（年月日时分秒，本地时区）。
 * 用于表格与事实清单中需要精确定位一条记录的场景。
 */
export function dateTimeLabel(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = parse(value);
  return date === null ? value : date.toLocaleString("zh-CN", { hour12: false });
}

/**
 * 只到日期（本地时区）。
 * 用于"冻结于 / 创建于"这类只需要天级粒度的场合。
 */
export function dateOnlyLabel(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = parse(value);
  if (date === null) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 只到时分（本地时区）。
 * 用于同一会话内的密集时间线（如授权变更记录）——这里日期由分组标题承载，
 * 逐行重复年月日反而会淹没真正要看的"先后顺序"。
 */
export function timeOnlyLabel(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = parse(value);
  if (date === null) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
