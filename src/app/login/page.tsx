"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/Logo';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z.string().min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  bio: z.string().optional(),
  skills: z.string().optional(),
  githubUrl: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, isUsernameUnique, signOut } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
  });

  const handleLogin = async (data: LoginValues) => {
    setLoading(true);
    try {
      const userCredential = await signIn(data.email, data.password);
      if (userCredential && userCredential.user) {
        if (userCredential.user.emailVerified) {
          router.push('/');
          toast({ title: 'Login successful!', description: 'Welcome back.' });
        } else {
          await signOut();
          toast({
            title: 'Email Not Verified',
            description: 'Please check your inbox to verify your email address before logging in.',
            variant: 'destructive',
            duration: 6000,
          });
        }
      }
    } catch (error: any) {
      toast({ title: 'Login Failed', description: error.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleSignup = async (data: SignupValues) => {
    setLoading(true);

    const isUnique = await isUsernameUnique(data.username);
    if (!isUnique) {
        toast({ title: 'Username Taken', description: 'This username is already in use. Please choose another one.', variant: 'destructive' });
        setLoading(false);
        return;
    }

    try {
      await signUp(data);
      router.push('/');
      toast({ 
        title: 'Account created!', 
        description: "We've sent a verification link to your email. Please verify to log in.",
        duration: 6000,
      });
    } catch (error: any) {
      toast({ title: 'Sign-up Failed', description: error.message, variant: 'destructive' });
    }
    setLoading(false);
  };

   const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push('/');
      toast({ title: 'Signed in with Google!', description: 'Welcome to SquadUp.' });
    } catch (error: any) {
      toast({
        title: "Google Sign-In Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
       <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-fit">
              <Logo />
            </div>
            <CardTitle>Welcome to SquadUp</CardTitle>
            <CardDescription>Sign in or create an account to start building.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="m@example.com" {...loginForm.register('email')} />
                  {loginForm.formState.errors.email && <p className="text-destructive text-xs">{loginForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" {...loginForm.register('password')} />
                  {loginForm.formState.errors.password && <p className="text-destructive text-xs">{loginForm.formState.errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Logging in...' : 'Login'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input id="signup-name" placeholder="John Doe" {...signupForm.register('name')} />
                       {signupForm.formState.errors.name && <p className="text-destructive text-xs">{signupForm.formState.errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-username">Username</Label>
                      <Input id="signup-username" placeholder="johndoe" {...signupForm.register('username')} />
                      {signupForm.formState.errors.username && <p className="text-destructive text-xs">{signupForm.formState.errors.username.message}</p>}
                    </div>
                </div>
                 <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" placeholder="m@example.com" {...signupForm.register('email')} />
                      {signupForm.formState.errors.email && <p className="text-destructive text-xs">{signupForm.formState.errors.email.message}</p>}
                    </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input id="signup-password" type="password" {...signupForm.register('password')} />
                  {signupForm.formState.errors.password && <p className="text-destructive text-xs">{signupForm.formState.errors.password.message}</p>}
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="signup-bio">About Me</Label>
                  <Textarea id="signup-bio" placeholder="Tell us about yourself..." {...signupForm.register('bio')} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="signup-skills">Skills (comma-separated)</Label>
                  <Input id="signup-skills" placeholder="React, Next.js, GenAI" {...signupForm.register('skills')} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-github">GitHub URL</Label>
                    <Input id="signup-github" placeholder="https://github.com/username" {...signupForm.register('githubUrl')} />
                    {signupForm.formState.errors.githubUrl && <p className="text-destructive text-xs">{signupForm.formState.errors.githubUrl.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-linkedin">LinkedIn URL</Label>
                    <Input id="signup-linkedin" placeholder="https://linkedin.com/in/username" {...signupForm.register('linkedinUrl')} />
                     {signupForm.formState.errors.linkedinUrl && <p className="text-destructive text-xs">{signupForm.formState.errors.linkedinUrl.message}</p>}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-background px-2 text-sm text-muted-foreground">OR</span>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
