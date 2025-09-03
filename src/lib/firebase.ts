
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";

// Your web app's Firebase configuration, provided by a previous step.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};
// This function is no longer the primary way services are initialized,
// but can be kept for contexts where just the app instance is needed.
export function getFirebaseApp(): FirebaseApp {
    if (getApps().length > 0) {
        return getApp();
    }
    return initializeApp(firebaseConfig);
}
