import * as Dialog from "../../components/ui/Dialog";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useState } from "react";
import { Linking } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { makePermissionStatusAtom } from "../../lib/permissionStatusAtom";
import {
  localNotificationsEnabled,
  requestLocalNotifications,
} from "../agent-awareness/localNotifications";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";

const statusAtom = makePermissionStatusAtom<"checking" | "enabled" | "disabled">({
  label: "obsidiancode:local-notifications",
  initial: "checking",
  read: async () => {
    try {
      return await localNotificationsEnabled() ? "enabled" : "disabled";
    } catch {
      return "disabled";
    }
  },
});

export function SettingsNotificationsRouteScreen() {
  const status = useAtomValue(statusAtom);
  const setStatus = useAtomSet(statusAtom);
  const [requesting, setRequesting] = useState(false);

  const openSettings = () => {
    void Linking.openSettings().catch(() => {
      Dialog.alert("Couldn't open Settings", "Open Android Settings, then ObsidianCode → Notifications.");
    });
  };

  const changeEnabled = async (enabled: boolean) => {
    if (requesting) return;
    if (!enabled) {
      Dialog.alert("Notification settings", "Turn off ObsidianCode notifications in Android Settings.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: openSettings },
      ]);
      return;
    }
    setRequesting(true);
    try {
      const granted = await requestLocalNotifications();
      setStatus(granted ? "enabled" : "disabled");
      if (!granted) {
        Dialog.alert("Notifications disabled", "You can enable ObsidianCode notifications in Android Settings.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: openSettings },
        ]);
      }
    } catch {
      Dialog.alert("Notifications unavailable", "Could not request notification permission. Try again in Android Settings.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <SettingsScreen title="Notifications">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-4 px-5 pt-4 pb-10"
      >
        <SettingsSection title="Agent activity">
          <SettingsSwitchRow
            icon="bell.badge"
            label="Local notifications"
            subtitle="When an agent finishes, fails, or needs your response"
            disabled={status === "checking" || requesting}
            value={status === "enabled"}
            onValueChange={(enabled) => void changeEnabled(enabled)}
          />
        </SettingsSection>
        <Text className="text-sm text-foreground-muted">
          Alerts work while ObsidianCode is running and connected to your environment. Android may
          pause the connection in the background; alerts cannot arrive while the app is suspended or
          closed. The thread you are viewing stays quiet. Tap an alert to open its thread.
        </Text>
      </ScrollView>
    </SettingsScreen>
  );
}
