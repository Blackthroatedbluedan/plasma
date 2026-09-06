import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirebaseApp } from './init.js';
import {
  isInventoryMockMode,
  isFirebaseConfigured,
  RECORD_PLASMA_MATERIAL_USE,
  FUNCTIONS_REGION,
} from './config.js';
import { api } from '../api.js';

let functionsInstance;

function getFunctionsInstance() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
    if (import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR) {
      const [host, portStr] = import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR.split(':');
      connectFunctionsEmulator(functionsInstance, host, Number(portStr) || 5001);
    }
  }
  return functionsInstance;
}

/**
 * Call KLFSapps `recordPlasmaMaterialUse` HTTPS callable (or mock in local dev).
 * @param {object} payload - Callable request body
 * @returns {Promise<{ ok: true, transactionId: string }>}
 */
export async function recordPlasmaMaterialUse(payload) {
  if (isInventoryMockMode()) {
    await new Promise((r) => setTimeout(r, 150));
    return { ok: true, transactionId: `mock-${Date.now()}` };
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars or enable VITE_FIREBASE_MOCK=true.');
  }

  const callable = httpsCallable(getFunctionsInstance(), RECORD_PLASMA_MATERIAL_USE);
  const result = await callable(payload);
  const data = result.data;

  if (!data?.ok || !data.transactionId) {
    throw new Error(data?.error || data?.message || 'Callable returned an unexpected response');
  }

  return data;
}

/**
 * Process pending inventory sync queue items (requires signed-in Firebase user).
 * Best-effort: failures leave items pending for retry.
 */
export async function processInventorySyncQueue({ onProgress } = {}) {
  const { items } = await api.getInventorySyncPending();
  const results = { synced: 0, failed: 0, skipped: items.length };

  for (const item of items) {
    try {
      const response = await recordPlasmaMaterialUse(item.payload);
      await api.completeInventorySync(item.id, { transactionId: response.transactionId });
      results.synced += 1;
      onProgress?.({ item, status: 'synced', response });
    } catch (err) {
      await api.failInventorySync(item.id, { error: err.message || String(err) }).catch(() => {});
      results.failed += 1;
      onProgress?.({ item, status: 'failed', error: err.message || String(err) });
    }
  }

  results.skipped = items.length - results.synced - results.failed;
  return results;
}

export function canSyncInventory(isSignedIn) {
  if (isInventoryMockMode()) return true;
  return isSignedIn && isFirebaseConfigured();
}
