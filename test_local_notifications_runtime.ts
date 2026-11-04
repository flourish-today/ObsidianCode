import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Exercise the app adapter with real event tracking and mocked platform/connection APIs.
const sent: unknown[][] = [];
const dismissed: string[] = [];
const permissionRequests: string[] = [];
let granted = false;
let permissionReads = 0;
let appStateListener: (() => void) | null = null;
let subscription: { atom: any; listener: (value: any) => void } | null = null;
const catalog = { entries: new Map([["env", { enabled: true }]]) };
const state = { status: "live", snapshot: { _tag: "Some", value: { threads: [] as any[] } } };
const AppState = {
  currentState: "active",
  addEventListener(_event: string, listener: () => void) {
    appStateListener = listener;
    return { remove() { appStateListener = null; } };
  },
};
const platform = { OS: "android", Version: 33 };
const native = {
  async localNotificationsEnabled() { permissionReads++; return granted; },
  async showLocalNotification(...args: unknown[]) { sent.push(args); return granted; },
  async dismissLocalNotification(path: string) { dismissed.push(path); },
};
const get = (atom: any): any => typeof atom.read === "function" ? atom.read(get) : atom.value;
const registry = {
  subscribe(atom: any, listener: (value: any) => void, options: { immediate: boolean }) {
    subscription = { atom, listener };
    if (options.immediate) listener(get(atom));
    return () => { subscription = null; };
  },
};
const mocks: Record<string, Record<string, unknown>> = {
  "expo-constants": { default: { expoConfig: { scheme: "t3code" } } },
  "expo": { requireOptionalNativeModule: () => native },
  "@t3tools/client-runtime/state/connections": {
    enabledEnvironmentIds: (value: typeof catalog) => [...value.entries]
      .filter(([, entry]) => entry.enabled).map(([id]) => id),
  },
  "@t3tools/contracts": { isListedThreadLineage: (value: any) => value.relationshipToParent !== "subagent" && !value.sideChat },
  "effect/DateTime": { formatIso: (value: string) => value },
  "effect/Option": { isNone: (value: any) => value._tag === "None" },
  "effect/reactivity": { Atom: { make: (read: any) => ({ read }) } },
  "react-native": {
    AppState, Platform: platform,
    PermissionsAndroid: {
      PERMISSIONS: { POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS" },
      async request(permission: string) { permissionRequests.push(permission); granted = true; return "granted"; },
    },
  },
  "../../connection/catalog": { environmentCatalog: { catalogValueAtom: { value: catalog } } },
  "../../state/atom-registry": { appAtomRegistry: registry },
  "../../state/shell": { environmentShell: { stateValueAtom: () => ({ value: state }) } },
};
(globalThis as any).__localNotificationTestMocks = mocks;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier]) return { shortCircuit: true, url: `mock:${specifier}` };
    if (specifier === "./localNotificationEvents") {
      return { shortCircuit: true, url: new URL("./overlay/apps/mobile/src/features/agent-awareness/localNotificationEvents.ts", import.meta.url).href };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.startsWith("mock:")) return next(url, context);
    const specifier = url.slice(5);
    const source = Object.keys(mocks[specifier]!).map((key) =>
      key === "default"
        ? `export default globalThis.__localNotificationTestMocks[${JSON.stringify(specifier)}].default;`
        : `export const ${key} = globalThis.__localNotificationTestMocks[${JSON.stringify(specifier)}][${JSON.stringify(key)}];`
    ).join("\n");
    return { shortCircuit: true, format: "module", source };
  },
});
const notifications = await import("./overlay/apps/mobile/src/features/agent-awareness/localNotifications.ts");
hooks.deregister();
delete (globalThis as any).__localNotificationTestMocks;

function emit() {
  subscription?.listener(get(subscription.atom));
}
function thread(id: string, patch: Record<string, unknown> = {}) {
  return {
    id, title: "Task", status: "running", latestRunId: "run", latestRunCompletedAt: null,
    pendingRuntimeRequest: null, archivedAt: null, deletedAt: null,
    lineage: { relationshipToParent: null }, ...patch,
  };
}

test("notification permission uses Android and never a push registration", async () => {
  assert.equal(await notifications.requestLocalNotifications(), true);
  assert.deepEqual(permissionRequests, ["android.permission.POST_NOTIFICATIONS"]);
  assert.equal(permissionReads, 2);
  await notifications.requestLocalNotifications();
  assert.equal(permissionRequests.length, 1);
  granted = false;
  platform.Version = 32;
  assert.equal(await notifications.requestLocalNotifications(), false);
  assert.equal(permissionRequests.length, 1);
});

test("cached shells and visible threads stay quiet; background alerts deep-link and clean up", async () => {
  const completedAt = new Date(Date.now() + 60_000).toISOString();
  const stop = notifications.installLocalAgentNotifications();
  notifications.setLocalNotificationThreadOnScreen("/threads/env/a");
  state.status = "cached";
  state.snapshot.value.threads = [thread("a", { status: "completed", latestRunCompletedAt: completedAt })];
  emit();
  assert.equal(sent.length, 0);
  state.status = "live";
  state.snapshot.value.threads = [thread("a"), thread("b"), thread("child", { lineage: { relationshipToParent: "subagent" } })];
  emit();
  state.snapshot.value.threads = state.snapshot.value.threads.map((row) => ({ ...row, status: "completed", latestRunCompletedAt: completedAt }));
  emit();
  await Promise.resolve();
  assert.deepEqual(sent, [["/threads/env/b", "t3code", "Task", "Agent finished."]]);
  notifications.setLocalNotificationThreadOnScreen("/");
  emit();
  assert.equal(sent.length, 1);
  AppState.currentState = "background";
  notifications.setLocalNotificationThreadOnScreen("/threads/env/a");
  state.snapshot.value.threads = [thread("a", {
    status: "waiting", pendingRuntimeRequest: { id: "question", kind: "user_input", createdAt: completedAt },
  })];
  emit();
  assert.deepEqual(sent[1], ["/threads/env/a", "t3code", "Task", "Agent needs your response."]);
  AppState.currentState = "active";
  appStateListener?.();
  assert.ok(dismissed.includes("/threads/env/a"));
  stop();
  assert.equal(subscription, null);
  assert.equal(appStateListener, null);
});
