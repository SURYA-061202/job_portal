import { onCall, HttpsError } from "firebase-functions/v2/https";
import { HOUR, cleanId, enforceLimit, firestore, requireStaff, str, FieldValue, Timestamp } from "./security";

/**
 * Referral rewards: a recruiter credits the user who shared a job link and
 * brought a candidate in. The referral doc (`referrals/{postId}__{referrerUid}`)
 * is the audit trail; `users/{uid}.bonusCredits` is written only from here
 * (firestore.rules keeps that key off the client), and resolveSubscription adds
 * it on top of the plan's credits.
 */

export const rewardReferral = onCall(async (request) => {
  const caller = await requireStaff(request);
  await enforceLimit(`ref-reward:${caller.uid}`, 60, HOUR, "Too many rewards in a short time. Please try again later.");

  const body = request.data as {
    postId?: unknown;
    applicantUid?: unknown;
    referrerUid?: unknown;
    points?: unknown;
    note?: unknown;
  };
  const postId = cleanId(body.postId, "post");
  const applicantUid = cleanId(body.applicantUid, "applicant");
  const referrerUid = cleanId(body.referrerUid, "referrer");
  const points = Math.round(Number(body.points));
  const note = str(body.note, 200);

  if (!Number.isFinite(points) || points < 1 || points > 100) {
    throw new HttpsError("invalid-argument", "Choose between 1 and 100 credit points.");
  }
  if (referrerUid === applicantUid) {
    throw new HttpsError("invalid-argument", "A self-referral cannot be rewarded.");
  }

  const db = firestore();
  const appRef = db.collection("job_applications").doc(`${postId}_${applicantUid}`);
  const refRef = db.collection("referrals").doc(`${postId}__${referrerUid}`);
  const userRef = db.collection("users").doc(referrerUid);

  const granted = await db.runTransaction(async (tx) => {
    const [appSnap, refSnap, userSnap] = await Promise.all([tx.get(appRef), tx.get(refRef), tx.get(userRef)]);

    if (!appSnap.exists) throw new HttpsError("not-found", "That application no longer exists.");
    const source = appSnap.data()?.source as { type?: string; referrerUid?: string } | undefined;
    if (!source || source.type !== "referral" || source.referrerUid !== referrerUid) {
      throw new HttpsError("failed-precondition", "This application was not referred by that user.");
    }
    if (!userSnap.exists) throw new HttpsError("not-found", "The referrer's account no longer exists.");

    const refData = refSnap.data() as Record<string, unknown> | undefined;
    const rewards = Array.isArray(refData?.rewards) ? (refData!.rewards as Record<string, unknown>[]) : [];
    // One reward per referred applicant: the same conversion can never be paid twice.
    if (rewards.some((r) => r?.applicantUid === applicantUid)) {
      throw new HttpsError("failed-precondition", "This referral has already been rewarded.");
    }

    const at = new Date().toISOString();
    const u = userSnap.data() as Record<string, unknown>;
    const referrerName = `${str(u.firstName, 60)} ${str(u.lastName, 60)}`.trim() || str(u.name, 120) || str(u.email, 120);
    const email = str(u.email, 254).toLowerCase();

    tx.set(
      refRef,
      {
        rewards: [...rewards, { points, applicantUid, at, by: caller.uid, byEmail: caller.email, ...(note ? { note } : {}) }],
        rewardsTotal: Number(refData?.rewardsTotal || 0) + points,
        updatedAt: at,
      },
      { merge: true }
    );
    // Admin SDK write: the rules-restricted `bonusCredits` key never touches a client.
    tx.update(userRef, { bonusCredits: FieldValue().increment(points) });

    return { points, referrerName, email, postId };
  });

  // Best-effort confirmation to the referrer; the credits are already granted.
  try {
    if (granted.email) {
      await db.collection("notifications").doc().set({
        userId: granted.email,
        type: "referral_reward",
        title: "Referral Reward 🎁",
        message: `Your referral earned you ${granted.points} credit point${granted.points === 1 ? "" : "s"}. Thank you for sharing!`,
        metadata: { postId: granted.postId, points: granted.points },
        read: false,
        viewed: false,
        createdAt: Timestamp().now(),
      });
    }
  } catch (err) {
    console.error("Referral reward notification failed:", err);
  }

  return { success: true, points: granted.points };
});
