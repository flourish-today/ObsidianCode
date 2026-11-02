// ObsidianCode: the QR scanner (Google ML Kit) is removed. Pair by pasting the link.
const denied = { granted: false, status: "denied", canAskAgain: false, expires: "never" };

export function CameraView() {
  return null;
}

export function useCameraPermissions() {
  return [denied, async () => denied, async () => denied];
}
