const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID'];

export function isFirebaseConfigured() {
  return required.every((key) => Boolean(import.meta.env[key]));
}

export function isInventoryMockMode() {
  return import.meta.env.VITE_FIREBASE_MOCK === 'true';
}

export function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

export const KLFS_EMAIL_SUFFIX = '@klfs.ca';
export const RECORD_PLASMA_MATERIAL_USE = 'recordPlasmaMaterialUse';
export const FUNCTIONS_REGION = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
