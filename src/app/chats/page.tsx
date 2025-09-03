
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MessageSquare, Users, Frown } from 'lucide-react';
import React, { useEffect, useState, useMemo, Suspense } from 'react';
import type { Project, Team, User, PersonalChat as PersonalChatType, Message } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider } from '@/components/ui/sidebar';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonalChat } from '@/components/PersonalChat';
import { ProjectChat } from '@/components/ProjectChat';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EnrichedProjectChat extends Project {
    teamId: string;
}
interface EnrichedPersonalChat extends PersonalChatType {
    otherUser: User;
}

function ChatPageContent() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [projectChats, setProjectChats] = useState<EnrichedProjectChat[]>([]);
  const [personalChats, setPersonalChats] = useState<EnrichedPersonalChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);

  const chatTypeFromUrl = searchParams.get('type');
  const chatIdFromUrl = searchParams.get('id');

  const [selectedChat, setSelectedChat] = useState<{ type: 'project' | 'personal'; id: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login?message=Please log in to view your chats.');
      return;
    }

    const fetchChats = async () => {
        setLoadingChats(true);
        
        // 1. Fetch teams the user is part of
        const teamsQuery = query(collection(db, 'teams'), where('memberIds', 'array-contains', user.uid));
        const teamsSnapshot = await getDocs(teamsQuery);
        const userTeams = teamsSnapshot.docs.map(doc => doc.data() as Team);
        const projectIds = userTeams.map(team => team.projectId);

        // 2. Fetch corresponding projects
        if (projectIds.length > 0) {
            const projectsQuery = query(collection(db, 'projects'), where('__name__', 'in', projectIds));
            const projectsSnapshot = await getDocs(projectsQuery);
            const projectsData = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), teamId: userTeams.find(t => t.projectId === doc.id)!.id } as EnrichedProjectChat));
            setProjectChats(projectsData);
        } else {
            setProjectChats([]);
        }

        // 3. Fetch personal chats
        const personalChatsQuery = query(collection(db, 'personalChats'), where('participants', 'array-contains', user.uid));
        const personalChatsUnsubscribe = onSnapshot(personalChatsQuery, async (snapshot) => {
            const chatsData: PersonalChatType[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PersonalChatType));
            
            const otherUserIds = chatsData.map(chat => chat.participants.find(p => p !== user.uid)).filter(Boolean) as string[];

            if (otherUserIds.length > 0) {
                const usersQuery = query(collection(db, 'users'), where('__name__', 'in', otherUserIds));
                const usersSnapshot = await getDocs(usersQuery);
                const usersMap = new Map(usersSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as User]));
                
                const enrichedChats = chatsData.map(chat => ({
                    ...chat,
                    otherUser: usersMap.get(chat.participants.find(p => p !== user.uid)!)!
                })).filter(chat => chat.otherUser); // Filter out chats where other user might not be found

                setPersonalChats(enrichedChats);
            } else {
                setPersonalChats([]);
            }
        });
        
        setLoadingChats(false);
        return () => {
            personalChatsUnsubscribe();
        }
    };

    fetchChats();
  }, [user, authLoading, router]);

  // Set selected chat based on URL
  useEffect(() => {
    if (chatTypeFromUrl && chatIdFromUrl) {
      setSelectedChat({ type: chatTypeFromUrl as 'project' | 'personal', id: chatIdFromUrl });
    } else if (projectChats.length > 0) {
      // setSelectedChat({ type: 'project', id: projectChats[0].id });
    } else if (personalChats.length > 0) {
      // setSelectedChat({ type: 'personal', id: personalChats[0].id });
    } else {
      setSelectedChat(null);
    }
  }, [chatTypeFromUrl, chatIdFromUrl, projectChats, personalChats]);


  if (authLoading || loadingChats || !user) {
      return (
        <div className="flex-1 container mx-auto p-4 flex items-center justify-center">
            <p>Loading chats...</p>
        </div>
      )
  }

  return (
    <SidebarProvider>
        <div className="flex flex-1 overflow-hidden">
            <Sidebar collapsible="icon" side="left" className="w-80 border-r">
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel>Project Chats</SidebarGroupLabel>
                        <SidebarMenu>
                                {projectChats.map(proj => (
                                <SidebarMenuItem key={proj.id}>
                                    <Link href={`/chats?type=project&id=${proj.id}`} className="w-full">
                                        <SidebarMenuButton isActive={selectedChat?.id === proj.id && selectedChat?.type === 'project'}>
                                            <Users className="h-4 w-4" />
                                            <span>{proj.title}</span>
                                        </SidebarMenuButton>
                                    </Link>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                    <SidebarGroup>
                        <SidebarGroupLabel>Direct Messages</SidebarGroupLabel>
                        <SidebarMenu>
                            {personalChats.map(chat => (
                                <SidebarMenuItem key={chat.id}>
                                    <Link href={`/chats?type=personal&id=${chat.id}`} className="w-full">
                                        <SidebarMenuButton isActive={selectedChat?.id === chat.id && selectedChat?.type === 'personal'}>
                                            <Avatar className="h-6 w-6">
                                                <AvatarImage src={chat.otherUser.avatarUrl} alt={chat.otherUser.name} />
                                                <AvatarFallback>{chat.otherUser.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <span>{chat.otherUser.name}</span>
                                        </SidebarMenuButton>
                                    </Link>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                </SidebarContent>
            </Sidebar>

            <main className="flex-1 overflow-y-auto">
                {selectedChat ? (
                    <div className="h-full p-4">
                        {selectedChat.type === 'personal' ? (
                            <PersonalChat chatId={selectedChat.id} />
                        ) : (
                            <ProjectChat projectId={selectedChat.id} />
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                        <MessageSquare className="h-16 w-16 mb-4" />
                        <h2 className="text-2xl font-bold">Select a chat</h2>
                        <p>Choose a conversation from the sidebar to start messaging.</p>
                    </div>
                )}
            </main>
        </div>
      </SidebarProvider>
  )
}


const ChatsPage: NextPage = () => {
  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
          <ChatPageContent />
      </Suspense>
    </div>
  );
};

export default ChatsPage;
