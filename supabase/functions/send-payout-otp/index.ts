// import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// const supabase = createClient(
//   Deno.env.get("SUPABASE_URL") ?? "",
//   Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
// );

// const corsHeaders = {
//   "Access-Control-Allow-Origin": "*",
//   "Access-Control-Allow-Methods": "POST, OPTIONS",
//   "Access-Control-Allow-Headers": "content-type, authorization",
// };

// const ZEPTOMAIL_TOKEN = Deno.env.get("ZEPTOMAIL_TOKEN");
// const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// function escapeHtml(value: string): string {
//   return String(value ?? "")
//     .replace(/&/g, "&amp;")
//     .replace(/</g, "&lt;")
//     .replace(/>/g, "&gt;")
//     .replace(/"/g, "&quot;");
// }

// function buildOtpEmailHtml(email: string, otp: string): string {
//   const escapedEmail = escapeHtml(email);
//   const escapedOtp = escapeHtml(otp);

//   return `
//     <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#0b0b0b; padding:24px; color:#f5f5f5;">
//       <div style="max-width:480px; margin:0 auto; background:#161616; border-radius:12px; overflow:hidden; border:1px solid #2a2a2a;">
//         <div style="padding:20px 24px; border-bottom:1px solid #2a2a2a;">
//           <span style="color:#ff3b3b; font-weight:700; font-size:18px;">YoVibe</span>
//         </div>

//         <div style="padding:24px;">
//           <p style="margin:0 0 16px; font-size:15px; color:#cfcfcf;">
//             Hello ${escapedEmail},
//           </p>
//           <p style="margin:0 0 16px; font-size:15px; color:#cfcfcf;">
//             Your payout verification code is:
//           </p>

//           <div style="background:#1a1a1a; border-radius:10px; padding:24px; text-align:center; margin-bottom:20px; border:1px solid #2a2a2a;">
//             <p style="margin:0; font-size:32px; font-weight:700; color:#ff3b3b; letter-spacing:8px;">${escapedOtp}</p>
//           </div>

//           <p style="margin:0 0 16px; font-size:13px; color:#9a9a9a;">
//             This code is valid for 90 seconds. Enter it to confirm your payout.
//           </p>

//           <p style="margin:0; font-size:13px; color:#6b6b6b;">
//             If you didn't request this, ignore this email.
//           </p>
//         </div>

//         <div style="padding:16px 24px; background:#101010; text-align:center;">
//           <p style="margin:0; font-size:11px; color:#6b6b6b;">
//             This email is verified and secured by YoVibe
//           </p>
//         </div>
//       </div>
//     </div>
//   `;
// }

// async function sendViaZeptoMail(
//   to: string,
//   subject: string,
//   htmlBody: string
// ): Promise<{ ok: boolean; error?: string }> {
//   if (!ZEPTOMAIL_TOKEN) return { ok: false, error: "ZEPTOMAIL_TOKEN not configured" };

//   try {
//     const res = await fetch("https://api.zeptomail.com/v1.1/email", {
//       method: "POST",
//       headers: {
//         "Authorization": ZEPTOMAIL_TOKEN,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         from: { address: "noreply@yovibe.net", name: "YoVibe" },
//         to: [{ email_address: { address: to } }],
//         subject,
//         htmlbody: htmlBody,
//       }),
//     });

//     if (!res.ok) {
//       const errText = await res.text();
//       return { ok: false, error: `ZeptoMail API error: ${errText}` };
//     }
//     return { ok: true };
//   } catch (err: unknown) {
//     return { ok: false, error: `ZeptoMail request failed: ${(err as Error).message}` };
//   }
// }

// async function sendViaResendFallback(
//   to: string,
//   subject: string,
//   htmlBody: string
// ): Promise<{ ok: boolean; error?: string }> {
//   if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not configured" };

//   try {
//     const res = await fetch("https://api.resend.com/emails", {
//       method: "POST",
//       headers: {
//         "Authorization": `Bearer ${RESEND_API_KEY}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         from: "YoVibe <noreply@yovibe.net>",
//         to: [to],
//         subject,
//         html: htmlBody,
//       }),
//     });

//     if (!res.ok) {
//       const errText = await res.text();
//       return { ok: false, error: `Resend API error: ${errText}` };
//     }
//     return { ok: true };
//   } catch (err: unknown) {
//     return { ok: false, error: `Resend request failed: ${(err as Error).message}` };
//   }
// }

// async function sendEmailWithFallback(
//   to: string,
//   subject: string,
//   htmlBody: string
// ): Promise<{ ok: boolean; provider: string; error?: string }> {
//   const zepto = await sendViaZeptoMail(to, subject, htmlBody);
//   if (zepto.ok) return { ok: true, provider: "zeptomail" };

//   console.warn("[send-payout-otp] ZeptoMail failed, falling back to Resend:", zepto.error);
//   const resendResult = await sendViaResendFallback(to, subject, htmlBody);
//   if (resendResult.ok) return { ok: true, provider: "resend-fallback" };

//   console.error("[send-payout-otp] Both providers failed:", {
//     zeptoError: zepto.error,
//     resendError: resendResult.error,
//   });
//   return {
//     ok: false,
//     provider: "none",
//     error: `ZeptoMail: ${zepto.error} | Resend: ${resendResult.error}`,
//   };
// }

// serve(async (req) => {
//   if (req.method === "OPTIONS") {
//     return new Response("OK", { headers: corsHeaders });
//   }

//   if (req.method !== "POST") {
//     return new Response(
//       JSON.stringify({ error: "Method not allowed" }),
//       { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
//     );
//   }

//   let payload: { email: string; otp: string };
//   try {
//     payload = await req.json();
//   } catch {
//     return new Response(
//       JSON.stringify({ error: "Invalid JSON body" }),
//       { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
//     );
//   }

//   const { email, otp } = payload;

//   if (!email || !otp) {
//     return new Response(
//       JSON.stringify({ error: "Missing required fields: email and otp" }),
//       { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
//     );
//   }

//   const htmlEmailBody = buildOtpEmailHtml(email, otp);
//   const subject = "Your YoVibe payout verification code";

//   const result = await sendEmailWithFallback(email, subject, htmlEmailBody);
//   if (!result.ok) {
//     return new Response(
//       JSON.stringify({ error: "Failed to send email", details: result.error }),
//       { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
//     );
//   }

//   console.log(`[send-payout-otp] sent successfully via ${result.provider}`);

//   return new Response(
//     JSON.stringify({ success: true, provider: result.provider }),
//     { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
//   );
// });