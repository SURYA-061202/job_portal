import { collection, addDoc, doc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationType =
    | 'interview_invite'
    | 'verify_details'
    | 'congratulations'
    | 'manager_invite'
    | 'premium_request'
    | 'premium_approved'
    | 'premium_rejected'
    | 'subscription_request'
    | 'subscription_request_sent'
    | 'subscription_approved'
    | 'subscription_rejected'
    | 'round_moved'
    | 'offer_sent'
    | 'application_rejected'
    | 'job_application'
    | 'interview_response'
    | 'shortlisted'
    | 'details_submitted';

export interface NotificationData {
    userId: string; // Recipient email — addressed by email so any device's bell matches
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
 * @returns Promise<string> Document ID of created notification ('' when skipped)
 */
export async function createNotification(data: NotificationData): Promise<string> {
    // Normalised so the address always matches what the bell queries for:
    // Firebase Auth hands back lowercase emails, while profile documents store
    // whatever was typed.
    const userId = (data.userId || '').trim().toLowerCase();
    if (!userId) {
        // Writing a blank recipient would create a doc no query can ever match.
        console.error('Skipping notification without a recipient:', data.type, data.title);
        return '';
    }

    try {
        const notificationRef = await addDoc(collection(db, 'notifications'), {
            ...data,
            userId,
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
    roundType: string,
    /** Falls back to the person's Firestore record when the passed email is empty. */
    candidateId?: string
): Promise<string> {
    const email = await resolvePersonEmail(candidateId, candidateEmail);
    if (!email) {
        console.error('No email for interview invite notification', candidateId);
        return '';
    }
    return createNotification({
        userId: email,
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
    role?: string,
    /** Falls back to the person's Firestore record when the passed email is empty. */
    candidateId?: string
): Promise<string> {
    const email = await resolvePersonEmail(candidateId, candidateEmail);
    if (!email) {
        console.error('No email for congratulations notification', candidateId);
        return '';
    }
    return createNotification({
        userId: email,
        type: 'congratulations',
        title: 'Congratulations!',
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

/** Tells an admin that a recruiter has asked for a subscription plan. */
export async function createSubscriptionRequestNotification(
    adminEmail: string,
    recruiterName: string,
    recruiterEmail: string,
    planName: string
): Promise<string> {
    return createNotification({
        userId: adminEmail,
        type: 'subscription_request',
        title: 'Subscription Request',
        message: `${recruiterName} (${recruiterEmail}) has requested the ${planName} subscription. Please review it in Subscriptions.`,
        metadata: { recruiterName, recruiterEmail, planName },
    });
}

/** Confirms to the recruiter that their request reached the admin. */
export async function createSubscriptionRequestSentNotification(
    recruiterEmail: string,
    recruiterName: string,
    planName: string
): Promise<string> {
    return createNotification({
        userId: recruiterEmail,
        type: 'subscription_request_sent',
        title: 'Subscription Request Sent',
        message: `Hi ${recruiterName}, your request for the ${planName} subscription has been sent to the admin. You will be notified once it is reviewed.`,
        metadata: { planName },
    });
}

export async function createSubscriptionApprovedNotification(
    recruiterEmail: string,
    recruiterName: string,
    planName: string,
    expiresOn: string
): Promise<string> {
    return createNotification({
        userId: recruiterEmail,
        type: 'subscription_approved',
        title: 'Subscription Approved',
        message: `Congratulations ${recruiterName}! Your ${planName} subscription is active until ${expiresOn}.`,
        metadata: { planName, expiresOn },
    });
}

export async function createSubscriptionRejectedNotification(
    recruiterEmail: string,
    recruiterName: string,
    planName: string,
    note?: string
): Promise<string> {
    return createNotification({
        userId: recruiterEmail,
        type: 'subscription_rejected',
        title: 'Subscription Request Declined',
        message: `Hi ${recruiterName}, your request for the ${planName} subscription was declined.${note ? ` Reason: ${note}` : ' Please contact admin for more details.'}`,
        metadata: { planName },
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
                if (email) return (email as string).trim();
            }
        } catch (err) {
            console.error(`Error reading ${path}/${personId} for notification:`, err);
        }
    }
    return null;
}

/**
 * The address a notification should be sent to: the email we were handed if it
 * is usable, otherwise the one stored against the person's document. Returns
 * null when neither exists (e.g. a resume uploaded with no contact details).
 */
export async function resolvePersonEmail(
    personId?: string | null,
    fallbackEmail?: string | null
): Promise<string | null> {
    const fallback = (fallbackEmail || '').trim();
    if (fallback) return fallback;
    if (!personId) return null;
    return getPersonEmail(personId);
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

        if (status === 'shortlisted') {
            await createNotification({
                userId: email,
                type: 'shortlisted',
                title: 'You Have Been Shortlisted',
                message: `Good news — you have been shortlisted${forRole}. The recruiter will share interview dates soon.`,
                metadata: { role: jobTitle },
            });
            return;
        }

        const roundMatch = status.match(/^round(\d+)$/);
        if (roundMatch || status === 'technical' || status === 'hr') {
            const roundName = params.roundLabel?.trim() || (roundMatch ? `Round ${roundMatch[1]}` : 'the next round');
            // "Technical" reads as "Technical Round"; names that already carry
            // the word ("Round 1", "HR Round", "the next round") stay as they are.
            const roundPhrase = /round/i.test(roundName) ? roundName : `${roundName} Round`;
            await createNotification({
                userId: email,
                type: 'round_moved',
                title: 'Moved to the Next Round',
                message: `You have moved to ${roundPhrase}${forRole}.`,
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

/**
 * Everyone who should hear about activity on a post: the recruiter who owns it,
 * plus the admin(s). When the owner can't be resolved (post written before
 * `recruiterId` existed, or their user record is gone) the admin still gets the
 * news instead of the notification being dropped.
 */
async function getRecruiterRecipients(postId?: string | null): Promise<string[]> {
    const recipients = new Set<string>();

    if (postId) {
        const { recruiterEmail } = await getPostContext(postId);
        if (recruiterEmail) recipients.add(recruiterEmail.trim());
    }

    try {
        const admins = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
        admins.docs.forEach(d => {
            const email = d.data()?.email;
            if (email) recipients.add(String(email).trim());
        });
    } catch (err) {
        console.error('Error resolving admin recipients for notification:', err);
    }

    return [...recipients].filter(Boolean);
}

/** Tells the post owner (and admins) that someone applied. Never throws. */
export async function notifyRecruiterOfApplication(postId: string, candidateId: string): Promise<void> {
    try {
        const { jobTitle } = await getPostContext(postId);
        const recipients = await getRecruiterRecipients(postId);
        if (recipients.length === 0) return;
        const candidateName = await getPersonName(candidateId);

        for (const recipient of recipients) {
            await createNotification({
                userId: recipient,
                type: 'job_application',
                title: 'New Application',
                message: `${candidateName} applied for ${jobTitle || 'one of your posts'}.`,
                metadata: { candidateId, postId, role: jobTitle },
            });
        }
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
        // Without a post there is no owner to look up — the admins still hear
        // about the response rather than it vanishing.
        const recipients = await getRecruiterRecipients(params.postId);
        if (recipients.length === 0) return;

        const jobTitle = params.postId ? (await getPostContext(params.postId)).jobTitle : '';
        const candidateName = await getPersonName(params.candidateId);
        const forRole = jobTitle ? ` for ${jobTitle}` : '';

        for (const recipient of recipients) {
            await createNotification({
                userId: recipient,
                type: 'interview_response',
                title: params.accepted ? 'Interview Confirmed' : 'Interview Declined',
                message: params.accepted
                    ? `${candidateName} accepted the interview${forRole}${params.slot ? ` and chose ${params.slot}` : ''}, and submitted their details.`
                    : `${candidateName} declined the interview invitation${forRole}.`,
                metadata: { candidateId: params.candidateId, postId: params.postId ?? undefined, role: jobTitle },
            });
        }
    } catch (err) {
        console.error('Failed to notify recruiter of interview response:', err);
    }
}

/** Tells the recruiter a candidate filled in the verify-details form. Never throws. */
export async function notifyRecruiterOfDetailsSubmitted(params: {
    postId?: string | null;
    candidateId: string;
}): Promise<void> {
    try {
        const recipients = await getRecruiterRecipients(params.postId);
        if (recipients.length === 0) return;

        const jobTitle = params.postId ? (await getPostContext(params.postId)).jobTitle : '';
        const candidateName = await getPersonName(params.candidateId);
        const forRole = jobTitle ? ` for ${jobTitle}` : '';

        for (const recipient of recipients) {
            await createNotification({
                userId: recipient,
                type: 'details_submitted',
                title: 'Details Submitted',
                message: `${candidateName} submitted their verification details${forRole}.`,
                metadata: { candidateId: params.candidateId, postId: params.postId ?? undefined, role: jobTitle },
            });
        }
    } catch (err) {
        console.error('Failed to notify recruiter of submitted details:', err);
    }
}
