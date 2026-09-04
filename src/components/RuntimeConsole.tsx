import type { AgentProfileSummaryDto, TaskDetailDto, TrajectoryEventDto } from "../api";
import { Icon } from "./Icons";

export type RuntimeLoadState =
  | { status: "idle" | "loading" }
  | { status: "ready" }
  | { status: "error"; code: string; message: string; retryable: boolean };

const stateLabel: Record<TaskDetailDto["nodes"][number]["status"], string> = {
  pending: "待执行",
  running: "执行中",
  accepted: "已接受",
  rejected: "已拒绝",
  blocked_unavailable: "能力不可用",
  awaiting_approval: "等待确认",
  needs_reconcile: "等待对账",
};

export function RuntimeConsole({
  detail,
  trajectory,
  load,
  profiles,
  apiMode,
  starting,
  onStart,
  approvingNodeId,
  onApproveNode,
  planningOperation,
  onPlanOperation,
  confirmingOperationId,
  onConfirmOperation,
  onRefresh,
}: {
  detail: TaskDetailDto | null;
  trajectory: TrajectoryEventDto[];
  load: RuntimeLoadState;
  profiles: AgentProfileSummaryDto[];
  apiMode: "http" | "fixture";
  starting: boolean;
  onStart: () => void;
  approvingNodeId: string | null;
  onApproveNode: (nodeId: string) => void;
  planningOperation: boolean;
  onPlanOperation: () => void;
  confirmingOperationId: string | null;
  onConfirmOperation: (operationId: string) => void;
  onRefresh: () => void;
}) {
  if (load.status === "loading" && !detail) {
    return <section className="runtime runtime--notice">正在读取任务聚合、节点和外部操作状态…</section>;
  }
  if (load.status === "error" && !detail) {
    return (
      <section className="runtime runtime--notice" data-state="error" role="alert">
        <span>{load.code} · {load.message}</span>
        {load.retryable && <button className="btn btn--ghost btn--sm" onClick={onRefresh}>重试</button>}
      </section>
    );
  }
  if (!detail) return null;

  const accepted = detail.nodes.filter((node) => node.status === "accepted").length;
  const current = detail.nodes.find((node) => node.nodeId === detail.currentNodeId);
  const preparedOperation = detail.preparedDelivery === null ? undefined : detail.gitOperations.find((operation) =>
    operation.sourceRevision === detail.preparedDelivery?.sourceRevision &&
    operation.changeSet.digest === detail.preparedDelivery.changeSet.digest &&
    operation.targetBranch === detail.preparedDelivery.targetBranch,
  );

  return (
    <section className="runtime" data-mode={apiMode}>
      <header className="runtime__head">
        <div>
          <span className="kicker">AF 控制面事实</span>
          <strong>{detail.status} · {accepted}/{detail.nodes.length} 节点已接受</strong>
        </div>
        <div className="runtime__badges">
          {apiMode === "http" && detail.status === "created" && (
            <button className="btn btn--accent btn--sm" disabled={starting} onClick={onStart}>
              <Icon.Sparkle size={12} />
              {starting ? "启动中…" : "启动任务"}
            </button>
          )}
          <span className="tag tag--xs mono">{detail.executorMode}</span>
          <span className="tag tag--xs mono">{detail.workflow.workflowId}@{detail.workflow.workflowVersion}</span>
          <span className="tag tag--xs" data-tone={detail.workflow.frozen ? "ok" : "warn"}>{detail.workflow.frozen ? "版本已冻结" : "草稿版本"}</span>
          {apiMode === "fixture" && <span className="tag tag--xs runtime__fixture">FIXTURE · 非真实执行</span>}
          <button className="iconBtn iconBtn--sm" onClick={onRefresh} aria-label="刷新任务状态"><Icon.Clock size={12} /></button>
        </div>
      </header>

      <div className="runtime__summary">
        <span><b>基线</b><code>{detail.baseBranch}@{detail.baseRevision?.slice(0, 10) ?? "待冻结"}</code></span>
        <span><b>目标</b><code>{detail.targetBranch}</code></span>
        <span><b>当前节点</b>{current ? `${current.nodeId} · ${stateLabel[current.status]}` : "无"}</span>
        <span><b>节点规格</b><code>{detail.workflow.nodeSpecDigest.slice(0, 20)}…</code></span>
      </div>

      <div className="runtime__grid">
        <section className="runtimeBlock runtimeBlock--nodes">
          <header><Icon.Nodes size={13} /><strong>节点、Profile 与证据</strong></header>
          <ol className="runtimeNodes">
            {detail.nodes.map((node) => {
              const profile = node.agentProfileRef ? profiles.find((item) => item.profileId === node.agentProfileRef?.profileId) : undefined;
              return (
                <li key={node.nodeId} data-status={node.status}>
                  <i />
                  <div>
                    <strong>{node.nodeId}</strong>
                    <span>{stateLabel[node.status]}</span>
                  </div>
                  <p>
                    {profile ? `${profile.name} @ ${node.agentProfileRef?.profileVersion}` : node.skillRef ? `${node.skillRef.skillId}@${node.skillRef.skillVersion}` : node.kind}
                    {node.provider && <em className="mono">{node.provider}/{node.model}</em>}
                  </p>
                  <small className="mono">attempt {node.attemptId ?? "—"} · evidence {node.evidenceRefs.length}</small>
                  {node.failureCode && <b className="runtimeNodes__failure">{node.failureCode}{node.reworkTargetNodeId ? ` → 定向返工 ${node.reworkTargetNodeId}` : ""}</b>}
                  {apiMode === "http" && node.status === "awaiting_approval" && (
                    <button className="btn btn--accent btn--sm" disabled={approvingNodeId === node.nodeId || (node.kind === "git" && detail.preparedDelivery !== null && preparedOperation?.status !== "committed")} onClick={() => onApproveNode(node.nodeId)}>
                      <Icon.Shield size={12} />
                      {approvingNodeId === node.nodeId ? "批准并继续中…" : node.kind === "git" && detail.preparedDelivery !== null && preparedOperation?.status !== "committed" ? "先确认 MCP 写入" : "批准并继续"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="runtimeBlock">
          <header><Icon.Beaker size={13} /><strong>Skill 与门禁</strong></header>
          <div className="runtimeFacts">
            {detail.skills.map((skill) => (
              <article key={`${skill.nodeId}-${skill.skillId}`} data-tone={skill.status === "completed" ? "ok" : "bad"}>
                <strong>{skill.skillId}@{skill.skillVersion}</strong>
                <span>{skill.status} · exit {skill.exitCode ?? "—"} · {skill.durationMs}ms</span>
                <code>{skill.evidenceRef}</code>
              </article>
            ))}
            {detail.gates.map((gate) => (
              <article key={gate.gateId} data-tone={gate.outcome === "pass" ? "ok" : gate.outcome === "unavailable" ? "warn" : "bad"}>
                <strong>{gate.gateId}</strong>
                <span>{gate.outcome} · evaluator {gate.evaluatorVersion}</span>
                <code>{gate.failureCode ?? gate.evidenceRef ?? "无失败"}</code>
              </article>
            ))}
            {!detail.skills.length && !detail.gates.length && <p className="runtimeEmpty">尚无 Skill 或门禁结果。</p>}
          </div>
        </section>

        <section className="runtimeBlock runtimeBlock--git">
          <header><Icon.Branch size={13} /><strong>SCM MCP 操作</strong></header>
          <div className="gitOps">
            {detail.preparedDelivery !== null && preparedOperation === undefined && (
              <article data-status="prepared">
                <div className="gitOps__top"><strong>本地 change set 已准备</strong><span className="tag tag--xs">prepared</span></div>
                <dl>
                  <div><dt>source</dt><dd><code>{detail.preparedDelivery.sourceRevision}</code></dd></div>
                  <div><dt>change set</dt><dd><code>{detail.preparedDelivery.changeSet.digest}</code></dd></div>
                  <div><dt>files</dt><dd>{detail.preparedDelivery.changeSet.files.length}</dd></div>
                </dl>
                <button className="btn btn--accent btn--sm" disabled={planningOperation} onClick={onPlanOperation}>
                  <Icon.Branch size={12} />
                  {planningOperation ? "生成中…" : "生成 SCM operation"}
                </button>
              </article>
            )}
            {detail.gitOperations.map((operation) => (
              <article key={operation.operationId} data-status={operation.status}>
                <div className="gitOps__top">
                  <strong>{operation.provider} · {operation.mcpServerRef}</strong>
                  <span className="tag tag--xs">{operation.status}</span>
                </div>
                <dl>
                  <div><dt>source</dt><dd><code>{operation.sourceRevision}</code></dd></div>
                  <div><dt>remote</dt><dd><code>{operation.remoteRevision ?? "待远端生成"}</code></dd></div>
                  <div><dt>change set</dt><dd><code>{operation.changeSet.digest}</code></dd></div>
                  <div><dt>MCP capabilities</dt><dd><code>{operation.mcpCapabilitiesDigest}</code></dd></div>
                </dl>
                {(operation.status === "planned" || operation.status === "confirmation") && (
                  <button className="btn btn--accent btn--sm" disabled={confirmingOperationId === operation.operationId} onClick={() => onConfirmOperation(operation.operationId)}>
                    <Icon.Shield size={12} />
                    {confirmingOperationId === operation.operationId ? "确认中…" : "确认 MCP 功能分支写入"}
                  </button>
                )}
                {operation.status === "unknown" && <p className="gitOps__warning"><code>{operation.errorCode}</code> · 禁止重放写操作，只能按 {operation.reconcileQueryRef} 对账。</p>}
                {operation.errorMessage && operation.status !== "unknown" && <p className="gitOps__warning">{operation.errorMessage}</p>}
              </article>
            ))}
            {!detail.gitOperations.length && detail.preparedDelivery === null && <p className="runtimeEmpty">尚未生成 SCM operation；前置测试、审查和 source change set 必须先通过。</p>}
          </div>
        </section>

        <section className="runtimeBlock">
          <header><Icon.Clock size={13} /><strong>轨迹与交付</strong></header>
          <ol className="runtimeTimeline">
            {trajectory.slice(-8).map((event) => (
              <li key={event.eventId}>
                <span className="mono">#{event.seq}</span>
                <div><strong>{event.eventType}</strong><p>{event.summary}</p></div>
                <small>{event.actor}</small>
              </li>
            ))}
          </ol>
          <p className="runtimeDeliverables">当前交付物 {detail.deliverables.filter((item) => item.status === "current").length} · superseded {detail.deliverables.filter((item) => item.status === "superseded").length}</p>
        </section>
      </div>
    </section>
  );
}
