export interface User {
  uid: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  matchingScores?: Record<string, number>;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  skills: string[];
  education: Education[];
  projects?: Project[];
  resumeUrl: string;
  extractedData: {
    summary: string;
    workExperience: WorkExperience[];
    education: Education[];
    skills: string[];
    certifications: string[];
    projects?: Project[];
  };
  createdAt: Date;
  updatedAt: Date;

  // New fields for interview workflow
  /**
   * Current stage of the candidate in the pipeline. Eg: "pending", "round1", "round2", "round3", "selected", "rejected".
   */
  status?: string;

  /** Details of the interview invitation that was sent */
  interviewDetails?: {
    role: string;
    dates: string[];
    roundType: string;
    interviewers: string[];
    sentAt: string;
  };

  /** ISO date (YYYY-MM-DD) chosen by the candidate via email link */
  selectedInterviewDate?: string;

  /** list of raw responses coming from /api/interview-response */
  interviewResponses?: Array<{
    respondedAt: string;
    dateIndex: number | null;
    response: string;
  }>;

  /** AI Ranking scores for specific job posts */
  rankings?: Record<string, CandidateRanking>;

  /** Profile text of platform users (registered candidates); searched and shown by the keyword search. */
  profileExtras?: CandidateProfileExtras;
}

/** One titled line of a candidate profile (job, project, certificate). */
export interface ProfileEntry {
  title: string;
  meta?: string;
  description?: string;
}

export interface CandidateProfileExtras {
  location?: string;
  experience?: ProfileEntry[];
  projects?: ProfileEntry[];
  certificates?: ProfileEntry[];
  courses?: string[];
}

export interface CandidateRanking {
  score: number;
  reasoning: string;
  updatedAt: any;
}

export interface ParsedResumeData {
  name: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  summary: string;
  workExperience: string[];
  education: string[];
  skills: string[];
  certifications: string[];
}

// Environment variables type definitions
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_FIREBASE_API_KEY: string;
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
      NEXT_PUBLIC_FIREBASE_APP_ID: string;
    }
  }
}

// Resume parsing types
export interface ResumeParseResponse {
  success: boolean;
  data?: CandidateData;
  error?: string;
  raw?: string;
}

export interface WorkExperience {
  company: string;
  position: string;
  duration: string;
  description: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  year: string;
  cgpa?: string;
}

export interface Project {
  name: string;
  technologies?: string;
  description?: string;
}

export interface CandidateData {
  name: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  summary: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  certifications: string[];
  projects?: Project[];
}

export type PremiumRequestStatus = 'none' | 'pending' | 'approved' | 'rejected';

/** One configurable interview round on a job post (Pipeline column). */
export interface InterviewRound {
  /** 1-based position of the round in the pipeline. */
  roundNumber: number;
  /** Recruiter-given name, e.g. "Technical Screen". May be blank. */
  name: string;
}

export interface RecruitmentRequest {
  id?: string;
  jobTitle: string;
  urgencyLevel: 'Immediate' | 'Moderate' | 'Flexible';
  department: string;
  candidateType: 'Permanent' | 'Contract' | 'Internship' | 'Part Time';
  positionLevel: 'Entry' | 'Junior' | 'Mid' | 'Senior' | 'Manager';
  yearsExperience: string;
  modeOfWork: 'Office' | 'Hybrid' | 'Remote';
  location: string;
  candidatesCount: number;
  qualification: string;
  skills: string;
  description?: string;
  jdUrl?: string;
  budgetPay: string;
  salaryBreakup: string;
  requestedBy?: 'Dinesh' | 'Naresh';
  recruiterId?: string;
  recruiterName?: string;
  recruiterEmail?: string;
  companyName?: string;
  createdAt: any;
  applicantCount?: number;
  viewedBy?: string[];
  /** How many interview rounds this post runs. Absent on posts created before this was configurable. */
  totalRounds?: number;
  /** Names for each round; index-independent, keyed by roundNumber. */
  rounds?: InterviewRound[];
}

/* ------------------------------------------------------------------ *
 * Subscriptions
 * ------------------------------------------------------------------ */

/** Stored in plan limit fields to mean "no limit". */
export const UNLIMITED = -1;

/** Who a plan is for. Plans saved before audiences existed have none and count as 'recruiter'. */
export type SubscriptionAudience = 'recruiter' | 'user';

/**
 * Extra things a user (job seeker) plan can switch on. Add new keys here (and to
 * USER_PRIVILEGES in lib/subscriptions.ts) as more privileges are introduced.
 */
export interface PlanPrivileges {
  /** See which recruiters/companies viewed the user's profile. */
  profileVisibility?: boolean;
}

/** A subscription level the admin offers to recruiters or to job seekers (users). */
export interface SubscriptionPlan {
  id?: string;
  audience?: SubscriptionAudience;
  /** 1, 2, 3 ... - higher level = bigger limits. */
  level: number;
  name: string;
  description?: string;
  /** Price in INR. 0 = free / by arrangement. */
  price: number;
  /** How long an approved subscription lasts. */
  durationDays: number;
  /** Recruiter plans: max job posts they may create. User plans: max job posts they may view. (UNLIMITED = no cap.) */
  maxPosts: number;
  /** Recruiter plans: max candidates visible in the Candidates module. Unused (0) on user plans. */
  maxCandidates: number;
  /** User plans: privileges the plan grants. Unused on recruiter plans. */
  privileges?: PlanPrivileges;
  features: string[];
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

/** Snapshot of the plan a recruiter holds, stored on users/{uid}.subscription. */
export interface UserSubscription {
  planId: string;
  planName: string;
  level: number;
  maxPosts: number;
  maxCandidates: number;
  privileges?: PlanPrivileges;
  startedAt: any;
  expiresAt: any;
  /** Set when the plan was bought online: the payments/{orderId} it came from. */
  paymentOrderId?: string;
}

export type SubscriptionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface SubscriptionRequest {
  id?: string;
  audience?: SubscriptionAudience;
  /** The requesting account's uid (a recruiter, or a user on a user plan). */
  recruiterId: string;
  recruiterName: string;
  recruiterEmail: string;
  planId: string;
  planName: string;
  planLevel: number;
  status: SubscriptionRequestStatus;
  createdAt: any;
  resolvedAt?: any;
  resolvedBy?: string;
  note?: string;
}

export type PaymentStatus = 'created' | 'paid' | 'failed';

/**
 * One online payment for a plan, payments/{orderId}. Written only by the payment
 * Cloud Functions (functions/src/payments.ts); recruiters read their own, admins all.
 */
export interface PaymentRecord {
  id?: string;
  /** Razorpay order id (same as the document id). */
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  /** Plan terms snapshotted when the order was created; this is what was granted. */
  plan: {
    planId: string;
    planName: string;
    level: number;
    price: number;
    durationDays: number;
  };
  /** In paise (₹1 = 100). */
  amount: number;
  currency: string;
  status: PaymentStatus;
  razorpayPaymentId?: string;
  method?: string | null;
  failureReason?: string | null;
  expiresAt?: any;
  createdAt: any;
  paidAt?: any;
}

/** What a user is entitled to right now, after expiry and legacy flags are applied. */
export interface EffectiveSubscription {
  source: 'free' | 'plan' | 'legacy' | 'admin';
  planId: string | null;
  planName: string;
  /** 0 = free tier. */
  level: number;
  maxPosts: number;
  maxCandidates: number;
  /** What the active plan unlocks for a user. Empty on the free tier; everything for admins. */
  privileges: PlanPrivileges;
  expiresAt: Date | null;
  /** True when a paid plan existed but has lapsed (the user is back on the free tier). */
  expired: boolean;
  /** The plan that lapsed, when `expired`; lets the UI offer to renew it. */
  lapsedPlanId?: string | null;
}

// Ensure this file is treated as a module
export { }; 