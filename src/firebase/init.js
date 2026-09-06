import { initializeApp, getApps } from 'firebase/app';
import { getFirebaseConfig, isFirebaseConfigured } from './config.js';

let app;

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(getFirebaseConfig());
  }
  return app;
}
