
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Frown, Search, Users, User } from 'lucide-react';
import Link from 'next/link';
import type { Project, Team, PersonalChat, User as UserType } from '@/lib/types';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ProjectChat } from '@/components/ProjectChat';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { PersonalChat as PersonalChatComponent } from '@/components/PersonalChat';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSearchParams } from 'next/navigation';


interface EnrichedPersonalChat extends PersonalChat {
    otherUserName: string;
    otherUserAvatar?: string;
}

const ChatPageContent: React.FC = () => {
  const [projectChats, setProjectChats] = useState<Project[]>([]);
  const [personalChats, setPersonalChats] = useState<EnrichedPersonalChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<{ type: 'project' | 'personal', id: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const chatTypeFromUrl = searchParams.get('type');
  const chatIdFromUrl = searchParams.get('id');

  useEffect(() => {
    const fetchUserChats = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // --- Fetch Project Chats ---
        const teamsQuery = query(collection(db, 'teams'), where('memberIds', 'array-contains', user.uid));
        const teamsSnapshot = await getDocs(teamsQuery);
        const projectIds = teamsSnapshot.docs.map(doc => (doc.data() as Team).projectId);

        if (projectIds.length > 0) {
            const projectsQuery = query(collection(db, 'projects'), where(documentId(), 'in', projectIds));
            const projectSnapshots = await getDocs(projectsQuery);
            const projectsData = projectSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
            setProjectChats(projectsData);
        } else {
            setProjectChats([]);
        }
        
        // --- Fetch Personal Chats ---
        const personalChatsQuery = query(
            collection(db, 'personalChats'), 
            where('participants', 'array-contains', user.uid)
        );
        const personalChatsSnapshot = await getDocs(personalChatsQuery);
        const personalChatsData = personalChatsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PersonalChat));

        if (personalChatsData.length > 0) {
            const otherUserIds = personalChatsData.flatMap(c => c.participants).filter(pId => pId !== user.uid);
            const uniqueOtherUserIds = [...new Set(otherUserIds)];
            
            if (uniqueOtherUserIds.length > 0) {
                const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', uniqueOtherUserIds));
                const userSnapshots = await getDocs(usersQuery);
                const usersData = userSnapshots.docs.reduce((acc, userDoc) => {
                    acc[userDoc.id] = userDoc.data() as UserType;
                    return acc;
                }, {} as {[key: string]: UserType});

                const enrichedPersonalChats = personalChatsData.map(chat => {
                    const otherUserId = chat.participants.find(pId => pId !== user.uid)!;
                    const otherUser = usersData[otherUserId];
                    return {
                        ...chat,
                        otherUserName: otherUser?.name || 'User',
                        otherUserAvatar: otherUser?.avatarUrl,
                    }
                })
                setPersonalChats(enrichedPersonalChats);
            }
        } else {
            setPersonalChats([]);
        }


      } catch (error) {
        console.error("Error fetching user chats:", error);
      }
      setLoading(false);
    };

    fetchUserChats();
  }, [user]);
  
  useEffect(() => {
    if ((chatTypeFromUrl === 'project' || chatTypeFromUrl === 'personal') && chatIdFromUrl && !loading) {
      // Find the chat in the currently loaded chats
      const chatExists = chatTypeFromUrl === 'project'
        ? projectChats.some(p => p.id === chatIdFromUrl)
        : personalChats.some(p => p.id === chatIdFromUrl);

      if (chatExists) {
        setSelectedChat({ type: chatTypeFromUrl as 'project' | 'personal', id: chatIdFromUrl });
      } else {
        setSelectedChat(null);
      }
    }
  }, [chatTypeFromUrl, chatIdFromUrl, loading]);


  const filteredProjectChats = useMemo(() => {
    return projectChats.filter(project =>
      project.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projectChats, searchTerm]);

  const filteredPersonalChats = useMemo(() => {
    return personalChats.filter(chat =>
      chat.otherUserName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [personalChats, searchTerm]);


    if (loading) {
      return (
         <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-3 gap-4 h-full">
            <Card className="col-span-1 md:col-span-1">
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-4 p-2">
                     {[...Array(5)].map((_, i) => (
                         <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </CardContent>
            </Card>
            <Card className="col-span-1 md:col-span-3 lg:col-span-2">
                <CardContent className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">Loading chats...</p>
                </CardContent>
            </Card>
        </div>
      );
    }

    if (!user) {
        return (
            <Alert>
                <Frown className="h-4 w-4" />
                <AlertTitle>Please Log In</AlertTitle>
                <AlertDescription>
                You need to be logged in to view your chats.
                <Button asChild variant="link" className="p-0 h-auto ml-1"><Link href="/login">Login here.</Link></Button>
                </AlertDescription>
          </Alert>
        );
    }
    
    if (projectChats.length === 0 && personalChats.length === 0) {
        return (
           <Alert>
            <MessageSquare className="h-4 w-4" />
            <AlertTitle>No Active Chats</AlertTitle>
            <AlertDescription>
              You haven't joined any project squads or started any personal chats yet. Explore projects and profiles to connect with others!
            </AlertDescription>
             <Button asChild variant="outline" className="mt-4 mr-2"><Link href="/projects">Explore Projects</Link></Button>
             <Button asChild variant="outline" className="mt-4"><Link href="/profiles">Find Buddies</Link></Button>
          </Alert>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-3 gap-4 h-full">
            <Card className="col-span-1 md:col-span-1">
                <CardHeader>
                    <CardTitle>All Chats</CardTitle>
                     <div className="relative mt-2">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search chats..."
                            className="pl-8 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-2 space-y-2">
                    {filteredProjectChats.length > 0 && (
                        <div>
                            <h3 className="text-xs font-semibold uppercase text-muted-foreground px-3 py-2 flex items-center"><Users className="mr-2 h-4 w-4" /> Project Chats</h3>
                            {filteredProjectChats.map(project => (
                                <button 
                                    key={project.id}
                                    onClick={() => setSelectedChat({type: 'project', id: project.id})}
                                    className={cn(
                                        "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                        selectedChat?.type === 'project' && selectedChat.id === project.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                                    )}
                                >
                                     <Avatar className="h-8 w-8">
                                        <AvatarFallback><Users/></AvatarFallback>
                                    </Avatar>
                                    <h3 className="font-semibold">{project.title}</h3>
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {filteredProjectChats.length > 0 && filteredPersonalChats.length > 0 && <Separator />}

                    {filteredPersonalChats.length > 0 && (
                        <div>
                             <h3 className="text-xs font-semibold uppercase text-muted-foreground px-3 py-2 flex items-center"><User className="mr-2 h-4 w-4" /> Direct Messages</h3>
                            {filteredPersonalChats.map(chat => (
                                <button 
                                    key={chat.id}
                                    onClick={() => setSelectedChat({type: 'personal', id: chat.id})}
                                    className={cn(
                                        "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                        selectedChat?.type === 'personal' && selectedChat.id === chat.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                                    )}
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={chat.otherUserAvatar} alt={chat.otherUserName} data-ai-hint="user avatar"/>
                                        <AvatarFallback>{chat.otherUserName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <h3 className="font-semibold">{chat.otherUserName}</h3>
                                </button>
                            ))}
                        </div>
                    )}

                </CardContent>
            </Card>

            <div className="col-span-1 md:col-span-3 lg:col-span-2 h-full">
               <Card className="h-full flex flex-col">
                   {selectedChat?.type === 'project' && (
                        <ProjectChat projectId={selectedChat.id} />
                   )}
                   {selectedChat?.type === 'personal' && (
                        <PersonalChatComponent chatId={selectedChat.id} />
                   )}
                   {!selectedChat && (
                       <div className="flex flex-1 items-center justify-center">
                           <div className="text-center">
                               <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                               <p className="mt-4 text-muted-foreground">Select a chat to start messaging</p>
                           </div>
                       </div>
                   )}
               </Card>
            </div>
        </div>
    );
  }


const ChatsPage: NextPage = () => {

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4 flex flex-col">
         <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold">The Spill</h1>
         </div>
         <div className="flex-1">
             <Suspense fallback={<div className="text-center">Loading...</div>}>
                <ChatPageContent />
            </Suspense>
         </div>
      </main>
    </div>
  );
};

export default ChatsPage;
