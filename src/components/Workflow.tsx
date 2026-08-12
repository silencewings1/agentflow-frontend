import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import {
  NODE_H,
  NODE_W,
  dagSize,
  failLabelPos,
  failPath,
  flowPath,
  insertAfter,
  nodePos,
  patchNode,
  removeNode,
  roleGlyph,
  roleTint,
  setFailTarget,
  workflowTemplates,
  type WfNode,
  type Workflow,
} from "../data/workflows";
import { roleLabel, type AgentRole } from "../data/settings";

/* ============================ DAG 画布 ================================= */

export function DagCanvas({
  wf,
  selected,
  onSelect,
  compact,
}: {
  wf: Workflow;
  selected?: string | null;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  const size = dagSize(wf.nodes);
  const flows = wf.edges.filter((e) => e.kind === "flow");
  const fails = wf.edges.filter((e) => e.kind === "fail");
  const byId = useMemo(
    () => Object.fromEntries(wf.nodes.map((n) => [n.id, n])) as Record<string, WfNode>,
    [wf.nodes],
  );

  const dipBase = size.h + 22;
  const padBottom = fails.length ? 34 + fails.length * 17 : 16;
  const vw = size.w + 8;
  const vh = size.h + padBottom;

  return (
    <div className="dag" data-compact={compact ? "true" : undefined}>
      <svg
        className="dag__svg"
        viewBox={`-4 -6 ${vw + 8} ${vh + 12}`}
        style={{ minWidth: compact ? undefined : vw }}
        role="img"
        aria-label={`${wf.name} 编排图`}
      >
        <defs>
          <marker id="ar-flow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0.6 L7.4 4 L0 7.4 z" fill="var(--accent)" />
          </marker>
          <marker id="ar-fail" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M0 0.6 L7.4 4 L0 7.4 z" fill="var(--gold)" />
          </marker>
        </defs>

        {/* 失败回退边先画，压在节点下层 */}
        {fails.map((e, i) => {
          const a = byId[e.from];
          const b = byId[e.to];
          if (!a || !b) return null;
          const lp = failLabelPos(a, b, i, dipBase);
          return (
            <g key={e.id} className="dagEdge dagEdge--fail" style={{ ["--i" as string]: i }}>
              <path d={failPath(a, b, i, dipBase)} markerEnd="url(#ar-fail)" />
              {e.label && !compact && (
                <text x={lp.x} y={lp.y} className="dagEdge__label">
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {flows.map((e, i) => {
          const a = byId[e.from];
          const b = byId[e.to];
          if (!a || !b) return null;
          return (
            <g key={e.id} className="dagEdge dagEdge--flow" style={{ ["--i" as string]: i }}>
              <path d={flowPath(a, b)} markerEnd="url(#ar-flow)" />
            </g>
          );
        })}

        {wf.nodes.map((n, i) => {
          const p = nodePos(n);
          const G = Icon[roleGlyph[n.role]];
          return (
            <g
              key={n.id}
              className="dagNode"
              data-active={selected === n.id ? "true" : undefined}
              data-tint={roleTint[n.role]}
              style={{ ["--i" as string]: i }}
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => onSelect?.(n.id)}
            >
              <rect className="dagNode__box" width={NODE_W} height={NODE_H} rx="10" />
              <g className="dagNode__icon" transform="translate(11 12)">
                <G size={14} />
              </g>
              <text className="dagNode__role" x="32" y="22">
                {roleLabel[n.role]}
              </text>
              <text className="dagNode__name" x="11" y="43">
                {n.name}
              </text>
              {n.gate && (
                <g transform={`translate(${NODE_W - 20} 12)`}>
                  <circle className="dagNode__gate" r="6" cx="6" cy="6" />
                  <text className="dagNode__gateGlyph" x="6" y="9.5">
                    G
                  </text>
                </g>
              )}
              {n.approval && (
                <g transform={`translate(${NODE_W - 20} ${NODE_H - 20})`}>
                  <circle className="dagNode__appr" r="6" cx="6" cy="6" />
                  <text className="dagNode__gateGlyph" x="6" y="9.5">
                    人
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ====================== 会话内编排状态条 =============================== */

export function WorkflowStrip({
  wf,
  activeIndex,
  onOpen,
}: {
  wf: Workflow;
  activeIndex: number;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const G = Icon[wf.glyph];

  return (
    <div className="wfStrip" data-open={open ? "true" : undefined}>
      <div className="wfStrip__bar">
        <span className="wfStrip__glyph" data-tint={wf.tint}>
          <G size={13} />
        </span>
        <span className="wfStrip__name">{wf.name}</span>
        <span className="wfStrip__rule" />
        <ol className="wfStrip__steps">
          {wf.nodes.map((n, i) => (
            <li
              key={n.id}
              className="wfStrip__step"
              data-state={i < activeIndex ? "done" : i === activeIndex ? "active" : "todo"}
              style={{ ["--i" as string]: i }}
              title={n.desc}
            >
              <i />
              {n.name}
            </li>
          ))}
        </ol>
        <button className="wfStrip__more" onClick={() => setOpen((v) => !v)}>
          {open ? "收起编排" : "查看编排"}
          <Icon.Chevron size={12} className={open ? "rotUp" : undefined} />
        </button>
        {onOpen && (
          <button className="wfStrip__more" onClick={onOpen}>
            <Icon.Sliders size={12} />
            重新编排
          </button>
        )}
      </div>
      {open && (
        <div className="wfStrip__dag">
          <DagCanvas wf={wf} selected={wf.nodes[activeIndex]?.id ?? null} compact />
        </div>
      )}
    </div>
  );
}

/* ========================= 工作流配置面板 ============================== */

export function WorkflowPicker({
  value,
  onChange,
  onToast,
}: {
  value: Workflow;
  onChange: (w: Workflow) => void;
  onToast?: (t: { tone: "ok" | "warn" | "info"; title: string; body: string }) => void;
}) {
  const [sel, setSel] = useState<string | null>(value.nodes[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState<AgentRole>("testing");
  const [newName, setNewName] = useState("");

  const node = value.nodes.find((n) => n.id === sel) ?? null;
  const failEdge = value.edges.find((e) => e.kind === "fail" && e.from === sel);
  const upstream = value.nodes.filter((n) => n.col < (node?.col ?? 0));

  const pick = (id: string) => {
    const tpl = workflowTemplates.find((w) => w.id === id);
    if (!tpl) return;
    onChange(tpl);
    setSel(tpl.nodes[0]?.id ?? null);
    setAdding(false);
  };

  return (
    <div className="wfConf">
      {/* 模板选择 */}
      <div className="wfTpl">
        {workflowTemplates.map((w, i) => {
          const G = Icon[w.glyph];
          const on = w.id === value.id;
          return (
            <button
              key={w.id}
              className="wfTpl__item"
              data-on={on}
              style={{ ["--i" as string]: i }}
              onClick={() => pick(w.id)}
            >
              <span className="wfTpl__glyph" data-tint={w.tint}>
                <G size={15} />
              </span>
              <span className="wfTpl__text">
                <strong>{w.name}</strong>
                <em>{w.nodes.length} 节点 · {w.edges.filter((e) => e.kind === "fail").length} 回退</em>
              </span>
              {on && <Icon.Check size={13} className="wfTpl__tick" />}
            </button>
          );
        })}
      </div>

      {/* 画布 */}
      <div className="wfStage">
        <div className="wfStage__bar">
          <div className="wfStage__id">
            <strong>{value.name}</strong>
            {!value.builtin && <span className="tag tag--xs">已修改</span>}
          </div>
          <p className="wfStage__sum">{value.summary}</p>
          <div className="wfLegend">
            <span className="wfLegend__i" data-k="flow">
              <i />
              流转
            </span>
            <span className="wfLegend__i" data-k="fail">
              <i />
              失败回退
            </span>
            <span className="wfLegend__i" data-k="gate">
              <b>G</b>
              质量门禁
            </span>
            <span className="wfLegend__i" data-k="appr">
              <b>人</b>
              人工检查点
            </span>
          </div>
        </div>

        <div className="wfStage__scroll">
          <DagCanvas wf={value} selected={sel} onSelect={setSel} />
        </div>
      </div>

      {/* 节点编辑 */}
      <div className="wfEdit">
        <div className="wfEdit__main">
          {node ? (
            <>
              <div className="wfEdit__head">
                <span className="wfEdit__glyph" data-tint={roleTint[node.role]}>
                  {(() => {
                    const G = Icon[roleGlyph[node.role]];
                    return <G size={15} />;
                  })()}
                </span>
                <input
                  className="wfEdit__name"
                  value={node.name}
                  onChange={(e) => onChange(patchNode(value, node.id, { name: e.target.value }))}
                  aria-label="节点名称"
                />
                <button
                  className="iconBtn iconBtn--sm"
                  aria-label="删除节点"
                  onClick={() => {
                    const next = removeNode(value, node.id);
                    onChange(next);
                    setSel(next.nodes[0]?.id ?? null);
                    onToast?.({ tone: "warn", title: "已删除节点", body: node.name });
                  }}
                >
                  <Icon.Trash size={13} />
                </button>
              </div>

              <p className="wfEdit__desc">{node.desc}</p>

              <div className="wfEdit__row">
                <label>承接角色</label>
                <div className="tagPick">
                  {(Object.keys(roleLabel) as AgentRole[]).map((r) => (
                    <button
                      key={r}
                      className="tag"
                      data-on={node.role === r}
                      onClick={() => onChange(patchNode(value, node.id, { role: r }))}
                    >
                      {roleLabel[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wfEdit__row">
                <label>失败回退至</label>
                <div className="tagPick">
                  {upstream.length === 0 && <span className="wfEdit__none">首节点无上游</span>}
                  {upstream.map((u) => (
                    <button
                      key={u.id}
                      className="tag"
                      data-on={failEdge?.to === u.id}
                      onClick={() =>
                        onChange(
                          setFailTarget(value, node.id, failEdge?.to === u.id ? null : u.id),
                        )
                      }
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wfEdit__row wfEdit__row--flags">
                <button
                  className="flagBtn"
                  data-on={!!node.gate}
                  onClick={() =>
                    onChange(
                      patchNode(value, node.id, { gate: node.gate ? undefined : "自动检查通过" }),
                    )
                  }
                >
                  <Icon.Shield size={13} />
                  质量门禁
                </button>
                <button
                  className="flagBtn"
                  data-on={!!node.approval}
                  onClick={() => onChange(patchNode(value, node.id, { approval: !node.approval }))}
                >
                  <Icon.Check size={13} />
                  人工检查点
                </button>
              </div>
            </>
          ) : (
            <p className="wfEdit__none">在图中选择一个节点进行配置。</p>
          )}
        </div>

        <aside className="wfEdit__side">
          <span className="kicker">编排策略</span>
          <dl className="kv kv--tight">
            <div>
              <dt>适用</dt>
              <dd>{value.scene}</dd>
            </div>
            <div>
              <dt>重试上限</dt>
              <dd className="mono">{value.maxRetry} 次</dd>
            </div>
            <div>
              <dt>超限处置</dt>
              <dd>{value.onExhaust}</dd>
            </div>
            <div>
              <dt>门禁数</dt>
              <dd className="mono">{value.nodes.filter((n) => n.gate).length}</dd>
            </div>
            <div>
              <dt>检查点</dt>
              <dd className="mono">{value.nodes.filter((n) => n.approval).length}</dd>
            </div>
          </dl>

          {adding ? (
            <div className="wfAdd">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="节点名称"
                autoFocus
              />
              <div className="tagPick">
                {(Object.keys(roleLabel) as AgentRole[]).map((r) => (
                  <button key={r} className="tag" data-on={newRole === r} onClick={() => setNewRole(r)}>
                    {roleLabel[r]}
                  </button>
                ))}
              </div>
              <div className="wfAdd__act">
                <button className="btn btn--outline btn--sm" onClick={() => setAdding(false)}>
                  取消
                </button>
                <button
                  className="btn btn--accent btn--sm"
                  onClick={() => {
                    if (!sel) return;
                    const next = insertAfter(value, sel, newRole, newName.trim() || roleLabel[newRole]);
                    onChange(next);
                    setAdding(false);
                    setNewName("");
                    onToast?.({ tone: "ok", title: "已插入节点", body: "并自动补一条失败回退边" });
                  }}
                >
                  插入
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn--outline btn--sm btn--block"
              disabled={!sel}
              onClick={() => setAdding(true)}
            >
              <Icon.Plus size={13} />
              在选中节点后插入
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
