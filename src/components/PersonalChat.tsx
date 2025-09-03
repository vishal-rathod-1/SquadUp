
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, writeBatch, setDoc, where, getDocs, limit, deleteDoc, Unsubscribe } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase-client';
import { useAuth } from '@/hooks/useAuth';
import type { Message, PersonalChat as PersonalChatType, User, Call, Notification } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send, Paperclip, File as FileIcon, Video, PhoneOff, Lock, X } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { CardHeader, CardTitle, CardDescription } from './ui/card';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import Image from 'next/image';
import { Progress } from './ui/progress';

interface PersonalChatProps {
  chatId: string;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25MB

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

type CallStatus = 'idle' | 'calling' | 'receiving' | 'connected' | 'ended';

export function PersonalChat({ chatId }: PersonalChatProps) {
  const { user, userProfile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInfo, setChatInfo] = useState<{ otherUser: User } | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [hasMutualFollow, setHasMutualFollow] = useState(false);
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const callListeners = useRef<Unsubscribe[]>([]);
  const [incomingCall, setIncomingCall] = useState<Notification | null>(null);
  const toastIdRef = useRef<string | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const { toast, dismiss } = useToast();

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);
  
  const stopMediaTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach(track => track.stop());
  };
  
  const cleanupCall = useCallback(() => {
    if (!isMounted.current) return;
    console.log("Cleaning up call state...");

    callListeners.current.forEach(unsubscribe => unsubscribe());
    callListeners.current = [];
  
    if (pc.current) {
        pc.current.onicecandidate = null;
        pc.current.ontrack = null;
        pc.current.onconnectionstatechange = null;
        pc.current.close();
        pc.current = null;
    }
  
    stopMediaTracks(localStream.current);
    localStream.current = null;

    stopMediaTracks(remoteStream.current);
    remoteStream.current = null;
    
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    setCallStatus('idle');
    setCallId(null);
    setIncomingCall(null);
    if(toastIdRef.current) {
        dismiss(toastIdRef.current);
        toastIdRef.current = null;
    }
  }, [dismiss]);

  useEffect(() => {
    let unsubscribeMessages: () => void = () => {};
    let unsubscribeChatInfo: () => void = () => {};

    if (user && userProfile) {
      setLoading(true);
      const chatDocRef = doc(db, 'personalChats', chatId);
      unsubscribeChatInfo = onSnapshot(chatDocRef, (chatDoc) => {
        if (chatDoc.exists()) {
          const chatData = chatDoc.data() as PersonalChatType;
          const otherUserId = chatData.participants.find(pId => pId !== user.uid);
          if (otherUserId) {
            const userDocRef = doc(db, 'users', otherUserId);
            getDoc(userDocRef).then(userDoc => {
              if (userDoc.exists()) {
                const otherUserData = { id: userDoc.id, ...userDoc.data() } as User;
                if(isMounted.current) {
                    setChatInfo({ otherUser: otherUserData });
                    const isFollowing = userProfile.following?.includes(otherUserData.id);
                    const isFollowedBy = otherUserData.followers?.includes(user.uid);
                    setHasMutualFollow(!!isFollowing && !!isFollowedBy);
                }
              }
            }).catch(e => {
                console.error("Error fetching other user's profile", e);
            }).finally(() => {
                if (isMounted.current) setLoading(false);
            });
          } else {
            if (isMounted.current) setLoading(false);
          }
        } else {
             if (isMounted.current) setLoading(false);
        }
      }, (err) => {
          console.error("Error fetching chat info:", err);
          if (isMounted.current) setLoading(false);
      });
      
      const messagesRef = collection(db, 'personalChats', chatId, 'messages');
      const q = query(messagesRef, orderBy('createdAt', 'asc'));
      unsubscribeMessages = onSnapshot(q, (querySnapshot) => {
        if (!isMounted.current) return;
        setMessages(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
      }, (err) => { 
        console.error("Error fetching messages:", err);
      });

    } else {
        if (isMounted.current) setLoading(false);
    }
    
    return () => {
      unsubscribeMessages();
      unsubscribeChatInfo();
      cleanupCall();
    };
  }, [chatId, user, userProfile, cleanupCall]);

   useEffect(() => {
    if (!user?.uid) return;

    const notifsRef = collection(db, 'notifications');
    const q = query(
        notifsRef, 
        where('userId', '==', user.uid), 
        where('type', '==', 'incoming_call'),
        where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!isMounted.current) return;
        if (!snapshot.empty) {
            const callNotification = {id: snapshot.docs[0].id, ...snapshot.docs[0].data()} as Notification;
            if(callStatus === 'idle' && incomingCall?.id !== callNotification.id) {
                setIncomingCall(callNotification);
                setCallStatus('receiving');
            }
        } else {
            if(callStatus === 'receiving') {
                cleanupCall();
            }
        }
    });

    return () => unsubscribe();
}, [user?.uid, callStatus, cleanupCall, incomingCall?.id]);

 useEffect(() => {
    if (callStatus === 'receiving' && incomingCall) {
        if(toastIdRef.current) dismiss(toastIdRef.current);

        const { id: toastId } = toast({
            title: `Incoming call`,
            description: `${incomingCall.message.split(' ')[0]} is calling you.`,
            duration: 60000, 
            action: (
                <div className="flex gap-2">
                    <Button onClick={() => handleAnswerCall(incomingCall)}>Accept</Button>
                    <Button variant="destructive" onClick={() => handleDeclineCall(incomingCall)}>Decline</Button>
                </div>
            ),
             onClose: () => {
                 if (isMounted.current && callStatus === 'receiving') {
                    handleDeclineCall(incomingCall);
                 }
             }
        });
        toastIdRef.current = toastId;
    }
}, [callStatus, incomingCall]);

  useEffect(() => {
    if (localVideoRef.current && localStream.current) {
      localVideoRef.current.srcObject = localStream.current;
    }
    if (remoteVideoRef.current && remoteStream.current) {
      remoteVideoRef.current.srcObject = remoteStream.current;
    }
  }, [callStatus, localStream, remoteStream]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
        if (selectedFile.type.startsWith('image/') && selectedFile.size > MAX_IMAGE_SIZE) {
            toast({ title: "Image is too large", description: `Please select an image smaller than ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`, variant: "destructive" });
            return;
        }
        if (selectedFile.type.startsWith('video/') && selectedFile.size > MAX_VIDEO_SIZE) {
            toast({ title: "Video is too large", description: `Please select a video smaller than ${MAX_VIDEO_SIZE / 1024 / 1024}MB.`, variant: "destructive" });
            return;
        }
        setFile(selectedFile);
    }
  };

  const cancelUpload = () => {
    setFile(null);
    if(fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile || !chatInfo || (newMessage.trim() === '' && !file)) return;
    
    if (!hasMutualFollow) {
      toast({ title: "Cannot send message", description: "You must both follow each other to chat.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    
    if (file) {
        const storageRef = ref(storage, `personal-chats/${chatId}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => {
                console.error("Upload failed:", error);
                toast({ title: "Upload Failed", description: "Your file could not be uploaded.", variant: "destructive"});
                setIsUploading(false);
                setUploadProgress(null);
            },
            async () => {
                const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
                await sendMessageWithAttachment(newMessage, { fileUrl, fileName: file.name, fileType: file.type, fileSize: file.size });
            }
        );
    } else {
         await sendMessageWithAttachment(newMessage);
    }
  };
  
  const sendMessageWithAttachment = async (text: string, attachment?: any) => {
      if (!user || !userProfile || !chatInfo) return;

      try {
           const batch = writeBatch(db);
            const messagesRef = collection(db, 'personalChats', chatId, 'messages');
            const newMessageRef = doc(messagesRef);
            const messageData: Partial<Message> = {
                text: text,
                createdAt: serverTimestamp(),
                senderId: user.uid,
                senderName: userProfile.name,
                senderAvatarUrl: userProfile.avatarUrl || '',
                ...(attachment && attachment)
            };
            batch.set(newMessageRef, messageData);
            const chatDocRef = doc(db, 'personalChats', chatId);
            batch.update(chatDocRef, { lastMessage: messageData });
            const otherUserId = chatInfo.otherUser.id;
            const newNotifRef = doc(collection(db, 'notifications'));
            batch.set(newNotifRef, {
                userId: otherUserId,
                type: "new_message",
                message: `New message from ${userProfile.name}`,
                link: `/chats?type=personal&id=${chatId}`,
                isRead: false,
                createdAt: serverTimestamp(),
            });
            await batch.commit();
            setNewMessage('');
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
      } catch(error) {
          console.error("Error sending message:", error);
          toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
      } finally {
            setIsUploading(false);
            setUploadProgress(null);
      }
  }

 const handleInitiateCall = async () => {
    if (!user || !userProfile || !chatInfo?.otherUser.id || callStatus !== 'idle') return;

    pc.current = new RTCPeerConnection(servers);
    
    try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if(isMounted.current) {
            setCallStatus('calling');
        }
    } catch (e) {
        console.error("Error accessing media devices.", e);
        toast({ title: "Error", description: "Could not access camera or microphone.", variant: "destructive" });
        cleanupCall();
        return;
    }
    
    localStream.current.getTracks().forEach(track => {
        pc.current!.addTrack(track, localStream.current!);
    });

    pc.current.ontrack = (event) => {
        const stream = event.streams[0];
        if (isMounted.current) {
            remoteStream.current = stream;
            setCallStatus('connected');
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
        }
    };

    const callDocRef = doc(collection(db, 'personalChats', chatId, 'calls'));
    setCallId(callDocRef.id);
    const offerCandidates = collection(callDocRef, 'offerCandidates');
    const answerCandidates = collection(callDocRef, 'answerCandidates');

    pc.current.onicecandidate = event => {
        event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    const newNotifRef = doc(collection(db, 'notifications'));
    
    const offerDescription = await pc.current.createOffer();
    await pc.current.setLocalDescription(offerDescription);
    const offer = { sdp: offerDescription.sdp, type: offerDescription.type };
    
    const batch = writeBatch(db);
    batch.set(callDocRef, { offer, callerId: user.uid, calleeId: chatInfo.otherUser.id, status: 'pending', notifId: newNotifRef.id });
    batch.set(newNotifRef, { userId: chatInfo.otherUser.id, type: "incoming_call", message: `${userProfile.name} is calling you.`, link: callDocRef.id, isRead: false, createdAt: serverTimestamp(), status: 'pending' });
    await batch.commit();
    
    const unsubCallDoc = onSnapshot(callDocRef, (snapshot) => {
        if (!isMounted.current) return;
        const data = snapshot.data();
        if (!snapshot.exists() || data?.status === 'ended' || data?.status === 'declined') {
            cleanupCall();
            return;
        }
        if (pc.current && !pc.current.currentRemoteDescription && data?.answer) {
            pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    });

    const unsubAnswerCandidates = onSnapshot(answerCandidates, (snapshot) => {
        if (!isMounted.current) return;
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' && pc.current?.currentRemoteDescription) {
                pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            }
        });
    });

    callListeners.current.push(unsubCallDoc, unsubAnswerCandidates);
  };

  const handleAnswerCall = async (callNotification: Notification) => {
      if (!user || callStatus !== 'receiving') return;

      setIncomingCall(null);
      if(toastIdRef.current) {
        dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      
      const callDocId = callNotification.link;
      const notificationId = callNotification.id;

      pc.current = new RTCPeerConnection(servers);
      setCallId(callDocId);
      
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (e) {
          console.error("Error accessing media devices on answer.", e);
          toast({ title: "Error", description: "Could not access camera or microphone.", variant: "destructive" });
          await handleDeclineCall(callNotification);
          return;
      }
      
      localStream.current.getTracks().forEach(track => {
          pc.current!.addTrack(track, localStream.current!);
      });

      pc.current.ontrack = (event) => {
          const stream = event.streams[0];
          if(isMounted.current) {
             remoteStream.current = stream;
             setCallStatus('connected');
          }
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
          }
      };
      
      const callDocRef = doc(db, 'personalChats', chatId, 'calls', callDocId);
      const offerCandidates = collection(callDocRef, 'offerCandidates');
      const answerCandidates = collection(callDocRef, 'answerCandidates');

      pc.current.onicecandidate = event => {
          event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
      };

      const callDoc = await getDoc(callDocRef);
      if (!callDoc.exists() || callDoc.data().status !== 'pending') {
          cleanupCall();
          toast({ title: "Call Unavailable", description: "This call is no longer available.", variant: "destructive" });
          return;
      }
      
      const offerDescription = callDoc.data().offer;
      await pc.current.setRemoteDescription(new RTCSessionDescription(offerDescription));

      const answerDescription = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answerDescription);
      const answer = { type: answerDescription.type, sdp: answerDescription.sdp };
      
      const batch = writeBatch(db);
      batch.update(callDocRef, { answer, status: 'active' });
      batch.delete(doc(db, 'notifications', notificationId));
      await batch.commit();

      if (isMounted.current) {
          setCallStatus('connected');
      }

      const unsubOfferCandidates = onSnapshot(offerCandidates, (snapshot) => {
          if (!isMounted.current) return;
          snapshot.docChanges().forEach((change) => {
              if (change.type === 'added' && pc.current?.remoteDescription) {
                  pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
              }
          });
      });

      const unsubCallDoc = onSnapshot(callDocRef, (snapshot) => {
          if (!isMounted.current || !snapshot.exists() || snapshot.data()?.status === 'ended' || snapshot.data()?.status === 'declined') {
              cleanupCall();
          }
      });
      callListeners.current.push(unsubOfferCandidates, unsubCallDoc);
  };


  const handleDeclineCall = async (callNotification: Notification) => {
    if (!callNotification) return;

    if(toastIdRef.current) {
        dismiss(toastIdRef.current);
        toastIdRef.current = null;
    }
    
    try {
        const batch = writeBatch(db);
        const callDocRef = doc(db, 'personalChats', chatId, 'calls', callNotification.link);
        const notificationDocRef = doc(db, 'notifications', callNotification.id);
        
        batch.update(callDocRef, { status: 'declined' });
        batch.delete(notificationDocRef);
        await batch.commit();

    } catch (error) {
        if ((error as any).code !== 'not-found') {
            console.error("Error declining call:", error);
        }
    }
    cleanupCall();
  };
  
  const handleHangup = async () => {
      if (callId) {
          try {
            const callDocRef = doc(db, 'personalChats', chatId, 'calls', callId);
            const callDoc = await getDoc(callDocRef);
            if(callDoc.exists()){
                const batch = writeBatch(db);
                const currentStatus = callDoc.data().status;
                const notifId = callDoc.data().notifId;
                
                if (currentStatus === 'pending' && notifId) {
                    batch.delete(doc(db, 'notifications', notifId));
                }
                batch.update(callDocRef, { status: 'ended' }); 
                await batch.commit();
            }
          } catch(e) {
              console.error("Error during hangup", e);
          }
      }
      cleanupCall();
  }

  const renderFile = (msg: Message) => {
    if (!msg.fileUrl) return null;
    if (msg.fileType?.startsWith('image/')) {
        return <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"><Image src={msg.fileUrl} alt={msg.fileName || 'uploaded image'} width={200} height={200} className="rounded-md mt-2 max-w-full h-auto" /></a>
    }
    if (msg.fileType?.startsWith('video/')) {
        return <video src={msg.fileUrl} controls className="rounded-md mt-2 max-w-full h-auto" style={{maxWidth: '250px'}} />
    }
    return (
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-background/50 p-2 rounded-md mt-2 border">
            <FileIcon className="h-6 w-6" />
            <div className="flex flex-col"><span className="text-sm font-medium">{msg.fileName}</span><span className="text-xs text-muted-foreground">{msg.fileSize ? `${(msg.fileSize / 1024).toFixed(2)} KB` : ''}</span></div>
        </a>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-[700px]"><p>Loading chat...</p></div>;

  const isVideoOpen = callStatus === 'calling' || callStatus === 'connected';

  return (
    <div className="flex flex-col h-[700px]">
       <CardHeader className="flex flex-row items-center justify-between">
           <CardTitle>{chatInfo?.otherUser?.name || 'Direct Message'}</CardTitle>
           <Button variant="ghost" size="icon" onClick={handleInitiateCall} disabled={isVideoOpen || !hasMutualFollow}>
               <Video className="h-5 w-5" />
           </Button>
       </CardHeader>
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex items-end gap-3 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
               {msg.senderId !== user?.uid && (<Avatar className="h-8 w-8"><AvatarImage src={msg.senderAvatarUrl} /><AvatarFallback>{msg.senderName.charAt(0)}</AvatarFallback></Avatar>)}
              <div className={`rounded-lg px-3 py-2 max-w-[70%] ${msg.senderId === user?.uid ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <p className={`text-xs font-semibold mb-1 ${msg.senderId === user?.uid ? 'text-primary-foreground/80' : 'text-foreground'}`}>{msg.senderId === user?.uid ? 'You' : msg.senderName}</p>
                 {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                {renderFile(msg)}
              </div>
               {msg.senderId === user?.uid && (<Avatar className="h-8 w-8"><AvatarImage src={userProfile?.avatarUrl} alt={userProfile?.name || ''} /><AvatarFallback>{userProfile?.name?.charAt(0)}</AvatarFallback></Avatar>)}
            </div>
          ))}
        </div>
      </ScrollArea>
       {!hasMutualFollow ? (
        <div className="p-4 border-t text-center text-sm text-muted-foreground bg-muted/50"><Lock className="h-4 w-4 mx-auto mb-2" />You must both follow each other to send messages.</div>
      ) : (
        <div className="border-t p-4">
             {uploadProgress !== null && (<div className="mb-2"><Progress value={uploadProgress} className="w-full h-2" /><p className="text-xs text-muted-foreground mt-1 text-center">Uploading: {uploadProgress.toFixed(0)}%</p></div>)}
             {file && (<div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-md text-sm"><FileIcon className="h-4 w-4" /><span className="flex-1 truncate">{file.name}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelUpload}><X className="h-4 w-4"/></Button></div>)}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*"/>
                <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUploading}><Paperclip className="h-4 w-4" /></Button>
                <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." autoComplete="off" disabled={isUploading} />
                <Button type="submit" size="icon" disabled={(!newMessage.trim() && !file) || isUploading}>{isUploading ? <div className="h-4 w-4 border-2 border-t-transparent rounded-full animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            </form>
        </div>
      )}

      <Dialog open={isVideoOpen} onOpenChange={(open) => { if (!open && callStatus !== 'idle') handleHangup(); }}>
        <DialogContent className="max-w-4xl p-0 border-0 bg-black text-white">
            <DialogHeader className="sr-only">
                <DialogTitle>Video Call</DialogTitle>
                <DialogDescription>Video call with {chatInfo?.otherUser?.name || 'your buddy'}.</DialogDescription>
            </DialogHeader>
            <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden rounded-md">
                <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                <div className="absolute bottom-4 right-4 w-1/4 h-1/4 max-w-[200px] max-h-[150px] rounded-lg shadow-lg overflow-hidden border-2 border-white z-20">
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                </div>
                 <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-black/50 p-2 rounded-md">
                    <p>{callStatus === 'calling' ? 'Calling...' : callStatus === 'connected' ? `Connected with ${chatInfo?.otherUser.name}` : 'Connecting...'}</p>
                </div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                    <Button variant="destructive" size="icon" className="rounded-full h-12 w-12" onClick={handleHangup}>
                        <PhoneOff className="h-6 w-6" />
                    </Button>
                </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
