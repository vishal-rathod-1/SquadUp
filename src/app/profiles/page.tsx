
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import type { User, FollowRequest } from '@/lib/types';
import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where, doc, runTransaction, arrayUnion, arrayRemove, serverTimestamp, getDoc, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { User as UserIcon, Search, UserPlus, MessageSquare, UserCheck, Frown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserWithFollowStatus extends User {
    sentRequest?: FollowRequest;
    receivedRequest?: FollowRequest;
}

const ProfilesPage: NextPage = () => {
  const [users, setUsers] = useState<UserWithFollowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { user: currentUser, userProfile: currentUserProfile, loading: authLoading, refreshUserProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.push('/login?message=Please log in to view profiles.');
      return;
    }

    const fetchUsersAndRequests = async () => {
        setLoading(true);
        try {
          const usersCollection = collection(db, 'users');
          // Query for users, excluding the current user
          const q = query(
            usersCollection,
            where('__name__', '!=', currentUser.uid)
          );
          const usersSnapshot = await getDocs(q);
          let usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
          
          const userIds = usersData.map(u => u.id);
  
          if (userIds.length > 0) {
              const sentRequestsQuery = query(collection(db, 'followRequests'), where('fromUserId', '==', currentUser.uid), where('toUserId', 'in', userIds));
              const receivedRequestsQuery = query(collection(db, 'followRequests'), where('toUserId', '==', currentUser.uid), where('fromUserId', 'in', userIds));
              
              const [sentSnapshot, receivedSnapshot] = await Promise.all([getDocs(sentRequestsQuery), getDocs(receivedRequestsQuery)]);
              
              const sentRequestsMap = new Map(sentSnapshot.docs.map(doc => [doc.data().toUserId, {id: doc.id, ...doc.data()} as FollowRequest]));
              const receivedRequestsMap = new Map(receivedSnapshot.docs.map(doc => [doc.data().fromUserId, {id: doc.id, ...doc.data()} as FollowRequest]));
  
              const usersWithStatus: UserWithFollowStatus[] = usersData.map(user => ({
                  ...user,
                  sentRequest: sentRequestsMap.get(user.id),
                  receivedRequest: receivedRequestsMap.get(user.id)
              }));
              setUsers(usersWithStatus);
          } else {
              setUsers([]);
          }
  
        } catch (error) {
          console.error("Error fetching users:", error);
          toast({
            title: "Error",
            description: "Could not fetch user profiles. There might be a database configuration issue.",
            variant: "destructive"
          });
        }
        setLoading(false);
      };

    fetchUsersAndRequests();
  }, [currentUser, authLoading, router, toast]);
  
  const handleSendFollowRequest = async (targetUser: User) => {
      if (!currentUser || !currentUserProfile) return;

      const newRequestRef = doc(collection(db, "followRequests"));
      const batch = writeBatch(db);

      batch.set(newRequestRef, {
          fromUserId: currentUser.uid,
          fromUserName: currentUserProfile.name,
          fromUserAvatar: currentUserProfile.avatarUrl,
          toUserId: targetUser.id,
          status: "pending",
          createdAt: serverTimestamp(),
      });

      const newNotificationRef = doc(collection(db, "notifications"));
      batch.set(newNotificationRef, {
        userId: targetUser.id,
        type: "follow_request",
        message: `${currentUserProfile.name} sent you a follow request.`,
        link: `/profiles/${currentUser.uid}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });
      
      try {
          await batch.commit();
          //await fetchUsersAndRequests();
          toast({
              title: "Request Sent",
              description: `Your follow request to ${targetUser.name} has been sent.`,
          });
      } catch (error) {
          console.error("Error sending follow request:", error);
          toast({
              title: "Request Failed",
              description: "Could not send follow request. Please try again.",
              variant: "destructive",
          });
      }
  };

  const handleAcceptFollowRequest = async (request: FollowRequest) => {
      if (!currentUser || !currentUserProfile) return;
      
      const batch = writeBatch(db);
      
      const requestRef = doc(db, 'followRequests', request.id);
      batch.update(requestRef, { status: "accepted" });

      const currentUserRef = doc(db, 'users', currentUser.uid);
      const requesterUserRef = doc(db, 'users', request.fromUserId);
      batch.update(currentUserRef, { followers: arrayUnion(request.fromUserId) });
      batch.update(requesterUserRef, { following: arrayUnion(currentUser.uid) });
      
      const newNotificationRef = doc(collection(db, "notifications"));
      batch.set(newNotificationRef, {
        userId: request.fromUserId,
        type: "new_follower",
        message: `${currentUserProfile.name} accepted your follow request.`,
        link: `/profiles/${currentUser.uid}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      try {
          await batch.commit();
          await Promise.all([refreshUserProfile()]);
          toast({
              title: "Request Accepted",
              description: `You are now following each other.`,
          });
      } catch (error) {
          console.error("Error accepting request:", error);
          toast({
              title: "Action Failed",
              description: "Could not accept the request.",
              variant: "destructive",
          });
      }
  };

  const handleUnfollow = async (targetUser: User) => {
     if (!currentUser || !currentUserProfile) return;

    try {
        await runTransaction(db, async (transaction) => {
            const currentUserRef = doc(db, 'users', currentUser.uid);
            const targetUserRef = doc(db, 'users', targetUser.id);
            
            transaction.update(currentUserRef, { following: arrayRemove(targetUser.id) });
            transaction.update(targetUserRef, { followers: arrayRemove(currentUser.uid) });

            const requestQuery = query(collection(db, 'followRequests'), where('fromUserId', 'in', [currentUser.uid, targetUser.id]), where('toUserId', 'in', [currentUser.uid, targetUser.id]));
            const requestDocs = await getDocs(requestQuery);
            requestDocs.forEach(d => transaction.delete(d.ref));
        });

        await Promise.all([refreshUserProfile()]);
        toast({
            title: "Unfollowed",
            description: `You are no longer following ${targetUser.name}.`,
        });
    } catch(error) {
         console.error("Error unfollowing:", error);
         toast({
            title: "Action Failed",
            description: "Could not unfollow user.",
            variant: "destructive",
        });
    }
  }

  const filteredUsers = useMemo(() => {
    if (!currentUser) return [];
    return users.filter(user =>
      user.id !== currentUser.uid && (
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.skills && user.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())))
      )
    );
  }, [users, searchTerm, currentUser]);

  const getFollowButton = (user: UserWithFollowStatus) => {
      if (!currentUser || !currentUserProfile) return null;
      const isFollowing = currentUserProfile.following?.includes(user.id);
      
      if (isFollowing) {
          return <Button onClick={() => handleUnfollow(user)} variant="secondary" className="w-full"><UserCheck className="mr-2 h-4 w-4"/>Following</Button>;
      }
      if(user.receivedRequest?.status === 'pending') {
          return <Button onClick={() => handleAcceptFollowRequest(user.receivedRequest!)} className="w-full">Accept Request</Button>;
      }
      if(user.sentRequest?.status === 'pending') {
          return <Button variant="outline" className="w-full" disabled>Request Sent</Button>;
      }
      return <Button onClick={() => handleSendFollowRequest(user)} className="w-full"><UserPlus className="mr-2 h-4 w-4"/>Follow</Button>;
  }

  if (authLoading || !currentUser) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4 flex items-center justify-center">
            <Alert>
                <UserIcon className="h-4 w-4" />
                <AlertTitle>Please Log In</AlertTitle>
                <AlertDescription>
                You need to be logged in to view student profiles. 
                <Button asChild variant="link" className="p-0 h-auto ml-1"><Link href="/login">Login here.</Link></Button>
                </AlertDescription>
            </Alert>
        </main>
      </div>
    )
  }

  if (loading) {
       return (
          <div className="flex flex-col min-h-screen bg-background">
            <Header />
            <main className="flex-1 container mx-auto py-8 px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[...Array(8)].map((_, i) => (
                    <Card key={i} className="text-center p-6">
                        <Skeleton className="h-24 w-24 rounded-full mx-auto mb-4" />
                        <Skeleton className="h-6 w-1/2 mx-auto mb-2" />
                        <Skeleton className="h-4 w-3/4 mx-auto mb-4" />
                        <div className="flex flex-wrap gap-2 justify-center">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-20" />
                        </div>
                        <Skeleton className="h-10 w-full mt-6" />
                    </Card>
                    ))}
                </div>
            </main>
          </div>
        )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="flex-1 mb-8">
            <h1 className="text-4xl font-bold">Student Profiles</h1>
            <p className="text-muted-foreground">Find talented students and potential collaborators.</p>
        </div>

        <div className="mb-8">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search by name, username, or skill..."
                    className="pl-8 w-full md:w-1/3"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {filteredUsers.length === 0 && !loading ? (
          <Alert>
            <UserIcon className="h-4 w-4" />
            <AlertTitle>No Users Found</AlertTitle>
            <AlertDescription>
              No users match your search. Try a different term.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredUsers.map(user => {
              const isFollowing = currentUserProfile?.following?.includes(user.id);
              const hasMutualFollow = isFollowing && user.followers?.includes(currentUser!.uid);

              return (
                 <Card key={user.id} className="text-center flex flex-col">
                  <CardHeader className="items-center p-4">
                    <Link href={`/profiles/${user.id}`}>
                      <Avatar className="h-24 w-24 mb-4 ring-2 ring-offset-2 ring-offset-background ring-primary cursor-pointer hover:ring-accent transition-all">
                        <AvatarImage src={user.avatarUrl || `https://picsum.photos/seed/${user.id}/200`} alt={user.name} data-ai-hint="profile photo" />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <CardTitle className="text-lg hover:underline">
                      <Link href={`/profiles/${user.id}`}>{user.name}</Link>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground -mt-1">@{user.username}</p>
                    <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                        <div className="text-center">
                            <p className="font-bold text-foreground">{user.followers?.length || 0}</p>
                            <p>Followers</p>
                        </div>
                        <Separator orientation="vertical" className="h-6" />
                        <div className="text-center">
                            <p className="font-bold text-foreground">{user.following?.length || 0}</p>
                            <p>Following</p>
                        </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow px-4 pb-4">
                     {user.skills && user.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1 justify-center">
                          {user.skills.slice(0, 3).map(skill => <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>)}
                          {user.skills.length > 3 && <Badge variant="outline">+{user.skills.length - 3}</Badge>}
                      </div>
                     ) : (
                        <p className="text-xs text-muted-foreground italic">No skills listed.</p>
                     )}
                  </CardContent>
                  <CardFooter className="flex flex-col sm:flex-row gap-2 p-4 pt-0">
                     {getFollowButton(user)}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProfilesPage;
