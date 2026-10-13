import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

interface CandidateInput {
  id?: string;
  name?: string;
  email: string;
}

const managerInviteFn = httpsCallable(functions, 'managerInvite');
const sendInterviewInviteFn = httpsCallable(functions, 'sendInterviewInvite');
const sendRoundInviteFn = httpsCallable(functions, 'sendRoundInvite');
const sendCongratulationsMailFn = httpsCallable(functions, 'sendCongratulationsMail');
const sendVerifyDetailsFn = httpsCallable(functions, 'sendVerifyDetails');
const sendPasswordResetMailFn = httpsCallable(functions, 'sendPasswordResetMail');
const sendSignupOtpFn = httpsCallable<{ email: string }, { success: boolean }>(functions, 'sendSignupOtp');
const verifySignupOtpFn = httpsCallable<{ email: string; code: string }, { success: boolean }>(functions, 'verifySignupOtp');
const verifyEmailExistsFn = httpsCallable<{ email: string }, { exists: boolean | null }>(functions, 'verifyEmailExists');

export async function sendManagerInvite(data: { email: string; name?: string; password: string; baseUrl: string }) {
  await managerInviteFn(data);
}

export async function sendInterviewInvite(data: {
  candidate: CandidateInput;
  interviewDetails: { role: string; dates: string[]; roundType: string; interviewers: string[]; baseUrl?: string; postId?: string };
  baseUrl: string;
}) {
  await sendInterviewInviteFn(data);
}

export async function sendRoundInvite(data: {
  candidate: CandidateInput;
  roundName: string;
  roundNumber: number;
  role: string;
  baseUrl: string;
}) {
  await sendRoundInviteFn(data);
}

export async function sendCongratulationsMail(data: { candidate: CandidateInput }) {
  await sendCongratulationsMailFn(data);
}

export async function sendVerifyDetails(data: { candidate: CandidateInput; baseUrl: string }) {
  await sendVerifyDetailsFn(data);
}

export async function sendPasswordResetMail(data: { email: string; baseUrl: string }) {
  await sendPasswordResetMailFn(data);
}

/** true = mailbox exists, false = mail server says it does not, null = unknown. */
export async function verifyEmailExists(email: string): Promise<boolean | null> {
  const result = await verifyEmailExistsFn({ email });
  return result.data?.exists ?? null;
}

/** Sends the 6-digit signup code. No auth account is created yet. */
export async function sendSignupOtp(data: { email: string }) {
  await sendSignupOtpFn(data);
}

/** Checks the code the user entered; on success the client completes signup. */
export async function verifySignupOtp(data: { email: string; code: string }) {
  await verifySignupOtpFn(data);
}
