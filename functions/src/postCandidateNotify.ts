import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { firestore, Timestamp } from "./security";
import { claim, formatExpiry, toDate } from "./expiryReminders";

/**
 * Job-seeker notifications about a post's deadline (the recruiter side lives in
 * postLifecycle.ts, which calls into this file):
 *
 *  - `notifyClosingSoon`: called by the daily sweep for a post that closes in
 *    1-3 days. Tells everyone who saved it or opened it without applying.
 *  - `postEnded`: a Firestore trigger. When a post turns `closed` (the recruiter
 *    closed it) or `expired` (the sweep flipped it), every applicant still in the
 *    running and everyone who saved it is told, with a few similar open jobs.
 *
 * Notifications are addressed by email in `userId`, like every other
 * notification in the app. Each send is claimed in `expiry_reminders` first (see
 * expiryReminders.claim), so a retried run or a repeated trigger never sends
 * twice, while a reposted post that later ends again notifies afresh.
 */

type Doc = FirebaseFirestore.DocumentData;

const STAFF_ROLES = ["recruiter", "manager", "admin"];
/** Most people notified per post per event; a runaway post must not fan out forever. */
const MAX_AUDIENCE = 1000;
const SIMILAR_JOBS = 3;
const CHUNK = 25;

interface Person {
    uid: string;
    email: string;
}

const emailOf = (v: unknown): string => String(v || "").trim().toLowerCase();

/** Profiles for these uids, in chunks (getAll takes a bounded number of refs). */
async function profiles(uids: string[]): Promise<Map<string, Doc>> {
    const db = firestore();
    const out = new Map<string, Doc>();
    for (let i = 0; i < uids.length; i += 300) {
        const refs = uids.slice(i, i + 300).map((u) => db.collection("users").doc(u));
        if (refs.length === 0) continue;
        for (const snap of await db.getAll(...refs)) {
            if (snap.exists) out.set(snap.id, snap.data() as Doc);
        }
    }
    return out;
}

/** Job seekers only (staff may have opened the post too) that have an address. */
function seekers(map: Map<string, Doc>, uids: string[]): Person[] {
    const people: Person[] = [];
    for (const uid of uids) {
        const p = map.get(uid);
        if (!p || STAFF_ROLES.includes(String(p.role))) continue;
        const email = emailOf(p.email);
        if (email) people.push({ uid, email });
    }
    return people;
}

/** uid -> application status, for everyone who applied to the post. */
async function applicantsOf(postId: string): Promise<Map<string, string>> {
    const snap = await firestore().collection("job_applications").where("post_id", "==", postId).limit(MAX_AUDIENCE).get();
    const out = new Map<string, string>();
    snap.docs.forEach((d) => {
        const uid = String(d.data().user_id || "");
        if (uid) out.set(uid, String(d.data().status || "applied").toLowerCase());
    });
    return out;
}

/** Users who saved the post (it lives on their profile as `savedJobs`). */
async function saversOf(postId: string): Promise<Map<string, Doc>> {
    const snap = await firestore().collection("users").where("savedJobs", "array-contains", postId).limit(MAX_AUDIENCE).get();
    const out = new Map<string, Doc>();
    snap.docs.forEach((d) => out.set(d.id, d.data() as Doc));
    return out;
}

/** Writes one notification, once: the claim key decides whether this run owns it. */
async function sendOnce(key: string, to: string, payload: { type: string; title: string; message: string; metadata: Doc }): Promise<boolean> {
    if (!(await claim(key))) return false;
    await firestore().collection("notifications").doc().set({
        userId: to,
        ...payload,
        read: false,
        viewed: false,
        createdAt: Timestamp().now(),
    });
    return true;
}

/** Runs `work` for each item a few at a time, so a big audience doesn't open hundreds of writes at once. */
async function inChunks<T>(items: T[], work: (item: T) => Promise<unknown>): Promise<void> {
    for (let i = 0; i < items.length; i += CHUNK) {
        await Promise.all(items.slice(i, i + CHUNK).map(async (item) => {
            try { await work(item); } catch (err) { console.error("post notification failed", err); }
        }));
    }
}

const at = (post: Doc) => (post.companyName ? ` at ${post.companyName}` : "");

/* ------------------------------------------------------------------ *
 * Closing soon (called by the daily sweep)
 * ------------------------------------------------------------------ */

/**
 * "Closes in N days" to people who saved the post or opened it without
 * applying. One notification per person per expiry date, sent the first time
 * the sweep sees the post inside its last three days.
 */
export async function notifyClosingSoon(postId: string, post: Doc, expiryKey: string, daysLeft: number): Promise<number> {
    const expiresAt = toDate(post.expiresAt);
    if (!expiresAt) return 0;
    const title = String(post.jobTitle || "a job");
    const when = daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;

    const [applied, savers] = await Promise.all([applicantsOf(postId), saversOf(postId)]);
    const viewerIds = (Array.isArray(post.viewedBy) ? post.viewedBy : [])
        .map(String)
        .filter((uid: string) => !savers.has(uid))
        .slice(0, MAX_AUDIENCE);
    const viewers = await profiles(viewerIds);

    // Savers first so someone who both saved and viewed gets the "saved" wording.
    const audience = [
        ...seekers(savers, [...savers.keys()]).map((p) => ({ ...p, saved: true })),
        ...seekers(viewers, viewerIds).map((p) => ({ ...p, saved: false })),
    ].filter((p) => !applied.has(p.uid));

    let sent = 0;
    await inChunks(audience, async (p) => {
        const ok = await sendOnce(`post_${postId}_${expiryKey}_u_${p.uid}`, p.email, {
            type: "post_closing_soon",
            title: `Closing soon: ${title}`,
            message: `A job you ${p.saved ? "saved" : "viewed"} - "${title}"${at(post)} - closes ${when} (${formatExpiry(expiresAt)}). Apply before the deadline.`,
            metadata: { postId, jobTitle: title, daysLeft, saved: p.saved },
        });
        if (ok) sent += 1;
    });
    return sent;
}

/* ------------------------------------------------------------------ *
 * Post ended (Firestore trigger)
 * ------------------------------------------------------------------ */

const STOP_WORDS = new Set(["and", "the", "for", "with", "our", "you", "are", "of", "in", "at", "to"]);
const words = (text: unknown): string[] =>
    String(text || "").toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

interface Similar { id: string; jobTitle: string; companyName: string }

/** Up to three other open posts that look like this one: title words, department, location and skills. */
async function similarJobs(postId: string, post: Doc): Promise<Similar[]> {
    const recent = await firestore().collection("recruits").orderBy("createdAt", "desc").limit(300).get();
    const now = Date.now();
    const titleWords = new Set(words(post.jobTitle));
    const skills = new Set(words(post.skills));
    const dept = String(post.department || "").trim().toLowerCase();
    const place = String(post.location || "").trim().toLowerCase();

    return recent.docs
        .filter((d) => d.id !== postId)
        .map((d) => ({ id: d.id, data: d.data() as Doc }))
        // Open means: no status (older post) or active, and not past its expiry.
        .filter(({ data }) => {
            const status = data.status ?? "active";
            const exp = toDate(data.expiresAt);
            return status === "active" && (!exp || exp.getTime() > now);
        })
        .map(({ id, data }) => {
            let score = 0;
            words(data.jobTitle).forEach((w) => { if (titleWords.has(w)) score += 2; });
            if (dept && String(data.department || "").trim().toLowerCase() === dept) score += 3;
            if (place && String(data.location || "").trim().toLowerCase() === place) score += 2;
            words(data.skills).forEach((w) => { if (skills.has(w)) score += 1; });
            return { id, score, jobTitle: String(data.jobTitle || ""), companyName: String(data.companyName || "") };
        })
        .filter((s) => s.score >= 2 && s.jobTitle)
        .sort((a, b) => b.score - a.score)
        .slice(0, SIMILAR_JOBS)
        .map(({ id, jobTitle, companyName }) => ({ id, jobTitle, companyName }));
}

/** An applicant who was already selected, made an offer, or turned down has nothing to learn from this. */
const settled = (status: string) =>
    status === "selected" || status === "hired" || status.startsWith("offer") || status.endsWith("rejected") || status === "declined";

/**
 * Fires on every write to a post but only acts on the one that moves it to
 * `closed` or `expired`. The function's region must be the Firestore database's;
 * set FIRESTORE_TRIGGER_REGION (functions/.env) when the database is not in the
 * default functions region.
 */
export const postEnded = onDocumentUpdated(
    { document: "recruits/{postId}", ...(process.env.FIRESTORE_TRIGGER_REGION ? { region: process.env.FIRESTORE_TRIGGER_REGION } : {}) },
    async (event) => {
        const before = event.data?.before.data() as Doc | undefined;
        const after = event.data?.after.data() as Doc | undefined;
        if (!before || !after) return;
        const ended = (s: unknown) => s === "closed" || s === "expired";
        if (!ended(after.status) || ended(before.status)) return;

        const postId = event.params.postId;
        const title = String(after.jobTitle || "a job");
        const reason = after.status === "closed" ? after.closeReason : "expired";
        const headline = reason === "filled" ? "Position filled" : "Position closed";
        const what =
            reason === "filled" ? `has been filled`
                : reason === "cancelled" ? `is no longer open - the employer cancelled hiring`
                    : `is no longer accepting applications`;
        // A repost bumps repostCount, so the same post ending again notifies again.
        const run = Number(after.repostCount || 0);

        const [applied, savers, similar] = await Promise.all([applicantsOf(postId), saversOf(postId), similarJobs(postId, after)]);
        const similarText = similar.length ? ` Similar jobs: ${similar.map((s) => s.jobTitle).join(", ")}.` : "";
        const metadata = { postId, jobTitle: title, reason, similarJobs: similar };

        const applicants = seekers(await profiles([...applied.keys()]), [...applied.keys()])
            .filter((p) => !settled(applied.get(p.uid) || "applied"));
        const savedOnly = seekers(savers, [...savers.keys()]).filter((p) => !applied.has(p.uid));

        let told = 0;
        await inChunks(applicants, async (p) => {
            if (await sendOnce(`post_${postId}_end${run}_a_${p.uid}`, p.email, {
                type: "post_ended",
                title: headline,
                message: `"${title}"${at(after)} ${what}.${similarText}`,
                metadata: { ...metadata, applied: true },
            })) told += 1;
        });
        await inChunks(savedOnly, async (p) => {
            if (await sendOnce(`post_${postId}_end${run}_s_${p.uid}`, p.email, {
                type: "post_ended",
                title: "A job you saved has closed",
                message: `"${title}"${at(after)} ${what}.${similarText}`,
                metadata: { ...metadata, applied: false },
            })) told += 1;
        });

        console.log(`postEnded ${postId} (${after.status}): ${applicants.length} applicant(s), ${savedOnly.length} saver(s), ${told} notified`);
    },
);
