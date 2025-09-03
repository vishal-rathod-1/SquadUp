
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Github, Linkedin, Frown, Edit, MessageSquare, UserPlus, FileText, UserCheck, Phone } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, writeBatch, documentId, addDoc, serverTimestamp, setDoc, deleteDoc, runTransaction, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase-client';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { User, Project, FollowRequest } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';

const profileFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  bio: z.string().optional(),
  skills: z.string().optional(),
  githubUrl: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  resumeUrl: z.string().url().optional().or(z.literal('')),
  avatarFile: z.any().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;


const ProfileDetailPage: NextPage<{ params: { id: string } }> = ({ params }) => {
  const id = React.use(params).id;
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [followRequest, setFollowRequest] = useState<FollowRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { user, userProfile: currentUserProfile, refreshUserProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = useMemo(() => user?.uid === id, [user, id]);
  const isFollowing = useMemo(() => currentUserProfile?.following?.includes(id), [currentUserProfile, id]);
  const isFollowedBy = useMemo(() => currentUserProfile?.followers?.includes(id), [currentUserProfile, id]);
  const hasMutualFollow = useMemo(() => isFollowing && isFollowedBy, [isFollowing, isFollowedBy]);
  const sentRequest = useMemo(() => followRequest?.status === 'pending' && followRequest.fromUserId === user?.uid, [followRequest, user]);
  const receivedRequest = useMemo(() => followRequest?.status === 'pending' && followRequest.toUserId === user?.uid, [followRequest, user]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
  });

  const fetchProfileData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        // Fetch user profile
        const userDocRef = doc(db, 'users', id);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = { id: userDoc.id, ...userDoc.data() } as User;
          setUserProfile(userData);

          // Fetch user projects (if any)
          const projectsQuery = query(collection(db, 'projects'), where('createdBy', '==', id));
          const projectSnapshots = await getDocs(projectsQuery);
          const projectsData = projectSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
          setUserProjects(projectsData);
          
           // Fetch follow request status only if not own profile
          if (user && user.uid !== id) {
            const requestQuery1 = query(collection(db, 'followRequests'), where('fromUserId', '==', user.uid), where('toUserId', '==', id));
            const requestQuery2 = query(collection(db, 'followRequests'), where('fromUserId', '==', id), where('toUserId', '==', user.uid));
            
            const [requestSnap1, requestSnap2] = await Promise.all([getDocs(requestQuery1), getDocs(requestQuery2)]);
            
            if(!requestSnap1.empty) {
              setFollowRequest({id: requestSnap1.docs[0].id, ...requestSnap1.docs[0].data()} as FollowRequest);
            } else if (!requestSnap2.empty) {
              setFollowRequest({id: requestSnap2.docs[0].id, ...requestSnap2.docs[0].data()} as FollowRequest);
            } else {
              setFollowRequest(null);
            }
          }
          
        } else {
          console.error("No such user document!");
        }

      } catch (error) {
        console.error("Error fetching profile data:", error);
      }
      setLoading(false);
    };

  useEffect(() => {
    if (userProfile) {
      form.reset({
        name: userProfile.name,
        bio: userProfile.bio,
        skills: userProfile.skills ? userProfile.skills.join(', ') : '',
        githubUrl: userProfile.githubUrl,
        linkedinUrl: userProfile.linkedinUrl,
        resumeUrl: userProfile.resumeUrl,
      });
      setImagePreview(userProfile.avatarUrl || null);
    }
  }, [userProfile, form]);

  useEffect(() => {
    fetchProfileData();
  }, [id, user]);

  const handleUpdateProfile = async (data: ProfileFormValues) => {
    if (!id || !user) return;
    const userDocRef = doc(db, 'users', id);
    try {
      let avatarUrl = userProfile?.avatarUrl;

      // Handle image upload
      if (data.avatarFile && data.avatarFile[0]) {
        const file = data.avatarFile[0];
        const storageRef = ref(storage, `profile-pictures/${user.uid}/${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        avatarUrl = await getDownloadURL(snapshot.ref);
      }

      const skillsArray = data.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
      const updatedData = {
        name: data.name,
        bio: data.bio,
        skills: skillsArray,
        githubUrl: data.githubUrl,
        linkedinUrl: data.linkedinUrl,
        resumeUrl: data.resumeUrl,
        avatarUrl: avatarUrl,
      };
      
      await updateDoc(userDocRef, updatedData);

      await refreshUserProfile(); // Refresh local profile state
      await fetchProfileData(); // Re-fetch all page data

      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      setIsEditDialogOpen(false);
    } catch (error) {
       console.error("Error updating profile:", error);
       toast({
        title: "Update Failed",
        description: "There was an error updating your profile.",
        variant: "destructive",
      });
    }
  };

  const handleSendFollowRequest = async () => {
      if (!user || !currentUserProfile || isOwnProfile) return;

      const newRequestRef = doc(collection(db, "followRequests"));
      const batch = writeBatch(db);

      batch.set(newRequestRef, {
          fromUserId: user.uid,
          fromUserName: currentUserProfile.name,
          fromUserAvatar: currentUserProfile.avatarUrl,
          toUserId: id,
          status: "pending",
          createdAt: serverTimestamp(),
      });

      const newNotificationRef = doc(collection(db, "notifications"));
      batch.set(newNotificationRef, {
        userId: id,
        type: "follow_request",
        message: `${currentUserProfile.name} sent you a follow request.`,
        link: `/profiles/${user.uid}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });
      
      try {
          await batch.commit();
          await fetchProfileData();
          toast({
              title: "Request Sent",
              description: `Your follow request to ${userProfile?.name} has been sent.`,
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

  const handleAcceptFollowRequest = async () => {
      if (!user || !followRequest || !userProfile) return;
      
      const batch = writeBatch(db);
      
      // Update the request status
      const requestRef = doc(db, 'followRequests', followRequest.id);
      batch.update(requestRef, { status: "accepted" });

      // Update follower/following lists
      const currentUserRef = doc(db, 'users', user.uid);
      const requesterUserRef = doc(db, 'users', followRequest.fromUserId);
      batch.update(currentUserRef, { followers: arrayUnion(followRequest.fromUserId) });
      batch.update(requesterUserRef, { following: arrayUnion(user.uid) });
      
      // Send notification to the requester
      const newNotificationRef = doc(collection(db, "notifications"));
      batch.set(newNotificationRef, {
        userId: followRequest.fromUserId,
        type: "new_follower",
        message: `${userProfile.name} accepted your follow request.`,
        link: `/profiles/${user.uid}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Create a personal chat between them
      const chatId = [user.uid, followRequest.fromUserId].sort().join('_');
      const chatRef = doc(db, 'personalChats', chatId);
      batch.set(chatRef, {
        participants: [user.uid, followRequest.fromUserId],
        createdAt: serverTimestamp(),
        lastMessage: null,
      }, { merge: true }); // Use merge to avoid overwriting existing chat data if any

      try {
          await batch.commit();
          await Promise.all([refreshUserProfile(), fetchProfileData()]);
          toast({
              title: "Request Accepted",
              description: `You are now following each other. A chat has been created.`,
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

  const handleUnfollow = async () => {
    if (!user || !isFollowing) return;

    try {
        await runTransaction(db, async (transaction) => {
            const currentUserRef = doc(db, 'users', user.uid);
            const targetUserRef = doc(db, 'users', id);
            
            transaction.update(currentUserRef, { following: arrayRemove(id) });
            transaction.update(targetUserRef, { followers: arrayRemove(user.uid) });

            // Also delete any existing follow requests between them
            const requestQuery1 = query(collection(db, 'followRequests'), where('fromUserId', '==', user.uid), where('toUserId', '==', id));
            const requestQuery2 = query(collection(db, 'followRequests'), where('fromUserId', '==', id), where('toUserId', '==', user.uid));
            const [requestDocs1, requestDocs2] = await Promise.all([getDocs(requestQuery1), getDocs(requestQuery2)]);
            
            requestDocs1.forEach(d => transaction.delete(d.ref));
            requestDocs2.forEach(d => transaction.delete(d.ref));
        });

        await Promise.all([refreshUserProfile(), fetchProfileData()]);
        toast({
            title: "Unfollowed",
            description: `You are no longer following ${userProfile?.name}.`,
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

  const handleNavigateToChat = (options?: { startCall: boolean }) => {
    if (!user || !userProfile) return;
    const chatId = [user.uid, userProfile.id].sort().join('_');
    const url = `/chats?type=personal&id=${chatId}` + (options?.startCall ? '&action=call' : '');
    router.push(url);
  };


  const getFollowButton = () => {
      if (isOwnProfile || !user) return null;

      if (isFollowing) {
          return <Button onClick={handleUnfollow} variant="secondary" className="w-full"><UserCheck className="mr-2 h-4 w-4" /> Following</Button>;
      }
      if (receivedRequest) {
           return <Button onClick={handleAcceptFollowRequest} className="w-full">Accept Request</Button>;
      }
      if (sentRequest) {
          return <Button variant="outline" className="w-full" disabled>Request Sent</Button>;
      }
      return <Button onClick={handleSendFollowRequest} className="w-full"><UserPlus className="mr-2 h-4 w-4" /> Follow</Button>;
  }


  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4">
          <Card className="max-w-4xl mx-auto">
            <CardHeader className="flex flex-col md:flex-row items-center gap-8 p-8 bg-muted/30">
              <Skeleton className="h-32 w-32 rounded-full border-4 border-primary" />
              <div className="space-y-3 text-center md:text-left">
                <Skeleton className="h-10 w-60" />
                <Skeleton className="h-6 w-80" />
                 <div className="flex gap-4 mt-4 justify-center md:justify-start">
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div>
                <Skeleton className="h-7 w-32 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div>
                <Skeleton className="h-7 w-24 mb-4" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!userProfile) {
     return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4 text-center">
          <Alert variant="destructive" className="max-w-lg mx-auto">
            <Frown className="h-4 w-4" />
            <AlertTitle>User Not Found</AlertTitle>
            <AlertDescription>
              This user profile could not be loaded.
            </AlertDescription>
          </Alert>
           <Button asChild className="mt-4">
            <Link href="/profiles">Back to Profiles</Link>
          </Button>
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <Card className="max-w-4xl mx-auto">
          <CardHeader className="flex flex-col md:flex-row items-start gap-8 p-8 bg-muted/30">
            <Avatar className="h-32 w-32 border-4 border-primary">
              <AvatarImage src={userProfile.avatarUrl} alt={userProfile.name} data-ai-hint="user avatar" />
              <AvatarFallback>{userProfile.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left flex-1">
              <CardTitle className="text-4xl">{userProfile.name} <span className="text-2xl text-muted-foreground">(@{userProfile.username})</span></CardTitle>
              <CardDescription className="text-lg mt-1">
                {userProfile.email}
              </CardDescription>

              <div className="flex items-center justify-center md:justify-start gap-4 mt-4 text-sm text-muted-foreground">
                <div className="text-center">
                    <p className="font-bold text-foreground">{userProfile.followers?.length || 0}</p>
                    <p>Followers</p>
                </div>
                 <Separator orientation="vertical" className="h-8" />
                 <div className="text-center">
                    <p className="font-bold text-foreground">{userProfile.following?.length || 0}</p>
                    <p>Following</p>
                </div>
              </div>

              <div className="flex gap-4 mt-4 justify-center md:justify-start">
                  {userProfile.githubUrl && (
                    <Button variant="ghost" size="icon" asChild><Link href={userProfile.githubUrl} target="_blank"><Github /></Link></Button>
                  )}
                  {userProfile.linkedinUrl && (
                    <Button variant="ghost" size="icon" asChild><Link href={userProfile.linkedinUrl} target="_blank"><Linkedin /></Link></Button>
                  )}
                   {userProfile.resumeUrl && (
                    <Button variant="ghost" size="icon" asChild><Link href={userProfile.resumeUrl} target="_blank"><FileText /></Link></Button>
                  )}
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto">
             {isOwnProfile ? (
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogTrigger asChild>
                   <Button variant="outline" className="w-full"><Edit className="mr-2 h-4 w-4" /> Edit Profile</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Your Profile</DialogTitle>
                    <DialogDescription>
                      Update your personal information. Click save when you're done.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleUpdateProfile)} className="space-y-4">
                       <FormField
                        control={form.control}
                        name="avatarFile"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Profile Photo</FormLabel>
                             <FormControl>
                                <div className="flex items-center gap-4">
                                   <Avatar className="h-24 w-24">
                                      <AvatarImage src={imagePreview || ''} alt="Profile preview" />
                                      <AvatarFallback>{userProfile.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>Change Photo</Button>
                                    <Input 
                                      type="file" 
                                      className="hidden" 
                                      ref={fileInputRef}
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          form.setValue('avatarFile', e.target.files);
                                          setImagePreview(URL.createObjectURL(file));
                                        }
                                      }}
                                    />
                                </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>About Me</FormLabel>
                            <FormControl><Textarea {...field} /></FormControl>
                             <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="skills"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Skills (comma-separated)</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                             <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField
                        control={form.control}
                        name="githubUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>GitHub URL</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField
                        control={form.control}
                        name="linkedinUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>LinkedIn URL</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="resumeUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Resume URL</FormLabel>
                            <FormControl><Input {...field} placeholder="https://example.com/resume.pdf"/></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                          {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            ) : (
                user && (
                  <>
                    {getFollowButton()}
                    {hasMutualFollow && (
                        <div className="flex gap-2 mt-2">
                            <Button onClick={() => handleNavigateToChat()} className="w-full"><MessageSquare className="mr-2 h-4 w-4"/>Message</Button>
                            <Button onClick={() => handleNavigateToChat({ startCall: true })} variant="outline" size="icon"><Phone className="h-4 w-4"/></Button>
                        </div>
                    )}
                  </>
                )
            )}
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            {userProfile.bio && (
              <div>
                <h3 className="font-bold text-xl mb-4">About Me</h3>
                <p className="text-muted-foreground">{userProfile.bio}</p>
              </div>
            )}
             {userProfile.skills && userProfile.skills.length > 0 && (
               <div>
                <h3 className="font-bold text-xl mb-4">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {userProfile.skills.map(skill => (
                    <Badge key={skill} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
             )}
             {userProjects.length > 0 && (
               <div>
                <h3 className="font-bold text-xl mb-4">Owned Projects</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {userProjects.map(project => (
                       <Card key={project.id}>
                          <CardHeader>
                            <CardTitle className="text-lg">{project.title}</CardTitle>
                          </CardHeader>
                          <CardFooter>
                              <Button variant="outline" size="sm" className="w-full" asChild><Link href={`/projects/${project.id}`}>View Project</Link></Button>
                          </CardFooter>
                        </Card>
                    ))}
                </div>
              </div>
             )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ProfileDetailPage;
