import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationType = 'interview_invite' | 'verify_details' | 'congratulations' | 'manager_invite' | 'premium_request' | 'premium_approved' | 'premium_rejected';

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
