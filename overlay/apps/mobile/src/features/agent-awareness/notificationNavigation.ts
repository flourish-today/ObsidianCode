import { threadDeepLinkOnScreen } from "./notificationPayload";
import { installKeepConnected } from "./keepConnected";
import {
  installLocalAgentNotifications,
  setLocalNotificationThreadOnScreen,
} from "./localNotifications";

export function setAgentNotificationPathname(pathname: string): void {
  setLocalNotificationThreadOnScreen(threadDeepLinkOnScreen(pathname));
}

// Notification taps use Android ACTION_VIEW and the app's existing deep-link navigation.
// KeepConnectedService keeps the app running after it's left, so the notifications can arrive.
export function installAgentNotificationNavigation(_navigate: (href: string) => void): () => void {
  const stopNotifications = installLocalAgentNotifications();
  const stopKeepingConnected = installKeepConnected();
  return () => {
    stopNotifications();
    stopKeepingConnected();
  };
}
