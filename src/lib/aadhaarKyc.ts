import { httpsCallable } from 'firebase/functions';
import jsQR from 'jsqr';
import { functions } from './firebase';

/** users/{uid}.aadhaarKyc, written only by the Aadhaar Cloud Functions. */
export interface AadhaarKyc {
    status: 'verified';
    aadhaarLast4: string;
    /** Mobile and name as they were when verified. */
    mobile: string;
    name: string;
}

interface ProfileIdentity {
    firstName?: string;
    lastName?: string;
    mobile?: string;
    aadhaarKyc?: AadhaarKyc;
}

/**
 * The badge holds only while the profile still has the verified name and mobile;
 * changing either means verifying again.
 */
export function isAadhaarVerified(profile?: ProfileIdentity | null): boolean {
    const kyc = profile?.aadhaarKyc;
    if (!profile || kyc?.status !== 'verified') return false;
    const name = `${profile.firstName || ''} ${profile.lastName || ''}`.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    const mobile = (profile.mobile || '').replace(/\D/g, '').slice(-10);
    return kyc.name === name && kyc.mobile === mobile;
}

const startFn = httpsCallable<{ qr: string; consent: boolean }, { mobileLast4: string }>(functions, 'startAadhaarKyc');
const confirmFn = httpsCallable<{ code: string }, { success: boolean }>(functions, 'confirmAadhaarKyc');

export async function startAadhaarKyc(qr: string): Promise<{ mobileLast4: string }> {
    return (await startFn({ qr, consent: true })).data;
}

export async function confirmAadhaarKyc(code: string): Promise<void> {
    await confirmFn({ code });
}

/**
 * Reads the Aadhaar Secure QR from a picture, in the browser; the picture is
 * never uploaded. Dense codes can decode at one size and not another.
 */
export async function readQrFromImage(file: File): Promise<string> {
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not read the image.');

    const longest = Math.max(image.width, image.height);
    for (const target of [longest, 2000, 1400, 1000, 3000]) {
        const scale = Math.min(target, 4000) / longest;
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (found && /^\d+$/.test(found.data)) return found.data;
    }
    throw new Error('No Aadhaar QR code found. Crop the picture closely around the large QR code and try again.');
}
