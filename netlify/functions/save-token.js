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

const crypto = require('crypto');
const { getAdminClient } = require('../shared/supabaseAdmin');

const INSTALLATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function registerInstallation(supabase, { installationId, installationSecret, broadcastsFrom, now }) {
  if (!installationId && !installationSecret) return null;
  if (!INSTALLATION_ID_RE.test(String(installationId || '')) || typeof installationSecret !== 'string' || installationSecret.length < 32) {
    throw Object.assign(new Error('Invalid notification installation'), { statusCode: 400 });
  }
  const { data: existing, error: lookupError } = await supabase
    .from('notification_installations')
    .select('id,secret_hash,broadcasts_from')
    .eq('id', installationId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const secretHash = hashSecret(installationSecret);
  if (existing) {
    if (!safeEqual(existing.secret_hash, secretHash)) {
      throw Object.assign(new Error('Notification installation conflict'), { statusCode: 403 });
    }
    return existing;
  }

  const { data, error } = await supabase
    .from('notification_installations')
    .insert({
      id: installationId,
      secret_hash: secretHash,
      broadcasts_from: broadcastsFrom || now,
      created_at: now,
      updated_at: now,
    })
    .select('id,broadcasts_from')
    .single();
  if (error) throw error;
  return data;
}

export async function handler(event) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { token, userId, userEmail, userName, installationId, installationSecret } = JSON.parse(event.body);

    if (!token) {
      return { statusCode: 400, body: "Missing token" };
    }

    const supabase = getAdminClient();
    const now = new Date().toISOString();
    const isAuthenticated = userId !== null && userId !== undefined;

    // Check if token already exists in Supabase
    const { data: existingTokens, error: queryError } = await supabase
      .from("notification_tokens")
      .select("id,subscribed_at")
      .eq("token", token)
      .limit(1);

    if (queryError) throw queryError;

    const priorSubscription = existingTokens?.[0]?.subscribed_at || now;
    const installation = await registerInstallation(supabase, {
      installationId,
      installationSecret,
      broadcastsFrom: priorSubscription,
      now,
    });
    let tokenId;

    if (existingTokens && existingTokens.length > 0) {
      // Token exists - update it
      const existingId = existingTokens[0].id;

      const updateData = {
        last_active_at: now,
        is_active: true,
      };

      if (installation) updateData.installation_id = installation.id;

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

      if (installation) tokenData.installation_id = installation.id;

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
        broadcastsFrom: installation?.broadcasts_from || null,
      }),
    };
  } catch (err) {
    console.error("[save-token] Error:", err);
    return { statusCode: err.statusCode || 500, body: err.message };
  }
}
