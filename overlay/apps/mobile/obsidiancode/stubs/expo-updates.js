// ObsidianCode: over-the-air updates are removed. Updates come only as a new APK.
export const isEnabled = false;

function removed() {
  return Promise.reject(new Error("Over-the-air updates are removed from this build."));
}

export const checkForUpdateAsync = removed;
export const fetchUpdateAsync = removed;
export const reloadAsync = removed;

export async function readLogEntriesAsync() {
  return [];
}
