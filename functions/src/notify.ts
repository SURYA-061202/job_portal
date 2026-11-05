import { firestore, Timestamp } from "./security";

/**
 * Server-side twin of the recruiter notifications the candidate pages used to
 * write from the browser. Notifications are addressed by lowercase email.
 */

interface Params {
  postId?: string | null;
  candidateId: string;
  type: "interview_response" | "details_submitted";
  title: string;
  /** Receives the candidate's name and " for <job title>" (or ""). */
  message: (candidateName: string, forRole: string) => string;
}

async function personName(candidateId: string): Promise<string> {
  const db = firestore();
  const user = await db.collection("users").doc(candidateId).get();
  if (user.exists) {
    const d = user.data() as Record<string, any>;
    return `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || "A candidate";
  }
  const cand = await db.collection("candidates").doc(candidateId).get();
  if (cand.exists) {
    const d = cand.data() as Record<string, any>;
    return d.name || d.email || "A candidate";
  }
  return "A candidate";
}

/** The post's owner plus every admin, so a response never goes unseen. Never throws. */
export async function notifyRecruiters(p: Params): Promise<void> {
  try {
    const db = firestore();
    const recipients = new Set<string>();
    let jobTitle = "";

    if (p.postId) {
      const post = await db.collection("recruits").doc(p.postId).get();
      if (post.exists) {
        const d = post.data() as Record<string, any>;
        jobTitle = d.jobTitle || "";
        let email: string | undefined = d.recruiterEmail;
        if (!email && d.recruiterId) {
          email = (await db.collection("users").doc(String(d.recruiterId)).get()).data()?.email;
        }
        if (email) recipients.add(String(email).trim().toLowerCase());
      }
    }

    const admins = await db.collection("users").where("role", "==", "admin").get();
    admins.docs.forEach((a) => {
      const email = a.data()?.email;
      if (email) recipients.add(String(email).trim().toLowerCase());
    });
    if (recipients.size === 0) return;

    const name = await personName(p.candidateId);
    const forRole = jobTitle ? ` for ${jobTitle}` : "";
    const batch = db.batch();
    for (const userId of recipients) {
      batch.set(db.collection("notifications").doc(), {
        userId,
        type: p.type,
        title: p.title,
        message: p.message(name, forRole),
        metadata: { candidateId: p.candidateId, ...(p.postId ? { postId: p.postId } : {}), role: jobTitle },
        read: false,
        viewed: false,
        createdAt: Timestamp().now(),
      });
    }
    await batch.commit();
  } catch (err) {
    console.error("notifyRecruiters failed", err);
  }
}

/** Older invites have no postId on the interview document; the candidate's own record may. */
export async function resolvePostId(candidateId: string, fromInterview: unknown): Promise<string | null> {
  if (typeof fromInterview === "string" && fromInterview) return fromInterview;
  try {
    const cand = await firestore().collection("candidates").doc(candidateId).get();
    const postId = cand.data()?.postId;
    return typeof postId === "string" && postId ? postId : null;
  } catch {
    return null;
  }
}
