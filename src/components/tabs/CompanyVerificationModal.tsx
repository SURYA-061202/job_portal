import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, ChevronDown, Clock, ShieldAlert, ShieldCheck, Loader2, X } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  submitCompanyVerification,
  validateCompanyVerification,
  validateCompanyEmail,
  type CompanyVerification,
  type RegistrationType,
} from '@/lib/companyVerification';
import { createCompanyVerificationRequestNotification } from '@/lib/notificationHelper';
import { sendCompanyEmailCode, verifyCompanyEmailCode } from '@/lib/emailFunctions';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

interface Props {
  onClose: () => void;
}

/** Tells every admin a request is waiting. Best effort: the request itself is already saved. */
async function notifyAdmins(recruiterName: string, companyName: string) {
  try {
    const admins = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
    await Promise.all(
      admins.docs
        .map((d) => String(d.data()?.email || '').trim())
        .filter(Boolean)
        .map((email) => createCompanyVerificationRequestNotification(email, recruiterName, companyName))
    );
  } catch (err) {
    console.error('Could not notify admins of the verification request:', err);
  }
}

/** Centered dialog where a recruiter verifies their company: current status, and the form to (re)submit. */
export default function CompanyVerificationModal({ onClose }: Props) {
  const skin = useSkin();
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<CompanyVerification | null>(null);
  const [recruiterName, setRecruiterName] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Company email the recruiter has proved with an emailed code (written by the backend only).
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [checkingCode, setCheckingCode] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    website: '',
    companyEmail: '',
    registrationType: 'GSTIN' as RegistrationType,
    registrationNumber: '',
  });

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    let cancelled = false;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const d = snap.data();
        const existing = (d.companyVerification ?? null) as CompanyVerification | null;
        setRecord(existing);
        setRecruiterName(`${d.firstName || ''} ${d.lastName || ''}`.trim());
        setVerifiedEmail(String(d.companyEmailVerified || ''));
        setForm({
          companyName: existing?.companyName || d.companyName || '',
          website: existing?.website || '',
          companyEmail: existing?.companyEmail || '',
          registrationType: existing?.registrationType || 'GSTIN',
          registrationNumber: existing?.registrationNumber || '',
        });
        // Nothing submitted yet: open straight on the form.
        setFormOpen(!existing || existing.status === 'none');
      })
      .catch((err) => {
        console.error('Could not load company verification:', err);
        popup.error('Could not load verification details');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setError(null);
  };

  const normalizedEmail = form.companyEmail.trim().toLowerCase();
  const emailVerified = !!normalizedEmail && verifiedEmail === normalizedEmail;
  const codeSent = !!normalizedEmail && codeSentTo === normalizedEmail;

  const callError = (err: unknown, fallback: string) =>
    (err as { message?: string })?.message?.replace(/^.*?:\s*/, '') || fallback;

  const sendCode = async () => {
    const problem = validateCompanyEmail(form.companyEmail, form.website);
    if (problem) {
      setError(problem);
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      await sendCompanyEmailCode(normalizedEmail);
      setCodeSentTo(normalizedEmail);
      setCode('');
      popup.success(`Code sent to ${normalizedEmail}`);
    } catch (err) {
      setError(callError(err, 'Could not send the code. Please try again.'));
    } finally {
      setSendingCode(false);
    }
  };

  const checkCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setCheckingCode(true);
    setError(null);
    try {
      const email = await verifyCompanyEmailCode(code.trim());
      setVerifiedEmail(email);
      setCode('');
      popup.success('Company email verified');
    } catch (err) {
      setError(callError(err, 'Could not verify the code. Please try again.'));
    } finally {
      setCheckingCode(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const problem = validateCompanyVerification(form);
    if (problem) {
      setError(problem);
      return;
    }
    if (!emailVerified) {
      setError('Verify your company email with the code we send before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await submitCompanyVerification(uid, form);
      void notifyAdmins(recruiterName || 'A recruiter', saved.companyName);
      setRecord(saved);
      setFormOpen(false);
      popup.success('Sent for verification');
    } catch (err) {
      console.error('Company verification error:', err);
      setError(err instanceof Error ? err.message : 'Could not send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const status = record?.status ?? 'none';
  const labelCls = 'text-xs font-bold text-ink';
  const inputCls = `mt-1 w-full rounded-lg px-3 py-2 text-sm ${skin.field} ${FOCUS}`;
  const showForm = formOpen && status !== 'verified' && status !== 'pending';

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-verify-title"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-full w-full max-w-md flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}
      >
        <div className={`flex shrink-0 items-center justify-between border-b ${skin.edge} px-5 py-4`}>
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-ink" aria-hidden="true" />
            <h3 id="company-verify-title" className={skin.heading}>Verify your company</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto px-5 py-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Loading" />
            </div>
          ) : (
            <>
              {status === 'verified' && (
                <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm text-ink">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold">{record?.companyName} is verified</p>
                    <p className="mt-0.5 text-xs text-ink/60">{record?.registrationType} {record?.registrationNumber}</p>
                  </div>
                </div>
              )}

              {status === 'pending' && (
                <div className="flex items-start gap-2 rounded-lg border border-ink/20 bg-ink/5 p-3 text-sm text-ink">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink/60" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold">Under review</p>
                    <p className="mt-0.5 text-xs text-ink/60">
                      We are checking {record?.companyName}. You will get a notification once an admin has reviewed it.
                    </p>
                  </div>
                </div>
              )}

              {status === 'rejected' && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-ink">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold">Verification declined</p>
                    <p className="mt-0.5 break-words text-xs text-ink/70">{record?.reviewNote || 'Please check your details and submit again.'}</p>
                  </div>
                </div>
              )}

              {status === 'none' && !showForm && (
                <p className="text-sm text-ink/60">Verify your company so candidates can trust your job posts.</p>
              )}

              {status === 'rejected' && !showForm && (
                <button type="button" onClick={() => setFormOpen(true)} className={`mt-4 cursor-pointer rounded-lg ${skin.cta} ${FOCUS}`}>
                  Submit again
                </button>
              )}

              {showForm && (
                <form onSubmit={submit} className={`space-y-3 ${status === 'rejected' ? 'mt-4' : ''}`} noValidate>
                  <div>
                    <label htmlFor="cv-company" className={labelCls}>Company name</label>
                    <input id="cv-company" type="text" value={form.companyName} onChange={set('companyName')} className={inputCls} autoComplete="organization" />
                  </div>
                  <div>
                    <label htmlFor="cv-website" className={labelCls}>Company website</label>
                    <input id="cv-website" type="text" value={form.website} onChange={set('website')} placeholder="www.yourcompany.com" className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="cv-email" className={labelCls}>Company email</label>
                    <input id="cv-email" type="email" value={form.companyEmail} onChange={set('companyEmail')} placeholder="you@yourcompany.com" className={inputCls} />
                    <p className="mt-0.5 text-xs text-ink/50">Must use your company's website domain.</p>

                    {emailVerified ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Email verified
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={sendCode}
                          disabled={sendingCode || !normalizedEmail}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg ${skin.secondary} !px-3 !py-1.5 !text-xs !normal-case !tracking-normal ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {sendingCode && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                          {codeSent ? 'Resend code' : 'Send verification code'}
                        </button>
                        {codeSent && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              aria-label="6-digit verification code"
                              placeholder="6-digit code"
                              maxLength={6}
                              value={code}
                              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(null); }}
                              className={`w-full rounded-lg px-3 py-2 text-sm tracking-widest ${skin.field} ${FOCUS}`}
                            />
                            <button
                              type="button"
                              onClick={checkCode}
                              disabled={checkingCode || code.length !== 6}
                              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg ${skin.cta} !px-3 !py-1.5 !text-xs !normal-case !tracking-normal ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              {checkingCode && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                              Verify
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                    <div>
                      <label htmlFor="cv-regtype" className={labelCls}>ID type</label>
                      <div className="relative">
                        <select id="cv-regtype" value={form.registrationType} onChange={set('registrationType')} className={`${inputCls} appearance-none pr-8`}>
                          <option value="GSTIN">GSTIN</option>
                          <option value="CIN">CIN</option>
                        </select>
                        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-ink/60" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="cv-regnum" className={labelCls}>{form.registrationType === 'GSTIN' ? 'GST number' : 'Company ID (CIN)'}</label>
                      <input
                        id="cv-regnum"
                        type="text"
                        value={form.registrationNumber}
                        onChange={set('registrationNumber')}
                        maxLength={21}
                        autoCapitalize="characters"
                        className={`${inputCls} uppercase`}
                      />
                    </div>
                  </div>

                  {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}

                  <div className="flex gap-3 pt-1">
                    {/* Not disabled while the email is unverified: clicking explains what is missing instead of doing nothing. */}
                    <button type="submit" disabled={submitting} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg ${skin.cta} !normal-case !tracking-normal ${FOCUS} disabled:cursor-not-allowed disabled:opacity-60`}>
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Send for review
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
