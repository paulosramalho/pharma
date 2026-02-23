import { useState, useEffect, useCallback } from "react";
import { getStoreId } from "../lib/api";
import {
  replayQueue,
  clearFailed,
  getSyncState,
  onSyncStateChange,
  refreshCounts,
} from "../lib/sync";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState(getSyncState);

  useEffect(() => {
    // Sync when the engine emits a state change
    const unsub = onSyncStateChange(setSyncState);

    // Track online/offline transitions
    const handleOnline = async () => {
      setIsOnline(true);
      const storeId = getStoreId();
      if (storeId) {
        await replayQueue({ storeId });
      }
    };
    const handleOffline = () => setIsOnline(false);

    // Refresh counts when a new mutation is queued from api.js
    const handleMutationQueued = () => refreshCounts(getStoreId());

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pharma:mutation-queued", handleMutationQueued);

    // Refresh counts on mount (in case there are pending items from previous session)
    refreshCounts(getStoreId());

    return () => {
      unsub();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pharma:mutation-queued", handleMutationQueued);
    };
  }, []);

  const syncNow = useCallback(async () => {
    const storeId = getStoreId();
    if (storeId) await replayQueue({ storeId });
  }, []);

  const clearFailedItems = useCallback(async () => {
    const storeId = getStoreId();
    if (storeId) await clearFailed(storeId);
  }, []);

  return {
    isOnline,
    pendingCount: syncState.pendingCount,
    failedCount: syncState.failedCount,
    syncStatus: syncState.status,
    syncNow,
    clearFailed: clearFailedItems,
  };
}
