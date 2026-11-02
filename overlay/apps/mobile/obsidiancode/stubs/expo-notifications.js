// ObsidianCode: notifications (and their Firebase code) are removed.
// Permission always reads "denied", so the app never asks for it.
const denied = { granted: false, status: "denied", canAskAgain: false, expires: "never" };
const subscription = { remove() {} };

export const AndroidImportance = {
  UNKNOWN: 0,
  UNSPECIFIED: 1,
  NONE: 2,
  MIN: 3,
  LOW: 4,
  DEFAULT: 5,
  HIGH: 6,
  MAX: 7,
};

export async function getPermissionsAsync() {
  return denied;
}

export async function requestPermissionsAsync() {
  return denied;
}

export async function getDevicePushTokenAsync() {
  throw new Error("Notifications are removed from this build.");
}

export function addPushTokenListener() {
  return subscription;
}

export function addNotificationResponseReceivedListener() {
  return subscription;
}

export async function getLastNotificationResponseAsync() {
  return null;
}

export async function clearLastNotificationResponseAsync() {}

export async function dismissAllNotificationsAsync() {}

export async function setNotificationChannelAsync() {
  return null;
}

export function setNotificationHandler() {}
