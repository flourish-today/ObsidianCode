// Decides when ObsidianCode keeps its connection running in the background, and what the status
// notification says. Kept independent of React Native so it can be tested locally.

/** How long the connection stays up after the owner leaves the app. */
export const STAY_CONNECTED_AFTER_LEAVING_MS = 30 * 60_000;
/** While an agent is still working, the connection stays up this long after leaving, at most. */
export const STAY_CONNECTED_WHILE_WORKING_MS = 3 * 60 * 60_000;

export interface KeepConnectedInput {
  readonly appActive: boolean;
  /** When the app last went to the background; null if it hasn't been in front since it started. */
  readonly leftAtMs: number | null;
  readonly nowMs: number;
  readonly hasEnvironments: boolean;
  readonly agentsWorking: number;
}

export interface KeepConnectedDecision {
  readonly keep: boolean;
  /** Keep the processor awake, so updates from a working agent are handled with the screen off. */
  readonly holdCpu: boolean;
  /** When the background deadline passes, as a time; null while the app is in front. */
  readonly untilMs: number | null;
}

export function decideKeepConnected(input: KeepConnectedInput): KeepConnectedDecision {
  const off = { keep: false, holdCpu: false, untilMs: null };
  if (!input.hasEnvironments) return off;
  if (input.appActive) return { keep: true, holdCpu: false, untilMs: null };
  if (input.leftAtMs === null) return off;
  const afterLeaving = input.leftAtMs + STAY_CONNECTED_AFTER_LEAVING_MS;
  const working = input.agentsWorking > 0;
  const untilMs = working ? input.leftAtMs + STAY_CONNECTED_WHILE_WORKING_MS : afterLeaving;
  if (input.nowMs >= untilMs) return off;
  return { keep: true, holdCpu: working, untilMs };
}

export type StatusConnection = "connected" | "connecting" | "offline" | "error";

export interface KeepConnectedStatusInput {
  readonly connection: StatusConnection;
  /** The connected environment's name, or the one being reconnected. */
  readonly environmentLabel: string;
  readonly agentsWorking: number;
  readonly notificationsOn: boolean;
  readonly untilText: string | null;
}

export function keepConnectedStatus(input: KeepConnectedStatusInput): {
  title: string;
  text: string;
} {
  const title =
    input.connection === "connected" ? `Connected to ${input.environmentLabel}`
    : input.connection === "connecting" ? `Reconnecting to ${input.environmentLabel}…`
    : input.connection === "offline" ? "Phone is offline. Retrying…"
    : `Can't reach ${input.environmentLabel}. Retrying…`;
  const parts: string[] = [];
  if (input.agentsWorking > 0) {
    parts.push(input.agentsWorking === 1 ? "1 agent working" : `${input.agentsWorking} agents working`);
  }
  if (!input.notificationsOn) parts.push("Agent notifications are off in Settings");
  else if (input.agentsWorking > 0) parts.push("You'll get a notification when it's done");
  else parts.push("Notifications on");
  // While an agent works, the connection lasts until it's done (within the limit).
  if (input.untilText !== null && input.agentsWorking === 0) {
    parts.push(`Staying connected until ${input.untilText}`);
  }
  return { title, text: parts.join(". ") + "." };
}
