import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import { canSyncInventory, processInventorySyncQueue } from './inventorySync.js';
import { api } from '../api.js';

const SYNC_INTERVAL_MS = 60_000;

const InventorySyncContext = createContext(null);

export function InventorySyncProvider({ children }) {
  const { isSignedIn } = useAuth();
  const [summary, setSummary] = useState({ pending: 0, synced: 0, failed: 0 });
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const syncingRef = useRef(false);

  const refreshSummary = useCallback(async () => {
    try {
      const data = await api.getInventorySyncPending();
      setSummary(data.summary || { pending: 0, synced: 0, failed: 0 });
    } catch (_) {
      /* offline */
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!canSyncInventory(isSignedIn) || syncingRef.current) return null;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await processInventorySyncQueue();
      setLastResult(result);
      await refreshSummary();
      return result;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [isSignedIn, refreshSummary]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    if (!canSyncInventory(isSignedIn)) return undefined;
    syncNow();
    const timer = setInterval(syncNow, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isSignedIn, syncNow]);

  const value = useMemo(() => ({
    summary, syncing, lastResult, syncNow, refreshSummary,
  }), [summary, syncing, lastResult, syncNow, refreshSummary]);

  return (
    <InventorySyncContext.Provider value={value}>
      {children}
    </InventorySyncContext.Provider>
  );
}

export function useInventorySync() {
  const ctx = useContext(InventorySyncContext);
  if (!ctx) throw new Error('useInventorySync must be used within InventorySyncProvider');
  return ctx;
}
