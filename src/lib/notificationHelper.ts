import { collection, addDoc, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationType =
    | 'interview_invite'
    | 'verify_details'
    | 'congratulations'
    | 'manager_invite'
    | 'premium_request'
    | 'premium_approved'
    | 'premium_rejected'
    | 'round_moved'
    | 'offer_sent'
    | 'application_rejected'
    | 'job_application'
    | 'interview_response';

export interface NotificationData {
    userId: string; // User email or UID
    type: NotificationType;
    title: string;
    message: string;
    metadata?: {
        role?: string;
        dates?: string[];
        roundType?: string;
        [key: string]: any;
    };
}

/**
 * Creates a notification in Firestore
 * @param data Notification data
 * @returns Promise<string> Document ID of created notification
 */
export async function createNotification(data: NotificationData): Promise<string> {
    try {
        const notificationRef = await addDoc(collection(db, 'notifications'), {
            ...data,
            read: false,
            // NotificationBell and NotificationsTab both key their unread badge off
            // `viewed`; without it every notification stays unread forever.
            viewed: false,
            createdAt: Timestamp.now(),
        });

        console.log('Notification created:', notificationRef.id);
        return notificationRef.id;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
}

/**
 * Helper functions for specific notification types
 */

export async function createInterviewInviteNotification(
    candidateEmail: string,
    role: string,
    dates: string[],
    roundType: string
): Promise<string> {
    return createNotification({
        userId: candidateEmail,
        type: 'interview_invite',
        title: 'Interview Invitation',
        message: `You have been invited for ${roundType} round interview for the position of ${role}. Please check your email for available dates.`,
        metadata: {
            role,
            dates,
            roundType,
        },
    });
}

export async function createVerifyDetailsNotification(
    candidateEmail: string
): Promise<string> {
    return createNotification({
        userId: candidateEmail,
        type: 'verify_details',
        title: 'Verify Your Details',
        message: 'Please verify your details before proceeding to the next round. Check your email for the verification link.',
    });
}

export async function createCongratulationsNotification(
    candidateEmail: string,
    role?: string
): Promise<string> {
    return createNotification({
        userId: candidateEmail,
        type: 'congratulations',
        title: 'Congratulations! 🎉',
        message: role
            ? `Congratulations! You have been selected for the position of ${role}. Welcome to the team!`
            : 'Congratulations! You have been selected. Welcome to the team!',
        metadata: role ? { role } : undefined,
    });
}

export async function createManagerInviteNotification(
    managerEmail: string,
    name: string
): Promise<string> {
    return createNotification({
        userId: managerEmail,
        type: 'manager_invite',
        title: 'Welcome to the Team!',
        message: `Welcome ${name}! Your manager account has been created. Please check your email for login credentials.`,
        metadata: {
            name,
        },
    });
}

export async function createPremiumRequestNotification(
    adminEmail: string,
    recruiterName: string,
    recruiterEmail: string
): Promise<string> {
    return createNotification({
        userId: adminEmail,
        type: 'premium_request',
        title: 'Premium Access Request',
        message: `${recruiterName} (${recruiterEmail}) has requested premium access to post more than 5 jobs. Please review in Add Members.`,
        metadata: {
            recruiterName,
            recruiterEmail,
        },
    });
}

export async function createPremiumApprovedNotification(
    recruiterEmail: string,
    recruiterName: string
): Promise<string> {
    return createNotification({
        userId: recruiterEmail,
        type: 'premium_approved',
        title: 'Premium Access Approved',
        message: `Congratulations ${recruiterName}! Your premium access request has been approved. You can now post unlimited jobs.`,
    });
}

export async function createPremiumRejectedNotification(
    recruiterEmail: string,
    recruiterName: string
): Promise<string> {
    return createNotification({
        userId: recruiterEmail,
        type: 'premium_rejected',
        title: 'Premium Access Request Declined',
        message: `Hi ${recruiterName}, your premium access request has been declined. Please contact admin for more details.`,
    });
}

/* ------------------------------------------------------------------ *
 * Lookups. Notifications are addressed by email, but the app tracks
 * people by id, so these bridge the two.
 * ------------------------------------------------------------------ */

/** Email for a candidate id, whether they are a platform user or an uploaded resume. */
async function getPersonEmail(personId: string): Promise<string | null> {
    for (const path of ['users', 'candidates']) {
        try {
            const snap = await getDoc(doc(db, path, personId));
            if (snap.exists()) {
                const email = snap.data()?.email;
                if (email) return email as string;
            }
        } catch (err) {
            console.error(`Error reading ${path}/${personId} for notification:`, err);
        }
    }
    return null;
}

/** Display name for a candidate id, falling back to their email. */
async function getPersonName(personId: string): Promise<string> {
    try {
        const userSnap = await getDoc(doc(db, 'users', personId));
        if (userSnap.exists()) {
            const data = userSnap.data();
            return `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'A candidate';
        }
        const candSnap = await getDoc(doc(db, 'candidates', personId));
        if (candSnap.exists()) {
            const data = candSnap.data();
            return data.name || data.email || 'A candidate';
        }
    } catch (err) {
        console.error('Error resolving candidate name for notification:', err);
    }
    return 'A candidate';
}

/** The post title and the email of the recruiter who owns it. */
async function getPostContext(postId: string): Promise<{ jobTitle: string; recruiterEmail: string | null }> {
    try {
        const postSnap = await getDoc(doc(db, 'recruits', postId));
        if (!postSnap.exists()) return { jobTitle: '', recruiterEmail: null };
        const post = postSnap.data();
        const jobTitle = post.jobTitle || '';
        if (!post.recruiterId) return { jobTitle, recruiterEmail: null };
        const recruiterSnap = await getDoc(doc(db, 'users', post.recruiterId));
        return { jobTitle, recruiterEmail: recruiterSnap.exists() ? (recruiterSnap.data()?.email ?? null) : null };
    } catch (err) {
        console.error('Error resolving post context for notification:', err);
        return { jobTitle: '', recruiterEmail: null };
    }
}

/* ------------------------------------------------------------------ *
 * Candidate-facing pipeline notifications
 * ------------------------------------------------------------------ */

/**
 * Tells a candidate their application moved. Called wherever a pipeline status
 * is written, and deliberately never throws — a failed notification must not
 * block or roll back the status change itself.
 */
export async function notifyCandidateOfStatusChange(params: {
    candidateId: string;
    postId?: string | null;
    status: string;
    /** Name of the round, when the new status is an interview round. */
    roundLabel?: string;
}): Promise<void> {
    try {
        const email = await getPersonEmail(params.candidateId);
        if (!email) return;

        const jobTitle = params.postId ? (await getPostContext(params.postId)).jobTitle : '';
        const forRole = jobTitle ? ` for ${jobTitle}` : '';
        const status = (params.status || '').toLowerCase();

        if (status.endsWith('rejected') || status === 'declined') {
            await createNotification({
                userId: email,
                type: 'application_rejected',
                title: 'Application Update',
                message: `Thank you for your time. Your application${forRole} is not moving forward at this stage.`,
                metadata: { role: jobTitle },
            });
            return;
        }

        if (status === 'selected' || status === 'hired') {
            await createCongratulationsNotification(email, jobTitle || undefined);
            return;
        }

        if (status === 'offer' || status === 'offer_sent') {
            await createNotification({
                userId: email,
                type: 'offer_sent',
                title: 'Offer Sent 🎉',
                message: `An offer${forRole} is on its way to you. Please check your email.`,
                metadata: { role: jobTitle },
            });
            return;
        }

        const roundMatch = status.match(/^round(\d+)$/);
        if (roundMatch || status === 'technical' || status === 'hr') {
            const roundName = params.roundLabel?.trim() || (roundMatch ? `Round ${roundMatch[1]}` : 'the next round');
            await createNotification({
                userId: email,
                type: 'round_moved',
                title: 'Moved to the Next Round',
                message: `Good news — you have moved to ${roundName}${forRole}.`,
                metadata: { role: jobTitle, roundType: roundName },
            });
        }
    } catch (err) {
        console.error('Failed to notify candidate of status change:', err);
    }
}

/* ------------------------------------------------------------------ *
 * Recruiter-facing notifications
 * ------------------------------------------------------------------ */

/** Tells the post owner that someone applied. Never throws. */
export async function notifyRecruiterOfApplication(postId: string, candidateId: string): Promise<void> {
    try {
        const { jobTitle, recruiterEmail } = await getPostContext(postId);
        if (!recruiterEmail) return;
        const candidateName = await getPersonName(candidateId);

        await createNotification({
            userId: recruiterEmail,
            type: 'job_application',
            title: 'New Application',
            message: `${candidateName} applied for ${jobTitle || 'one of your posts'}.`,
            metadata: { candidateId, postId, role: jobTitle },
        });
    } catch (err) {
        console.error('Failed to notify recruiter of application:', err);
    }
}

/** Tells the recruiter how a candidate answered their interview invite. Never throws. */
export async function notifyRecruiterOfInterviewResponse(params: {
    postId?: string | null;
    candidateId: string;
    accepted: boolean;
    slot?: string | null;
}): Promise<void> {
    try {
        if (!params.postId) return; // no post means no recruiter to address
        const { jobTitle, recruiterEmail } = await getPostContext(params.postId);
        if (!recruiterEmail) return;
        const candidateName = await getPersonName(params.candidateId);
        const forRole = jobTitle ? ` for ${jobTitle}` : '';

        await createNotification({
            userId: recruiterEmail,
            type: 'interview_response',
            title: params.accepted ? 'Interview Confirmed' : 'Interview Declined',
            message: params.accepted
                ? `${candidateName} accepted the interview${forRole}${params.slot ? ` and chose ${params.slot}` : ''}, and submitted their details.`
                : `${candidateName} declined the interview invitation${forRole}.`,
            metadata: { candidateId: params.candidateId, postId: params.postId, role: jobTitle },
        });
    } catch (err) {
        console.error('Failed to notify recruiter of interview response:', err);
    }
}
