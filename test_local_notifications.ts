import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLocalAgentAlertTracker,
  type LocalNotificationThread,
} from "./overlay/apps/mobile/src/features/agent-awareness/localNotificationEvents.ts";

const startedAt = Date.parse("2026-11-03T20:00:00.000Z");
const before = "2026-11-03T19:59:00.000Z";
const after = "2026-11-03T20:01:00.000Z";
const later = "2026-11-03T20:02:00.000Z";
const thread = (patch: Partial<LocalNotificationThread> = {}): LocalNotificationThread => ({
  id: "thread/1", title: "My task", status: "running", latestRunId: "run-1",
  latestRunCompletedAt: null, pendingRuntimeRequest: null, hidden: false, ...patch,
});

test("initial snapshot never alerts, including existing completions and requests", () => {
  const tracker = createLocalAgentAlertTracker(startedAt);
  const threads = [
    thread({ status: "completed", latestRunCompletedAt: after }),
    thread({ id: "other", pendingRuntimeRequest: { id: "q1", kind: "user_input", createdAt: after } }),
  ];
  assert.deepEqual(tracker.update("environment", threads), []);
  assert.deepEqual(tracker.update("environment", threads), []);
});

test("completions open the correct encoded thread and notify once across replays", () => {
  const tracker = createLocalAgentAlertTracker(startedAt);
  tracker.update("env/1", [thread()]);
  const completed = thread({ status: "completed", latestRunCompletedAt: after });
  assert.deepEqual(tracker.update("env/1", [completed]), [{
    path: "/threads/env%2F1/thread%2F1", title: "My task", body: "Agent finished.",
  }]);
  assert.deepEqual(tracker.update("env/1", [completed]), []);
  // A reconnect with an older snapshot must not cause the same completion to alert again.
  tracker.update("env/1", [thread({ status: "completed", latestRunCompletedAt: before })]);
  assert.deepEqual(tracker.update("env/1", [completed]), []);
  assert.equal(tracker.update("env/1", [thread({ ...completed, latestRunId: "run-2", latestRunCompletedAt: later })]).length, 1);
});

test("failures alert; user stops and rollbacks stay quiet", () => {
  for (const status of ["failed", "interrupted", "cancelled", "rolled_back"]) {
    const tracker = createLocalAgentAlertTracker(startedAt);
    tracker.update("env", [thread()]);
    const alerts = tracker.update("env", [thread({ status, latestRunCompletedAt: after })]);
    assert.equal(alerts.length, status === "failed" ? 1 : 0);
    if (status === "failed") assert.match(alerts[0]!.body, /failed/);
  }
});

test("new questions and approvals alert once per request, without repeating a completion", () => {
  const tracker = createLocalAgentAlertTracker(startedAt);
  tracker.update("env", [thread()]);
  const pending = thread({ pendingRuntimeRequest: { id: "q1", kind: "user_input", createdAt: after } });
  assert.equal(tracker.update("env", [pending])[0]!.body, "Agent needs your response.");
  assert.deepEqual(tracker.update("env", [pending]), []);
  tracker.update("env", [thread()]);
  assert.deepEqual(tracker.update("env", [pending]), []);
  assert.equal(tracker.update("env", [thread({
    pendingRuntimeRequest: { id: "a1", kind: "command", createdAt: later },
  })])[0]!.body, "Agent needs your approval.");
});

test("hidden threads and old history do not generate alerts", () => {
  const tracker = createLocalAgentAlertTracker(startedAt);
  tracker.update("env", []);
  assert.deepEqual(tracker.update("env", [
    thread({ id: "old", status: "completed", latestRunCompletedAt: before }),
    thread({ id: "old-request", pendingRuntimeRequest: { id: "old-q", kind: "user_input", createdAt: before } }),
    thread({ id: "hidden", hidden: true, status: "completed", latestRunCompletedAt: after }),
  ]), []);
  // Unarchiving a thread must not replay its already observed event.
  assert.deepEqual(tracker.update("env", [thread({ id: "hidden", status: "completed", latestRunCompletedAt: after })]), []);
});

test("each environment has its own baseline and request history", () => {
  const tracker = createLocalAgentAlertTracker(startedAt);
  tracker.update("a", [thread()]);
  tracker.update("b", [thread()]);
  const done = thread({ status: "completed", latestRunCompletedAt: after });
  assert.equal(tracker.update("a", [done]).length, 1);
  assert.equal(tracker.update("b", [done]).length, 1);
  tracker.forget("a");
  assert.deepEqual(tracker.update("a", [done]), []);
});
