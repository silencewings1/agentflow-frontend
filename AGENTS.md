# AGENTS.md — AgentFlow 设计与协作约定

本文件是 AgentFlow 仓库的**唯一设计契约**。任何人（含 AI 智能体）在改动本仓库前必须先读完本文件，并在改动中遵守其约定。它记录三类内容：

1. **产品的设计思想** —— 为什么界面长这样、每个信息块存在的理由；
2. **工程与视觉约定** —— 令牌、CSS 模式、状态表达方式、命名规则；
3. **协作流程** —— 验证方式、提交节奏、允许与禁止的操作。

如果一次改动与本文件冲突，正确做法是**先修改本文件并说明理由**，而不是在代码里悄悄破例。

---

## 一、项目定位

AgentFlow 是一个**智能体研发控制台**的前端实现，形态接近 Codex / Claude Code 的会话式界面，但要表达的不是「一个更好的对话框」，而是一套**可信协同**的研发工作流。

- 纯前端单页应用，**没有后端**。所有数据来自 `src/data/*.ts` 中的静态领域模型，交互通过 `setTimeout` 模拟流式与推进。
- 定位是**设计与思想的可交互载体**：它要把「AI 参与研发」从「单点辅助」推进到「可信协同」这件事，用界面讲清楚。
- 因此：**任何界面元素都必须承载一个设计主张**。纯装饰、纯炫技、没有语义的区块不应存在。

技术栈：

| 项 | 选择 |
| --- | --- |
| 构建 | Vite 8 |
| 框架 | React 19（函数组件 + Hooks，无状态库） |
| 语言 | TypeScript ~6.0，`strict` |
| 样式 | 原生 CSS + CSS 自定义属性，**不使用** CSS-in-JS / Tailwind / UI 库 |
| 图标 | `src/components/Icons.tsx` 手写内联 SVG，**不引入图标库** |
| Lint | oxlint（`.oxlintrc.json`） |
| 动画 | 原生 CSS `@keyframes` / `transition` 优先；`motion` 已在依赖中但当前未被使用，新增动效不要贸然引入 |

---

## 二、命令与验证

```bash
npm run dev      # 开发服务器（端口被占用时会自动上移，如 5175）
npm run build    # tsc -b && vite build，提交前必须通过
npm run lint     # oxlint
npm run preview  # 预览产物

npx tsc --noEmit -p tsconfig.app.json   # 只做类型检查，改动中最快的反馈
```

**验证纪律**：

- 改动 `.tsx` / `.ts` 后，先跑 `npx tsc --noEmit -p tsconfig.app.json`。
- 提交前必须跑一次 `npm run build` 并确认成功。
- 新增 CSS 后，**必须确认所用的每个 `var(--token)` 真实存在**。历史上出现过 `--surface-1` / `--line-2` 被直接使用但从未定义的问题（表现为静默降级、主题切换时错位）。核对方式：在 `src/index.css` 中搜索令牌名。
- 令牌缺失时的正确处理是**在两套配色中各补一个符合梯度的值**，而不是随便换成邻近令牌，也不是写 `var(--x, fallback)` 掩盖。

---

## 三、目录结构与职责边界

```
src/
├─ main.tsx                挂载入口，仅此一件事
├─ App.tsx                 唯一的状态中心：所有 useState 集中在此，向下传 props
├─ App.css                 布局骨架 + 通用原子类；顶部 @import 五个分片样式
├─ index.css               设计令牌 + reset + 排版基础（唯一的令牌来源）
├─ components/
│  ├─ Rail.tsx             最左侧图标导航栏（60px）
│  ├─ Sidebar.tsx          会话列表，按 今天 / 昨天 / 更早 分组
│  ├─ TopBar.tsx           面包屑 + 门禁轨 + 命令面板 + 检查面板开关
│  ├─ Stream.tsx           事件流渲染器：按 AgentEvent.kind 分派
│  ├─ Composer.tsx         输入区
│  ├─ Inspector.tsx        右侧检查面板：文件/改动/证据链/回放/终端/沙箱
│  ├─ Settings.tsx         设置覆盖层：总体架构/智能体/连接层/环境配置
│  ├─ NewTask.tsx          新建任务三步悬浮窗：任务目标 → 任务契约 → 工作流编排
│  ├─ Workflow.tsx         DAG 画布、编排配置面板、会话进度条
│  ├─ Palette.tsx          ⌘K 命令面板
│  ├─ Welcome.tsx          空态
│  ├─ Toasts.tsx           轻提示
│  └─ Icons.tsx            内联 SVG 图标集 + IconName 类型 + iconByKey 映射
├─ data/
│  ├─ mock.ts              会话列表 + AgentEvent 事件联合类型 + 演示对话
│  ├─ settings.ts          第二章领域模型（五层架构/契约/智能体/连接/门禁/证据/回放/环境）
│  └─ workflows.ts         DAG 数据模型、布局计算、六套内置编排、不可变编辑函数
└─ styles/
   ├─ stream.css           事件流通用卡片
   ├─ panels.css           检查面板、悬浮层
   ├─ settings.css         设置各面板
   ├─ workflow.css         DAG 与编排
   └─ trust.css            可信协同专属样式（契约/门禁/证据链/回放/门禁轨/五层架构）
```

**边界规则**：

- **状态只放在 `App.tsx`**。子组件不持有跨组件状态；纯本地的 UI 开关（展开/折叠、局部筛选）可以自己持有。
- **数据与视图分离**。所有文案、阈值、清单、角色、层级都写进 `src/data/*.ts`，组件只做渲染与派发。判断逻辑（如「有几条必需证据未闭环」）可以在组件里算，但**输入必须来自数据层**。
- **样式按语义分片**。可信协同相关的一切新样式进 `trust.css`；不要往 `App.css` 堆业务样式，`App.css` 只放骨架与原子类。
- **令牌只在 `index.css` 定义**，其他文件只消费。

---

## 四、核心设计思想：五层可信协同

这是整个产品的立论。它来自一个判断：

> 单点辅助的问题不在模型能力，而在**缺少承接结构**：结论无从核验、责任无从界定。

因此界面的组织方式不是「功能菜单」，而是**把「谁判断、谁核验、谁负责」拆开**，让 AI 的产出必须穿过确定性验证与人工决策才能落地。

### 4.1 五层架构与责任主体

数据源：`src/data/settings.ts` → `archLayers`；界面载体：`Settings.tsx` → `ArchPane`（导航项「总体架构」）。

| 层 | 名称 | 职责 | 责任主体 |
| --- | --- | --- | --- |
| L1 | 业务研发层 | 承载需求、设计、开发、测试、交付、运行等正式研发活动 | 平台 |
| L2 | 智能执行层 | 理解任务、拆分步骤、调度专业智能体、汇总交付物 | AI |
| L3 | 受控连接层 | 访问外部系统，并检查身份、权限与调用参数 | 确定性程序 |
| L4 | 质量验证层 | 编译、测试、覆盖率、安全扫描、独立审查 | 确定性程序 |
| L5 | 人工检查层 | 需求确认、高风险方案、代码合并、生产发布 | 人工 |

`ArchLayer.owner` 是这套设计里**最重要的一个字段**，它把责任边界编码成了数据而非文案。对应的 `ownerNote` 映射写明了不可让渡的原则：

```ts
平台:        "由平台承载，是研发活动发生的地方",
AI:          "由智能体判断，输出必须可被下层核验",
确定性程序:  "由程序裁决，不接受自然语言协商",
人工:        "由人决策，AI 只能请求、不能代替",
```

**改动约束**：任何新增能力都要能回答「它属于哪一层、由谁负责」。如果一个功能让 AI 直接跨过 L3/L4 触达 L5 的结果，它违反了本设计，必须重新设计而不是加个开关绕过。

### 4.2 任务契约：唯一入口与验收基线

数据：`settings.ts` → `TaskContract` / `taskContract`；`mock.ts` → `AgentEvent` 的 `contract` 变体；界面：`NewTask.tsx` 第二步 + `Stream.tsx` → `Contract` 卡片。

契约七要素：**问题陈述** + 六类清单（改动范围 / 完成判定 / 需人工放行 / 输入资料 / 可用工具 / 交付物）。

设计要点：

- 契约是**任务的唯一入口**。新建任务必须先立契约，`ready` 判定要求 `prompt` 非空且 `scope`、`doneCriteria` 至少各一条 —— 没有范围和完成判定的任务不允许启动。
- 契约确认后作为本次运行的**第一张卡片**进入事件流（`runTurn(prompt, contract)` 把它拼在用户消息之后），从视觉上确立「后续所有节点都以它为验收基线」。
- 卡片脚注明确写出后果：「契约一经确认即作为后续每个节点的验收基线；范围之外的改动会被门禁拦截并要求补充契约。」
- 空的必填清单项以 `--gold` 边框提示（`.ctrEdit__cell[data-empty]`），而不是弹错误 —— 引导而非阻断式惩罚。

### 4.3 质量门禁：不可绕过的公开节点

数据：`settings.ts` → `GateState` / `QualityGate` / `qualityGates`（G1 需求与设计、G2 测试驱动开发、G3 集成验证、G4 交付提交）；界面：`Stream.tsx` → `Gate` 卡片 + `TopBar.tsx` → `.gateRail`。

设计要点：

- 门禁的裁决者是**确定性程序**，不是模型。`checks` 都是可测的量（`312 passed`、`91.4%`、`48/52 passed`），不是评语。
- 每道门禁都有 `independentReview`（独立审查视角）与 `fallback`（失败去哪里），失败必须有明确的回退目标。
- **门禁必须常驻可见**。`TopBar` 的 `.gateRail` 展示四道门禁的 pip 状态（passed=`--sage` / active=`--accent` + `gatePulse` 脉冲 / blocked=`--rose` / todo=虚线 0.62 透明）以及证据链就绪度，点击直达证据链视图。
- **界面不允许暗示一个不成立的推进**：**任何会造成不可逆后果的操作，在前置条件未满足时必须显式呈现受阻，而不是照常可点然后报错。**（原「开 PR」按钮的 `data-blocked` 受阻态是此规则的一个实例，该按钮已按需求移除；规则本身仍然有效，新增此类操作时照此办理。）

### 4.4 证据链：结论可回溯

数据：`settings.ts` → `EvidenceKind` / `EvidenceItem` / `evidenceChain`（ev-1 … ev-7，全部 `required`，前三条 `confirmed`）；界面：`Inspector.tsx` → `EvidencePane`。

六类证据：实际变更 / 关键工具调用 / 测试结果 / 安全扫描 / 独立审查 / 人工审批。

每条证据强制携带三元组：**出处（`source`）、版本（`version`）、责任人（`actor`）**。这三个字段是「可核验」的最小充分条件 —— 缺任何一个，结论就退化成断言。

设计要点：

- 就绪度以进度计（`.evSum__bar`，accent → sage 渐变）呈现，配 `tabular-nums` 数字，可比可读。
- `only` 筛选默认可切到「仅看未闭环」—— 面板要服务于「还差什么」这个真实问题。
- 已闭环节点为 `--sage` 实心、未闭环为 `--gold` 虚线，形态差异先于颜色差异（对色觉障碍友好）。
- 脚注说明两条机制：证据**随交接物一并传递**；定向返工只**替换被失效的证据**，不重复采集。

### 4.5 定向返工：问题回到它产生的那一层

数据：`settings.ts` → `reworkRoutes`（rw-1 … rw-5）；`mock.ts` → `rework` 事件；界面：`Settings.tsx` → `.archRoute` + `Stream.tsx` → `Rework` 卡片 + `workflows.ts` 的 `fail` 边。

| 失败原因 | 回退目标 | 处理者 |
| --- | --- | --- |
| 需求语义或验收条件需澄清 | 需求分析 + 人工确认 | 人工 |
| 架构、接口或兼容性问题 | 方案设计 | 智能体 |
| 实现、测试或代码质量问题 | 开发与测试 | 智能体 |
| 工具权限不足或外部系统异常 | 暂停调用并记录原因 | 人工 |
| 连续失败、信息不足或风险上升 | 人工接管节点 | 人工 |

核心主张：**返工是路由，不是重试**。命中回退路由时只重跑目标节点及其下游，已闭环证据不重复采集。`rework` 事件因此同时携带 `redo` 与 `keep` 两个清单 —— 说明「重做什么」的同时必须说明「保留什么」。

### 4.6 结构化任务交接

`mock.ts` → `handoff` 事件；界面：`Stream.tsx` → `Handoff` 卡片。

交接物 = `from` / `to` 角色 + 标题 + **范围 / 完成判定 / 未决问题** 三段契约字段 + 随行 `evidence` id 列表。

要点：交接不是「把消息传下去」，而是**把契约与证据一起传下去**。`open`（未决问题）字段是刻意保留的 —— 允许诚实地交接不确定性，比强行给出确定结论更可信。

### 4.7 受控连接层：权限分级与七步链路

数据：`settings.ts` → `PermTier` / `permTiers` / `connections` / `callSteps` / `connPolicies`；界面：`Settings.tsx` 连接层面板 + `Stream.tsx` → `Controlled` 卡片。

三级权限：

| 等级 | 规则 | 放行方式 |
| --- | --- | --- |
| 只读 | 查询需求、代码、测试结果，不产生写入 | 按任务范围放行 |
| 普通写入 | 建分支、回写任务状态等 | 白名单 + 参数校验 |
| 高风险写入 | 代码合并、生产发布、生产数据与权限变更 | 责任人审批 |

一次受控调用的七步：工具选择 → 身份与分级授权 → 上下文与参数校验 → 连接器执行 → 结果完整性检查 → 调用审计 → 任务状态回写。每次调用落一个 `traceId`，高风险写入额外带 `approver`。

要点：`denied` 是**一等结果**而非异常。`replaySteps` 里 `rp-6`（尝试写入生产配置 → `denied`）是刻意保留的样本 —— 界面必须能体面地展示「被拒绝」，因为这正是受控生效的证明。

### 4.8 人工检查层：从逐行读码到节点判定

`mock.ts` → `checkpoint` 事件；界面：`Stream.tsx` → `Checkpoint` 卡片。

检查点给人的是 `facts`（收敛后的判断依据，带 `ok/warn/info` 语气）+ `options`（可选决策），**不是全量代码**。设计目标写在字段注释里：「把人从逐行读码升级为节点判定」。

### 4.9 任务回放：按步查证

数据：`settings.ts` → `ReplayStep` / `replaySteps`（rp-1 … rp-10）；界面：`Inspector.tsx` → `ReplayPane`。

每一步记录：时间 / 阶段 / 执行者 / 动作 / 材料 / 权限等级 / 结果。提供进度轴（`.rpScrub` 自定义 range 拇指）+ 时间线（未到达的步骤 `opacity: .45`，当前步 accent 内嵌标记）。

结论句写在面板底部：「问题定位从**反复追问**变成**按步查证**」。这是回放存在的全部理由。

### 4.10 多智能体编排

数据：`workflows.ts` → `WfNode` / `WfEdge` / `Workflow`，六套内置编排（需求开发、单元测试、缺陷修复、存量系统逆向重构、开源漏洞整改、AI 代码审核）；`settings.ts` → `AgentRole` 八种角色 + `AgentSpec`。

要点：

- 边分三类：`flow`（流转）/ `fail`（失败回退）/ `approve`（人工审批）。**失败回退是编排的一等公民**，不是异常分支。
- 每套编排都有 `maxRetry` 与 `onExhaust`（人工接管 / 降级处理 / 终止任务）—— 重试次数耗尽后的归属必须显式声明。
- `AgentSpec.independent` 标记该智能体是否承担独立审查职责；`scope`（只读 / 逐条确认 / 自动执行）决定其权限上限。
- 编排编辑函数（`insertAfter` / `removeNode` / `setFailTarget` / `patchNode`）全部**不可变**，返回新 `Workflow`。

---

## 五、事件模型

`src/data/mock.ts` 的 `AgentEvent` 是一个**可辨识联合（discriminated union）**，以 `kind` 为判别式：

基础类：`user` / `reasoning` / `text` / `plan` / `tool` / `diff` / `approval` / `tests`
可信协同类：`contract` / `handoff` / `gate` / `rework` / `controlled` / `checkpoint`

`Stream.tsx` 的 `Event` 组件用 `switch (e.kind)` 分派到独立渲染函数，每个渲染函数签名统一为：

```tsx
function Gate({ e, style }: { e: Extract<AgentEvent, { kind: "gate" }>; style: object }) { … }
```

**新增事件类型的标准流程**：

1. 在 `AgentEvent` 联合中加一个变体，**带中文注释说明它承载什么设计主张**；
2. 在 `Stream.tsx` 的 `switch` 中加 `case`，写一个 `Extract<…>` 签名的渲染函数；
3. 样式加到 `trust.css`（可信协同类）或 `stream.css`（通用类），类名用 `.card--<kind>`；
4. 在 `conversation` 中补一条演示事件，让它在默认会话里可见 —— **不可见的能力等于不存在**。

`switch` 必须穷尽所有 `kind`，不要用 `default` 兜底，让 TypeScript 在漏分支时报错。

---

## 六、设计系统

### 6.1 双配色

两套配色，均定义在 `src/index.css`，通过 `document.documentElement.dataset.theme` 切换（`App.tsx` 的 `useEffect`）：

- **Lumen**（默认）：白底冷灰技术控制台
- **Ink**：深色冷调

切换快捷键 `⌘/Ctrl + J`。**每次新增令牌必须同时补齐两套配色**，且值要落在既有梯度上。

### 6.2 令牌清单

| 类别 | 令牌 |
| --- | --- |
| 字体 | `--font-display`（Instrument Serif）`--font-ui`（Schibsted Grotesk）`--font-mono`（JetBrains Mono） |
| 字阶 | `--step--2` … `--step-5`（rem 固定阶梯） |
| 圆角 | `--r-xs` 3px / `--r-sm` 5px / `--r-md` 9px / `--r-lg` 14px / `--r-xl` 22px |
| 布局 | `--rail` 60 / `--sidebar` 272 / `--inspector` 400 / `--topbar` 52 |
| 缓动 | `--ease-out` / `--ease-spring` / `--ease-in-out` |
| 底色 | `--bg` / `--bg-deep` |
| 表面 | `--surface` → `--surface-1` → `--surface-2` → `--surface-3`（透明度递增） |
| 描边 | `--line` → `--line-2` → `--line-strong` |
| 文字 | `--text` → `--text-2` → `--text-3` → `--text-4`（对比度递减） |
| 主色 | `--accent-h: 214` / `--accent-s: 92%` 派生出 `--accent` / `--accent-soft` / `--accent-line` / `--accent-glow` / `--accent-text` |
| 语义色 | `--azure` `--cyan` `--sage` `--gold` `--plum` `--rose` |
| 阴影 | `--shadow-lift` / `--shadow-pop` / `--scrim` / `--grain-op` |

**语义色的固定含义**（不要随意换用）：

| 令牌 | 含义 |
| --- | --- |
| `--accent` | 当前进行中、可操作、系统主动作 |
| `--sage` | 通过、已闭环、成功 |
| `--gold` | 待人工介入、受阻、未闭环、需要注意（**不是错误**） |
| `--rose` | 失败、被拒绝 |
| `--cyan` | 确定性程序 / 连接层 |
| `--azure` | 业务与需求域 |
| `--plum` | 交付与合并域 |

### 6.3 CSS 约定

**所有派生色用 `color-mix(in oklab, …)`**，不要手写十六进制变体，也不要用 `opacity` 压整块内容。

```css
background: color-mix(in oklab, var(--accent) 8%, transparent);
border-color: color-mix(in oklab, var(--accent) 30%, var(--line));
```

**状态一律用 `data-*` 属性表达**，不用状态类名。React 侧直接把布尔或字符串塞进 `data-`：

```tsx
<i data-state={g.state} />
<button data-blocked={evBlocking > 0}>
```

```css
.gateRail__pip[data-state="passed"] { … }
.btn[data-blocked="true"] { … }
```

已在用的状态属性：`data-theme` `data-sidebar` `data-inspector` `data-open` `data-active` `data-ok` `data-state` `data-result` `data-tier` `data-tint` `data-blocking` `data-blocked` `data-empty` `data-human` `data-past` `data-cur` `data-mode` `data-on`。

**发丝分隔网格**：用 1px 间隙露出底色作为分隔线，而不是给每个单元格加 `border`。

```css
.grid { display: grid; gap: 1px; background: var(--line); }
.grid > * { background: var(--bg); }
```

**多色变体用 `--layer` 间接层**：不要为每个色调重复所有规则，只映射一个自定义属性，其余规则统一消费它。

```css
.archLayer[data-tint="sage"] { --layer: var(--sage); }
.archLayer__glyph { color: var(--layer, var(--accent)); }
```

**列表入场用 `--i` 错峰**：

```tsx
<li style={{ "--i": i } as CSSProperties}>
```

```css
.item { animation: fadeUp .38s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms); }
```

错峰步长控制在 35–50ms，总时长不超过约 500ms —— 它是节奏提示，不是表演。

**其他**：

- 折叠卡片：外层 `data-open`，body 用 `display: none` 切换，箭头加 `.rot180`；侧向箭头用 `.rot90`。
- 数字用 `font-variant-numeric: tabular-nums`，保证纵向可比。
- 代码、id、路径、版本号统一 `.mono` 类。
- 小标签用 `.kicker`（mono、`--step--2`、`letter-spacing: .2em`、大写、`--text-3`）。
- 标题用 `.serif` / `--font-display`；正文行宽不超过 74ch。
- 响应式断点：1180px（隐藏门禁轨附属信息）、1000px（隐藏门禁轨）、900px（架构回退路由折行）、760px（多处两列降一列）。**收窄时优先牺牲装饰与冗余标签，绝不牺牲状态与结论。**

### 6.4 交互与快捷键

| 快捷键 | 行为 |
| --- | --- |
| `⌘/Ctrl + K` | 命令面板 |
| `⌘/Ctrl + J` | 切换配色 |
| `⌘/Ctrl + \` | 切换检查面板 |
| `⌘/Ctrl + B` | 切换侧边栏 |
| `Esc` | 关闭命令面板 / 悬浮层 |

约定：

- 悬浮层结构统一为 `.scrim` + `.sheet`，`Esc` 用捕获阶段监听，内容区 `stopPropagation`。
- 多步向导用可点击的面包屑（允许回退修改），body 上加 `key={step}` 以重放入场动画。
- 模拟流式统一用 `useRef<number[]>` 收集 `setTimeout` id，并在 unmount 时全部 `clearTimeout`。
- 跨面板跳转要一次到位。示例：点门禁轨 → `setInspectorTab("evidence"); setInspectorOpen(true)`。**不要让用户自己去找**。

### 6.5 文案约定

- **界面文案全部中文**，术语与领域模型保持一致：任务契约、质量门禁、证据链、定向返工、受控连接层、人工检查点、独立审查、责任人。
- 文案要说**机制与后果**，不说营销话术。对照：
  - 差：「智能门禁，保障质量」
  - 好：「契约一经确认即作为后续每个节点的验收基线；范围之外的改动会被门禁拦截并要求补充契约。」
- 中英混排时英文/数字两侧留一个空格。
- 代码注释用中文说明**设计意图**而非重述代码。范例：`/* 门禁状态到视觉语义的映射：门禁是流程的必经节点，而非可跳过的提醒 */`
- 不使用 emoji。

---

## 七、协作流程

1. **每完成一个任务先提交代码。** 这是硬性要求。顺序固定：类型检查 → `npm run build` → `git add -A` → `git commit`。
2. **提交信息按设计主张组织，而不是按文件组织。** 正文分条说明「实现了什么设计思想、通过什么载体」，让意图留在历史里。参考 `6401061`。
3. 仓库当前只有本地 `master`，无远端，不要擅自添加 remote 或 push。
4. 改动数据层时，同步检查所有消费方的类型（如给 `tint` 联合加成员前，先确认 CSS 是否已有对应映射；反之写 CSS 前先读联合的真实成员 —— 曾出现 CSS 写了 `plum` 但类型里没有的问题）。
5. 用批量脚本改 CSS 时注意 `--` 前缀会被 perl 之类解析为运算符，优先用精确的查找替换而不是正则脚本。

---

## 八、明确的禁止事项

- 不引入 UI 组件库、图标库、CSS 框架、状态管理库。
- 不引入后端、真实网络请求、真实凭据。
- 不在 `index.css` 之外定义设计令牌；不硬编码颜色值（语义色与 `hsl` 派生除外，且只在 `index.css`）。
- 不用状态类名代替 `data-*`；不用 `!important`。
- 不在子组件中新建跨组件状态。
- 不添加没有设计主张的装饰性区块。
- 不让 AI 的产出绕过质量验证层或人工检查层 —— **任何「跳过门禁」的开关都不应存在**。
- 不在界面上让前置条件未满足的不可逆操作看起来可用。
- 不新增没有演示数据的能力。

---

## 九、快速自检清单

提交前逐条确认：

- [ ] `npx tsc --noEmit -p tsconfig.app.json` 通过
- [ ] `npm run build` 通过
- [ ] 新增 CSS 用到的每个令牌在 `index.css` 中真实存在，且两套配色都有
- [ ] 新增状态用 `data-*` 表达，Lumen / Ink 下都验证过观感
- [ ] 新增能力有演示数据，默认会话里能看到
- [ ] 语义色用法符合第 6.2 节的固定含义
- [ ] 新能力能回答「属于五层中的哪一层、责任主体是谁」
- [ ] 文案说的是机制与后果，术语与领域模型一致
- [ ] 窄屏下退化后，状态与结论仍然可见
- [ ] 提交信息按设计主张分条说明
