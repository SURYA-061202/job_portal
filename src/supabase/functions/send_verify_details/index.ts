// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.193.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
const HOSTNAME = Deno.env.get("SMTP_HOST") || "sandbox.smtp.mailtrap.io";
const PORT = Number(Deno.env.get("SMTP_PORT") || "2525");
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
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders()
  });
  if (req.method !== "POST") return new Response(JSON.stringify({
    success: false,
    error: "Method not allowed"
  }), {
    status: 405,
    headers: {
      "Content-Type": "application/json"
    }
  });
  try {
    /**
     * Expected body: { candidate: { id,name,email }, baseUrl }
     */ const { candidate, baseUrl } = await req.json();
    if (!candidate?.email) {
      return new Response(JSON.stringify({
        success: false,
        error: "Candidate email missing"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
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
    await client.send({
      from: MAIL_FROM,
      to: candidate.email,
      subject: "Verify Your Details – Indian Infra",
      content: "Please view this email in HTML capable client.",
      html
    });
    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    console.error("send_verify_details error", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
});
