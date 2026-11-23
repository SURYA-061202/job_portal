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
 *    arrived go live (status `active`, fresh `postedAt`, expiry set), if the
 *    owner's plan has a free slot. Without one the draft stays a draft and the
 *    owner is told once; it is retried on later runs, so it still goes live as
 *    soon as a slot opens.
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

/** Mirrors the app's resolveSubscription for posts: -1 = unlimited. */
function postLimit(user: Doc | undefined): number {
    if (!user) return 0;
    if (user.role === "admin") return -1;
    const sub = user.subscription as Doc | undefined;
    if (sub?.planId) {
        const exp = toDate(sub.expiresAt);
        if (!exp || exp.getTime() > Date.now()) {
            const max = typeof sub.maxPosts === "number" ? sub.maxPosts : 0;
            return max < 0 ? -1 : max;
        }
    }
    // Recruiters approved under the old single "premium" flag keep unlimited posts.
    if ((user.role === "recruiter" || user.role === "manager") && user.isPremium === true) return -1;
    return 0;
}

/** Active (not past its expiry) or paused; a post with no status is an older, still-live one. */
function isLive(post: Doc, now: number): boolean {
    const status = post.status ?? "active";
    if (status === "paused") return true;
    if (status !== "active") return false;
    const exp = toDate(post.expiresAt);
    return !exp || exp.getTime() > now;
}

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
        let blocked = 0;
        const limitCache = new Map<string, { limit: number; live: number }>();

        for (const ref of drafts.docs) {
            try {
                const draft = ref.data() as Doc;
                const publishAt = toDate(draft.publishAt);
                if (!publishAt || publishAt.getTime() > nowMs) continue; // an ordinary draft, or not yet time

                const ownerId = String(draft.recruiterId || "");
                let slots = limitCache.get(ownerId);
                if (!slots) {
                    const user = ownerId ? (await db.collection("users").doc(ownerId).get()).data() as Doc | undefined : undefined;
                    const mine = ownerId ? await db.collection("recruits").where("recruiterId", "==", ownerId).get() : { docs: [] };
                    slots = { limit: postLimit(user), live: mine.docs.filter((d: FirebaseFirestore.QueryDocumentSnapshot) => isLive(d.data(), nowMs)).length };
                    limitCache.set(ownerId, slots);
                }
                const title = String(draft.jobTitle || "your job post");
                const to = await ownerEmail(draft);

                if (slots.limit >= 0 && slots.live >= slots.limit) {
                    blocked += 1;
                    if (to && (await claim(`post_${ref.id}_${publishAt.getTime()}_publishfail`))) {
                        await notify(to, "post_publish_failed", "Scheduled post could not go live",
                            `"${title}" was due to go live but your plan's post limit is reached. It stays a draft and will publish automatically as soon as a slot is free - close or delete a post, or upgrade your plan.`,
                            { postId: ref.id, jobTitle: title });
                    }
                    continue;
                }

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

                slots.live += 1;
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

        console.log(`publishScheduledPosts: ${drafts.size} draft(s), ${published} published, ${blocked} blocked by plan limit`);
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
