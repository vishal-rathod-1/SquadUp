
"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { LogIn, LogOut, User as UserIcon, MessageSquare, Bell, UserPlus, UserCheck } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { markNotificationsAsRead, db } from "@/lib/firebase-client";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { doc, writeBatch, arrayUnion, collection, query, where, getDocs } from "firebase/firestore";

const NavLinks = ({isMobile = false}: {isMobile?: boolean}) => {
  const { user } = useAuth();
  return (
  <>
    <Link href="/projects" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Projects</Link>
    <Link href="/profiles" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Profiles</Link>
     {user && (
        <Link href="/chats" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          {isMobile ? 'Chats' : <MessageSquare className="h-5 w-5" />}
        </Link>
      )}
  </>
)};

export function Header() {
  const { user, userProfile, loading, signOut, notifications, setNotifications } = useAuth();
  const { toast } = useToast();

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  const hasUnread = notifications.some(n => !n.isRead);

  const handleOpenNotifications = async (open: boolean) => {
    if (open && hasUnread && user) {
        try {
            await markNotificationsAsRead(user.uid);
            // Optimistically update the UI
            setNotifications(prev => prev.map(n => ({...n, isRead: true})));
        } catch (error) {
            console.error("Error marking notifications as read", error);
        }
    }
  }

  const handleAcceptRequest = async (notification: Notification, e: React.MouseEvent) => {
      e.preventDefault(); // Prevent dropdown from closing
      if (!user || !userProfile) return;
      
      const requesterId = notification.link.split("/").pop();
      if (!requesterId) return;

      const followRequestQuery = query(collection(db, "followRequests"), where("fromUserId", "==", requesterId), where("toUserId", "==", user.uid));
      const followRequestSnapshot = await getDocs(followRequestQuery);

      if (followRequestSnapshot.empty) {
          toast({ title: "Error", description: "Could not find the original follow request.", variant: "destructive"});
          return;
      }
      
      const requestDoc = followRequestSnapshot.docs[0];

      const batch = writeBatch(db);
      // Update request
      batch.update(requestDoc.ref, { status: "accepted" });
      // Update follower/following
      batch.update(doc(db, 'users', user.uid), { followers: arrayUnion(requestDoc.data().fromUserId) });
      batch.update(doc(db, 'users', requestDoc.data().fromUserId), { following: arrayUnion(user.uid) });
      
      const newNotificationForRequesterRef = doc(collection(db, 'notifications'));
      batch.set(newNotificationForRequesterRef, {
        userId: requestDoc.data().fromUserId,
        type: 'new_follower',
        message: `${userProfile.name} accepted your follow request.`,
        link: `/profiles/${user.uid}`,
        isRead: false,
        createdAt: new Date(),
      })


      // Update the current notification to reflect acceptance
      batch.update(doc(db, 'notifications', notification.id), { isRead: true, type: 'new_follower', message: `You are now following ${requestDoc.data().fromUserName}.` });

      try {
        await batch.commit();
        toast({ title: "Request Accepted!" });
        // The onSnapshot listener in useAuth will automatically update the notifications list
      } catch (error) {
        console.error("Error accepting request:", error);
        toast({ title: "Error", description: "Failed to accept request.", variant: "destructive"});
      }
  };


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Logo />
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <NavLinks />
          </nav>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <Link href="/" className="mb-6 inline-block">
              <Logo />
            </Link>
            <div className="flex flex-col space-y-4">
              <NavLinks isMobile/>
            </div>
          </SheetContent>
        </Sheet>


        <div className="flex flex-1 items-center justify-end space-x-2">
          <nav className="flex items-center space-x-2">
             {loading ? (
              <div className="h-10 w-20 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <>
               <DropdownMenu onOpenChange={handleOpenNotifications}>
                  <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="relative">
                          <Bell className="h-5 w-5" />
                          {hasUnread && <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-destructive" />}
                      </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                      <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {notifications.length > 0 ? (
                          <DropdownMenuGroup>
                          {notifications.map(n => (
                              <DropdownMenuItem key={n.id} asChild>
                                  <Link href={n.link} className={cn("whitespace-normal items-start justify-between flex", !n.isRead && "font-bold")}>
                                      <div className="flex items-center gap-2">
                                         {n.type === 'follow_request' && <UserPlus className="mt-1 h-4 w-4"/>}
                                         {n.type === 'new_message' && <MessageSquare className="mt-1 h-4 w-4"/>}
                                         {n.type === 'new_follower' && <UserCheck className="mt-1 h-4 w-4"/>}
                                         <span>{n.message}</span>
                                      </div>
                                      {n.type === 'follow_request' && (
                                        <Button size="sm" className="ml-2" onClick={(e) => handleAcceptRequest(n, e)}>Accept</Button>
                                      )}
                                  </Link>
                              </DropdownMenuItem>
                          ))}
                          </DropdownMenuGroup>
                      ) : (
                          <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
                      )}
                  </DropdownMenuContent>
              </DropdownMenu>

               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={userProfile?.avatarUrl} alt={userProfile?.name ?? "User"} />
                      <AvatarFallback>{getInitials(userProfile?.name)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{userProfile?.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                     <Link href={`/profiles/${user.uid}`}>
                        <UserIcon className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                     </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </>
            ) : (
              <Button asChild>
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  Login
                </Link>
              </Button>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
