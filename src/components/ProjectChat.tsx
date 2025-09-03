
"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Message } from '@/lib/types';
import { db } from '@/lib/firebase-client';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Send } from 'lucide-react';
import { format } from 'date-fns';

export function ProjectChat({ projectId }: { projectId: string }) {
  const { user, userProfile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);
  
  useEffect(() => {
    if (!projectId) return;

    const messagesCollectionRef = collection(db, `projects/${projectId}/messages`);
    const q = query(messagesCollectionRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setMessages(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    });

    return () => unsubscribe();
  }, [projectId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !userProfile) return;

    const messagesCollectionRef = collection(db, `projects/${projectId}/messages`);
    
    await addDoc(messagesCollectionRef, {
      senderId: user.uid,
      senderName: userProfile.name,
      senderAvatarUrl: userProfile.avatarUrl,
      text: newMessage,
      createdAt: serverTimestamp(),
    });

    setNewMessage('');
  };

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-muted/50 rounded-lg">
        {messages.map(msg => (
          <div key={msg.id} className={`flex items-end gap-2 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
             {msg.senderId !== user?.uid && (
                <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.senderAvatarUrl} alt={msg.senderName} />
                    <AvatarFallback>{msg.senderName.charAt(0)}</AvatarFallback>
                </Avatar>
            )}
             <div className={`flex flex-col space-y-1 max-w-xs md:max-w-md ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                 {msg.senderId !== user?.uid && <p className="text-xs text-muted-foreground font-medium">{msg.senderName}</p>}
                <div className={`rounded-lg px-4 py-2 ${msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                    <p>{msg.text}</p>
                </div>
                 <span className="text-xs text-muted-foreground">
                    {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'p') : 'sending...'}
                </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2 pt-4">
        <Input 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          autoComplete="off"
        />
        <Button type="submit" size="icon" disabled={!newMessage.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
