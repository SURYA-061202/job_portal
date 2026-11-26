import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue, firestore, Timestamp } from "./security";
import { claim, formatExpiry, TIME_ZONE, toDate } from "./expiryReminders";
import { ownerEmail } from "./postLifecycle";

/**
 * Two server-side pieces of the post lifecycle that must not depend on a
 * recruiter having the app open:
 *
 *  - `publishScheduledPosts`: every 15 minutes, drafts whose `publishAt` has
 *    arrived go live (status `active`, fresh `postedAt`, expiry set).
 *  - `postCapReached`: when an application is created, a post with an
 *    `applicationCap` that has now reached it pauses itself (`pausedReason:
 *    "cap"`) and the owner is told. Counts every `job_applications` row for the
 *    post, including candidates a recruiter added by hand.
 *
 * Sends are claimed in `expiry_reminders` first (see expiryReminders.claim).
 */

type Doc = FirebaseFirestore.DocumentData;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VALIDITY_DAYS = 30;

async function notify(to: string, type: string, title: string, message: string, metadata: Doc): Promise<void> {
    await firestore().collection("notifications").doc().set({
        userId: to, type, title, message, metadata, read: false, viewed: false, createdAt: Timestamp().now(),
    });
}

/* ------------------------------------------------------------------ *
 * Scheduled go-live
 * ------------------------------------------------------------------ */

export const publishScheduledPosts = onSchedule(
    { schedule: "*/15 * * * *", timeZone: TIME_ZONE },
    async () => {
        const db = firestore();
        const nowMs = Date.now();
        const drafts = await db.collection("recruits").where("status", "==", "draft").get();

        let published = 0;

        for (const ref of drafts.docs) {
            try {
                const draft = ref.data() as Doc;
                const publishAt = toDate(draft.publishAt);
                if (!publishAt || publishAt.getTime() > nowMs) continue; // an ordinary draft, or not yet time

                const title = String(draft.jobTitle || "your job post");
                const to = await ownerEmail(draft);

                // Transaction: the recruiter may have published, edited or deleted it since the query ran.
                const goneLive = await db.runTransaction(async (tx) => {
                    const fresh = (await tx.get(ref.ref)).data() as Doc | undefined;
                    const due = toDate(fresh?.publishAt);
                    if (!fresh || fresh.status !== "draft" || !due || due.getTime() > Date.now()) return null;
                    // A closing date chosen up front is kept if it is still ahead; otherwise count days from now.
                    const planned = toDate(fresh.expiresAt);
                    const expiresAt = planned && planned.getTime() > Date.now()
                        ? planned
                        : new Date(Date.now() + (Number(fresh.validityDays) || DEFAULT_VALIDITY_DAYS) * DAY_MS);
                    tx.update(ref.ref, {
                        status: "active",
                        postedAt: Timestamp().now(),
                        expiresAt: Timestamp().fromDate(expiresAt),
                        publishAt: FieldValue().delete(),
                    });
                    return expiresAt;
                });
                if (!goneLive) continue;

                published += 1;
                if (to && (await claim(`post_${ref.id}_${publishAt.getTime()}_published`))) {
                    await notify(to, "post_published", "Your scheduled post is live",
                        `"${title}" is now live and open to applications until ${formatExpiry(goneLive)}.`,
                        { postId: ref.id, jobTitle: title });
                }
            } catch (err) {
                console.error("publishScheduledPosts: skipped draft", ref.id, err);
            }
        }

        console.log(`publishScheduledPosts: ${drafts.size} draft(s), ${published} published`);
    },
);

/* ------------------------------------------------------------------ *
 * Application cap
 * ------------------------------------------------------------------ */

export const postCapReached = onDocumentCreated(
    { document: "job_applications/{appId}", ...(process.env.FIRESTORE_TRIGGER_REGION ? { region: process.env.FIRESTORE_TRIGGER_REGION } : {}) },
    async (event) => {
        const postId = String(event.data?.data()?.post_id || "");
        if (!postId) return;
        const db = firestore();
        const postRef = db.collection("recruits").doc(postId);
        const post = (await postRef.get()).data() as Doc | undefined;
        const cap = Number(post?.applicationCap);
        if (!post || !cap || cap < 1 || post.status !== "active") return;

        const received = (await db.collection("job_applications").where("post_id", "==", postId).count().get()).data().count;
        if (received < cap) return;

        // Re-read inside a transaction so two applications arriving together pause it once.
        const paused = await db.runTransaction(async (tx) => {
            const fresh = (await tx.get(postRef)).data() as Doc | undefined;
            if (!fresh || fresh.status !== "active" || Number(fresh.applicationCap) !== cap) return false;
            tx.update(postRef, { status: "paused", pausedAt: Timestamp().now(), pausedReason: "cap" });
            return true;
        });
        if (!paused) return;

        const to = await ownerEmail(post);
        const title = String(post.jobTitle || "Your job post");
        if (to && (await claim(`post_${postId}_cap${cap}_${post.repostCount || 0}`))) {
            await notify(to, "post_cap_reached", "Application limit reached",
                `"${title}" received ${received} applications - its limit of ${cap} - and was paused. Raise or remove the limit by editing the post to reopen it, or close it.`,
                { postId, jobTitle: title, cap, received });
        }
        console.log(`postCapReached ${postId}: ${received}/${cap}, paused`);
    },
);
