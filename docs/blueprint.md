# **App Name**: SquadUp

## Core Features:

- User Authentication: Secure user authentication using Firebase Auth with Google and Email/Password. Upon signup, user profiles are stored in Firestore.
- Profile Management: Users can create and edit their profiles, including name, email, bio, skills, and portfolio link. User data is stored in the `users` collection in Firestore.
- Project Listing: Users can view and create projects, including details such as title, description, status, required skills, and team ID. Projects are stored in the `projects` collection.
- Team Formation: Users can form teams for projects, with team details including team name, members (with roles), and associated project ID. Teams are stored in the `teams` collection.
- Skill-Based Project Recommendations: A Cloud Function suggests projects to users based on overlapping skills.  This tool allows for intelligent matching of users to projects.
- Real-time Project Chat: Enable real-time chat functionality within each project, allowing team members to communicate and collaborate effectively.
- Firestore Security Rules: Implement Firestore Security Rules to ensure data security, including restrictions on profile editing and project modifications.

## Style Guidelines:

- Primary color: Vibrant purple (#9D4EDD) to capture GenZ's energetic vibe. Inspired by the platform's function of bringing different people together.
- Background color: Light purple (#F5EEFE), very desaturated.
- Accent color: Hot pink (#EE4266) for highlights and CTAs, creating contrast.
- Font: 'Poppins', sans-serif, known for a modern and fashionable look that resonates well with a GenZ audience.
- Use flat, minimal icons that align with the platform's purpose of connecting students, representing collaboration, ideas, and projects.
- Modern, clean layout with clear information hierarchy. Utilize cards and grids for displaying projects and user profiles.
- Subtle animations on button presses and data loading to enhance user engagement without being distracting.