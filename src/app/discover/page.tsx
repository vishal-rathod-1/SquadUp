
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
import { collection, getDocs, query, where, doc, runTransaction, arrayUnion, arrayRemove, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { User as UserIcon, Search, UserPlus, Frown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

const DiscoverPage: NextPage = () => {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const { user: currentUser, userProfile: currentUserProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.push('/login?message=Please log in to discover users.');
      return;
    }

    const fetchUsersAndRequests = async () => {
      setLoading(true);
      try {
        // Fetch all users
        const usersQuery = query(collection(db, 'users'));
        const usersSnapshot = await getDocs(usersQuery);
        const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setAllUsers(usersData);

        // Fetch follow requests sent by the current user
        const requestsQuery = query(collection(db, 'followRequests'), where('fromUserId', '==', currentUser.uid));
        const requestsSnapshot = await getDocs(requestsQuery);
        const requesteeIds = requestsSnapshot.docs.map(doc => doc.data().toUserId);
        setSentRequests(requesteeIds);

      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: "Could not fetch user profiles.",
          variant: "destructive"
        });
      }
      setLoading(false);
    };

    fetchUsersAndRequests();
  }, [currentUser, authLoading, router, toast]);
  

  const filteredAndSortedUsers = useMemo(() => {
    if (!currentUser || !currentUserProfile) return [];

    const followingIds = currentUserProfile.following || [];
    
    return allUsers
      .filter(user =>
        // Exclude current user
        user.id !== currentUser.uid &&
        // Exclude users already followed
        !followingIds.includes(user.id) &&
        // Search term filter
        (user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (user.skills && user.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()))))
      );
  }, [allUsers, currentUser, currentUserProfile, searchTerm]);

  const handleSendFollowRequest = async (targetUser: User) => {
    if (!currentUser || !currentUserProfile) return;

    setSentRequests(prev => [...prev, targetUser.id]);

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
        toast({
            title: "Request Sent",
            description: `Your follow request to ${targetUser.name} has been sent.`,
        });
    } catch (error) {
        console.error("Error sending follow request:", error);
        setSentRequests(prev => prev.filter(id => id !== targetUser.id));
        toast({
            title: "Request Failed",
            description: "Could not send follow request. Please try again.",
            variant: "destructive",
        });
    }
  };


  if (authLoading || loading) {
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
            <h1 className="text-4xl font-bold">Discover Users</h1>
            <p className="text-muted-foreground">Find new students to collaborate with and follow.</p>
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

        {filteredAndSortedUsers.length === 0 ? (
          <Alert>
            <Frown className="h-4 w-4" />
            <AlertTitle>No New Users Found</AlertTitle>
            <AlertDescription>
              Either all users are followed, or none match your search. Try a different search term.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredAndSortedUsers.map(user => (
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
                  <CardFooter className="p-4 pt-0">
                      <Button 
                        className="w-full"
                        onClick={() => handleSendFollowRequest(user)}
                        disabled={sentRequests.includes(user.id)}
                      >
                          <UserPlus className="mr-2 h-4 w-4" />
                          {sentRequests.includes(user.id) ? 'Request Sent' : 'Follow'}
                      </Button>
                  </CardFooter>
                </Card>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default DiscoverPage;
