import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";
import { isListedThreadLineage } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { AppState, PermissionsAndroid, Platform } from "react-native";

import { environmentCatalog } from "../../connection/catalog";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentShell } from "../../state/shell";
import { createLocalAgentAlertTracker } from "./localNotificationEvents";

interface LocalNotificationsNative {
  localNotificationsEnabled(): Promise<boolean>;
  showLocalNotification(path: string, scheme: string, title: string, body: string): Promise<boolean>;
  dismissLocalNotification(path: string): Promise<void>;
}

const native = Platform.OS === "android"
  ? requireOptionalNativeModule<LocalNotificationsNative>("ObsidianNetwork") : null;
let threadOnScreen: string | null = null;

export async function localNotificationsEnabled(): Promise<boolean> {
  return await native?.localNotificationsEnabled() ?? false;
}

export async function requestLocalNotifications(): Promise<boolean> {
  if (!native) return false;
  // Creates the channel before Android 13+ asks for notification permission.
  if (await localNotificationsEnabled()) return true;
  if (Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  return localNotificationsEnabled();
}

function reportError(error: unknown): void {
  console.warn("[obsidiancode] Local notification failed", error);
}

function dismissVisibleThread(): void {
  if (threadOnScreen && AppState.currentState === "active") {
    void native?.dismissLocalNotification(threadOnScreen).catch(reportError);
  }
}

export function setLocalNotificationThreadOnScreen(path: string | null): void {
  threadOnScreen = path;
  dismissVisibleThread();
}

export function installLocalAgentNotifications(): () => void {
  if (!native) return () => {};
  const tracker = createLocalAgentAlertTracker();
  const schemeConfig = Constants.expoConfig?.scheme;
  const scheme = (Array.isArray(schemeConfig) ? schemeConfig[0] : schemeConfig) ?? "t3code";
  const shellsAtom = Atom.make((get) => {
    const shells = new Map<EnvironmentId, EnvironmentShellState>();
    for (const environmentId of enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))) {
      shells.set(environmentId, get(environmentShell.stateValueAtom(environmentId)));
    }
    return shells;
  });
  let previousEnvironments = new Set<string>();
  const unsubscribe = appAtomRegistry.subscribe(shellsAtom, (shells) => {
    for (const id of previousEnvironments) {
      if (!shells.has(id)) tracker.forget(id);
    }
    previousEnvironments = new Set(shells.keys());
    for (const [environmentId, state] of shells) {
      // Only a synchronized server snapshot can produce alerts, never the disk cache.
      if (state.status !== "live" || Option.isNone(state.snapshot)) continue;
      const alerts = tracker.update(environmentId, state.snapshot.value.threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        status: thread.status,
        latestRunId: thread.latestRunId,
        latestRunCompletedAt: thread.latestRunCompletedAt
          ? DateTime.formatIso(thread.latestRunCompletedAt) : null,
        pendingRuntimeRequest: thread.pendingRuntimeRequest ? {
          ...thread.pendingRuntimeRequest,
          createdAt: DateTime.formatIso(thread.pendingRuntimeRequest.createdAt),
        } : null,
        hidden: thread.archivedAt !== null || thread.deletedAt !== null ||
          !isListedThreadLineage(thread.lineage),
      })));
      for (const alert of alerts) {
        // Still record the event so moving away doesn't replay a visible thread's alert.
        if (AppState.currentState === "active" && alert.path === threadOnScreen) continue;
        void native.showLocalNotification(alert.path, scheme, alert.title, alert.body).catch(reportError);
      }
    }
  }, { immediate: true });
  const subscription = AppState.addEventListener("change", dismissVisibleThread);
  return () => {
    unsubscribe();
    subscription.remove();
  };
}
