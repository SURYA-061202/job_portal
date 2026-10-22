import type * as Nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || "465");
const SECURE = (process.env.SMTP_SECURE || "true").toLowerCase() === "true";

let transporter: Nodemailer.Transporter | null = null;

function getTransporter(): Nodemailer.Transporter {
  const USER = process.env.SMTP_USER;
  const PASS = process.env.SMTP_PASS;
  if (!USER || !PASS) {
    throw new Error("SMTP_USER / SMTP_PASS are not configured");
  }
  if (!transporter) {
    // Lazy-loaded: importing nodemailer at module scope pushes first-load
    // past the 10s deployment-analysis timeout on slower build machines.
    const nodemailer = require("nodemailer") as typeof import("nodemailer");
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: { user: USER, pass: PASS },
    });
  }
  return transporter;
}

export interface OtpSmsOptions {
  /** 10-digit Indian mobile (no country code) — the number on the profile. */
  mobile: string;
  code: string;
  /** Registered account email — used as the fallback delivery channel. */
  email?: string;
  name?: string;
}

/**
 * Delivers a mobile-verification OTP by SMS through Fast2SMS when
 * SMS_API_KEY is configured (see functions/.env), otherwise falls back to
 * logging the code and emailing it to the account so verification still
 * works during development.
 *
 * Fast2SMS routes:
 *   "q" (default)     — free-text Quick SMS (needs one ₹100+ recharge).
 *   "otp"             — predefined "Your OTP: {#var#}" text (also requires
 *                       website verification in the OTP Message menu).
 */
export async function sendOtpSms(opts: OtpSmsOptions): Promise<void> {
  const apiKey = process.env.SMS_API_KEY;
  const apiUrl = process.env.SMS_API_URL || "https://www.fast2sms.com/dev/bulkV2";
  const route = process.env.SMS_ROUTE || "q";

  if (apiKey) {
    const body: Record<string, unknown> = { route, numbers: opts.mobile };
    if (route === "otp") {
      body.variables_values = opts.code;
    } else {
      body.message =
        `Your Indian Infra Jobs verification code is ${opts.code}. ` +
        `It expires in 10 minutes. If you did not request this, ignore this message.`;
      body.language = "english";
    }

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { return?: boolean; message?: string | string[] }
      | null;
    const providerMsg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    if (!res.ok || data?.return === false) {
      throw new Error(providerMsg || `Fast2SMS responded with HTTP ${res.status}`);
    }
    console.log(`sendOtpSms: Fast2SMS sent code to ${opts.mobile} (route=${route})`);
    return;
  }

  // No SMS API key configured: log for `firebase functions:log` and fall
  // back to email so the user can still complete verification.
  console.log(`[sendOtpSms:fallback] SMS_API_KEY not set — mobile=${opts.mobile} code=${opts.code}`);

  if (!opts.email) return;

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#ff6600;">Verify Your Mobile Number</h2>
        <p>Hi${opts.name ? ` ${opts.name}` : ""},</p>
        <p>Use the code below to verify the mobile number registered on your Indian Infra Jobs account:</p>
        <p style="margin:8px 0;"><strong>Mobile:</strong> +91 ${opts.mobile}</p>
        <p style="text-align:center;margin:28px 0;">
          <span style="display:inline-block;background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:14px 28px;font-size:30px;font-weight:bold;letter-spacing:12px;color:#0f172a;font-family:Consolas,Menlo,monospace;">${opts.code}</span>
        </p>
        <p style="color:#64748b;font-size:14px;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Jobs Team</p>
      </div>
    `;

  const USER = process.env.SMTP_USER;
  const MAIL_FROM = process.env.MAIL_FROM || `Indian Infra <${USER}>`;
  await getTransporter().sendMail({
    from: MAIL_FROM,
    to: opts.email,
    subject: "Your mobile verification code – Indian Infra Jobs",
    html,
  });
}
