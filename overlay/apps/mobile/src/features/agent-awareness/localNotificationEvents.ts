// Kept independent of React Native so replay and duplicate handling can be tested locally.
export interface LocalNotificationThread {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly latestRunId: string | null;
  readonly latestRunCompletedAt: string | null;
  readonly pendingRuntimeRequest: {
    readonly id: string;
    readonly kind: string;
    readonly createdAt: string;
  } | null;
  readonly hidden: boolean;
}

export interface LocalAgentAlert {
  readonly path: string;
  readonly title: string;
  readonly body: string;
}

interface ThreadAlertHistory {
  completedAt: string | null;
  requests: Set<string>;
}

function alertBody(thread: LocalNotificationThread): string | null {
  const kind = thread.pendingRuntimeRequest?.kind;
  if (kind === "user_input" || kind === "mcp-elicitation") return "Agent needs your response.";
  if (kind === "auth_refresh") return "Agent needs you to sign in.";
  if (kind) return "Agent needs your approval.";
  if (thread.status === "completed") return "Agent finished.";
  if (thread.status === "failed") return "Agent run failed. Open the thread for details.";
  return null;
}

export function createLocalAgentAlertTracker(startedAt = Date.now()) {
  const environments = new Map<string, Map<string, ThreadAlertHistory>>();

  return {
    forget(environmentId: string) {
      environments.delete(environmentId);
    },
    update(environmentId: string, threads: readonly LocalNotificationThread[]): LocalAgentAlert[] {
      const firstSnapshot = !environments.has(environmentId);
      const history = environments.get(environmentId) ?? new Map<string, ThreadAlertHistory>();
      environments.set(environmentId, history);
      const alerts: LocalAgentAlert[] = [];
      for (const thread of threads) {
        const previous = history.get(thread.id);
        const requests: Set<string> = previous?.requests ?? new Set<string>();
        const request = thread.pendingRuntimeRequest;
        const completedAt = thread.latestRunCompletedAt;
        const newRequest = request !== null && !requests.has(request.id) &&
          Date.parse(request.createdAt) >= startedAt;
        const newCompletion = completedAt !== null && thread.latestRunId !== null &&
          Date.parse(completedAt) >= startedAt &&
          (previous?.completedAt == null || completedAt > previous.completedAt);
        if (request) requests.add(request.id);
        history.set(thread.id, {
          requests,
          completedAt: completedAt !== null &&
            (previous?.completedAt == null || completedAt > previous.completedAt)
            ? completedAt : (previous?.completedAt ?? null),
        });
        // Cached/history snapshots never produce a backlog of old notifications.
        if (firstSnapshot || thread.hidden || !(request ? newRequest : newCompletion)) continue;
        const body = alertBody(thread);
        if (!body) continue;
        alerts.push({
          path: `/threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(thread.id)}`,
          title: thread.title || "ObsidianCode",
          body,
        });
      }
      return alerts;
    },
  };
}
