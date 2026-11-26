import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { randomBytes } from "crypto";
import {
  DAY,
  MINUTE,
  cleanId,
  clientIp,
  enforceLimit,
  escapeHtml as esc,
  firestore,
  isEmail,
  requireStaff,
  safeBaseUrl,
  str,
} from "./security";
import { notifyRecruiters } from "./notify";

/**
 * Offer letters live in `offers/{postId}__{candidateId}`. Recruiters write them
 * from the browser (firestore.rules keeps the collection staff-only); these
 * callables are the candidate's door: they expose the letter fields and accept
 * a validated accept/decline with a typed signature.
 */

const mailer = () => require("./mailer") as typeof import("./mailer");

/** Same daily mail budget as the other staff mail functions (see index.ts). */
const MAILS_PER_DAY = 300;

const offerRef = (id: string) => firestore().collection("offers").doc(id);

async function limit(request: CallableRequest, bucket: string, max: number) {
  await enforceLimit(`${bucket}:${clientIp(request)}`, max, 10 * MINUTE, "Too many attempts. Please wait a few minutes and try again.");
}

/**
 * The emailed link carries a random token (`?t=`) that only the mail contains.
 * Without it the offer id alone (postId__uid, both semi-public) would be enough
 * to read a candidate's letter and email address.
 */
function requireToken(snap: FirebaseFirestore.DocumentSnapshot, body: Record<string, unknown>): void {
  const token = str(body?.token, 80);
  const stored = str(snap.get("token"), 80);
  if (!token || !stored || token !== stored) {
    throw new HttpsError("permission-denied", "This offer link is not valid.");
  }
}

/** Offer statuses that can no longer be answered. */
const CLOSED = ["accepted", "declined"];

/** What the candidate page shows. Never leaks recruiter-only bookkeeping. */
function publicOffer(id: string, d: FirebaseFirestore.DocumentData) {
  const iso = (v: unknown): string | undefined => {
    if (typeof v === "string" && v) return v;
    const t = v as { toDate?: () => Date } | undefined;
    return t && typeof t.toDate === "function" ? t.toDate().toISOString() : undefined;
  };
  const timeline = Array.isArray(d.timeline)
    ? d.timeline.map((e: Record<string, unknown>) => ({
        kind: str(e?.kind, 20),
        at: iso(e?.at) || "",
        ...(e?.by ? { by: str(e?.by, 120) } : {}),
        ...(e?.note ? { note: str(e?.note, 200) } : {}),
      }))
    : [];

  const signature =
    d.signature && typeof d.signature === "object"
      ? {
          name: str((d.signature as Record<string, unknown>).name, 120),
          at: iso((d.signature as Record<string, unknown>).at) || "",
        }
      : undefined;

  return {
    id,
    postId: str(d.postId, 128),
    candidateId: str(d.candidateId, 128),
    candidateName: str(d.candidateName, 120),
    candidateEmail: str(d.candidateEmail, 254),
    jobTitle: str(d.jobTitle, 200),
    designation: str(d.designation, 200),
    salary: str(d.salary, 120),
    joiningDate: str(d.joiningDate, 40),
    location: str(d.location, 200),
    notes: str(d.notes, 4000),
    companyName: str(d.companyName, 200),
    status: String(d.status || "draft"),
    recruiterName: str(d.recruiterName, 120),
    sentAt: iso(d.sentAt),
    respondedAt: iso(d.respondedAt),
    signature,
    timeline,
  };
}

/** The letter as the candidate sees it, read straight from Firestore. */
export const getOffer = onCall(async (request) => {
  await limit(request, "offer-get", 60);
  const body = (request.data || {}) as Record<string, unknown>;
  const id = cleanId(body.offerId, "offer");
  const snap = await offerRef(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "This offer link is not valid.");
  requireToken(snap, body);
  return publicOffer(id, snap.data() as FirebaseFirestore.DocumentData);
});

/** Accept (with a typed signature) or decline. Answers once; moves the application stage. */
export const respondToOffer = onCall(async (request) => {
  await limit(request, "offer-respond", 20);
  const body = request.data as { offerId?: unknown; action?: unknown; signatureName?: unknown; token?: unknown };
  const id = cleanId(body.offerId, "offer");
  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    throw new HttpsError("invalid-argument", "Invalid response.");
  }
  const signatureName = str(body.signatureName, 120);
  if (action === "accept" && signatureName.length < 3) {
    throw new HttpsError("invalid-argument", "Please type your full name to sign the offer.");
  }

  const ref = offerRef(id);
  // Checked before the transaction so a wrong token never touches the document.
  const preSnap = await ref.get();
  if (!preSnap.exists) throw new HttpsError("not-found", "This offer link is not valid.");
  requireToken(preSnap, body as Record<string, unknown>);
  const result = await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "This offer link is not valid.");
    const d = snap.data() as Record<string, unknown>;
    const status = String(d.status || "");
    if (CLOSED.includes(status)) throw new HttpsError("failed-precondition", "This offer has already been answered.");
    if (status !== "sent") throw new HttpsError("failed-precondition", "This offer is not open for a response.");

    const at = new Date().toISOString();
    const timeline = Array.isArray(d.timeline) ? [...(d.timeline as unknown[])] : [];
    const signedBy = signatureName || str(d.candidateName, 120);
    timeline.push({
      kind: action === "accept" ? "accepted" : "declined",
      at,
      ...(signedBy ? { by: signedBy } : {}),
    });

    tx.set(
      ref,
      {
        status: action === "accept" ? "accepted" : "declined",
        respondedAt: at,
        updatedAt: at,
        timeline,
        ...(action === "accept" ? { signature: { name: signatureName, at } } : {}),
      },
      { merge: true }
    );

    return {
      status: action === "accept" ? "accepted" : "declined",
      postId: str(d.postId, 128),
      candidateId: str(d.candidateId, 128),
      candidateName: str(d.candidateName, 120) || "A candidate",
      jobTitle: str(d.jobTitle, 200),
    };
  });

  // Move the application so the pipeline and the Selected tab reflect the answer.
  // Only an existing application is touched — an offer can be sent to an uploaded
  // resume that never applied through the platform.
  const appRef = firestore().collection("job_applications").doc(`${result.postId}_${result.candidateId}`);
  try {
    const appSnap = await appRef.get();
    if (appSnap.exists) {
      await appRef.update({
        status: result.status === "accepted" ? "offer_accepted" : "offer_declined",
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Could not update application after offer response:", err);
  }

  await notifyRecruiters({
    postId: result.postId,
    candidateId: result.candidateId,
    type: "offer_response",
    title: result.status === "accepted" ? "Offer Accepted" : "Offer Declined",
    message: (name, forRole) =>
      result.status === "accepted"
        ? `${name} accepted the offer${forRole}.`
        : `${name} declined the offer${forRole}.`,
  });

  return { success: true, status: result.status };
});

/** Emails the offer link to the candidate. The letter text comes from Firestore, never the client. */
export const sendOfferLetter = onCall(async (request) => {
  const caller = await requireStaff(request);
  await enforceLimit(`mail:${caller.uid}`, MAILS_PER_DAY, DAY, "Daily email limit reached. Please try again tomorrow.");

  const data = request.data as { offerId?: unknown; baseUrl?: unknown };
  const id = cleanId(data.offerId, "offer");
  const appUrl = safeBaseUrl(data.baseUrl);

  const snap = await offerRef(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "This offer no longer exists.");
  const d = snap.data() as Record<string, unknown>;
  const status = String(d.status || "draft");
  if (status !== "sent") {
    throw new HttpsError(
      "failed-precondition",
      status === "draft" ? "Save and send the offer first." : "This offer has already been answered."
    );
  }

  // One token per offer, minted here so only the emailed link can open it.
  let token = str(snap.get("token"), 80);
  if (!token) {
    token = randomBytes(16).toString("hex");
    await offerRef(id).set({ token, updatedAt: new Date().toISOString() }, { merge: true });
  }

  const email = str(d.candidateEmail, 254);
  if (!isEmail(email)) throw new HttpsError("invalid-argument", "Candidate email missing or invalid");

  const candidateName = str(d.candidateName, 120) || "Candidate";
  const designation = str(d.designation, 200) || str(d.jobTitle, 200);
  const company = str(d.companyName, 200) || "Indian Infra";
  const actionUrl = `${appUrl}/offer/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`;
  const firstName = esc(candidateName.split(" ")[0] || "there");

  const rows: [string, string][] = (
    [
      ["Position", designation],
      ["Compensation", str(d.salary, 120)],
      ["Joining date", str(d.joiningDate, 40)],
      ["Location", str(d.location, 200)],
    ] as [string, string][]
  ).filter(([, value]) => Boolean(value));

  const fieldHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#475569;font-weight:bold;white-space:nowrap;">${esc(label)}</td>` +
        `<td style="padding:6px 0;color:#0f172a;">${esc(value)}</td></tr>`
    )
    .join("");

  const notes = str(d.notes, 4000);

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Offer Letter – ${esc(designation)} @ ${esc(company)}</h2>
        <p>Hi ${firstName},</p>
        <p>We are delighted to extend an offer of employment to you for the position of <strong>${esc(designation)}</strong> at <strong>${esc(company)}</strong>.</p>
        <table style="border-collapse:collapse;margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
          <tbody>${fieldHtml}</tbody>
        </table>
        ${notes ? `<p style="white-space:pre-line;color:#334155;font-size:14px;">${esc(notes)}</p>` : ""}
        <p style="margin-top:16px;">
          <a href="${esc(actionUrl)}" style="background:#1d4ed8;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
            View &amp; respond to your offer
          </a>
        </p>
        <p>The page lets you read the full letter, download a copy and accept or decline with your signature. The link is personal to you.</p>
        <p>Best regards,<br/>HR Team<br/>${esc(company)}</p>
      </div>
    `;

  try {
    await mailer().sendMail({ to: email, subject: `Offer Letter – ${designation} @ ${company}`, html });
  } catch (err) {
    console.error("sendOfferLetter error", err);
    throw new HttpsError("internal", "Failed to send email");
  }

  return { success: true };
});
