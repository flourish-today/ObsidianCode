import { threadDeepLinkOnScreen } from "./notificationPayload";
import {
  installLocalAgentNotifications,
  setLocalNotificationThreadOnScreen,
} from "./localNotifications";

export function setAgentNotificationPathname(pathname: string): void {
  setLocalNotificationThreadOnScreen(threadDeepLinkOnScreen(pathname));
}

// Notification taps use Android ACTION_VIEW and the app's existing deep-link navigation.
export function installAgentNotificationNavigation(_navigate: (href: string) => void): () => void {
  return installLocalAgentNotifications();
}
