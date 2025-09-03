
"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import type { Message, User, PersonalChat as PersonalChatType } from '@/lib/types';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, setDoc } from 'firebase/firestore';
import { Send, Frown, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { useToast } from '@/hooks/use-toast';

export function PersonalChat({ chatId }: { chatId: string }) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chat, setChat] = useState<PersonalChatType | null>(null);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const areMutuals = React.useMemo(() => {
    if (!userProfile || !otherUser) return false;
    const currentUserFollowing = userProfile.following || [];
    const otherUserFollowers = otherUser.followers || [];
    return currentUserFollowing.includes(otherUser.id) && otherUserFollowers.includes(userProfile.id);
  }, [userProfile, otherUser]);

  useEffect(() => {
    if (!chatId || !user) return;
    
    let unsubscribeMessages: () => void;
    setLoading(true);

    const setupChat = async () => {
      try {
        const otherUserId = chatId.replace(user.uid, '').replace('_', '');
        const userDoc = await getDoc(doc(db, 'users', otherUserId));
        if (userDoc.exists()) {
            setOtherUser({ id: userDoc.id, ...userDoc.data() } as User);
        } else {
            setLoading(false);
            return;
        }

        const chatDocRef = doc(db, 'personalChats', chatId);
        const chatDoc = await getDoc(chatDocRef);
        
        if (chatDoc.exists()) {
            setChat({ id: chatDoc.id, ...chatDoc.data() } as PersonalChatType);
            const messagesCollectionRef = collection(db, `personalChats/${chatId}/messages`);
            const q = query(messagesCollectionRef, orderBy('createdAt', 'asc'));
            unsubscribeMessages = onSnapshot(q, (querySnapshot) => {
              setMessages(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
            }, (err) => { 
              console.error("Error fetching messages:", err);
            });
        }
        
      } catch (error) {
        console.error("Error setting up chat:", error);
      } finally {
        setLoading(false);
      }
    };
    
    setupChat();

    return () => {
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [chatId, user?.uid]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !userProfile || !otherUser) return;
    
    if (!areMutuals) {
        toast({ title: "Cannot Send Message", description: "You must both follow each other to chat.", variant: "destructive" });
        return;
    }
    
    const chatDocRef = doc(db, 'personalChats', chatId);
    const messagesCollectionRef = collection(chatDocRef, 'messages');
    try {
        const chatDoc = await getDoc(chatDocRef);
        if (!chatDoc.exists()) {
            await setDoc(chatDocRef, {
                participants: [user.uid, otherUser.id], createdAt: serverTimestamp(), lastMessage: null,
            });
            // After creating, we should also update the local state to reflect this
            setChat({ id: chatId, participants: [user.uid, otherUser.id], createdAt: new Date(), lastMessage: null});
        }
        await addDoc(messagesCollectionRef, {
            senderId: user.uid, senderName: userProfile.name, senderAvatarUrl: userProfile.avatarUrl,
            text: newMessage, createdAt: serverTimestamp(),
        });
        setNewMessage('');
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error("Error sending message:", error);
    }
  };
  
  if (loading) {
     return ( <div className="flex flex-col h-full"><div className="flex items-center p-4 border-b"><Skeleton className="h-10 w-10 rounded-full" /><div className="ml-4 space-y-1"><Skeleton className="h-4 w-24" /></div></div><div className="flex-1 p-4 space-y-4"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-10 w-1/2 ml-auto" /><Skeleton className="h-12 w-2/3" /></div><div className="p-4 border-t"><Skeleton className="h-10 w-full" /></div></div>)
  }

  if (!otherUser) {
    return (<Alert><Frown className="h-4 w-4" /><AlertTitle>User Not Found</AlertTitle><AlertDescription>This user could not be loaded.</AlertDescription></Alert>)
  }

  if (!chat && areMutuals) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
        <Users className="h-16 w-16 mb-4" />
        <h2 className="text-2xl font-bold">Start the conversation</h2>
        <p className="max-w-sm mx-auto">You and {otherUser.name} are mutual followers. Send a message to start chatting!</p>
        <div className="w-full mt-6">
            <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
                <Input 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={"Type a message..."}
                    autoComplete="off"
                />
                <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                    <Send className="h-4 w-4" />
                </Button>
            </form>
        </div>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
            <Avatar>
                <AvatarImage src={otherUser.avatarUrl} alt={otherUser.name} />
                <AvatarFallback>{otherUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <CardTitle>{otherUser.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map(msg => (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                {msg.senderId !== user?.uid && (
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={msg.senderAvatarUrl} alt={msg.senderName} />
                        <AvatarFallback>{msg.senderName ? msg.senderName.charAt(0) : 'U'}</AvatarFallback>
                    </Avatar>
                )}
                 <div className={`flex flex-col space-y-1 max-w-xs md:max-w-md ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                    <div className={`rounded-lg px-4 py-2 ${msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        <p>{msg.text}</p>
                    </div>
                     <span className="text-xs text-muted-foreground">
                        {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'p') : 'sending...'}
                    </span>
                </div>
            </div>
        ))}
         <div ref={messagesEndRef} />
      </CardContent>
       <CardFooter className="p-4 border-t">
        <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
            <Input 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={!areMutuals ? "You must both follow each other to chat." : "Type a message..."}
                autoComplete="off"
                disabled={!areMutuals}
            />
            <Button type="submit" size="icon" disabled={!newMessage.trim() || !areMutuals}>
                <Send className="h-4 w-4" />
            </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
