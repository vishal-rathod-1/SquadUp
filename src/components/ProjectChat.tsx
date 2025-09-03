
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, where, writeBatch, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, type UploadTask } from 'firebase/storage';
import { db, storage } from '@/lib/firebase-client';
import { useAuth } from '@/hooks/useAuth';
import type { Message, Team } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send, Paperclip, File as FileIcon, X } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { Progress } from './ui/progress';

interface ProjectChatProps {
  projectId: string;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25MB

export function ProjectChat({ projectId }: ProjectChatProps) {
  const { user, userProfile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const messagesRef = collection(db, 'projects', projectId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching chat messages:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
        if (selectedFile.type.startsWith('image/') && selectedFile.size > MAX_IMAGE_SIZE) {
            toast({
                title: "Image is too large",
                description: `Please select an image smaller than ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`,
                variant: "destructive",
            });
            return;
        }
         if (selectedFile.type.startsWith('video/') && selectedFile.size > MAX_VIDEO_SIZE) {
            toast({
                title: "Video is too large",
                description: `Please select a video smaller than ${MAX_VIDEO_SIZE / 1024 / 1024}MB.`,
                variant: "destructive",
            });
            return;
        }
        setFile(selectedFile);
    }
  }

  const cancelUpload = () => {
    setFile(null);
    if(fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile || (newMessage.trim() === '' && !file)) return;

    setIsUploading(true);

    if (file) {
        const storageRef = ref(storage, `project-chats/${projectId}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => {
                console.error("Upload failed:", error);
                toast({ title: "Upload Failed", description: "Your file could not be uploaded.", variant: "destructive"});
                setIsUploading(false);
                setUploadProgress(null);
            },
            async () => {
                const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
                const fileMetadata = {
                    fileUrl: fileUrl,
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                };
                await sendMessageWithAttachment(newMessage, fileMetadata);
            }
        );
    } else {
        await sendMessageWithAttachment(newMessage);
    }
  };

  const sendMessageWithAttachment = async (text: string, attachment?: any) => {
    if (!user || !userProfile) return;
    try {
        const batch = writeBatch(db);
        const messagesRef = collection(db, 'projects', projectId, 'messages');
        const newMessageRef = doc(messagesRef);

        batch.set(newMessageRef, {
            text: text,
            createdAt: serverTimestamp(),
            senderId: user.uid,
            senderName: userProfile.name,
            senderAvatarUrl: userProfile.avatarUrl || '',
            ...(attachment && attachment)
        });

        const teamsQuery = query(collection(db, 'teams'), where('projectId', '==', projectId));
        const teamSnap = await getDocs(teamsQuery);

        if (!teamSnap.empty) {
            const team = teamSnap.docs[0].data() as Team;
            const otherMembers = team.members.filter(m => m.userId !== user.uid);
            
            const notificationsRef = collection(db, 'notifications');
            otherMembers.forEach(member => {
                const newNotifRef = doc(notificationsRef);
                batch.set(newNotifRef, {
                    userId: member.userId,
                    type: "new_message",
                    message: `New message in "${team.teamName}" from ${userProfile.name}`,
                    link: `/chats?type=project&id=${projectId}`,
                    isRead: false,
                    createdAt: serverTimestamp(),
                });
            });
        }
        
        await batch.commit();
        setNewMessage('');
        setFile(null);
        if(fileInputRef.current) fileInputRef.current.value = "";

    } catch (error) {
        console.error("Error sending message and notifications:", error);
        toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
    } finally {
        setIsUploading(false);
        setUploadProgress(null);
    }
  }

  const renderFile = (msg: Message) => {
    if (!msg.fileUrl) return null;

    if (msg.fileType?.startsWith('image/')) {
        return (
            <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                <Image src={msg.fileUrl} alt={msg.fileName || 'uploaded image'} width={200} height={200} className="rounded-md mt-2 max-w-full h-auto" />
            </a>
        );
    }
    
    if (msg.fileType?.startsWith('video/')) {
        return (
            <video src={msg.fileUrl} controls className="rounded-md mt-2 max-w-full h-auto" style={{maxWidth: '250px'}} />
        );
    }

    return (
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-background/50 p-2 rounded-md mt-2 border">
            <FileIcon className="h-6 w-6" />
            <div className="flex flex-col">
                <span className="text-sm font-medium">{msg.fileName}</span>
                <span className="text-xs text-muted-foreground">{msg.fileSize ? `${(msg.fileSize / 1024).toFixed(2)} KB` : ''}</span>
            </div>
        </a>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-[600px]"><p>Loading chat...</p></div>;
  }

  return (
    <div className="flex flex-col h-[600px]">
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex items-end gap-3 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
               {msg.senderId !== user?.uid && (
                 <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.senderAvatarUrl} alt={msg.senderName} data-ai-hint="user avatar" />
                    <AvatarFallback>{msg.senderName.charAt(0)}</AvatarFallback>
                </Avatar>
               )}
              <div className={`rounded-lg px-3 py-2 max-w-[70%] ${msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <p className={`text-xs font-semibold mb-1 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-foreground'}`}>{msg.senderId === user?.uid ? 'You' : msg.senderName}</p>
                {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                {renderFile(msg)}
              </div>
               {msg.senderId === user?.uid && (
                 <Avatar className="h-8 w-8">
                    <AvatarImage src={userProfile?.avatarUrl} alt={userProfile?.name || ''} data-ai-hint="user avatar" />
                    <AvatarFallback>{userProfile?.name?.charAt(0)}</AvatarFallback>
                </Avatar>
               )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        {uploadProgress !== null && (
            <div className="mb-2">
                <Progress value={uploadProgress} className="w-full h-2" />
                <p className="text-xs text-muted-foreground mt-1 text-center">Uploading: {uploadProgress.toFixed(0)}%</p>
            </div>
        )}
        {file && (
            <div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-md text-sm">
                <FileIcon className="h-4 w-4" />
                <span className="flex-1 truncate">{file.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelUpload}>
                    <X className="h-4 w-4"/>
                </Button>
            </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*" />
            <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Paperclip className="h-4 w-4" />
            </Button>
            <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            autoComplete="off"
            disabled={isUploading}
            />
            <Button type="submit" size="icon" disabled={(!newMessage.trim() && !file) || isUploading}>
            {isUploading ? <div className="h-4 w-4 border-2 border-t-transparent rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
        </form>
      </div>
    </div>
  );
}
