/**
 * Shared coach-attention derivation (W2-T5). The roster's needsAttention
 * logic lives here once: the ethereal roster adapts its WorkspaceClient
 * rows onto AttentionSignals, and the dashboard triage widget plus the
 * /api/v1 attention route run the identical result. Any client-shaped
 * input with the listed fields satisfies AttentionClientLike, so canvas
 * stores and server query rows share one definition of "needs attention".
 */

export type AttentionSignals = {
  checkInOverdue: boolean;
  awaitingFeedbackCount: number;
  unreadCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  trainingFlags: number;
};

export type AttentionClientLike = {
  checkInStatus: string;
  checkIns: { status: string }[];
  unreadCount: number;
  clientTasks: { status: string }[];
  trainingFlags: number;
};

export function attentionSignalsFrom(
  client: AttentionClientLike,
): AttentionSignals {
  return {
    checkInOverdue: client.checkInStatus === "overdue",
    awaitingFeedbackCount: client.checkIns.filter(
      (checkIn) => checkIn.status === "awaiting feedback",
    ).length,
    unreadCount: client.unreadCount,
    openTaskCount: client.clientTasks.filter((task) => task.status === "open")
      .length,
    overdueTaskCount: client.clientTasks.filter(
      (task) => task.status === "overdue",
    ).length,
    trainingFlags: client.trainingFlags,
  };
}

export function needsAttention(signals: AttentionSignals): boolean {
  return (
    signals.checkInOverdue ||
    signals.awaitingFeedbackCount > 0 ||
    signals.unreadCount > 0 ||
    signals.openTaskCount > 0 ||
    signals.overdueTaskCount > 0 ||
    signals.trainingFlags > 0
  );
}

export function attentionReasons(signals: AttentionSignals): string[] {
  const reasons: string[] = [];
  if (signals.awaitingFeedbackCount > 0) {
    reasons.push("check-in awaiting feedback");
  } else if (signals.checkInOverdue) {
    reasons.push("check-in overdue");
  }
  if (signals.unreadCount > 0) {
    reasons.push(
      `${signals.unreadCount} unread message${signals.unreadCount === 1 ? "" : "s"}`,
    );
  }
  if (signals.overdueTaskCount > 0) {
    reasons.push(
      `${signals.overdueTaskCount} overdue task${signals.overdueTaskCount === 1 ? "" : "s"}`,
    );
  }
  if (signals.openTaskCount > 0) {
    reasons.push(
      `${signals.openTaskCount} pending task${signals.openTaskCount === 1 ? "" : "s"}`,
    );
  }
  if (signals.trainingFlags > 0) {
    reasons.push(
      `${signals.trainingFlags} training flag${signals.trainingFlags === 1 ? "" : "s"}`,
    );
  }
  return reasons;
}

export function attentionPriority(signals: AttentionSignals): number {
  if (signals.awaitingFeedbackCount > 0) return 5;
  if (signals.checkInOverdue) return 4;
  if (signals.overdueTaskCount > 0) return 3;
  if (signals.unreadCount > 0) return 2;
  if (signals.trainingFlags > 0) return 1;
  return 0;
}

export function attentionCount(signals: AttentionSignals): number {
  return (
    Number(signals.checkInOverdue || signals.awaitingFeedbackCount > 0) +
    signals.unreadCount +
    signals.openTaskCount +
    signals.overdueTaskCount +
    signals.trainingFlags
  );
}

export type TriageRow = {
  clientId: string;
  name: string;
  reasons: string[];
  priority: number;
  attentionCount: number;
};

/**
 * Roster-order triage: clients needing attention, most urgent first.
 * Ties fall back to the higher signal count, then name. That is the same
 * tiebreak the roster's attention sort uses.
 */
export function buildTriageRows(
  clients: (AttentionSignals & { clientId: string; name: string })[],
): TriageRow[] {
  return clients
    .filter((client) => needsAttention(client))
    .map((client) => ({
      clientId: client.clientId,
      name: client.name,
      reasons: attentionReasons(client),
      priority: attentionPriority(client),
      attentionCount: attentionCount(client),
    }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.attentionCount - a.attentionCount ||
        a.name.localeCompare(b.name),
    );
}
