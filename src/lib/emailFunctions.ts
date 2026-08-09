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
