import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import {
  auth as adminAuthInstance,
  clientIp,
  DAY,
  enforceLimit,
  escapeHtml as esc,
  firestore,
  HOUR,
  isEmail,
  requireAdmin,
  requireStaff,
  safeBaseUrl,
  str,
} from "./security";

export { verifyEmailExists } from "./emailVerify";
export { sendSignupOtp, verifySignupOtp } from "./signupOtp";
export { confirmMobileVerified, checkMobileAvailable } from "./mobileOtp";
export { sendCompanyEmailCode, verifyCompanyEmailCode } from "./companyEmail";
export { parseResume, scoreCandidates, rankApplicants, clusterCandidates } from "./ai";
export { getInterviewInvite, submitInterviewResponse, submitVerifyDetails } from "./candidatePortal";

if (getApps().length === 0) {
  initializeApp();
}

// Lazy-loaded at call time so deployment analysis (10s code-load budget)
// does not choke on firebase-admin / nodemailer at module scope.
const mailer = () => require("./mailer") as typeof import("./mailer");

/** Mails a recruiter may send per day. Bulk invites are well under this. */
const MAILS_PER_DAY = 300;

interface CandidateInput {
  id?: string;
  name?: string;
  email: string;
}

/** Validates the candidate block the staff-side mail functions receive. */
function candidateOf(data: unknown): { id: string; name: string; email: string } {
  const c = (data || {}) as Partial<CandidateInput>;
  if (!isEmail(c.email)) throw new HttpsError("invalid-argument", "Candidate email missing or invalid");
  return { id: str(c.id, 128), name: str(c.name, 120), email: c.email.trim() };
}

const firstName = (name: string) => esc(name.split(" ")[0] || "there");

/** Staff-only mail: signed in, a recruiter/manager/admin, within the daily quota. */
async function staffMail(request: Parameters<typeof requireStaff>[0]) {
  const caller = await requireStaff(request);
  await enforceLimit(`mail:${caller.uid}`, MAILS_PER_DAY, DAY, "Daily email limit reached. Please try again tomorrow.");
  return caller;
}

async function send(opts: { to: string; subject: string; html: string }, label: string) {
  try {
    await mailer().sendMail(opts);
    return { success: true };
  } catch (err: any) {
    console.error(`${label} error`, err);
    throw new HttpsError("internal", "Failed to send email");
  }
}

// 1. Manager / recruiter welcome email (admin only).
// The temporary password is never emailed any more: the new member gets a
// one-time link to set their own.
export const managerInvite = onCall(async (request) => {
  const caller = await requireAdmin(request);
  await enforceLimit(`mail:${caller.uid}`, MAILS_PER_DAY, DAY, "Daily email limit reached. Please try again tomorrow.");

  const { email, name, baseUrl } = request.data as { email?: string; name?: string; baseUrl?: string };
  if (!isEmail(email)) throw new HttpsError("invalid-argument", "Email missing");
  const appUrl = safeBaseUrl(baseUrl);

  // Only for accounts an admin has just created as recruiter/manager.
  let setPasswordLink: string;
  try {
    const user = await adminAuthInstance().getUserByEmail(email);
    const profile = (await firestore().collection("users").doc(user.uid).get()).data();
    if (!profile || !["recruiter", "manager"].includes(profile.role)) {
      throw new HttpsError("failed-precondition", "That account is not a recruiter or manager.");
    }
    setPasswordLink = await adminAuthInstance().generatePasswordResetLink(email, { url: appUrl });
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    console.error("managerInvite link error", err);
    throw new HttpsError("not-found", "No account found for this email.");
  }

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#f97316;">Welcome to Indian Infra!</h2>
        <p>Hi ${esc(str(name, 120) || "there")},</p>
        <p>You have been added to the Indian Infra Recruitment Portal. We're excited to have you on board!</p>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;font-weight:bold;color:#475569;">Your login email</p>
          <p style="margin:8px 0 0;">${esc(email)}</p>
        </div>
        <p>Use the button below to choose your password. For your security the link works once and expires in 1 hour.</p>
        <p style="margin-top:24px;">
          <a href="${esc(setPasswordLink)}" style="background:#f97316;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
            Set your password
          </a>
        </p>
        <p style="margin-top:16px;color:#64748b;font-size:14px;">After that you can sign in at <a href="${esc(appUrl)}">${esc(appUrl)}</a>. If you have any questions, please contact the system administrator.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Recruitment Team</p>
      </div>
    `;

  return send({ to: email, subject: "Welcome to Indian Infra Recruitment Portal", html }, "managerInvite");
});

// 2. Interview invitation email
export const sendInterviewInvite = onCall(async (request) => {
  await staffMail(request);
  const data = request.data as {
    candidate?: unknown;
    interviewDetails?: { role?: string; dates?: string[]; roundType?: string; interviewers?: string[] };
    baseUrl?: string;
  };
  const candidate = candidateOf(data.candidate);
  const d = data.interviewDetails || {};
  if (!candidate.id) throw new HttpsError("invalid-argument", "Candidate id missing");

  const role = str(d.role, 200);
  const roundType = str(d.roundType, 100);
  const dates = (Array.isArray(d.dates) ? d.dates : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 20);
  const interviewers = (Array.isArray(d.interviewers) ? d.interviewers : []).map((x) => str(x, 120)).filter(Boolean).slice(0, 20);
  const appUrl = safeBaseUrl(data.baseUrl);

  const dateItems = dates.map((date) => `<li style="margin-bottom:4px;">${esc(date)}</li>`).join("");
  const actionUrl = `${appUrl}/interview?candidateId=${encodeURIComponent(candidate.id)}`;

  const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
          <h2 style="color:#1d4ed8;">Interview Invitation – ${esc(role)}</h2>
          <p>Hi ${firstName(candidate.name)},</p>
          <p>Thank you for showing interest in <strong>Indian Infra</strong>. We are pleased to move your application forward to the <strong>${esc(roundType)}</strong> round for the position of <strong>${esc(role)}</strong>.</p>
          <p>Please review the available interview slots:</p>
          <ul style="padding-left:20px;color:#0f172a;font-size:14px;">
            ${dateItems}
          </ul>
          <p>On the same page you can also verify a few details (joining date, salary expectations, relocation and laptop availability) so we don't have to follow up separately.</p>
          <p style="margin-top:16px;">
            <a href="${esc(actionUrl)}" style="background:#1d4ed8;color:#ffffff;padding:10px 24px;border-radius:4px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
              Confirm availability &amp; verify details
            </a>
          </p>
          <p>The interview panel will include: <strong>${esc(interviewers.join(", "))}</strong>.</p>
          <p>If none of these dates are convenient, or you'd like to withdraw your application, open the <a href="${esc(actionUrl)}">same page</a> and choose "Not Interested".</p>
          <p>We look forward to speaking with you and learning more about your experience.</p>
          <p>Best regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
        </div>
      `;

  return send({ to: candidate.email, subject: `Interview Invitation – ${role} @ Indian Infra`, html }, "sendInterviewInvite");
});

// 3. Round-advance invitation email
export const sendRoundInvite = onCall(async (request) => {
  await staffMail(request);
  const data = request.data as { candidate?: unknown; roundName?: string; roundNumber?: number; role?: string; baseUrl?: string };
  const candidate = candidateOf(data.candidate);
  const roundName = str(data.roundName, 100);
  const roundNumber = Math.max(0, Math.min(20, Math.floor(Number(data.roundNumber) || 0)));
  const role = str(data.role, 200);
  const appUrl = safeBaseUrl(data.baseUrl);

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Interview Round Update – ${esc(role)}</h2>
        <p>Hi ${firstName(candidate.name)},</p>
        <p>We are pleased to inform you that you have been moved to <strong>Round ${roundNumber} (${esc(roundName)})</strong> for the position of <strong>${esc(role)}</strong> at <strong>Indian Infra</strong>.</p>
        <p>Please prepare accordingly for this round.</p>
        <p style="margin-top:16px;">
          <a href="${esc(appUrl)}/jobs" style="background:#1d4ed8;color:#ffffff;padding:10px 24px;border-radius:4px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
            View Your Dashboard
          </a>
        </p>
        <p>We wish you the best in your upcoming round.</p>
        <p>Best regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
      </div>
    `;

  return send(
    { to: candidate.email, subject: `Interview Round ${roundNumber} (${roundName}) – ${role} @ Indian Infra`, html },
    "sendRoundInvite"
  );
});

// 4. Congratulations / offer email
export const sendCongratulationsMail = onCall(async (request) => {
  await staffMail(request);
  const candidate = candidateOf((request.data as { candidate?: unknown })?.candidate);

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Congratulations – Offer from Indian Infra</h2>
        <p>Hi ${firstName(candidate.name)},</p>
        <p>We are delighted to inform you that you have been <strong>selected</strong> to join <strong>Indian Infra</strong>.</p>
        <p>To proceed with the onboarding process, kindly email the scanned copies of the following documents to us by replying to this email:</p>
        <ul style="padding-left:20px;color:#0f172a;font-size:14px;">
          <li>MarkSheets</li>
          <li>Degree Completion Certificates</li>
          <li>Experience Certificate (if applicable)</li>
          <li>Bank Account Details</li>
        </ul>
        <p style="margin-top:16px;color:#d97706;font-weight:bold;">Fill the Onborading form:</p>
        <p><a href="https://forms.gle/bv9Lc6SXWn6MHW6WA" style="color:#1d4ed8;">https://forms.gle/bv9Lc6SXWn6MHW6WA</a></p>
        <p>Our team will review the documents and get back to you with further steps.</p>
        <p>We look forward to having you on board.</p>
        <p>Best regards,<br/>HR Team<br/>Indian Infra</p>
      </div>
    `;

  return send({ to: candidate.email, subject: "Offer Letter – Welcome to Indian Infra", html }, "sendCongratulationsMail");
});

// 4b. Rejection email. The recruiter's reason is included, worded politely.
export const sendRejectionMail = onCall(async (request) => {
  await staffMail(request);
  const data = request.data as { candidate?: unknown; role?: string; reason?: string; roundName?: string };
  const candidate = candidateOf(data.candidate);
  const role = str(data.role, 200);
  const reason = str(data.reason, 1000);
  const roundName = str(data.roundName, 100);
  if (reason.length < 10) throw new HttpsError("invalid-argument", "A reason for rejection is required.");

  const forRole = role ? ` for the position of <strong>${esc(role)}</strong>` : "";
  const stage = roundName ? ` after the <strong>${esc(roundName)}</strong> round` : "";
  // Keep the recruiter's line breaks, but never any markup.
  const reasonHtml = esc(reason).replace(/\r?\n/g, "<br/>");

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Update on Your Application${role ? ` – ${esc(role)}` : ""}</h2>
        <p>Hi ${firstName(candidate.name)},</p>
        <p>Thank you for taking the time to interview with <strong>Indian Infra</strong>${forRole}. We truly appreciate the effort you put into the process.</p>
        <p>After careful consideration, we have decided not to move forward with your application${stage} at this time.</p>
        <div style="background:#f8fafc;border-left:4px solid #1d4ed8;padding:12px 16px;border-radius:4px;margin:20px 0;">
          <p style="margin:0 0 6px;font-weight:bold;color:#475569;">Feedback from the hiring team</p>
          <p style="margin:0;">${reasonHtml}</p>
        </div>
        <p>This decision reflects the needs of this particular role and is not a judgement of your overall abilities. We encourage you to keep an eye on our openings and apply again for roles that match your experience.</p>
        <p>We wish you every success in your career ahead.</p>
        <p>Best regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
      </div>
    `;

  return send(
    { to: candidate.email, subject: `Update on Your Application${role ? ` – ${role}` : ""} @ Indian Infra`, html },
    "sendRejectionMail"
  );
});

// 5. Verify-details email
export const sendVerifyDetails = onCall(async (request) => {
  await staffMail(request);
  const data = request.data as { candidate?: unknown; baseUrl?: string };
  const candidate = candidateOf(data.candidate);
  if (!candidate.id) throw new HttpsError("invalid-argument", "Candidate id missing");

  const actionUrl = `${safeBaseUrl(data.baseUrl)}/verify-details?candidateId=${encodeURIComponent(candidate.id)}`;
  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Verify Your Details</h2>
        <p>Hi ${firstName(candidate.name)},</p>
        <p>Thank you for confirming your interview slot. Before we proceed to the first technical round, please verify your details by clicking the button below.</p>
        <p style="margin-top:16px;">
          <a href="${esc(actionUrl)}" style="background:#1d4ed8;color:#ffffff;padding:10px 24px;border-radius:4px;text-decoration:none;font-size:14px;">Verify Details</a>
        </p>
        <p>If the button doesn't work, copy and paste the following URL into your browser:</p>
        <p><a href="${esc(actionUrl)}">${esc(actionUrl)}</a></p>
        <p style="color:#d97706;font-weight:bold;">Laptop is Mandatory</p>
        <p>Regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
      </div>`;

  return send({ to: candidate.email, subject: "Verify Your Details – Indian Infra", html }, "sendVerifyDetails");
});

// 6. Password reset link email (used by the login "Forgot Password" link and the
//    Change Password buttons on the user + recruiter/admin profile pages)
export const sendPasswordResetMail = onCall(async (request) => {
  const { email, baseUrl } = request.data as { email?: string; baseUrl?: string };

  if (!email) throw new HttpsError("invalid-argument", "Email missing");
  if (!isEmail(email)) throw new HttpsError("invalid-argument", "Invalid email address");

  // Signed-in callers may only request a reset for their own account.
  // Signed-out callers (login page "Forgot Password") are allowed through.
  if (request.auth) {
    const callerEmail = request.auth.token.email;
    if (!callerEmail || callerEmail.toLowerCase() !== email.toLowerCase()) {
      throw new HttpsError("permission-denied", "You can only request a password reset for your own account");
    }
  }

  // Signed-out callers can reach this, so cap it per address and per network
  // to stop it being used to flood someone's inbox or burn our mail quota.
  await enforceLimit(`reset-mail:${email.toLowerCase()}`, 3, HOUR, "A reset email was already sent recently. Please check your inbox or try again later.");
  await enforceLimit(`reset-ip:${clientIp(request)}`, 20, HOUR, "Too many requests. Please try again later.");

  const appUrl = safeBaseUrl(baseUrl);

  let resetLink: string;
  try {
    resetLink = await adminAuthInstance().generatePasswordResetLink(email, { url: appUrl });
  } catch (err: any) {
    console.error("sendPasswordResetMail link error", err);
    if (err?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No account found with this email");
    }
    throw new HttpsError("internal", "Failed to generate password reset link");
  }

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#ff6600;">Change Your Password</h2>
        <p>Hi there,</p>
        <p>We received a request to change the password for your Indian Infra account (<strong>${esc(email)}</strong>).</p>
        <p style="margin-top:24px;">
          <a href="${esc(resetLink)}" style="background:#ff6600;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
            Set New Password
          </a>
        </p>
        <p>If the button doesn't work, copy and paste the following URL into your browser:</p>
        <p style="word-break:break-all;color:#64748b;font-size:14px;">${esc(resetLink)}</p>
        <p style="margin-top:20px;color:#64748b;font-size:14px;">This link expires in 1 hour and can only be used once. If you didn't request this change, you can safely ignore this email &mdash; your password will remain unchanged.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Recruitment Team</p>
      </div>
    `;

  return send({ to: email, subject: "Reset Your Password – Indian Infra", html }, "sendPasswordResetMail");
});
