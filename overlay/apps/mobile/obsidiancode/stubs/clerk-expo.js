// ObsidianCode: Clerk (T3 Connect sign-in) is removed. Everything reports "signed out".
const signedOut = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  orgId: null,
  getToken: async () => null,
  signOut: async () => {},
};

export function useAuth() {
  return signedOut;
}

export function useUser() {
  return { isLoaded: true, isSignedIn: false, user: null };
}

export function ClerkProvider(props) {
  return props.children;
}

export function getClerkInstance() {
  throw new Error("Clerk is removed from this build.");
}
