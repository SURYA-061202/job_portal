export interface User {
  uid: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
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
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
      OPENAI_API_KEY: string;
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
  requestedBy: 'Dinesh' | 'Naresh';
  createdAt: any;
  applicantCount?: number;
}

// Ensure this file is treated as a module
export { }; 