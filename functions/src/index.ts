import { onCall, HttpsError } from "firebase-functions/v2/https";
import { sendMail } from "./mailer";

interface CandidateInput {
  id?: string;
  name?: string;
  email: string;
}

// 1. Manager welcome email
export const managerInvite = onCall(async (request) => {
  const { email, name, password, baseUrl } = request.data as {
    email: string;
    name?: string;
    password: string;
    baseUrl: string;
  };

  if (!email) throw new HttpsError("invalid-argument", "Email missing");

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#f97316;">Welcome to Indian Infra!</h2>
        <p>Hi ${name || "there"},</p>
        <p>You have been added as a <strong>Manager</strong> to the Indian Infra Recruitment Portal. We're excited to have you on board!</p>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;font-weight:bold;color:#475569;">Your Login Credentials:</p>
          <p style="margin:8px 0 4px;"><strong>Email:</strong> ${email}</p>
          <p style="margin:0;"><strong>Temporary Password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${password}</code></p>
        </div>
        <p>Please log in using the link below and change your password immediately for security purposes.</p>
        <p style="margin-top:24px;">
          <a href="${baseUrl}" style="background:#f97316;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
            Login to Portal
          </a>
        </p>
        <p style="margin-top:24px;color:#64748b;font-size:14px;">If you have any questions, please contact the system administrator.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Recruitment Team</p>
      </div>
    `;

  try {
    await sendMail({ to: email, subject: "Welcome to Indian Infra Recruitment Portal", html });
    return { success: true };
  } catch (err: any) {
    console.error("managerInvite error", err);
    throw new HttpsError("internal", err.message || "Failed to send email");
  }
});

// 2. Interview invitation email
export const sendInterviewInvite = onCall(async (request) => {
  const { candidate, interviewDetails, baseUrl } = request.data as {
    candidate: CandidateInput;
    interviewDetails: { role: string; dates: string[]; roundType: string; interviewers: string[] };
    baseUrl: string;
  };

  if (!candidate?.email) throw new HttpsError("invalid-argument", "Candidate email missing");

  const dateItems = interviewDetails.dates.map((date) => `<li style="margin-bottom:4px;">${date}</li>`).join("");
  const actionUrl = `${baseUrl}/interview?candidateId=${candidate.id}`;
  const declineUrl = `${baseUrl}/api/interview-response?candidateId=${candidate.id}&response=decline`;

  const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
          <h2 style="color:#1d4ed8;">Interview Invitation – ${interviewDetails.role}</h2>
          <p>Hi ${candidate.name?.split(" ")[0] || "there"},</p>
          <p>Thank you for showing interest in <strong>Indian Infra</strong>. We are pleased to move your application forward to the <strong>${interviewDetails.roundType}</strong> round for the position of <strong>${interviewDetails.role}</strong>.</p>
          <p>Please review the available interview slots:</p>
          <ul style="padding-left:20px;color:#0f172a;font-size:14px;">
            ${dateItems}
          </ul>
          <p>On the same page you can also verify a few details (joining date, salary expectations, relocation and laptop availability) so we don't have to follow up separately.</p>
          <p style="margin-top:16px;">
            <a href="${actionUrl}" style="background:#1d4ed8;color:#ffffff;padding:10px 24px;border-radius:4px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
              Confirm availability &amp; verify details
            </a>
          </p>
          <p>The interview panel will include: <strong>${interviewDetails.interviewers.join(", ")}</strong>.</p>
          <p>If none of these dates are convenient, or you'd like to withdraw your application, you can decline <a href="${declineUrl}">here</a>.</p>
          <p>We look forward to speaking with you and learning more about your experience.</p>
          <p>Best regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
        </div>
      `;

  try {
    await sendMail({
      to: candidate.email,
      subject: `Interview Invitation – ${interviewDetails.role} @ Indian Infra`,
      html,
    });
    return { success: true };
  } catch (err: any) {
    console.error("sendInterviewInvite error", err);
    throw new HttpsError("internal", err.message || "Failed to send email");
  }
});

// 3. Round-advance invitation email
export const sendRoundInvite = onCall(async (request) => {
  const { candidate, roundName, roundNumber, role, baseUrl } = request.data as {
    candidate: CandidateInput;
    roundName: string;
    roundNumber: number;
    role: string;
    baseUrl: string;
  };

  if (!candidate?.email) throw new HttpsError("invalid-argument", "Candidate email missing");

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Interview Round Update – ${role}</h2>
        <p>Hi ${candidate.name?.split(" ")[0] || "there"},</p>
        <p>We are pleased to inform you that you have been moved to <strong>Round ${roundNumber} (${roundName})</strong> for the position of <strong>${role}</strong> at <strong>Indian Infra</strong>.</p>
        <p>Please prepare accordingly for this round.</p>
        <p style="margin-top:16px;">
          <a href="${baseUrl}/jobs" style="background:#1d4ed8;color:#ffffff;padding:10px 24px;border-radius:4px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
            View Your Dashboard
          </a>
        </p>
        <p>We wish you the best in your upcoming round.</p>
        <p>Best regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
      </div>
    `;

  try {
    await sendMail({
      to: candidate.email,
      subject: `Interview Round ${roundNumber} (${roundName}) – ${role} @ Indian Infra`,
      html,
    });
    return { success: true };
  } catch (err: any) {
    console.error("sendRoundInvite error", err);
    throw new HttpsError("internal", err.message || "Failed to send email");
  }
});

// 4. Congratulations / offer email
export const sendCongratulationsMail = onCall(async (request) => {
  const { candidate } = request.data as { candidate: CandidateInput };

  if (!candidate?.email) throw new HttpsError("invalid-argument", "Candidate email missing");

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Congratulations – Offer from Indian Infra</h2>
        <p>Hi ${candidate.name?.split(" ")[0] || "there"},</p>
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

  try {
    await sendMail({ to: candidate.email, subject: "Offer Letter – Welcome to Indian Infra", html });
    return { success: true };
  } catch (err: any) {
    console.error("sendCongratulationsMail error", err);
    throw new HttpsError("internal", err.message || "Failed to send email");
  }
});

// 5. Verify-details email
export const sendVerifyDetails = onCall(async (request) => {
  const { candidate, baseUrl } = request.data as { candidate: CandidateInput; baseUrl: string };

  if (!candidate?.email) throw new HttpsError("invalid-argument", "Candidate email missing");

  const actionUrl = `${baseUrl}/verify-details?candidateId=${candidate.id}`;
  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Verify Your Details</h2>
        <p>Hi ${candidate.name?.split(" ")[0] || "there"},</p>
        <p>Thank you for confirming your interview slot. Before we proceed to the first technical round, please verify your details by clicking the button below.</p>
        <p style="margin-top:16px;">
          <a href="${actionUrl}" style="background:#1d4ed8;color:#ffffff;padding:10px 24px;border-radius:4px;text-decoration:none;font-size:14px;">Verify Details</a>
        </p>
        <p>If the button doesn't work, copy and paste the following URL into your browser:</p>
        <p><a href="${actionUrl}">${actionUrl}</a></p>
        <p style="color:#d97706;font-weight:bold;">Laptop is Mandatory</p>
        <p>Regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
      </div>`;

  try {
    await sendMail({ to: candidate.email, subject: "Verify Your Details – Indian Infra", html });
    return { success: true };
  } catch (err: any) {
    console.error("sendVerifyDetails error", err);
    throw new HttpsError("internal", err.message || "Failed to send email");
  }
});
