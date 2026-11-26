import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { BadgeCheck, Loader2, Upload } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { confirmAadhaarKyc, isAadhaarVerified, readQrFromImage, startAadhaarKyc } from '@/lib/aadhaarKyc';
import { errorMessage } from '@/lib/errors';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

/** Aadhaar verification inside a recruiter's profile: QR picture, then SMS code. */
export default function AadhaarKycSection() {
    const skin = useSkin();
    const [verified, setVerified] = useState<{ last4: string } | null>(null);
    const [open, setOpen] = useState(false);
    const [consent, setConsent] = useState(false);
    /** Set once the SMS is on its way. */
    const [sentTo, setSentTo] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);

    // Live, so the badge follows verification and later profile edits.
    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        return onSnapshot(
            doc(db, 'users', uid),
            (snap) => {
                const data = snap.data();
                setVerified(isAadhaarVerified(data) ? { last4: data?.aadhaarKyc.aadhaarLast4 } : null);
            },
            (err) => console.error('Could not watch Aadhaar status:', err)
        );
    }, []);

    const handleImage = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try {
            const { mobileLast4 } = await startAadhaarKyc(await readQrFromImage(file));
            setSentTo(mobileLast4);
            setCode('');
        } catch (err) {
            popup.error(errorMessage(err) || 'Could not check this QR code.');
        } finally {
            setBusy(false);
        }
    };

    const handleConfirm = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            await confirmAadhaarKyc(code);
            popup.success('Aadhaar verified');
            setOpen(false);
            setSentTo('');
        } catch (err) {
            popup.error(errorMessage(err) || 'Could not verify the code.');
        } finally {
            setBusy(false);
        }
    };

    const link = `cursor-pointer text-sm font-medium text-ink underline underline-offset-2 disabled:opacity-50 ${FOCUS}`;

    return (
        <div>
            <p className="text-xs font-bold text-ink">Aadhaar verification</p>
            {verified ? (
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />Verified · XXXX {verified.last4}
                </p>
            ) : !open ? (
                <button type="button" onClick={() => setOpen(true)} className={`mt-0.5 ${link}`}>Verify now</button>
            ) : sentTo ? (
                <form onSubmit={handleConfirm} className="mt-1 space-y-2">
                    <label htmlFor="aadhaar-otp" className="block text-xs text-ink/70">
                        Enter the code sent by SMS to the mobile ending {sentTo}.
                    </label>
                    <input
                        id="aadhaar-otp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className={`w-full rounded-lg px-3 py-2 text-sm tracking-[0.3em] ${skin.field} ${FOCUS}`}
                    />
                    <div className="flex items-center gap-4">
                        <button type="submit" disabled={busy || code.length !== 6} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Verify
                        </button>
                        <button type="button" onClick={() => setSentTo('')} disabled={busy} className={link}>Start again</button>
                    </div>
                </form>
            ) : (
                <div className="mt-1 space-y-2">
                    <p className="text-xs text-ink/70">
                        Upload a clear picture of the QR code on your e-Aadhaar. Your profile name and mobile number must match your Aadhaar.
                    </p>
                    <label className="flex cursor-pointer items-start gap-2 text-xs text-ink/70">
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="form-checkbox mt-0.5 h-4 w-4 text-brand" />
                        <span>I consent to my Aadhaar QR details being checked to verify my identity. The picture is not uploaded; only the verification result and the last 4 digits are kept, with a coded fingerprint to stop reuse.</span>
                    </label>
                    <div className="flex items-center gap-4">
                        <label className={`inline-flex items-center gap-2 rounded-lg ${skin.secondary} ${consent && !busy ? 'cursor-pointer' : 'pointer-events-none opacity-50'}`}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                            {busy ? 'Checking…' : 'Upload QR'}
                            <input type="file" accept="image/png,image/jpeg" disabled={!consent || busy} onChange={handleImage} className="sr-only" />
                        </label>
                        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={link}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}
