import { onCall, HttpsError } from "firebase-functions/v2/https";
import { clientIp, cleanId, enforceLimit, firestore, MINUTE, str, Timestamp } from "./security";
import { notifyRecruiters, resolvePostId } from "./notify";

/**
 * The emailed interview links are opened by candidates who are NOT signed in.
 * Instead of leaving `interviews`, `candidates` and `users` readable by anyone,
 * these callables are the only door: they expose the few fields the page needs
 * and accept only validated writes against an invite the recruiter created.
 */

const TIME_SLOTS = ["10:00 - 12:00 PM", "12:00 - 02:00 PM", "02:00 - 04:00 PM"];

const interviewRef = (id: string) => firestore().collection("interviews").doc(id);

async function limit(request: Parameters<typeof clientIp>[0], bucket: string, max: number) {
  await enforceLimit(`${bucket}:${clientIp(request)}`, max, 10 * MINUTE, "Too many attempts. Please wait a few minutes and try again.");
}

interface Details {
  dateOfJoining: string;
  currentSalary: string;
  expectedSalary: string;
  expectedSalaryPeriod: string;
  yearsExperience: string;
  experienceIn: string;
  readyToRelocate: string;
  laptop: string;
}

function cleanDetails(raw: unknown): Details {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const yesNo = (v: unknown) => (v === "yes" ? "yes" : "no");
  const amount = (v: unknown) => {
    const s = str(typeof v === "number" ? String(v) : v, 15);
    return /^\d*(\.\d+)?$/.test(s) ? s : "";
  };
  return {
    dateOfJoining: /^\d{4}-\d{2}-\d{2}$/.test(str(d.dateOfJoining, 10)) ? str(d.dateOfJoining, 10) : "",
    currentSalary: amount(d.currentSalary),
    expectedSalary: amount(d.expectedSalary),
    expectedSalaryPeriod: d.expectedSalaryPeriod === "year" ? "year" : "month",
    yearsExperience: amount(d.yearsExperience),
    experienceIn: str(d.experienceIn, 100),
    readyToRelocate: yesNo(d.readyToRelocate),
    laptop: yesNo(d.laptop),
  };
}

/** What the confirmation page needs: the offered dates and whether it was already answered. */
export const getInterviewInvite = onCall(async (request) => {
  await limit(request, "invite-get", 60);
  const id = cleanId((request.data as { candidateId?: unknown })?.candidateId, "link");
  const snap = await interviewRef(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "This interview link is not valid.");
  const d = snap.data() as Record<string, unknown>;
  return {
    role: str(d.role, 200),
    dates: Array.isArray(d.dates) ? d.dates.map((x) => str(x, 40)).filter(Boolean).slice(0, 20) : [],
    responded: Boolean(d.response),
    detailsSubmitted: Boolean(d.readyToRelocate),
  };
});

/** The candidate accepts (with a slot and their details) or declines. Answers once. */
export const submitInterviewResponse = onCall(async (request) => {
  await limit(request, "invite-submit", 20);
  const body = request.data as { candidateId?: unknown; response?: unknown; slotDate?: unknown; slotTime?: unknown; details?: unknown };
  const id = cleanId(body.candidateId, "link");
  const accepted = body.response === "accept";
  if (!accepted && body.response !== "decline") throw new HttpsError("invalid-argument", "Invalid response.");

  const ref = interviewRef(id);
  const result = await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "This interview link is not valid.");
    const d = snap.data() as Record<string, unknown>;
    if (d.response) throw new HttpsError("already-exists", "Already submitted.");

    let slot: string | null = null;
    if (accepted) {
      const date = str(body.slotDate, 40);
      const time = str(body.slotTime, 40);
      const offered = Array.isArray(d.dates) ? d.dates.map(String) : [];
      if (!offered.includes(date) || !TIME_SLOTS.includes(time)) {
        throw new HttpsError("invalid-argument", "Please choose one of the offered dates and times.");
      }
      slot = `${date} ${time}`;
    }

    const now = Timestamp().now();
    tx.set(
      ref,
      {
        candidateId: id,
        response: accepted ? "accept" : "decline",
        selectedDate: slot,
        respondedAt: now,
        ...(accepted ? { ...cleanDetails(body.details), detailsSubmitted: true, submittedAt: now } : {}),
      },
      { merge: true }
    );
    return { slot, postId: d.postId };
  });

  const postId = await resolvePostId(id, result.postId);
  await notifyRecruiters({
    postId,
    candidateId: id,
    type: "interview_response",
    title: accepted ? "Interview Confirmed" : "Interview Declined",
    message: (name, forRole) =>
      accepted
        ? `${name} accepted the interview${forRole}${result.slot ? ` and chose ${result.slot}` : ""}, and submitted their details.`
        : `${name} declined the interview invitation${forRole}.`,
  });
  return { success: true };
});

/** Stand-alone "verify your details" link. Fills the details once. */
export const submitVerifyDetails = onCall(async (request) => {
  await limit(request, "verify-submit", 20);
  const body = request.data as { candidateId?: unknown; details?: unknown };
  const id = cleanId(body.candidateId, "link");
  const ref = interviewRef(id);

  const postIdRaw = await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "This link is not valid.");
    const d = snap.data() as Record<string, unknown>;
    if (d.readyToRelocate) throw new HttpsError("already-exists", "Already submitted.");
    tx.update(ref, { ...cleanDetails(body.details), submittedAt: Timestamp().now() });
    return d.postId;
  });

  await notifyRecruiters({
    postId: await resolvePostId(id, postIdRaw),
    candidateId: id,
    type: "details_submitted",
    title: "Details Submitted",
    message: (name, forRole) => `${name} submitted their verification details${forRole}.`,
  });
  return { success: true };
});
