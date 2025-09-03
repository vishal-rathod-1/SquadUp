# SquadUp

SquadUp is a GenZ-style student collaboration platform designed to help students connect, form squads, and build projects together. It's built with the modern web stack: Next.js, Tailwind CSS, and Firebase.

## Branding

- **Logo**: A flat, minimal, and bold abstract icon representing a squad, using a vibrant color palette.
- **Color Palette**:
  - **Primary (Purple)**: `#9D4EDD`
  - **Accent (Hot Pink)**: `#EE4266`
  - **Secondary (Teal)**: `#48D6C9`
  - **Highlight (Neon Lime)**: `#ADFF2F`
  - **Background**: `#F5EEFE` (light) / `#1A1023` (dark)
- **Typography**: `Poppins`, a modern and clean sans-serif font from Google Fonts.

---

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm, pnpm, or yarn
- A Firebase project

### 1. Setup Firebase Project

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click **"Add project"** and follow the on-screen instructions to create a new project.
3.  Inside your project, enable the following services:
    *   **Authentication**: Go to `Build > Authentication > Sign-in method` and enable **Google** and **Email/Password** providers.
    *   **Firestore Database**: Go to `Build > Firestore Database > Create database`. Start in **production mode**.

### 2. Configure Local Environment

1.  **Clone the repository and install dependencies:**
    ```bash
    git clone <repository_url>
    cd squadup
    npm install
    ```

2.  **Set up environment variables:**
    Create a `.env.local` file in the root of your project. Go to your Firebase project settings (`Project settings > General > Your apps > Web app`) and find your Firebase config object. Copy the values into the `.env.local` file:

    ```
    NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
    NEXT_PUBLIC_FIREBASE_APP_ID=1:...
    ```

### 3. Run the Development Server

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## Firestore Schema

Our database is structured into four main collections:

1.  **`users`**: Stores user profile information.
    -   `userId` (string): Unique ID from Firebase Auth.
    -   `name` (string): User's display name.
    -   `email` (string): User's email.
    -   `bio` (string): A short biography.
    -   `skills` (array of strings): List of user's skills.
    -   `portfolioLink` (string): URL to an external portfolio.

2.  **`projects`**: Contains all project details.
    -   `projectId` (string): Unique ID for the project.
    -   `title` (string): Project title.
    -   `description` (string): Detailed project description.
    -   `status` (string): `idea` | `in-progress` | `completed`.
    -   `createdBy` (string): `userId` of the project owner.
    -   `requiredSkills` (array of strings): Skills needed for the project.
    -   `teamId` (string): ID of the associated team in the `teams` collection.

3.  **`teams`**: Manages team composition for projects.
    -   `teamId` (string): Unique ID for the team.
    -   `projectId` (string): The project this team is for.
    -   `teamName` (string): Name of the team.
    -   `members` (array of objects):
        -   `userId` (string): Member's user ID.
        -   `role` (string): Role in the team (e.g., 'Owner', 'Developer').

4.  **`messages`**: Subcollection for real-time chat within a project.
    -   Located at `projects/{projectId}/messages`.
    -   Each document is a message with `text`, `senderId`, and `timestamp`.

---

## Code Flow & Architecture

This application uses Next.js with the App Router, promoting a hybrid approach of Server and Client components.

1.  **User Authentication**:
    -   The flow starts at the landing page (`/`).
    -   Users can sign up or log in using Firebase Authentication (Google or Email/Password).
    -   The auth state is managed through a React Context (`useAuth`), making user data available throughout the app.
    -   Upon a new user signup, a corresponding user document is created in the `users` collection in Firestore.

2.  **Project & Team Creation**:
    -   A logged-in user can create a new project from the `/projects` page.
    -   When a project is created, a new document is added to the `projects` collection.
    -   Simultaneously, a new `teams` document is automatically created. The project creator is added as the first member with the 'Owner' role.

3.  **Joining a Team**:
    -   Users can browse projects on the `/projects/[id]` page.
    -   If a user's skills match the project's required skills, they can click "Join Squad."
    -   This action updates the `members` array in the corresponding `teams` document.

4.  **Skill-Based Matching (GenAI)**:
    -   The dashboard features a GenAI-powered recommendation system.
    -   It uses a Genkit flow (`skill-based-project-recommendations`) defined as a Next.js Server Action.
    -   This flow takes the current user's skills as input and compares them against the `requiredSkills` of all available projects.
    -   It returns a list of projects with the highest skill overlap, which are then displayed to the user as recommendations.

5.  **Real-time Chat**:
    -   The project detail page (`/projects/[id]`) includes a chat component.
    -   This component uses hooks to listen for real-time updates to the `projects/{projectId}/messages` subcollection in Firestore, providing a seamless chat experience.

---

## Firebase Security & Deployment

### Security Rules

Firestore security rules (`firestore.rules`) are critical for protecting user data. The rules are configured to enforce:
-   **Profile Security**: Users can only create and edit their own profile document in the `users` collection.
-   **Project Security**: Projects can only be created by authenticated users and can only be edited by the user who created them (`createdBy`).
-   **Team Security**: Only the project owner is allowed to manage team membership (add/remove members). All authenticated users can view team data.

### Cloud Functions & Server Actions

-   The project recommendation logic is implemented as a **Genkit Flow** within the Next.js application (`src/ai/flows/skill-based-project-recommendations.ts`).
-   This flow is exposed as a **Server Action**, which is the modern, integrated way to handle server-side logic in Next.js, eliminating the need for a separate callable Cloud Function for this use case. It provides better performance and a more streamlined developer experience.

### Deployment

This Next.js app is configured for deployment on **Firebase Hosting** with App Hosting.

1.  **Connect to Firebase:**
    ```bash
    firebase init hosting
    ```
    - Select your Firebase project.
    - Choose **App Hosting (experimental)**.
    - Follow the prompts to create a backend.

2.  **Deploy:**
    ```bash
    firebase deploy
    ```
    This command will build your Next.js application and deploy it to Firebase Hosting, along with any backend configurations.
