import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Company verification. A recruiter submits their company's details from the
 * profile; an admin reviews them. The status lives on the recruiter's user
 * document as `companyVerification`. firestore.rules only lets the recruiter
 * write a `pending` request - `verified` / `rejected` can only come from an admin.
 */

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type RegistrationType = 'GSTIN' | 'CIN';

export interface CompanyVerification {
  status: VerificationStatus;
  companyName: string;
  website: string;
  companyEmail: string;
  registrationType: RegistrationType;
  registrationNumber: string;
  submittedAt?: unknown;
  reviewedAt?: unknown;
  /** Admin's note, shown to the recruiter when a request is declined. */
  reviewNote?: string;
}

export interface CompanyVerificationInput {
  companyName: string;
  website: string;
  companyEmail: string;
  registrationType: RegistrationType;
  registrationNumber: string;
}

/** 15 characters: state code, PAN, entity number, "Z", checksum. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** 21 characters: listing status, industry code, state, year, ownership, number. */
const CIN = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

/** Mailboxes anyone can open - they say nothing about who works at the company. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'rediffmail.com',
  'zoho.com', 'gmx.com', 'mail.com', 'yandex.com',
]);

/** "https://www.Example.com/about" -> "example.com"; null when it is not a usable address. */
export function websiteHost(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Problem with the company email, or null. The domain is compared with the
 * website only when the website is a usable address.
 */
export function validateCompanyEmail(rawEmail: string, rawWebsite = ''): string | null {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid company email address.';
  const emailDomain = email.split('@')[1];
  if (FREE_MAIL.has(emailDomain)) return 'Use your company email address, not a personal one like Gmail or Yahoo.';
  const host = websiteHost(rawWebsite);
  if (host && emailDomain !== host && !emailDomain.endsWith(`.${host}`) && !host.endsWith(`.${emailDomain}`)) {
    return `Your email domain (${emailDomain}) should match your company website (${host}).`;
  }
  return null;
}

/** The first problem with the form, or null when it can be submitted. */
export function validateCompanyVerification(input: CompanyVerificationInput): string | null {
  if (input.companyName.trim().length < 2) return 'Enter your company name.';

  if (!websiteHost(input.website)) return 'Enter a valid company website, e.g. www.yourcompany.com.';

  const emailProblem = validateCompanyEmail(input.companyEmail, input.website);
  if (emailProblem) return emailProblem;

  const number = input.registrationNumber.trim().toUpperCase();
  if (input.registrationType === 'GSTIN' && !GSTIN.test(number)) return 'Enter a valid 15-character GSTIN.';
  if (input.registrationType === 'CIN' && !CIN.test(number)) return 'Enter a valid 21-character CIN.';

  return null;
}

/** Sends the request to the admins by writing a pending record on the recruiter's own profile. */
export async function submitCompanyVerification(userId: string, input: CompanyVerificationInput): Promise<CompanyVerification> {
  const problem = validateCompanyVerification(input);
  if (problem) throw new Error(problem);

  const record: CompanyVerification = {
    status: 'pending',
    companyName: input.companyName.trim(),
    website: websiteHost(input.website) as string,
    companyEmail: input.companyEmail.trim().toLowerCase(),
    registrationType: input.registrationType,
    registrationNumber: input.registrationNumber.trim().toUpperCase(),
  };
  await updateDoc(doc(db, 'users', userId), {
    companyVerification: { ...record, submittedAt: serverTimestamp() },
    updatedAt: new Date(),
  });
  return record;
}

/** Admin only (enforced by firestore.rules): approve or decline a pending request. */
export async function reviewCompanyVerification(
  userId: string,
  decision: 'verified' | 'rejected',
  note?: string
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    'companyVerification.status': decision,
    'companyVerification.reviewedAt': serverTimestamp(),
    'companyVerification.reviewNote': decision === 'rejected' ? (note || '').trim() : '',
    companyVerified: decision === 'verified',
  });
}
