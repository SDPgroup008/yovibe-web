/**
 * netlify/functions/save-token.js
 *
 * This function saves FCM tokens to Supabase. Scheduled broadcasts target
 * the active token rows directly through Firebase multicast delivery.
 *
 * Environment variables required (set in Netlify):
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SECRET_KEY       - Supabase secret key
 */

const { getAdminClient } = require('../shared/supabaseAdmin');

export async function handler(event) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { token, userId, userEmail, userName } = JSON.parse(event.body);

    if (!token) {
      return { statusCode: 400, body: "Missing token" };
    }

    const supabase = getAdminClient();
    const now = new Date().toISOString();
    const isAuthenticated = userId !== null && userId !== undefined;

    // Check if token already exists in Supabase
    const { data: existingTokens, error: queryError } = await supabase
      .from("notification_tokens")
      .select("id")
      .eq("token", token)
      .limit(1);

    if (queryError) throw queryError;

    let tokenId;

    if (existingTokens && existingTokens.length > 0) {
      // Token exists - update it
      const existingId = existingTokens[0].id;

      const updateData = {
        last_active_at: now,
        is_active: true,
      };

      // Link to user if previously unauthenticated and now authenticated
      if (isAuthenticated) {
        updateData.user_id = userId;
        updateData.is_authenticated = true;
        if (userEmail) updateData.user_email = userEmail;
        if (userName) updateData.user_name = userName;
      }

      const { error: updateError } = await supabase
        .from("notification_tokens")
        .update(updateData)
        .eq("id", existingId);

      if (updateError) throw updateError;

      tokenId = existingId;
      console.log("[save-token] Updated existing token:", existingId);
    } else {
      // Create new token document
      const tokenData = {
        token,
        user_id: userId || null,
        is_authenticated: isAuthenticated,
        device_info: { platform: "web" },
        subscribed_at: now,
        last_active_at: now,
        created_at: now,
        is_active: true,
      };

      if (userEmail) tokenData.user_email = userEmail;
      if (userName) tokenData.user_name = userName;

      const { data: insertedData, error: insertError } = await supabase
        .from("notification_tokens")
        .insert(tokenData)
        .select("id")
        .single();

      if (insertError) throw insertError;

      tokenId = insertedData.id;
      console.log("[save-token] Created new token:", tokenId);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        tokenId,
        delivery: "direct_multicast",
      }),
    };
  } catch (err) {
    console.error("[save-token] Error:", err);
    return { statusCode: 500, body: err.message };
  }
}
