
"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import type { Message, User, PersonalChat as PersonalChatType, Call } from '@/lib/types';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, setDoc, writeBatch, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { Send, Frown, Phone, Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Firestore collections for WebRTC signaling
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};


export function PersonalChat({ chatId }: { chatId: string }) {
  const { user, userProfile, handleCallAction } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Video call state
  const [callState, setCallState] = useState<'idle' | 'calling' | 'receiving' | 'connected' | 'ended'>('idle');
  const [callData, setCallData] = useState<Call | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  const cleanupCall = useCallback(async () => {
    console.log("Cleaning up call...");
    if (peerConnection.current) {
        peerConnection.current.getTransceivers().forEach(transceiver => {
            transceiver.stop();
        });
        peerConnection.current.close();
        peerConnection.current = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
    }
    setRemoteStream(null);
    setCallState('idle');
    setCallData(null);
  }, [localStream]);

  // Main useEffect for setting up chat and call listeners
  useEffect(() => {
    isMounted.current = true;
    if (!chatId || !user) return;
    
    let unsubscribeMessages: () => void;
    let unsubscribeChat: () => void;
    let unsubscribeCall: () => void;
    
    setLoading(true);

    const setup = async () => {
      try {
        // 1. Setup Chat
        const chatDocRef = doc(db, 'personalChats', chatId);
        unsubscribeChat = onSnapshot(chatDocRef, async (chatDoc) => {
          if (!isMounted.current) return;
          if (chatDoc.exists()) {
            const otherUserId = chatDoc.data().participants.find(p => p !== user.uid);
            if (otherUserId && !otherUser) {
              const userDoc = await getDoc(doc(db, 'users', otherUserId));
              if (userDoc.exists() && isMounted.current) {
                setOtherUser({ id: userDoc.id, ...userDoc.data() } as User);
              }
            }
          }
        });

        const messagesCollectionRef = collection(db, `personalChats/${chatId}/messages`);
        const q = query(messagesCollectionRef, orderBy('createdAt', 'asc'));
        unsubscribeMessages = onSnapshot(q, (querySnapshot) => {
          if (!isMounted.current) return;
          setMessages(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
        }, (err) => { 
          console.error("Error fetching messages:", err);
        });

        // 2. Setup Call Listeners & handle incoming calls
        const callQuery = query(collection(db, 'calls'), where('calleeId', '==', user.uid), where('status', '==', 'pending'));
        unsubscribeCall = onSnapshot(callQuery, (snapshot) => {
            if (!isMounted.current) return;
            if (!snapshot.empty) {
                const call = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Call;
                const callChatId = [call.callerId, call.calleeId].sort().join('_');
                if (callChatId === chatId) {
                    setCallData(call);
                    setCallState('receiving');
                }
            }
        });

      } catch (error) {
        console.error("Error setting up chat/call:", error);
      } finally {
        if(isMounted.current) setLoading(false);
      }
    };
    
    setup();

    return () => {
      isMounted.current = false;
      if (unsubscribeMessages) unsubscribeMessages();
      if (unsubscribeChat) unsubscribeChat();
      if (unsubscribeCall) unsubscribeCall();
      cleanupCall();
    };
  }, [chatId, user?.uid]);


   // Effect to handle URL action to start a call
  useEffect(() => {
    if (searchParams.get('action') === 'call' && callState === 'idle' && otherUser && userProfile) {
        startCall(otherUser);
    }
  }, [searchParams, callState, otherUser, userProfile]);

  // Effect to listen for changes on the specific call document
  useEffect(() => {
    if (!callData?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'calls', callData.id), async (docSnapshot) => {
        if (!isMounted.current) return;
        const updatedCall = docSnapshot.data() as Call;
        if (!updatedCall) return;

        setCallData(prev => ({...prev, ...updatedCall}));

        // Handle receiving an answer
        if (peerConnection.current && !peerConnection.current.currentRemoteDescription && updatedCall.answer) {
            console.log("Got remote description (answer)");
            const answerDescription = new RTCSessionDescription(updatedCall.answer);
            await peerConnection.current.setRemoteDescription(answerDescription);
        }

        // Handle call status changes
        if(updatedCall.status === 'ended' || updatedCall.status === 'declined' || updatedCall.status === 'rejected') {
            await cleanupCall();
        }
    });

    return unsubscribe;
  }, [callData?.id, cleanupCall]);

   // Effect to listen for remote ICE candidates
   useEffect(() => {
    if (!callData?.id || !peerConnection.current) return;

    const candidatesCollection = collection(db, 'calls', callData.id, 'calleeCandidates');
    const unsubscribe = onSnapshot(candidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          peerConnection.current?.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });
    return unsubscribe;
  }, [callData?.id]);


  const startCall = async (targetUser: User) => {
    if (!user || !userProfile) return;

    setCallState('calling');
    peerConnection.current = new RTCPeerConnection(servers);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        stream.getTracks().forEach(track => peerConnection.current!.addTrack(track, stream));
    } catch(err) {
        toast({ title: "Camera/Mic Error", description: "Could not access camera or microphone.", variant: "destructive"});
        cleanupCall();
        return;
    }

    const callDocRef = doc(collection(db, 'calls'));
    const offerCandidates = collection(callDocRef, 'callerCandidates');
    const answerCandidates = collection(callDocRef, 'calleeCandidates');
    
    // Get candidates for caller, save to db
    peerConnection.current.onicecandidate = event => {
        event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    // Listen for remote stream
    peerConnection.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
    };

    const offerDescription = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offerDescription);

    const offer = { sdp: offerDescription.sdp!, type: offerDescription.type };

    const notifDocRef = doc(collection(db, "notifications"));

    const newCallData: Omit<Call, 'id'> = {
        callerId: user.uid,
        callerName: userProfile.name,
        calleeId: targetUser.id,
        offer,
        status: 'pending',
        notifId: notifDocRef.id
    };

    const batch = writeBatch(db);
    batch.set(callDocRef, newCallData);
    batch.set(notifDocRef, {
        userId: targetUser.id,
        type: 'incoming_call',
        message: `${userProfile.name} is calling you.`,
        link: `/chats?type=personal&id=${chatId}`,
        isRead: false,
        createdAt: serverTimestamp(),
        status: 'pending',
        callId: callDocRef.id
    });
    
    await batch.commit();
    setCallData({id: callDocRef.id, ...newCallData});
    setCallState('calling');
  };

  const answerCall = async () => {
    if (!callData || !user) return;
    setCallState('connected');

    peerConnection.current = new RTCPeerConnection(servers);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      stream.getTracks().forEach(track => peerConnection.current!.addTrack(track, stream));
    } catch(err) {
        toast({ title: "Camera/Mic Error", description: "Could not access camera or microphone.", variant: "destructive"});
        await hangUp('rejected');
        return;
    }

    const callDocRef = doc(db, 'calls', callData.id);
    const calleeCandidates = collection(callDocRef, 'calleeCandidates');
    const callerCandidates = collection(callDocRef, 'callerCandidates');

    peerConnection.current.onicecandidate = event => {
        event.candidate && addDoc(calleeCandidates, event.candidate.toJSON());
    };

    peerConnection.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
    };

    const callSnapshot = await getDoc(callDocRef);
    const existingCallData = callSnapshot.data() as Call;
    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(existingCallData.offer));

    const answerDescription = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answerDescription);

    const answer = { type: answerDescription.type, sdp: answerDescription.sdp! };

    await handleCallAction(callData.id, callData.notifId!, 'accepted', answer);

    onSnapshot(callerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                peerConnection.current?.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            }
        });
    });
  };

  const hangUp = async (reason: Call['status'] = 'ended') => {
      if (!callData) return;
      
      const callDocRef = doc(db, 'calls', callData.id);
      
      const batch = writeBatch(db);
      batch.update(callDocRef, { status: reason });
      
      if (callData.notifId && (reason === 'declined' || reason === 'rejected')) {
          const notifDocRef = doc(db, 'notifications', callData.notifId);
          batch.update(notifDocRef, { status: 'answered' });
      }

      await batch.commit();
      await cleanupCall();
  }

  const toggleMute = () => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
        setIsMuted(!isMuted);
    }
  }

  const toggleVideo = () => {
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
        setIsVideoOff(!isVideoOff);
      }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !userProfile || !otherUser) return;
    const chatDocRef = doc(db, 'personalChats', chatId);
    const messagesCollectionRef = collection(chatDocRef, 'messages');
    try {
        const chatDoc = await getDoc(chatDocRef);
        if (!chatDoc.exists()) {
            await setDoc(chatDocRef, {
                participants: [user.uid, otherUser.id], createdAt: serverTimestamp(), lastMessage: null,
            });
        }
        await addDoc(messagesCollectionRef, {
            senderId: user.uid, senderName: userProfile.name, senderAvatarUrl: userProfile.avatarUrl,
            text: newMessage, createdAt: serverTimestamp(),
        });
        setNewMessage('');
    } catch (error) {
        console.error("Error sending message:", error);
    }
  };
  
  if (loading) {
     return ( <div className="flex flex-col h-full"><div className="flex items-center p-4 border-b"><Skeleton className="h-10 w-10 rounded-full" /><div className="ml-4 space-y-1"><Skeleton className="h-4 w-24" /></div></div><div className="flex-1 p-4 space-y-4"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-10 w-1/2 ml-auto" /><Skeleton className="h-12 w-2/3" /></div><div className="p-4 border-t"><Skeleton className="h-10 w-full" /></div></div>)
  }

  if (!otherUser) {
    return (<Alert><Frown className="h-4 w-4" /><AlertTitle>Chat Not Found</AlertTitle><AlertDescription>The chat you are looking for could not be loaded.</AlertDescription></Alert>)
  }

  if (callState !== 'idle' && callState !== 'ended') {
    return (
        <Card className="h-full flex flex-col bg-slate-900 text-white">
             <CardContent className="flex-1 flex flex-col items-center justify-center p-4 relative">
                <div className="absolute top-4 right-4">
                    {localStream && <video ref={video => { if (video) video.srcObject = localStream }} muted autoPlay className="w-48 h-36 rounded-md object-cover border-2 border-slate-700"/>}
                </div>
                 <div className="text-center mb-8">
                     <Avatar className="h-24 w-24 mb-4 ring-4 ring-slate-700">
                         <AvatarImage src={otherUser.avatarUrl} />
                         <AvatarFallback>{otherUser.name.charAt(0)}</AvatarFallback>
                     </Avatar>
                     <CardTitle className="text-3xl">{otherUser.name}</CardTitle>
                      <p className="text-slate-400 capitalize">{callState === 'connected' ? 'Connected' : `${callState}...`}</p>
                 </div>
                 
                 <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
                    {remoteStream ? (
                        <video ref={video => { if (video) video.srcObject = remoteStream }} autoPlay className="w-full h-full object-cover"/>
                    ) : (
                        <p className="text-slate-500">Waiting for {otherUser.name}...</p>
                    )}
                 </div>

                 {callState === 'receiving' && (
                     <div className="absolute bottom-16 flex flex-col items-center gap-4">
                         <p>{callData?.callerName} is calling...</p>
                         <div className="flex gap-4">
                             <Button onClick={() => hangUp('rejected')} variant="destructive" size="lg" className="rounded-full h-16 w-16"><PhoneOff /></Button>
                             <Button onClick={answerCall} variant="secondary" size="lg" className="rounded-full h-16 w-16 bg-green-500 hover:bg-green-600"><Phone /></Button>
                         </div>
                     </div>
                 )}

             </CardContent>
             <CardFooter className="p-4 border-t border-slate-700 flex justify-center">
                 {callState === 'connected' || callState === 'calling' ? (
                     <div className="flex items-center gap-4">
                         <Button onClick={toggleMute} variant="secondary" size="icon" className={cn("rounded-full", isMuted && "bg-destructive")}>{isMuted ? <MicOff/> : <Mic />}</Button>
                         <Button onClick={() => hangUp('ended')} variant="destructive" size="lg" className="rounded-full h-16 w-16"><PhoneOff /></Button>
                         <Button onClick={toggleVideo} variant="secondary" size="icon" className={cn("rounded-full", isVideoOff && "bg-destructive")}>{isVideoOff ? <VideoOff/> : <Video />}</Button>
                     </div>
                 ) : null}
             </CardFooter>
        </Card>
    )
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
        <Button onClick={() => startCall(otherUser)} size="icon" variant="outline"><Phone className="h-4 w-4"/></Button>
      </CardHeader>
      <CardContent className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map(msg => (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                {msg.senderId !== user?.uid && (
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={msg.senderAvatarUrl} alt={msg.senderName} />
                        <AvatarFallback>{msg.senderName.charAt(0)}</AvatarFallback>
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
                placeholder="Type a message..."
                autoComplete="off"
            />
            <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                <Send className="h-4 w-4" />
            </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
