/** Firestore Timestamp (or anything shaped like one) as it comes off a document. */
export interface TimestampLike {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
  toMillis?: () => number;
}

/** A date field as stored in Firestore: Timestamp, Date, ISO string, epoch millis, or unset. */
export type FireDate = Date | string | number | TimestampLike | null;

export interface User {
  uid: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  matchingScores?: Record<string, number>;
}

/**
 * Where a job application came from. `referral` means the seeker arrived through
 * another user's personal share link (`/job/{id}?ref={code}`); the recruiter sees
 * it as "source: referral" and may reward the referrer with credit points.
 */
export type ApplicationSource =
  | {
      type: 'referral';
      /** The user who shared the job (their uid is also the referral code). */
      referrerUid: string;
      referrerName?: string;
      code: string;
      at?: string;
    }
  | { type: 'organic' };

/** Lifecycle of an offer letter: drafted, emailed, then answered by the candidate. */
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined';

/** One entry in an offer's audit trail (shown as a timeline to both sides). */
export interface OfferTimelineEvent {
  /** created | sent | accepted | declined | emailed */
  kind: 'created' | 'sent' | 'accepted' | 'declined' | 'emailed';
  /** ISO timestamp; stored as a string so it survives arrayUnion writes. */
  at: string;
  /** Display name of whoever caused the event (recruiter or candidate). */
  by?: string;
  note?: string;
}

/** Typed e-signature captured when the candidate accepts. */
export interface OfferSignature {
  /** The name exactly as the candidate typed it. */
  name: string;
  /** ISO timestamp of the signature. */
  at: string;
}

/**
 * An offer letter for one candidate on one post. Document id:
 * `offers/{postId}__{candidateId}`. Staff read/write it; the candidate sees it
 * only through the getOffer / respondToOffer Cloud Functions.
 */
export interface OfferLetter {
  id?: string;
  postId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  /** Role/designation the person is being hired for. */
  designation: string;
  /** CTC / salary, free text so "₹8 LPA" and "₹60,000 / month" both fit. */
  salary: string;
  /** ISO date (YYYY-MM-DD) the person is expected to join. */
  joiningDate: string;
  location: string;
  /** Extra terms and conditions, shown verbatim in the letter. */
  notes: string;
  companyName: string;
  status: OfferStatus;
  recruiterId: string;
  recruiterName?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  sentAt?: string;
  respondedAt?: string;
  signature?: OfferSignature;
  timeline: OfferTimelineEvent[];
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
  interviewDetails?: InterviewDetails;

  /** Job post this candidate applied to (applicants from the user side). */
  postId?: string;

  /** How the application arrived (stamped by applyForJob; shown to recruiters as a source badge). */
  source?: ApplicationSource;

  /** ISO date (YYYY-MM-DD) chosen by the candidate via email link */
  selectedInterviewDate?: string;

  /** list of raw responses coming from /api/interview-response */
  interviewResponses?: Array<{
    respondedAt: string;
    dateIndex: number | null;
    response: string;
  }>;

  /** Free-form project/certification lists some candidates carry at the top level. */
  keyProjects?: Project[];
  certifications?: Array<string | { name?: string; title?: string; issuer?: string; date?: string }>;

  /** AI Ranking scores for specific job posts */
  rankings?: Record<string, CandidateRanking>;

  /** Profile text of platform users (registered candidates); searched and shown by the keyword search. */
  profileExtras?: CandidateProfileExtras;
}

/** Interview invitation/response details, as stored on candidates and interviews/{id}. */
export interface InterviewDetails {
  role?: string;
  dates?: string[];
  roundType?: string;
  interviewers?: string[];
  sentAt?: string;
  /** Set once the interview-confirmation mail has gone out. */
  successmail?: boolean;
  postId?: string;
  currentSalary?: number;
  expectedSalary?: number;
  joiningDate?: string;
  yearsExperience?: string;
  experienceIn?: string;
  readyToRelocate?: string;
  feedback?: string;
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
  updatedAt: FireDate;
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
  duration?: string;
  arrears?: string;
  educationGap?: string;
  marksheetUrl?: string;
  marksheetName?: string;
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

/**
 * Where a job post is in its life. Stored on recruits/{id}.status; `expired` is
 * also derived on read when an `active` post passes its `expiresAt`
 * (see lib/postLifecycle.ts). Posts created before lifecycles existed have no
 * status and count as active with no expiry.
 */
export type PostStatus = 'draft' | 'active' | 'paused' | 'expired' | 'closed';

/** Why a post is paused: by the recruiter (absent) or because it hit its application cap. */
export type PostPauseReason = 'cap';

/** Why a recruiter closed a post by hand. */
export type PostCloseReason = 'filled' | 'cancelled' | 'other';

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
  createdAt: FireDate;
  applicantCount?: number;
  viewedBy?: string[];
  /** How many interview rounds this post runs. Absent on posts created before this was configurable. */
  totalRounds?: number;
  /** Names for each round; index-independent, keyed by roundNumber. */
  rounds?: InterviewRound[];

  /* ---- lifecycle (see lib/postLifecycle.ts) ---- */
  /** Absent on legacy posts, which are treated as active with no expiry. */
  status?: PostStatus;
  /** How many days a listing runs for each time it is posted or reposted. */
  validityDays?: number;
  /** When the current listing went live; reset by a repost (createdAt never changes). */
  postedAt?: FireDate;
  /** When the listing stops accepting applications. Absent = never expires. */
  expiresAt?: FireDate;
  /** Set while paused; on resume the expiry moves out by the paused time. */
  pausedAt?: FireDate;
  pausedReason?: PostPauseReason;
  /** Drafts only: when set, the post goes live by itself at this time (a "scheduled" post). */
  publishAt?: FireDate;
  /** Stop taking applications (the post pauses itself) once this many have been received. Absent = no cap. */
  applicationCap?: number;
  /** Stamped by the daily sweep the first time it sees the post past its expiry. */
  expiredAt?: FireDate;
  closedAt?: FireDate;
  closeReason?: PostCloseReason;
  /** How many times the post has been reposted. */
  repostCount?: number;
  lastRepostedAt?: FireDate;
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
  /** Recruiter plans: credit points added to the recruiter's balance each time the plan is granted. */
  credits?: number;
  /**
   * Recruiter plans: credit points each action costs on this plan (admin-editable when the
   * plan is created). Unset actions fall back to the defaults in CREDIT_COST.
   */
  costs?: { search?: number; view?: number; download?: number; post?: number };
  /** User plans: privileges the plan grants. Unused on recruiter plans. */
  privileges?: PlanPrivileges;
  features: string[];
  active: boolean;
  createdAt?: FireDate;
  updatedAt?: FireDate;
}

/** Snapshot of the plan a recruiter holds, stored on users/{uid}.subscription. */
export interface UserSubscription {
  planId: string;
  planName: string;
  level: number;
  maxPosts: number;
  maxCandidates: number;
  /** Credit points the plan gave when granted (the live plan's value wins when it can be read). */
  credits?: number;
  privileges?: PlanPrivileges;
  startedAt: FireDate;
  expiresAt: FireDate;
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
  createdAt: FireDate;
  resolvedAt?: FireDate;
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
  expiresAt?: FireDate;
  createdAt: FireDate;
  paidAt?: FireDate;
  /** Issued by the server when the payment succeeds (absent on payments made before invoicing). */
  invoice?: PaymentInvoice;
}

/** Invoice terms frozen at payment time (functions/src/payments.ts). */
export interface PaymentInvoice {
  number: string;
  issuedAt: FireDate;
  seller: { name: string; address: string; gstin: string; email: string };
  billedTo: { name: string; email: string; company: string; phone: string };
  description: string;
  periodStart: FireDate;
  periodEnd: FireDate;
  /** In paise, inclusive of any taxes. */
  amount: number;
  currency: string;
  method: string;
  razorpayPaymentId: string;
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
  /** Credit points the plan gives (taken from the plan itself). Ignored when `unlimitedCredits`. */
  creditsTotal: number;
  /** Credit points spent in the current subscription period. */
  creditsUsed: number;
  /** creditsTotal minus creditsUsed. */
  credits: number;
  /** Admins and legacy premium recruiters are never charged credits. */
  unlimitedCredits: boolean;
}

// Ensure this file is treated as a module
export { }; 