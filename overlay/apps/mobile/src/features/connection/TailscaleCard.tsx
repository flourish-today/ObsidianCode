// ObsidianCode: turns Tailscale inside the app on and off (modules/obsidian-network, Tailscale.kt).
import { requireOptionalNativeModule } from "expo";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";

import { AppText as Text, AppTextInput } from "../../components/ui/AppText";
import { ListRow } from "../../components/ui/ListRow";
import { cn } from "../../lib/cn";

interface TailscaleNativeModule {
  tailscaleStart(authKey: string): Promise<string>;
  tailscaleStatus(): Promise<string>;
  tailscaleStop(): Promise<string>;
  tailscaleLogout(): Promise<string>;
}

interface TailscaleStatus {
  readonly state: string;
  readonly authUrl?: string;
  readonly ips?: readonly string[];
  readonly dnsName?: string;
  readonly error?: string;
}

const native = requireOptionalNativeModule<TailscaleNativeModule>("ObsidianNetwork");

function parse(json: string): TailscaleStatus {
  try {
    const value = JSON.parse(json) as Partial<TailscaleStatus>;
    return { state: value.state ?? "Stopped", ...value } as TailscaleStatus;
  } catch {
    return { state: "Stopped", error: json };
  }
}

export function TailscaleCard() {
  const [status, setStatus] = useState<TailscaleStatus>({ state: "Stopped" });
  const [authKey, setAuthKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!native) return;
    let live = true;
    const refresh = () => {
      void native.tailscaleStatus().then((json) => {
        if (live) setStatus(parse(json));
      });
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  if (!native) return null;

  const run = (action: () => Promise<string>) => {
    setBusy(true);
    setActionError(null);
    void action()
      .then((json) => {
        const result = parse(json);
        if (result.error) setActionError(result.error);
      })
      .catch((error: unknown) => setActionError(String(error)))
      .then(() => native.tailscaleStatus())
      .then((json) => {
        if (json) setStatus(parse(json));
        setBusy(false);
      });
  };

  const turnOff = (
    <ListRow
      label="Turn off Tailscale"
      description="Keeps the login for next time."
      disabled={busy}
      onPress={() => run(() => native.tailscaleStop())}
    />
  );
  const divider = <View className="ml-4 border-t border-border-subtle" />;

  let rows;
  let hint =
    "Joins your tailnet inside this app, without the phone's VPN. Then pair with the Mac's Tailscale address (100.x.y.z or its .ts.net name).";
  switch (status.state) {
    case "Stopped":
      rows = (
        <>
          <View collapsable={false} className="h-13 flex-row items-center gap-3 px-4">
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className="w-20 text-base leading-[23px] text-foreground-muted"
            >
              Auth key
            </Text>
            <AppTextInput
              accessibilityLabel="Tailscale auth key"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Optional"
              value={authKey}
              onChangeText={setAuthKey}
              className="min-h-0 flex-1 rounded-none border-0 bg-transparent p-0 text-base leading-[23px]"
            />
          </View>
          {divider}
          <ListRow
            label="Turn on Tailscale"
            description="Without an auth key, you log in on Tailscale's page."
            disabled={busy}
            onPress={() => {
              const key = authKey;
              setAuthKey("");
              run(() => native.tailscaleStart(key));
            }}
          />
        </>
      );
      break;
    case "NeedsLogin":
      rows = (
        <>
          <ListRow
            label="Log in to Tailscale"
            description={status.authUrl ? "Opens the login page in your browser." : "Waiting for the login link…"}
            disabled={busy || !status.authUrl}
            onPress={() => {
              if (status.authUrl) void Linking.openURL(status.authUrl);
            }}
          />
          {divider}
          {turnOff}
        </>
      );
      break;
    case "NeedsMachineAuth":
      hint = "Approve this device in the Tailscale admin console.";
      rows = turnOff;
      break;
    case "Running":
      hint = "Connected. Pair with the Mac's Tailscale address (100.x.y.z or its .ts.net name).";
      rows = (
        <>
          <ListRow
            label={status.dnsName?.replace(/\.$/, "") || "Connected"}
            description={status.ips?.join("  ") ?? ""}
            disabled
            onPress={() => {}}
          />
          {divider}
          {turnOff}
          {divider}
          <ListRow
            label="Log out of Tailscale"
            description="Removes this phone from the tailnet."
            disabled={busy}
            onPress={() => run(() => native.tailscaleLogout())}
          />
        </>
      );
      break;
    default:
      rows = (
        <>
          <ListRow label="Starting Tailscale…" disabled onPress={() => {}} />
          {divider}
          {turnOff}
        </>
      );
  }

  const error = actionError ?? status.error ?? null;
  return (
    <View collapsable={false} className="gap-2">
      <Text className="px-4 text-sm font-t3-medium text-foreground-muted">Tailscale</Text>
      <View
        collapsable={false}
        className={cn(
          "overflow-hidden rounded-[26px] border-continuous border bg-grouped-card",
          error ? "border-danger-foreground" : "border-transparent",
        )}
      >
        {rows}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        className={cn(
          "px-4 text-sm leading-normal",
          error ? "text-danger-foreground" : "text-foreground-muted",
        )}
      >
        {error ?? hint}
      </Text>
    </View>
  );
}
