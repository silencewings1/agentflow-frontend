import { sessions } from "../data/mock";
import { workflowTemplates } from "../data/workflows";
import { toWorkflowDto } from "./mappers";
import type {
  AfApiClient,
  AfBootstrapDto,
  AfErrorPayload,
  AfResponse,
  CreateTaskInput,
  PushOperationInput,
  WorkflowValidation,
  WorkflowVersion,
} from "./types";

const profiles = [
  ["requirements-analyst", "需求分析智能体", false, "af.agent.requirements.v1"],
  ["solution-architect", "方案设计智能体", false, "af.agent.solution-architect.v1"],
  ["implementation-agent", "代码实现智能体", false, "af.agent.implementation.v1"],
  ["test-analyst", "测试分析智能体", false, "af.agent.test-analyst.v1"],
  ["independent-reviewer", "独立审查智能体", true, "af.agent.independent-review.v1"],
] as const;

const skills = [
  ["run-unit-tests", "单元测试"],
  ["run-integration-tests", "集成测试"],
  ["run-lint", "Lint"],
  ["run-build", "Build"],
  ["review-diff", "审查 Diff"],
] as const;

function fixtureBootstrap(): AfBootstrapDto {
  return {
    contractVersion: "1.0",
    executorMode: "demo-deterministic",
    tasks: sessions.map((task) => ({ taskId: task.id, title: task.title, repositoryRef: task.repo, baseBranch: "main", targetBranch: task.branch, state: task.state, updatedAt: task.time, workflowId: task.workflow, diff: task.diff, turns: task.turns })),
    workflows: workflowTemplates.map(toWorkflowDto),
    agentProfiles: profiles.map(([profileId, name, independent, promptId]) => ({
      profileId,
      profileVersion: "1.0.0",
      name,
      independent,
      promptId,
      promptVersion: "1.0.0",
    })),
    skills: skills.map(([skillId, name]) => ({
      skillId,
      skillVersion: "1.0.0",
      name,
      allowedCommands: [skillId],
    })),
  };
}

function fixtureClient(): AfApiClient {
  const bootstrap = fixtureBootstrap();
  return {
    mode: "fixture",
    async bootstrap() { return bootstrap; },
    async listTasks() { return bootstrap.tasks; },
    async getTask(taskId) { return bootstrap.tasks.find((task) => task.taskId === taskId) ?? null; },
    async validateWorkflow(_workflow) { return { valid: true, errors: [] }; },
    async saveWorkflow(workflow) {
      return { workflowId: workflow.workflowId, workflowVersion: workflow.workflowVersion, nodeSpecDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", frozen: false };
    },
    async createTask(_input) { return { taskId: `fixture-${Date.now()}` }; },
    async startTask(taskId) { return { taskId, status: "running" }; },
    async getTrajectory() { return []; },
    async createPushOperation(_taskId, input) { return { status: "confirmation", ...input }; },
    async confirmPushOperation(operationId) { return { operationId, status: "committed" }; },
    async getPushOperation(operationId) { return { operationId, status: "confirmation" }; },
  };
}

class HttpAfApiClient implements AfApiClient {
  readonly mode = "http" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  private async request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}${path}`, { ...init, signal, headers: { "content-type": "application/json", ...init?.headers } });
    const body = (await response.json()) as AfResponse<T>;
    if (!response.ok || !body.ok) {
      const payload: AfErrorPayload = body.ok ? { code: `AF_HTTP_${response.status}`, message: `AF API 请求失败（HTTP ${response.status}）`, retryable: response.status >= 500 } : body.error;
      throw new AfApiError(payload, response.status);
    }
    return body.data;
  }

  bootstrap(signal?: AbortSignal) { return this.request<AfBootstrapDto>("/bootstrap", undefined, signal); }
  listTasks(signal?: AbortSignal) { return this.request<AfBootstrapDto>("/bootstrap", undefined, signal).then((data) => data.tasks); }
  getTask(taskId: string, signal?: AbortSignal) { return this.request<unknown>(`/tasks/${encodeURIComponent(taskId)}`, undefined, signal); }
  validateWorkflow(workflow: import("./types").WorkflowDefinitionDto, signal?: AbortSignal) { return this.request<WorkflowValidation>("/workflows/validate", { method: "POST", body: JSON.stringify({ workflow }) }, signal); }
  saveWorkflow(workflow: import("./types").WorkflowDefinitionDto, signal?: AbortSignal) { return this.request<WorkflowVersion>("/workflows", { method: "POST", body: JSON.stringify({ workflow }) }, signal); }
  createTask(input: CreateTaskInput, signal?: AbortSignal) { return this.request<{ taskId: string }>("/tasks", { method: "POST", body: JSON.stringify(input) }, signal); }
  startTask(taskId: string, signal?: AbortSignal) { return this.request<{ taskId: string; status: string }>(`/tasks/${encodeURIComponent(taskId)}/start`, { method: "POST" }, signal); }
  getTrajectory(taskId: string, signal?: AbortSignal) { return this.request<unknown[]>(`/tasks/${encodeURIComponent(taskId)}/trajectory`, undefined, signal); }
  createPushOperation(taskId: string, input: PushOperationInput, signal?: AbortSignal) { return this.request<unknown>(`/tasks/${encodeURIComponent(taskId)}/git-operations`, { method: "POST", body: JSON.stringify(input) }, signal); }
  confirmPushOperation(operationId: string, signal?: AbortSignal) { return this.request<unknown>(`/git-operations/${encodeURIComponent(operationId)}/confirm`, { method: "POST" }, signal); }
  getPushOperation(operationId: string, signal?: AbortSignal) { return this.request<unknown>(`/git-operations/${encodeURIComponent(operationId)}`, undefined, signal); }
}

export class AfApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly status?: number;

  constructor(payload: AfErrorPayload, status?: number) {
    super(payload.message);
    this.name = "AfApiError";
    this.code = payload.code;
    this.retryable = payload.retryable;
    this.details = payload.details;
    this.status = status;
  }
}

export function createAfApiClient(options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}): AfApiClient {
  const baseUrl = options.baseUrl ?? import.meta.env.VITE_AF_API_BASE_URL;
  return baseUrl ? new HttpAfApiClient(baseUrl, options.fetchImpl) : fixtureClient();
}

export const afApi = createAfApiClient();
