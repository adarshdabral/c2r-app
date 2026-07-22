import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Session storage for React Native.
 *
 * The web app kept `token`, `role`, and `user_type` in `localStorage` and read
 * them synchronously (the axios request interceptor and route guards). Native
 * storage is async, so we hydrate an in-memory cache once at boot and read it
 * synchronously everywhere; every write is written through to the persistent
 * store. The token is a credential, so it lives in the Keychain/Keystore via
 * expo-secure-store; role/user_type are non-sensitive and live in AsyncStorage.
 *
 * SecureStore is unavailable on web (Expo web build). We fall back to
 * AsyncStorage there so `expo start --web` keeps working during development.
 */

export type UserRole = "user" | "recycler" | "admin";

const TOKEN_KEY = "token";
const ROLE_KEY = "role";
const USER_TYPE_KEY = "user_type";

type AuthCache = {
  token: string | null;
  role: string | null;
  userType: string | null;
};

// Synchronous mirror of persistent storage, hydrated by `hydrateAuth()`.
const cache: AuthCache = { token: null, role: null, userType: null };
let hydrated = false;

const isWeb = typeof document !== "undefined";

async function secureGet(key: string): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) return AsyncStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

/** Load persisted session into the in-memory cache. Call once at app boot. */
export async function hydrateAuth(): Promise<void> {
  const [token, role, userType] = await Promise.all([
    secureGet(TOKEN_KEY),
    AsyncStorage.getItem(ROLE_KEY),
    AsyncStorage.getItem(USER_TYPE_KEY),
  ]);
  cache.token = token;
  cache.role = role;
  cache.userType = userType;
  hydrated = true;
}

export const isAuthHydrated = () => hydrated;

// --- Synchronous reads (safe after hydration) -----------------------------

export const getToken = () => cache.token;
export const getRole = () => cache.role;
export const getUserType = () => cache.userType;

// --- Writes (update cache + persist) --------------------------------------

/** Persist a full session (login / OTP verify). */
export async function setSession(session: {
  token: string;
  role: string;
  user_type?: string | null;
}): Promise<void> {
  cache.token = session.token;
  cache.role = session.role;
  cache.userType = session.user_type ?? null;

  await Promise.all([
    secureSet(TOKEN_KEY, session.token),
    AsyncStorage.setItem(ROLE_KEY, session.role),
    session.user_type
      ? AsyncStorage.setItem(USER_TYPE_KEY, session.user_type)
      : AsyncStorage.removeItem(USER_TYPE_KEY),
  ]);
}

export async function setRole(role: string): Promise<void> {
  cache.role = role;
  await AsyncStorage.setItem(ROLE_KEY, role);
}

export async function setUserType(userType: string): Promise<void> {
  cache.userType = userType;
  await AsyncStorage.setItem(USER_TYPE_KEY, userType);
}

/** Clear the session (logout / 401). */
export async function clearSession(): Promise<void> {
  cache.token = null;
  cache.role = null;
  cache.userType = null;
  await Promise.all([
    secureDelete(TOKEN_KEY),
    AsyncStorage.removeItem(ROLE_KEY),
    AsyncStorage.removeItem(USER_TYPE_KEY),
  ]);
}
