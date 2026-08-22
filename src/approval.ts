import type { ApprovalHandler, ApprovalState, SmithEvent } from "./protocol";

export type ApprovalListener = (event: Extract<SmithEvent, { type: "approval_request" | "approval_update" }>) => void;

interface PendingApproval {
  resolve: (approved: boolean) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class ApprovalManager {
  private readonly records = new Map<string, ApprovalState>();
  private readonly pending = new Map<string, PendingApproval>();
  private readonly listeners = new Set<ApprovalListener>();

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

  decide(requestId: string, approved: boolean): boolean {
    return this.settle(requestId, approved, approved ? "approved" : "denied");
  }

  cancelAll(reason = "Approval cancelled."): void {
    for (const requestId of this.pending.keys()) this.settle(requestId, false, "cancelled", reason);
  }

  private waitForDecision(request: Parameters<ApprovalHandler>[0], signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false);

    const now = Date.now();
    const record: ApprovalState = {
      request,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(request.id, record);
    this.emit({ type: "approval_request", approval: this.copyState(record) });

    return new Promise<boolean>((resolve) => {
      const onAbort = () => this.settle(request.id, false, "cancelled", "Approval cancelled.");
      this.pending.set(request.id, { resolve, signal, onAbort });
      signal?.addEventListener("abort", onAbort, { once: true });
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
    pending.resolve(approved);
    return true;
  }

  private emit(event: Extract<SmithEvent, { type: "approval_request" | "approval_update" }>): void {
    for (const listener of this.listeners) listener(event);
  }

  private copyState(state: ApprovalState): ApprovalState {
    return { ...state, request: { ...state.request, args: { ...state.request.args } } };
  }
}
