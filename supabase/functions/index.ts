// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.193.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Helper: load env with fallback so the function runs locally with `supabase functions serve`
// Default to Mailtrap demo values so the function works in the sandbox even if the user forgets to set secrets.
const HOSTNAME = Deno.env.get("SMTP_HOST") || "sandbox.smtp.mailtrap.io";
const PORT = Number(Deno.env.get("SMTP_PORT") || "2525");
// Determine whether to use TLS based on env (default true for production SMTP like Gmail).
// Set SMTP_SECURE="false" to force plain connection (Mailtrap sandbox, local testing, etc.).
const TLS = (Deno.env.get("SMTP_SECURE") || "true").toLowerCase() === "true";
const USER = Deno.env.get("SMTP_USER") || "surya.r061202@gmail.com";
const PASS = Deno.env.get("SMTP_PASS") || "ftnpryvgwhmjvuie";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || `Indian Infra <${USER}>`;

const client = new SMTPClient({
  connection: {
    hostname: HOSTNAME,
    port: PORT,
    tls: TLS,
    auth: {
      username: USER,
      password: PASS,
    },
  },
  // Only keep the insecure debug overrides when TLS is disabled (e.g., Mailtrap sandbox)
  ...(TLS
    ? {}
    : {
      debug: {
        noStartTLS: true, // prevent STARTTLS on insecure connections
        allowUnsecure: true, // permit plain auth
      },
    }),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  } as const;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { type = "interview_invite", baseUrl } = body;

    if (type === "interview_invite") {
      const { candidate, interviewDetails } = body;
      if (!candidate?.email) {
        return new Response(JSON.stringify({ success: false, error: "Candidate email missing" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const dateItems = interviewDetails.dates.map((date: string) => `<li style="margin-bottom:4px;">${date}</li>`).join("");
      const actionUrl = `${baseUrl}/interview?candidateId=${candidate.id}`;
      const declineUrl = `${baseUrl}/api/interview-response?candidateId=${candidate.id}&response=decline`;

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
          <h2 style="color:#1d4ed8;">Interview Invitation – ${interviewDetails.role}</h2>
          <p>Hi ${candidate.name?.split(" ")[0] || "there"},</p>
          <p>Thank you for showing interest in <strong>Indian Infra</strong>. We are pleased to move your application forward to the <strong>${interviewDetails.roundType} round</strong> for the position of <strong>${interviewDetails.role}</strong>.</p>
          <p>Please review the available interview slots:</p>
          <ul style="padding-left:20px;color:#0f172a;font-size:14px;">
            ${dateItems}
          </ul>
          <p style="margin-top:16px;">
            <a href="${actionUrl}" style="background:#1d4ed8;color:#ffffff;padding:10px 24px;border-radius:4px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
              Click here to confirm your availability
            </a>
          </p>
          <p>The interview panel will include: <strong>${interviewDetails.interviewers.join(", ")}</strong>.</p>
          <p>If none of these dates are convenient, or you'd like to withdraw your application, you can decline <a href="${declineUrl}">here</a>.</p>
          <p>We look forward to speaking with you and learning more about your experience.</p>
          <p>Best regards,<br/>Talent Acquisition Team<br/>Indian Infra</p>
        </div>
      `;

      await client.send({
        from: MAIL_FROM,
        to: candidate.email,
        subject: `Interview Invitation – ${interviewDetails.role} @ Indian Infra`,
        content: "Please view this email in HTML capable client.",
        html,
      });
    } else if (type === "member_welcome") {
      const { email, name, password } = body;
      if (!email) {
        return new Response(JSON.stringify({ success: false, error: "Email missing" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
          <h2 style="color:#f97316;">Welcome to Indian Infra!</h2>
          <p>Hi ${name},</p>
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

      await client.send({
        from: MAIL_FROM,
        to: email,
        subject: "Welcome to Indian Infra Recruitment Portal",
        content: "Please view this email in HTML capable client.",
        html,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (err: any) {
    console.error("send_email function error", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}); 