import { requireOptionalNativeModule } from "expo";
import { isListedThreadLineage } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { AppState, Platform } from "react-native";

import { environmentCatalog } from "../../connection/catalog";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentShell } from "../../state/shell";
import { workspaceConnections } from "../../state/workspace";
import { localNotificationsEnabled } from "./localNotifications";
import {
  decideKeepConnected,
  keepConnectedStatus,
  type StatusConnection,
} from "./keepConnectedPolicy";

// Runs KeepConnectedService (Android) while the app is used and for a while after, so Android
// doesn't freeze the app: Tailscale, the connection and agent notifications keep working.

interface KeepConnectedNative {
  keepConnected(title: string, text: string, holdCpu: boolean, stopAtMs: number): Promise<boolean>;
  stopKeepingConnected(): Promise<void>;
}

const native = Platform.OS === "android"
  ? requireOptionalNativeModule<KeepConnectedNative>("ObsidianNetwork") : null;

interface Snapshot {
  readonly hasEnvironments: boolean;
  readonly connection: StatusConnection;
  readonly environmentLabel: string;
  readonly agentsWorking: number;
}

const snapshotAtom = Atom.make((get): Snapshot => {
  const environments = get(workspaceConnections.environmentsAtom).filter((e) => e.isEnabled);
  const offline = get(environmentCatalog.networkStatusValueAtom) === "offline";
  const connected = environments.find((e) => e.connectionState === "connected");
  const connecting = environments.find(
    (e) => e.connectionState === "connecting" || e.connectionState === "reconnecting",
  );
  let agentsWorking = 0;
  for (const environment of environments) {
    const shell = get(environmentShell.stateValueAtom(environment.environmentId));
    if (Option.isNone(shell.snapshot)) continue;
    for (const thread of shell.snapshot.value.threads) {
      if (thread.archivedAt !== null || thread.deletedAt !== null) continue;
      if (!isListedThreadLineage(thread.lineage)) continue;
      if (thread.status === "running" || thread.status === "pending") agentsWorking++;
    }
  }
  return {
    hasEnvironments: environments.length > 0,
    connection: offline ? "offline"
      : connected ? "connected"
      : connecting === undefined && environments.some((e) => e.connectionState === "error")
        ? "error"
      : "connecting",
    environmentLabel: (connected ?? connecting ?? environments[0])?.environmentLabel ?? "your computer",
    agentsWorking,
  };
});

function timeText(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    const date = new Date(ms);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
}

function reportError(error: unknown): void {
  console.warn("[obsidiancode] Keeping the connection failed", error);
}

export function installKeepConnected(): () => void {
  if (!native) return () => {};
  let snapshot = appAtomRegistry.get(snapshotAtom);
  let appActive = AppState.currentState === "active";
  let leftAtMs: number | null = null;
  let notificationsOn = true;
  let lastSent: string | null = null;

  const apply = (force = false) => {
    const decision = decideKeepConnected({
      appActive,
      leftAtMs,
      nowMs: Date.now(),
      hasEnvironments: snapshot.hasEnvironments,
      agentsWorking: snapshot.agentsWorking,
    });
    if (!decision.keep) {
      if (lastSent !== "stopped" || force) void native.stopKeepingConnected().catch(reportError);
      lastSent = "stopped";
      return;
    }
    const { title, text } = keepConnectedStatus({
      connection: snapshot.connection,
      environmentLabel: snapshot.environmentLabel,
      agentsWorking: snapshot.agentsWorking,
      notificationsOn,
      untilText: decision.untilMs === null ? null : timeText(decision.untilMs),
    });
    const stopAtMs = decision.untilMs ?? 0;
    const key = JSON.stringify([title, text, decision.holdCpu, stopAtMs]);
    if (key === lastSent && !force) return;
    lastSent = key;
    void native.keepConnected(title, text, decision.holdCpu, stopAtMs).catch(reportError);
  };

  const readNotifications = () => {
    void localNotificationsEnabled()
      .then((enabled) => {
        if (enabled === notificationsOn) return;
        notificationsOn = enabled;
        apply();
      })
      .catch(reportError);
  };

  const unsubscribe = appAtomRegistry.subscribe(snapshotAtom, (next) => {
    snapshot = next;
    apply();
  });
  const subscription = AppState.addEventListener("change", (state) => {
    const active = state === "active";
    if (active === appActive) return;
    appActive = active;
    if (!active) leftAtMs = Date.now();
    // Android may have stopped the service meanwhile, so coming back always sends it again.
    apply(active);
    if (active) readNotifications();
  });
  readNotifications();
  apply(true);
  return () => {
    unsubscribe();
    subscription.remove();
    void native.stopKeepingConnected().catch(reportError);
  };
}
