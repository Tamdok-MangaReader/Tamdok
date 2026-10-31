import * as Network from "expo-network";

export async function isOnWifi(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false) return false;
    return (
      state.type === Network.NetworkStateType.WIFI ||
      state.type === Network.NetworkStateType.ETHERNET
    );
  } catch {
    return true;
  }
}

let offlineCache: { at: number; value: boolean } | null = null;
const OFFLINE_CACHE_MS = 2000;

// True only when the OS positively reports no connection. Unknown state counts as online so a
// flaky probe never blocks a request that would have worked.
export async function isOffline(): Promise<boolean> {
  const now = Date.now();
  if (offlineCache && now - offlineCache.at < OFFLINE_CACHE_MS) {
    return offlineCache.value;
  }
  let value = false;
  try {
    const state = await Network.getNetworkStateAsync();
    value = state.isConnected === false || state.isInternetReachable === false;
  } catch {
    value = false;
  }
  offlineCache = { at: now, value };
  return value;
}
