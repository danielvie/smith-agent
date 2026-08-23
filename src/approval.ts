import type { ApprovalDecision, ApprovalHandler, ApprovalState, SmithEvent } from "./protocol";
import type { ApprovalPolicyStore } from "./approval-policy";

export type ApprovalListener = (event: Extract<SmithEvent, { type: "approval_request" | "approval_update" }>) => void;

interface PendingApproval {
  resolve: (decision: ApprovalDecision) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class ApprovalManager {
  private readonly records = new Map<string, ApprovalState>();
  private readonly pending = new Map<string, PendingApproval>();
  private readonly listeners = new Set<ApprovalListener>();

  constructor(private readonly policy?: ApprovalPolicyStore) {}

  readonly request: ApprovalHandler = (request, signal) => this.waitForDecision(request, signal);

  subscribe(listener: ApprovalListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): ApprovalState[] {
    return [...this.records.values()]
      .map((record) => ({ ...record, request: { ...record.request, args: { ...record.request.args } } }))
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  async decide(requestId: string, decision: ApprovalDecision): Promise<boolean> {
    const record = this.records.get(requestId);
    if (!record || !this.pending.has(requestId)) return false;
    if (decision === "always") {
      if (!this.policy) return false;
      await this.policy.alwaysApprove(record.request.toolName);
    }
    return this.settle(requestId, decision !== "deny", decision === "deny" ? "denied" : "approved", decision === "always" ? "Always approved for this tool." : undefined);
  }

  cancelAll(reason = "Approval cancelled."): void {
    for (const requestId of this.pending.keys()) this.settle(requestId, false, "cancelled", reason);
  }

  private waitForDecision(request: Parameters<ApprovalHandler>[0], signal?: AbortSignal): Promise<ApprovalDecision> {
    if (signal?.aborted) return Promise.resolve("deny");
    if (this.policy?.isAlwaysApproved(request.toolName)) return Promise.resolve("approve");

    const now = Date.now();
    const record: ApprovalState = {
      request,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(request.id, record);

    return new Promise<ApprovalDecision>((resolve) => {
      const onAbort = () => this.settle(request.id, false, "cancelled", "Approval cancelled.");
      this.pending.set(request.id, { resolve, signal, onAbort });
      signal?.addEventListener("abort", onAbort, { once: true });
      this.emit({ type: "approval_request", approval: this.copyState(record) });
      if (signal?.aborted) onAbort();
    });
  }

  private settle(requestId: string, approved: boolean, status: ApprovalState["status"], reason?: string): boolean {
    const pending = this.pending.get(requestId);
    const record = this.records.get(requestId);
    if (!pending || !record) return false;

    this.pending.delete(requestId);
    if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
    pending.onAbort = undefined;
    record.status = status;
    record.updatedAt = Date.now();
    record.reason = reason;
    this.emit({ type: "approval_update", approval: this.copyState(record) });
    pending.resolve(approved ? "approve" : "deny");
    return true;
  }

  private emit(event: Extract<SmithEvent, { type: "approval_request" | "approval_update" }>): void {
    for (const listener of this.listeners) listener(event);
  }

  private copyState(state: ApprovalState): ApprovalState {
    return { ...state, request: { ...state.request, args: { ...state.request.args } } };
  }
}
