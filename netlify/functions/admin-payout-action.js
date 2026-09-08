// netlify/functions/admin-payout-action.js
//
// Admin actions on card/bank payout requests: approve / reject / complete.
//
// Runs server-side with the Supabase service-role key so the status transition
// bypasses RLS. The browser client (anon key) cannot update the RLS-protected
// `payouts` table — an RLS-blocked UPDATE returns 0 rows with no error, which is
// why the previous client-side approval silently "succeeded" but left the
// payout on pending_admin_review.

const { requireUser, json } = require("../shared/supabaseAdmin");

function isAdmin(profile) { return profile?.user_type === "admin"; }
function money(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

async function sendPayoutNotification(admin, userId, title, body, payoutId, status) {
  if (!userId) return;
  try {
    await admin.from("notifications").insert({
      user_id: userId,
      title,
      body,
      type: "payout_update",
      data: { payoutId, status },
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("admin-payout-action: notification error:", e.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const { admin, authUser, profile } = await requireUser(event);
    if (!isAdmin(profile)) return json(403, { error: "Admin access required" });

    const body = JSON.parse(event.body || "{}");
    const { action, payoutId } = body;
    if (!action || !payoutId) return json(400, { error: "action and payoutId are required" });

    const { data: payout, error: fetchError } = await admin
      .from("payouts")
      .select("*")
      .eq("id", payoutId)
      .single();
    if (fetchError || !payout) return json(404, { error: "Payout not found" });

    const now = new Date().toISOString();

    if (action === "approve") {
      if (payout.status !== "pending_admin_review") return json(409, { error: "Payout is not awaiting review" });
      const update = { status: "approved", admin_id: authUser.id, updated_at: now };
      if (body.approvedAmount !== undefined && body.approvedAmount !== null) {
        if (Math.abs(money(body.approvedAmount) - money(payout.amount)) > 1) {
          return json(422, { error: "A payout must match the server-calculated ticket proceeds" });
        }
        update.approved_amount = money(payout.amount);
      }
      const { data, error } = await admin
        .from("payouts")
        .update(update)
        .eq("id", payoutId)
        .select("*")
        .single();
      if (error) throw error;
      await sendPayoutNotification(admin, payout.organizer_id, "✅ Payout Approved",
        `Your payout of UGX ${money(payout.amount).toLocaleString()} has been approved and is being processed.`,
        payoutId, "approved");
      return json(200, { payout: data });
    }

    if (action === "reject") {
      if (payout.status !== "pending_admin_review") return json(409, { error: "Payout is not awaiting review" });
      const note = (body.reason || "").trim() || "Rejected by admin";
      const { data, error } = await admin
        .from("payouts")
        .update({ status: "rejected", admin_id: authUser.id, admin_note: note, updated_at: now })
        .eq("id", payoutId)
        .select("*")
        .single();
      if (error) throw error;
      const ticketIds = Array.isArray(payout.ticket_ids) ? payout.ticket_ids : [];
      if (ticketIds.length) {
        await admin.from("tickets")
          .update({ payout_status: "pending", payout_eligible: true })
          .in("id", ticketIds).eq("payout_status", "pending_review")
          .eq("status", "used").eq("is_scanned", true).eq("refund_status", "none");
      }
      await sendPayoutNotification(admin, payout.organizer_id, "❌ Payout Rejected",
        `Your payout of UGX ${money(payout.amount).toLocaleString()} was rejected. Reason: ${note}`,
        payoutId, "rejected");
      return json(200, { payout: data });
    }

    if (action === "complete") {
      if (payout.status !== "approved") return json(409, { error: "Payout must be approved before completing" });
      if (payout.payout_method !== "bank_transfer") return json(422, { error: "Only card-funded bank payouts are submitted through PesaPal" });
      const metadata = typeof payout.metadata === "string" ? JSON.parse(payout.metadata || "{}") : (payout.metadata || {});
      if (!payout.recipient_name || !metadata.bank_name || !metadata.account_number) {
        return json(422, { error: "Payout bank details are incomplete" });
      }
      const transactionReference = String(body.transactionReference || "").trim();
      if (transactionReference.length < 6) {
        return json(422, { error: "Enter the real PesaPal payout reference before completing" });
      }
      const { data, error } = await admin.from("payouts").update({
        status: "completed",
        admin_id: authUser.id,
        transaction_reference: transactionReference,
        processed_date: now,
        admin_note: body.notes || "Card proceeds paid through PesaPal by admin",
        metadata: { ...metadata, pesapal_reference: transactionReference },
        updated_at: now,
      }).eq("id", payoutId).eq("status", "approved").select("*").maybeSingle();
      if (error) throw error;
      if (!data) return json(409, { error: "Payout is already being processed" });
      const ticketIds = Array.isArray(payout.ticket_ids) ? payout.ticket_ids : [];
      if (ticketIds.length) {
        const { error: ticketError } = await admin.from("tickets")
          .update({ payout_status: "paid", payout_eligible: false, payout_date: now })
          .in("id", ticketIds).eq("payout_status", "pending_review");
        if (ticketError) {
          await admin.from("payouts").update({ admin_note: `Ticket reconciliation required: ${ticketError.message}` }).eq("id", payoutId);
          throw ticketError;
        }
      }
      await sendPayoutNotification(admin, payout.organizer_id, "✅ Payout Completed",
        `Your payout of UGX ${money(payout.amount).toLocaleString()} was processed through PesaPal.`,
        payoutId, "completed");
      return json(200, { payout: data });
    }

    return json(400, { error: "Unsupported payout action" });
  } catch (error) {
    console.error("admin-payout-action error:", error);
    return json(error.statusCode || 500, { error: error.message || "Payout operation failed" });
  }
};
