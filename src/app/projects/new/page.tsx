
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

const projectFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters long.'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters long.'),
  tags: z.string().min(1, 'Please add at least one tag.'),
  isPublic: z.boolean().default(true),
  endDate: z.date({
    required_error: "An end date is required.",
  }),
  maxMembers: z.coerce.number().min(1, "The project needs at least one member.").max(100, "Maximum of 100 members allowed."),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

const NewProjectPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      title: '',
      description: '',
      tags: '',
      isPublic: true,
      maxMembers: 5,
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to create a project.",
        variant: "destructive",
      });
      router.push('/login');
    }
  }, [user, authLoading, router, toast]);

  const onSubmit = async (data: ProjectFormValues) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a project.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const batch = writeBatch(db);

      // 1. Create the project document
      const projectCollectionRef = collection(db, "projects");
      const newProjectDocRef = doc(projectCollectionRef); // Create a reference with a new ID
      
      batch.set(newProjectDocRef, {
        title: data.title,
        description: data.description,
        tags: data.tags.split(',').map(tag => tag.trim()),
        isPublic: data.isPublic,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        endDate: data.endDate,
        maxMembers: data.maxMembers,
        status: 'open',
      });
      
      // 2. Create the corresponding team document
      const teamCollectionRef = collection(db, "teams");
      const newTeamDocRef = doc(teamCollectionRef); // Create a reference for the team

      batch.set(newTeamDocRef, {
        projectId: newProjectDocRef.id,
        teamName: `${data.title} Squad`,
        members: [
          { userId: user.uid, role: 'Owner' }
        ],
        memberIds: [user.uid],
      });

      // 3. Commit the batch
      await batch.commit();

      toast({
          title: "Project and Team Created!",
          description: "Your new project has been successfully created.",
      });
      router.push(`/projects/${newProjectDocRef.id}`);

    } catch (error) {
       console.error("Error creating project:", error);
       toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (authLoading || !user) {
    return (
       <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4 flex items-center justify-center">
            <p>Loading user information...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Create a New Project</CardTitle>
              <CardDescription>
                Fill out the details below to get your squad started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., AI-Powered Study App"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your project in a few sentences."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Required Skills / Tags</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., React, Firebase, Genkit"
                            {...field}
                          />
                        </FormControl>
                         <FormDescription>
                          Enter skills or tags separated by commas.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Project End Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxMembers"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Members</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                   <FormField
                    control={form.control}
                    name="isPublic"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <FormLabel>Public Project</FormLabel>
                            <FormDescription>
                                Make the project visible to everyone on the platform.
                            </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Creating...' : 'Create Project'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default NewProjectPage;

    