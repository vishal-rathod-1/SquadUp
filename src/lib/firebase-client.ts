
"use client";

// This file is designated for client-side code only.
// It initializes Firebase services and exports them for use in other client components.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore, collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { firebaseConfig } from "./firebase"; // Import the configuration

// Initialize Firebase App
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize and export Firebase services
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);


export const markNotificationsAsRead = async (userId: string, notifIds?: string[]) => {
  const notifsRef = collection(db, 'notifications');
  
  let q;
  if (notifIds && notifIds.length > 0) {
    // This is less efficient, but necessary if we only want to mark specific notifications as read.
    // For batching, we have to do it this way.
  } else {
     q = query(notifsRef, where('userId', '==', userId), where('isRead', '==', false));
  }
  
  const snapshot = await getDocs(query(notifsRef, where('userId', '==', userId), where('isRead', '==', false)));

  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach(docSnapshot => {
     if (!notifIds || notifIds.includes(docSnapshot.id)) {
        batch.update(doc(db, 'notifications', docSnapshot.id), { isRead: true });
     }
  });

  await batch.commit();
};


export { app, db, auth, storage };
