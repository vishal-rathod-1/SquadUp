
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  User as FirebaseUser, 
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  UserCredential
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, onSnapshot, orderBy, getDocs, writeBatch, updateDoc } from "firebase/firestore";
import { db, auth } from '@/lib/firebase-client';
import type { User, Notification, Call } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: User | null;
  loading: boolean;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  signIn: (email: string, pass: string) => Promise<UserCredential>;
  signUp: (data: any) => Promise<any>;
  signInWithGoogle: () => Promise<any>;
  signOut: () => void;
  refreshUserProfile: () => Promise<void>;
  isUsernameUnique: (username: string) => Promise<boolean>;
  handleCallAction: (callId: string, notifId: string, action: 'accepted' | 'declined' | 'rejected' | 'ended', answer?: RTCSessionDescriptionInit) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const router = useRouter();

  const isUsernameUnique = async (username: string): Promise<boolean> => {
    const q = query(collection(db, "users"), where("username", "==", username));
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty;
  };

  const generateUniqueUsername = async (email: string): Promise<string> => {
    let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    let username = baseUsername;
    let attempts = 0;
    while (!(await isUsernameUnique(username))) {
        attempts++;
        username = `${baseUsername}${Math.floor(Math.random() * 1000)}`;
    }
    return username;
  }

  const fetchUserProfile = async (firebaseUser: FirebaseUser) => {
    const userDocRef = doc(db, "users", firebaseUser.uid);
    const userDoc = await getDoc(userDocRef);
     if (userDoc.exists()) {
      const userData = { id: userDoc.id, ...userDoc.data() } as User;
      // Keep the local user profile in sync with the auth state
      if (userData.emailVerified !== firebaseUser.emailVerified) {
          await updateDoc(userDocRef, { emailVerified: firebaseUser.emailVerified });
          userData.emailVerified = firebaseUser.emailVerified;
      }
      setUserProfile(userData);
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        const userDocRef = doc(db, "users", user.uid);
        
        // Use onSnapshot to listen for real-time updates to the user profile
        const unsubProfile = onSnapshot(userDocRef, (doc) => {
             if (doc.exists()) {
                 setUserProfile({ id: doc.id, ...doc.data() } as User);
             }
        });

        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
            const newUsername = await generateUniqueUsername(user.email!);
            const newUserProfileData = {
                name: user.displayName || 'New User',
                username: newUsername,
                email: user.email!,
                emailVerified: user.emailVerified,
                avatarUrl: user.photoURL || `https://picsum.photos/seed/${user.uid}/200`,
                bio: '',
                skills: [],
                followers: [],
                following: [],
                createdAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newUserProfileData);
            setUserProfile({ id: user.uid, ...newUserProfileData, createdAt: new Date() } as User);
        } else {
            // If the user doc exists, ensure the emailVerified status is up to date
            const existingData = userDoc.data();
            if(existingData.emailVerified !== user.emailVerified) {
                await updateDoc(userDocRef, { emailVerified: user.emailVerified });
            }
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setNotifications([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const notifsRef = collection(db, 'notifications');
      const q = query(notifsRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
        setNotifications(notifs);
      });

      return () => unsubscribe();
    }
  }, [user]);

  const signIn = (email: string, password: string): Promise<UserCredential> => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (data: any): Promise<any> => {
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    const newUser = userCredential.user;
    
    await sendEmailVerification(newUser);
    
    const userDocRef = doc(db, "users", newUser.uid);
    await setDoc(userDocRef, {
      name: data.name,
      username: data.username,
      email: newUser.email,
      emailVerified: newUser.emailVerified,
      bio: data.bio,
      skills: data.skills?.split(',').map((s: string) => s.trim()).filter(Boolean) || [],
      githubUrl: data.githubUrl,
      linkedinUrl: data.linkedinUrl,
      followers: [],
      following: [],
      createdAt: serverTimestamp(),
      avatarUrl: `https://picsum.photos/seed/${newUser.uid}/200`
    });

    await firebaseSignOut(auth);
    return userCredential;
  };
  
  const signInWithGoogle = (): Promise<any> => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
    router.push('/login');
  };

  const refreshUserProfile = async () => {
      if (user) {
          await fetchUserProfile(user);
      }
  }

  const handleCallAction = useCallback(async (callId: string, notifId: string, action: 'accepted' | 'declined' | 'rejected' | 'ended', answer?: RTCSessionDescriptionInit) => {
    const callDocRef = doc(db, 'calls', callId);
    
    const batch = writeBatch(db);

    const updateData: Partial<Call> = { status: action };
    if (action === 'accepted' && answer) {
        updateData.answer = answer;
        updateData.status = 'active';
    }
    
    batch.update(callDocRef, updateData);
    
    if (notifId) {
      const notifDocRef = doc(db, 'notifications', notifId);
      batch.update(notifDocRef, { status: 'answered' });
    }
    
    await batch.commit();
  }, []);

  const value = {
    user,
    userProfile,
    loading,
    notifications,
    setNotifications,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshUserProfile,
    isUsernameUnique,
    handleCallAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

    