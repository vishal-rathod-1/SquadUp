
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import Image from 'next/image';
import React, { useEffect, useState, useMemo } from 'react';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, arrayUnion, writeBatch, documentId, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import type { Project, Team, User, CollabRequest } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { CalendarDays, Users, Trash2, UserCheck, UserX, Send, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ProjectChat } from '@/components/ProjectChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface EnrichedTeamMember {
  userId: string;
  role: string;
  name: string;
  avatarUrl?: string;
}

interface EnrichedTeam extends Omit<Team, 'members'> {
    members: EnrichedTeamMember[];
}


const ProjectDetailPage: NextPage<{ params: { id: string } }> = ({ params }) => {
  const { id: projectId } = React.use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [team, setTeam] = useState<EnrichedTeam | null>(null);
  const [requests, setRequests] = useState<CollabRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<CollabRequest['status'] | null>(null);


  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const fetchProjectData = async () => {
      setLoading(true);
      try {
        // Fetch Project
        const projectDocRef = doc(db, 'projects', projectId);
        const projectDoc = await getDoc(projectDocRef);

        if (projectDoc.exists()) {
          const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project;
          if (projectData.endDate && typeof (projectData.endDate as any).toDate === 'function') {
            projectData.endDate = (projectData.endDate as any).toDate();
          }
          setProject(projectData);

          // Fetch Team
          const teamsCollectionRef = collection(db, 'teams');
          const teamQuery = query(teamsCollectionRef, where("projectId", "==", projectId));
          const teamSnapshot = await getDocs(teamQuery);
          
          if (!teamSnapshot.empty) {
            const teamDoc = teamSnapshot.docs[0];
            const teamData = { id: teamDoc.id, ...teamDoc.data() } as Team;

            // Enrich team members with user data
            if (teamData.memberIds && teamData.memberIds.length > 0) {
              const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', teamData.memberIds));
              const userSnapshots = await getDocs(usersQuery);
              const usersData = userSnapshots.docs.reduce((acc, userDoc) => {
                acc[userDoc.id] = userDoc.data() as User;
                return acc;
              }, {} as {[key: string]: User});

              const enrichedMembers = teamData.members.map(member => ({
                ...member,
                name: usersData[member.userId]?.name || `User ${member.userId.substring(0, 5)}`,
                avatarUrl: usersData[member.userId]?.avatarUrl,
              }));
              
              setTeam({ ...teamData, members: enrichedMembers });
            } else {
              setTeam({ ...teamData, members: [] });
            }
          }

          // Fetch Join Requests if current user is owner
          if (user?.uid === projectData.createdBy) {
            const requestsQuery = query(
              collection(db, 'collabRequests'), 
              where("projectId", "==", projectId), 
              where("status", "==", "pending")
            );
            const requestsSnapshot = await getDocs(requestsQuery);
            const requestsData = requestsSnapshot.docs.map(d => ({id: d.id, ...d.data()}) as CollabRequest);
            setRequests(requestsData);
          }

          // Check if current user has already sent a request
           if (user) {
            const sentRequestQuery = query(
              collection(db, 'collabRequests'),
              where('projectId', '==', projectId),
              where('fromUserId', '==', user.uid)
            );
            const sentRequestSnapshot = await getDocs(sentRequestQuery);
            if (!sentRequestSnapshot.empty) {
                const requestData = sentRequestSnapshot.docs[0].data() as CollabRequest;
                setRequestStatus(requestData.status);
            }
          }

        } else {
          console.error('No such document!');
        }
      } catch (error) {
        console.error('Error fetching project data:', error);
      }
      setLoading(false);
    };

  useEffect(() => {
    if (!projectId) return;
    fetchProjectData();
  }, [projectId, user]);
  
  const isUserInSquad = useMemo(() => {
    if (!user || !team) return false;
    return team.memberIds.includes(user.uid);
  }, [user, team]);

  const isSquadFull = useMemo(() => {
    if (!project || !team) return false;
    return team.members.length >= project.maxMembers;
  }, [project, team]);

  const isProjectOwner = useMemo(() => {
    if (!user || !project) return false;
    return user.uid === project.createdBy;
  }, [user, project]);

  const handleRequestToJoin = async () => {
    if (!user || !userProfile || !project) {
      toast({ title: "Authentication Required", description: "Please log in to join a squad.", variant: "destructive" });
      router.push('/login');
      return;
    }
    
    if (isSquadFull) {
        toast({ title: "Squad Full", description: "This squad has reached its maximum number of members.", variant: "destructive" });
        return;
    }

    setIsRequesting(true);
    try {
        const batch = writeBatch(db);
        const requestsCollectionRef = collection(db, "collabRequests");
        const newRequestRef = doc(requestsCollectionRef);
        batch.set(newRequestRef, {
            projectId: project.id,
            fromUserId: user.uid,
            fromUserName: userProfile.name,
            fromUserAvatar: userProfile.avatarUrl || '',
            toUserId: project.createdBy,
            status: "pending",
            createdAt: serverTimestamp(),
        });
        
        // Create notification for project owner
        const notificationsCollectionRef = collection(db, "notifications");
        const newNotificationRef = doc(notificationsCollectionRef);
        batch.set(newNotificationRef, {
            userId: project.createdBy,
            type: "request_received",
            message: `${userProfile.name} requested to join "${project.title}"`,
            link: `/projects/${project.id}`,
            isRead: false,
            createdAt: serverTimestamp(),
        });

        await batch.commit();
        
        setRequestStatus('pending');
        toast({ title: "Request Sent!", description: "Your request to join has been sent to the project owner." });

    } catch (error) {
      console.error("Error sending join request:", error);
      toast({ title: "Request Failed", description: "There was an error sending your request. Please try again.", variant: "destructive" });
    }
    setIsRequesting(false);
  };
  
  const handleRequestResponse = async (requestId: string, newStatus: 'accepted' | 'rejected') => {
      if (!team || !requests || !project) return;

      const request = requests.find(r => r.id === requestId);
      if (!request) return;

      const requestDocRef = doc(db, 'collabRequests', requestId);

      try {
          const batch = writeBatch(db);
          batch.update(requestDocRef, { status: newStatus });
          
          if (newStatus === 'accepted') {
              if (isSquadFull) {
                  toast({ title: "Squad Full", description: "Cannot add member, the squad is full.", variant: "destructive" });
                  return;
              }
              const teamDocRef = doc(db, 'teams', team.id);
              batch.update(teamDocRef, {
                  members: arrayUnion({ userId: request.fromUserId, role: 'Member' }),
                  memberIds: arrayUnion(request.fromUserId)
              });
              
              // Create notification for the user who was accepted
              const notificationsCollectionRef = collection(db, "notifications");
              const newNotificationRef = doc(notificationsCollectionRef);
              batch.set(newNotificationRef, {
                userId: request.fromUserId,
                type: "request_accepted",
                message: `Your request to join "${project.title}" was accepted!`,
                link: `/projects/${project.id}`,
                isRead: false,
                createdAt: serverTimestamp(),
              });
          }
          
          await batch.commit();
          
          // Re-fetch data to update UI correctly for all changes
          await fetchProjectData();

          toast({ title: `Request ${newStatus}`, description: `The user's request has been ${newStatus}.` });

      } catch (error) {
          console.error("Error handling request:", error);
          toast({ title: "Action Failed", description: "Could not update the request status.", variant: "destructive" });
      }
  };


  const handleDeleteProject = async () => {
    if (!isProjectOwner || !project || !team) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      const projectDocRef = doc(db, 'projects', project.id);
      batch.delete(projectDocRef);
      
      const teamDocRef = doc(db, 'teams', team.id);
      batch.delete(teamDocRef);
      
      // TODO: Delete messages subcollection & requests
      
      await batch.commit();

      toast({
        title: "Project Deleted",
        description: `The project "${project.title}" has been successfully deleted.`,
      });

      router.push('/projects');

    } catch (error) {
      console.error("Error deleting project:", error);
      toast({
        title: "Deletion Failed",
        description: "An error occurred while deleting the project.",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const handleCallMember = async (targetUserId: string) => {
    if (!user) return;
    const chatId = [user.uid, targetUserId].sort().join('_');
    const chatDocRef = doc(db, 'personalChats', chatId);
     try {
        const chatDoc = await getDoc(chatDocRef);
        if (!chatDoc.exists()) {
           await setDoc(chatDocRef, {
                participants: [user.uid, targetUserId],
                createdAt: serverTimestamp(),
                lastMessage: null,
            });
        }
        router.push(`/chats?type=personal&id=${chatId}`);

      } catch (error) {
           console.error("Error creating or getting personal chat:", error);
           toast({
            title: "Chat Error",
            description: "Could not initiate personal chat. Please try again.",
            variant: "destructive",
          });
      }
  };


  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4">
          <Skeleton className="w-full h-96 rounded-lg mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <Skeleton className="w-full h-48 rounded-lg" />
              <Skeleton className="w-full h-32 rounded-lg" />
            </div>
            <div className="space-y-8">
              <Skeleton className="w-full h-64 rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4 text-center">
          <h1 className="text-2xl font-bold">Project not found</h1>
          <p className="text-muted-foreground">This project either does not exist or has been deleted.</p>
          <Button asChild className="mt-4">
            <Link href="/projects">Back to Projects</Link>
          </Button>
        </main>
      </div>
    );
  }

  const getJoinButtonText = () => {
    if (isRequesting) return 'Sending...';
    if (isUserInSquad) return "You're in the Squad";
    if (isProjectOwner) return "You Own This Project";
    if (isSquadFull) return "Squad is Full";
    if (requestStatus === 'pending') return "Request Sent";
    if (requestStatus === 'rejected') return "Request Rejected";
    return "Request to Join";
  };
  
  const isJoinButtonDisabled = isRequesting || isUserInSquad || isSquadFull || !!requestStatus || isProjectOwner;


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="relative w-full h-64 md:h-96 rounded-lg overflow-hidden mb-8">
          <Image src={`https://picsum.photos/seed/${project.id}/1200/400`} alt="Project Hero Image" fill className="object-cover" data-ai-hint="abstract background" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-8 left-8">
            <h1 className="text-4xl md:text-5xl font-extrabold text-primary-foreground">{project.title}</h1>
             <Badge variant="secondary" className="mt-2 text-lg">{project.status}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-8">
            <Card>
              <CardHeader><CardTitle>Description</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">{project.description}</p></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Project Info</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                  <div className="flex items-center"><Users className="mr-2 h-5 w-5 text-muted-foreground" /><span>{team?.members.length ?? 0} / {project.maxMembers} members</span></div>
                  <div className="flex items-center"><CalendarDays className="mr-2 h-5 w-5 text-muted-foreground" /><span>Ends on {project.endDate ? format(project.endDate, "PPP") : 'N/A'}</span></div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {project.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}
              </CardContent>
            </Card>
             
            <Card>
              <CardHeader><CardTitle>Squad Members</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                 {team && team.members.length > 0 ? team.members.map((member) => (
                    <div key={member.userId} className="flex items-center justify-between gap-4 p-2 rounded-md hover:bg-muted">
                      <Link href={`/profiles/${member.userId}`} className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={member.avatarUrl} alt={member.name} data-ai-hint="user avatar" />
                          <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.role}</p>
                        </div>
                      </Link>
                       {user && user.uid !== member.userId && isUserInSquad && (
                          <Button variant="ghost" size="icon" onClick={() => handleCallMember(member.userId)} aria-label={`Call ${member.name}`}>
                              <Phone className="h-5 w-5 text-primary" />
                          </Button>
                      )}
                    </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No team members yet. Be the first to join!</p>
                )}
              </CardContent>
            </Card>
            
             {isProjectOwner && requests.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Join Requests</CardTitle>
                        <CardDescription>Review and respond to requests to join your squad.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {requests.map(req => (
                            <div key={req.id} className="flex items-center justify-between p-2 rounded-md border">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={req.fromUserAvatar} alt={req.fromUserName} data-ai-hint="user avatar" />
                                        <AvatarFallback>{req.fromUserName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-semibold">{req.fromUserName}</p>
                                        <Button variant="link" size="sm" className="p-0 h-auto" asChild>
                                            <Link href={`/profiles/${req.fromUserId}`}>View Profile</Link>
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="icon" variant="outline" className="text-green-500" onClick={() => handleRequestResponse(req.id, 'accepted')}><UserCheck /></Button>
                                    <Button size="icon" variant="outline" className="text-red-500" onClick={() => handleRequestResponse(req.id, 'rejected')}><UserX /></Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

             <Button 
                className="w-full text-lg py-6" 
                onClick={handleRequestToJoin} 
                disabled={isJoinButtonDisabled}
              >
                <Send className="mr-2 h-4 w-4" />
                {getJoinButtonText()}
            </Button>

            {isProjectOwner && (
                <Card className="border-destructive">
                    <CardHeader>
                        <CardTitle>Admin Actions</CardTitle>
                        <CardDescription>As the project owner, you can manage this project.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                       <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={isDeleting}><Trash2 className="mr-2 h-4 w-4" />{isDeleting ? "Deleting..." : "Delete Project"}</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone. This will permanently delete the project and its associated team.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </CardFooter>
                </Card>
            )}
          </div>

          <div className="lg:col-span-2">
             <Card className="sticky top-20">
                <CardHeader><CardTitle>Group Chat</CardTitle></CardHeader>
                <CardContent>
                    {isUserInSquad ? (
                        <ProjectChat projectId={projectId} />
                    ) : (
                        <div className="text-center p-8 bg-muted rounded-lg">
                            <p className="text-muted-foreground">You must be a member of the squad to view and participate in the chat.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProjectDetailPage;
