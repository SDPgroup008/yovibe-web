/**
 * netlify/functions/save-token.js
 *
 * This function saves FCM tokens to Supabase and subscribes
 * them to the "all-users" FCM topic for push notifications.
 *
 * Uses OAuth2 with the Firebase service account for FCM v1 API.
 *
 * Environment variables required (set in Netlify):
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_KEY      - Supabase service role key
 *   FIREBASE_SERVICE_ACCOUNT  - Full service account JSON string
 *   GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON file (alternative)
 */

const { createClient } = require("@supabase/supabase-js");
const https = require("https");
const path = require("path");
const fs = require("fs");
const { GoogleAuth } = require("google-auth-library");

const FCM_PROJECT_ID = "eco-guardian-bd74f";

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const supabaseUrl = process.env.SUPABASE_URL || "https://uqukizjohackrcwrtefk.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

/**
 * Load the service account credentials.
 */
function loadServiceAccount() {
  // 1. Check env var
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch { /* fall through */ }
  }

  // 2. Check for file in project root
  const saFile = path.join(__dirname, "..", "..", "eco-guardian-bd74f-firebase-adminsdk-thlcj-b60714ed55.json");
  if (fs.existsSync(saFile)) {
    return JSON.parse(fs.readFileSync(saFile, "utf-8"));
  }

  return null;
}

let cachedAccessToken = null;
let tokenExpiry = 0;

/**
 * Get an OAuth2 access token for FCM using the service account.
 */
async function getAccessToken() {
  // Return cached token if still valid (within 5 min of expiry)
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  const serviceAccount = loadServiceAccount();
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  cachedAccessToken = token.token;
  // Tokens typically expire in 3600s, cache for 55 min
  tokenExpiry = Date.now() + 3300000;
  return cachedAccessToken;
}

/**
 * Subscribe a token to the "all-users" FCM topic via FCM v1 API.
 */
async function subscribeTokenToTopic(token) {
  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.log("[save-token] Could not get access token, skipping topic subscription:", err.message);
    return { successCount: 0, failureCount: 0, skipped: true };
  }

  const fcmProject = FCM_PROJECT_ID;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      token,
      topic: "all-users",
    });

    const options = {
      hostname: "fcm.googleapis.com",
      path: `/v1/projects/${fcmProject}/registrations`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 409) {
          // 200 = created, 409 = already exists - both are fine
          console.log("[save-token] FCM topic subscription success:", body);
          resolve({ successCount: 1, failureCount: 0 });
        } else {
          console.error("[save-token] FCM topic subscription error:", res.statusCode, body);
          resolve({ successCount: 0, failureCount: 1 });
        }
      });
    });

    req.on("error", (err) => {
      console.error("[save-token] FCM topic subscription network error:", err);
      resolve({ successCount: 0, failureCount: 1 });
    });

    req.write(postData);
    req.end();
  });
}

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

    const supabase = getSupabase();
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

    // Subscribe the token to the "all-users" FCM topic
    let subscriptionResult = null;
    try {
      const result = await subscribeTokenToTopic(token);
      subscriptionResult = {
        successCount: result.successCount,
        failureCount: result.failureCount,
      };
      console.log(`[save-token] Subscribed token to "all-users":`, subscriptionResult);
    } catch (subError) {
      console.error("[save-token] Error subscribing token to topic:", subError);
      subscriptionResult = { error: subError.message };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        tokenId,
        subscription: subscriptionResult,
      }),
    };
  } catch (err) {
    console.error("[save-token] Error:", err);
    return { statusCode: 500, body: err.message };
  }
}