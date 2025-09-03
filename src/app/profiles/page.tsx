
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import type { User } from '@/lib/types';
import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where, doc, runTransaction, arrayUnion, arrayRemove, serverTimestamp, writeBatch, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { User as UserIcon, Search, UserPlus, MessageSquare, UserCheck, Frown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';

const ProfilesPage: NextPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { user: currentUser, userProfile: currentUserProfile, loading: authLoading, refreshUserProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !currentUserProfile) {
      router.push('/login?message=Please log in to view profiles.');
      return;
    }

    const fetchFollowingUsers = async () => {
        setLoading(true);
        try {
          if (currentUserProfile.following && currentUserProfile.following.length > 0) {
            const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', currentUserProfile.following));
            const usersSnapshot = await getDocs(usersQuery);
            const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setUsers(usersData);
          } else {
            setUsers([]); // Clear users if they are not following anyone
          }
        } catch (error) {
          console.error("Error fetching users:", error);
          toast({
            title: "Error",
            description: "Could not fetch user profiles.",
            variant: "destructive"
          });
        }
        setLoading(false);
      };

    fetchFollowingUsers();
  }, [currentUser, currentUserProfile, authLoading, router, toast]);
  

  const filteredUsers = useMemo(() => {
    return users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.skills && user.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())))
    );
  }, [users, searchTerm]);


  if (authLoading || !currentUserProfile) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4 flex items-center justify-center">
            <Alert>
                <UserIcon className="h-4 w-4" />
                <AlertTitle>Loading Profile...</AlertTitle>
                <AlertDescription>
                  Please wait while we load your information.
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
                    {[...Array(4)].map((_, i) => (
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
            <h1 className="text-4xl font-bold">Following</h1>
            <p className="text-muted-foreground">Profiles of students you follow.</p>
        </div>

        <div className="mb-8">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search in your followed users..."
                    className="pl-8 w-full md:w-1/3"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {filteredUsers.length === 0 ? (
          <Alert>
            <UserIcon className="h-4 w-4" />
            <AlertTitle>You're Not Following Anyone Yet</AlertTitle>
            <AlertDescription>
              You can find and follow users from project pages to see them here.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredUsers.map(user => (
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
                     <Button variant="secondary" className="w-full" asChild><Link href={`/profiles/${user.id}`}>View Profile</Link></Button>
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

export default ProfilesPage;

    