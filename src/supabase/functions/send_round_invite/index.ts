// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.193.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const HOSTNAME = Deno.env.get("SMTP_HOST") || "sandbox.smtp.mailtrap.io";
const PORT = Number(Deno.env.get("SMTP_PORT") || "2525");
const TLS = (Deno.env.get("SMTP_SECURE") || "true").toLowerCase() === "true";
const USER = Deno.env.get("SMTP_USER") || "talent.indianinfra@gmail.com";
const PASS = Deno.env.get("SMTP_PASS") || "abkzhcigopduzdao";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || `Indian Infra <${USER}>`;

const client = new SMTPClient({
  connection: {
    hostname: HOSTNAME,
    port: PORT,
    tls: TLS,
    auth: {
      username: USER,
      password: PASS
    }
  },
  ...TLS ? {} : {
    debug: {
      noStartTLS: true,
      allowUnsecure: true
    }
  }
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json"
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { candidate, roundName, roundNumber, role, baseUrl } = await req.json();

    if (!candidate?.email) {
      return new Response(JSON.stringify({ success: false, error: "Candidate email missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

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

    await client.send({
      from: MAIL_FROM,
      to: candidate.email,
      subject: `Interview Round ${roundNumber} (${roundName}) – ${role} @ Indian Infra`,
      content: "Please view this email in HTML capable client.",
      html
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    console.error("send_round_invite function error", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: corsHeaders()
    });
  }
});
