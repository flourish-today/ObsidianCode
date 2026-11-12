import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideKeepConnected,
  keepConnectedStatus,
  STAY_CONNECTED_AFTER_LEAVING_MS as AFTER,
  STAY_CONNECTED_WHILE_WORKING_MS as WORKING,
} from "./overlay/apps/mobile/src/features/agent-awareness/keepConnectedPolicy.ts";

const left = Date.parse("2026-11-12T20:00:00.000Z");
const base = { appActive: false, leftAtMs: left, nowMs: left, hasEnvironments: true, agentsWorking: 0 };

test("stays connected while the app is in front, without holding the processor", () => {
  assert.deepEqual(decideKeepConnected({ ...base, appActive: true, leftAtMs: null }),
    { keep: true, holdCpu: false, untilMs: null });
});

test("never runs without an environment, or before the app was used", () => {
  assert.equal(decideKeepConnected({ ...base, appActive: true, hasEnvironments: false }).keep, false);
  assert.equal(decideKeepConnected({ ...base, leftAtMs: null }).keep, false);
});

test("stays connected for the window after leaving, then stops", () => {
  assert.deepEqual(decideKeepConnected({ ...base, nowMs: left + AFTER - 1 }),
    { keep: true, holdCpu: false, untilMs: left + AFTER });
  assert.equal(decideKeepConnected({ ...base, nowMs: left + AFTER }).keep, false);
});

test("a working agent extends the connection up to the limit and holds the processor", () => {
  const working = { ...base, agentsWorking: 2 };
  assert.deepEqual(decideKeepConnected({ ...working, nowMs: left + AFTER + 60_000 }),
    { keep: true, holdCpu: true, untilMs: left + WORKING });
  assert.equal(decideKeepConnected({ ...working, nowMs: left + WORKING }).keep, false);
  // Once the agent is done after the window, the connection stops.
  assert.equal(decideKeepConnected({ ...base, nowMs: left + AFTER + 60_000 }).keep, false);
});

test("status text names the connection, the agents and the notifications", () => {
  const status = { connection: "connected" as const, environmentLabel: "Mac", agentsWorking: 0,
    notificationsOn: true, untilText: null };
  assert.deepEqual(keepConnectedStatus(status),
    { title: "Connected to Mac", text: "Notifications on." });
  assert.deepEqual(keepConnectedStatus({ ...status, untilText: "3:45 PM" }),
    { title: "Connected to Mac", text: "Notifications on. Staying connected until 3:45 PM." });
  assert.deepEqual(keepConnectedStatus({ ...status, agentsWorking: 1, untilText: "11:00 PM" }), {
    title: "Connected to Mac",
    text: "1 agent working. You'll get a notification when it's done.",
  });
  assert.equal(keepConnectedStatus({ ...status, connection: "connecting" }).title,
    "Reconnecting to Mac…");
  assert.equal(keepConnectedStatus({ ...status, notificationsOn: false, agentsWorking: 3 }).text,
    "3 agents working. Agent notifications are off in Settings.");
});
