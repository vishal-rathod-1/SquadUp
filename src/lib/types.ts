
// =============================
// User Model
// =_===========================
export interface User {
  id: string;              // Firebase Auth UID
  name: string;
  username: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  skills: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  followers: string[];
  following: string[];
  createdAt: Date;
}

// =============================
// Project Model
// =============================
export interface Project {
  id: string;
  title: string;
  description: string;
  createdBy: string;       // userId
  createdAt: Date;
  tags: string[];
  isPublic: boolean;
  status: 'open' | 'completed' | 'expired';
  endDate: Date;
  maxMembers: number;
}

// =============================
// Team Model
// =============================
export interface TeamMember {
  userId: string;
  role: string;
}
export interface Team {
  id: string;
  projectId: string;
  teamName: string;
  members: TeamMember[];
}


// =============================
// Chat Models
// =============================
export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  text: string;
  createdAt: any; // Can be Firestore Timestamp or ServerTimestamp
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  fileSize?: number;
}

export interface PersonalChat {
    id: string; // Combination of two user IDs
    participants: string[]; // Array of two user IDs
    lastMessage: Message | null;
    createdAt: any;
}


// =============================
// Collaboration Request Model
// =============================
export interface CollabRequest {
  id: string;
  projectId: string;
  fromUserId: string;        // userId
  fromUserName: string;
  fromUserAvatar?: string;
  toUserId: string;          // projectOwnerId
  status: "pending" | "accepted" | "rejected";
  createdAt: any; // Can be a Date or a Firestore Timestamp
}

// =============================
// Follow Request Model
// =============================
export interface FollowRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar?: string;
  toUserId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: any;
}


// =============================
// Notification Model
// =============================
export interface Notification {
  id: string;
  userId: string;          // target user
  type: "request_received" | "request_accepted" | "new_message" | "new_follower" | "follow_request" | "incoming_call";
  message: string;
  link: string; // URL to navigate to
  isRead: boolean;
  createdAt: any; // Can be a Date or a Firestore Timestamp
  status?: "pending" | "answered";
}


// =============================
// Video Call Model
// =============================
export interface Call {
    id: string;
    callerId: string;
    calleeId: string;
    offer: {
        sdp: string;
        type: 'offer';
    };
    answer?: {
        sdp: string;
        type: 'answer';
    };
    status: 'pending' | 'active' | 'ended' | 'declined';
    notifId?: string;
}

