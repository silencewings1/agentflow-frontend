/* 单列瀑布：主列唯一的内容流。
   设计主张：节点不是「跑过了」，而是按顺序留下可逐条核验的记录——
   阶段卡片按流程顺序铺开，治理事实与控制面事实折叠在底部，
   动作留在常驻的 .govBar，事实按需展开。用户只在一个方向滚动。
   纯展示 + 受控组件：展开状态全部由 App.tsx 持有，本组件不持有任何状态。 */
import type { JSX, ReactNode } from "react";
import type { StageCardModel } from "../api/stageModel";
import { StageCard } from "./StageCard";
import { Icon } from "./Icons";

/* 折叠区标题：kicker 给归属，标题给对象，meta 在折叠时给一句结论 */
function Fold({
  id,
  kicker,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="waterfall__section" data-open={open} data-section={id}>
      <button
        type="button"
        className="waterfall__sectionHead"
        aria-expanded={open}
        aria-controls={`waterfall-${id}`}
        onClick={onToggle}
      >
        <span className="kicker">{kicker}</span>
        <span className="waterfall__sectionTitle">{title}</span>
        {!open && meta.length > 0 && (
          <span className="waterfall__sectionMeta">{meta}</span>
        )}
        <Icon.Chevron size={14} className="waterfall__chev" aria-hidden />
      </button>
      <div className="waterfall__sectionBody" id={`waterfall-${id}`}>
        {children}
      </div>
    </section>
  );
}

export function Waterfall({
  cards,
  openIds,
  onToggle,
  factsOpen,
  onToggleFacts,
  controlsOpen,
  onToggleControls,
  facts,
  controls,
  stream,
}: {
  cards: StageCardModel[];
  openIds: Set<string>;
  onToggle: (nodeId: string) => void;
  factsOpen: boolean;
  onToggleFacts: () => void;
  controlsOpen: boolean;
  onToggleControls: () => void;
  facts: ReactNode;
  controls: ReactNode;
  /* 可选：事件流（节点审批/人工检查点的操作入口）。放在阶段卡片与折叠事实之间，
     保证折叠区始终位于瀑布底部。 */
  stream?: ReactNode;
}): JSX.Element {
  const accepted = cards.filter((card) => card.status === "accepted").length;
  const attention = cards.filter(
    (card) => card.status === "rejected" || card.status === "blocked",
  ).length;
  const stageMeta = cards.length
    ? `${cards.length} 个节点 · ${accepted} 已验收${attention > 0 ? ` · ${attention} 需处理` : ""}`
    : "暂无结构化产出";

  return (
    <div className="waterfall__body">
      {cards.length === 0 ? (
        <p className="govEmpty waterfall__empty">
          当前没有可展示的结构化节点产出。审计轨迹摘要可在右侧检查面板的回放视图中查看。
        </p>
      ) : (
        cards.map((card) => (
          <div
            className="waterfall__stage"
            id={`stage-${card.nodeId}`}
            data-node-id={card.nodeId}
            key={card.nodeId}
          >
            <StageCard
              card={card}
              open={openIds.has(card.nodeId)}
              onToggle={() => onToggle(card.nodeId)}
            />
          </div>
        ))
      )}

      {stream}

      <Fold
        id="facts"
        kicker="W7 · 可信展示"
        title="治理事实"
        meta={stageMeta}
        open={factsOpen}
        onToggle={onToggleFacts}
      >
        {facts}
      </Fold>

      <Fold
        id="controls"
        kicker="AF 控制面"
        title="控制面事实"
        meta="任务聚合 · 节点 · 外部操作"
        open={controlsOpen}
        onToggle={onToggleControls}
      >
        {controls}
      </Fold>
    </div>
  );
}
