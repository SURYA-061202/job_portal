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
const sendSignupOtpFn = httpsCallable<{ email: string; mobile: string }, { success: boolean }>(functions, 'sendSignupOtp');
const verifySignupOtpFn = httpsCallable<{ email: string; code: string }, { success: boolean }>(functions, 'verifySignupOtp');
const verifyEmailExistsFn = httpsCallable<{ email: string }, { exists: boolean | null }>(functions, 'verifyEmailExists');
const confirmMobileVerifiedFn = httpsCallable<{ mobile: string }, { success: boolean }>(functions, 'confirmMobileVerified');
const checkMobileAvailableFn = httpsCallable<{ mobile: string }, { available: boolean }>(functions, 'checkMobileAvailable');

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
export async function sendSignupOtp(data: { email: string; mobile: string }) {
  await sendSignupOtpFn(data);
}

/** Checks the code the user entered; on success the client completes signup. */
export async function verifySignupOtp(data: { email: string; code: string }) {
  await verifySignupOtpFn(data);
}

/** After Firebase Phone Auth has linked the number to the signed-in account,
 *  the backend re-checks it and sets mobileVerified. It is the sole writer of
 *  that flag, so the client cannot forge a verified number. */
export async function confirmMobileVerified(mobile: string) {
  await confirmMobileVerifiedFn({ mobile });
}

/** True if no other account holds this mobile; throws functions/failed-
 *  precondition when the number is taken. Runs before profile saves. */
export async function checkMobileAvailable(mobile: string) {
  await checkMobileAvailableFn({ mobile });
}

/** Normalizes an Indian mobile to its 10-digit form ("" if invalid). */
export function normalizeMobile(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : '';
}
