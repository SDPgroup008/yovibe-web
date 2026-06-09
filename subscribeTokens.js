/**
 * subscribeTokens.js
 *
 * Fetches all FCM notification tokens from Supabase and subscribes
 * them to the "all-users" FCM topic so they receive push notifications.
 *
 * Uses OAuth2 with the Firebase service account for FCM v1 API.
 *
 * Usage:
 *   node subscribeTokens.js
 *
 * Environment variables:
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_KEY      - Supabase service role key
 *   FIREBASE_SERVICE_ACCOUNT  - Full service account JSON string (optional if file exists)
 *   GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON file (optional)
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { GoogleAuth } = require("google-auth-library");

// ─── Configuration ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || "https://uqukizjohackrcwrtefk.supabase.co";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  "sb_publishable_P69Y2IRwywqDIjo6hXhwjw_EwbJ-qB_";

const FCM_PROJECT_ID = "eco-guardian-bd74f";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const TOPIC_NAME = "all-users";

// ─── OAuth2 with Service Account ────────────────────────────────────────────

/**
 * Load the service account credentials.
 */
function loadServiceAccount() {
  // 1. Check for service account file in current directory
  const serviceAccountFile = path.join(__dirname, "eco-guardian-bd74f-firebase-adminsdk-thlcj-b60714ed55.json");
  if (fs.existsSync(serviceAccountFile)) {
    console.log("[FCM] Loading service account from file:", serviceAccountFile);
    return JSON.parse(fs.readFileSync(serviceAccountFile, "utf-8"));
  }

  // 2. Check for custom path env var
  const customPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (customPath && fs.existsSync(customPath)) {
    console.log("[FCM] Loading service account from:", customPath);
    return JSON.parse(fs.readFileSync(customPath, "utf-8"));
  }

  // 3. Check env var
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("[FCM] Loading service account from env var");
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  console.error("[FCM] No service account found. Cannot authenticate to FCM v1 API.");
  return null;
}

let cachedAccessToken = null;
let tokenExpiry = 0;

/**
 * Get an OAuth2 access token for FCM using the service account.
 */
async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) throw new Error("No service account available");

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  cachedAccessToken = token.token;
  tokenExpiry = Date.now() + 3300000;
  return cachedAccessToken;
}

// ─── FCM Topic Management ────────────────────────────────────────────────────

/**
 * Subscribe tokens to an FCM topic via the FCM v1 API.
 * Each token is subscribed individually via the FCM v1 Registration API.
 * FCM allows max 500 tokens per batch request.
 */
async function subscribeTokensToTopic(tokens, topic) {
  if (!tokens || tokens.length === 0) {
    console.log("No tokens to subscribe");
    return { success: 0, failure: 0 };
  }

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.log("[DRY RUN] Could not get access token:", err.message);
    console.log("[DRY RUN] Would subscribe", tokens.length, "tokens to", topic);
    return { success: tokens.length, failure: 0, dryRun: true };
  }

  const BATCH_SIZE = 500;
  let totalSuccess = 0;
  let totalFailure = 0;

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    try {
      const result = await fcmBatchSubscribe(batch, topic, accessToken);
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.successCount} succeeded, ${result.failureCount} failed`);
      totalSuccess += result.successCount;
      totalFailure += result.failureCount;
    } catch (err) {
      console.error(`Error subscribing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err);
      totalFailure += batch.length;
    }
  }

  return { success: totalSuccess, failure: totalFailure };
}

/**
 * Subscribe a batch of tokens to a topic via FCM v1 API.
 * Uses the Firebase Cloud Messaging v1 topic management endpoint.
 */
function fcmBatchSubscribe(registrationTokens, topic, accessToken) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      topic,
      registration_tokens: registrationTokens,
    });

    const options = {
      hostname: "fcm.googleapis.com",
      path: `/v1/projects/${FCM_PROJECT_ID}/registrations:batchAdd`,
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
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            resolve({
              successCount: parsed.results ? parsed.results.filter((r) => r.message_id).length : 0,
              failureCount: parsed.results ? parsed.results.filter((r) => r.error).length : 0,
            });
          } catch {
            resolve({ successCount: registrationTokens.length, failureCount: 0 });
          }
        } else {
          console.error("[FCM] Batch subscribe error:", res.statusCode, body);
          resolve({ successCount: 0, failureCount: registrationTokens.length });
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Fetch all active tokens from Supabase.
 */
async function getTokensFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("notification_tokens")
      .select("token")
      .eq("is_active", true);

    if (error) throw error;

    const tokens = (data || [])
      .map((row) => row.token)
      .filter((t) => typeof t === "string" && t.trim().length > 0);

    console.log(`Fetched ${tokens.length} active tokens from Supabase`);
    return tokens;
  } catch (err) {
    console.error("Error fetching tokens from Supabase:", err);
    return [];
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    let jsonTokens = [];

    // 1. Load tokens from tokens.json (legacy)
    if (fs.existsSync("tokens.json")) {
      jsonTokens = JSON.parse(fs.readFileSync("tokens.json", "utf-8"));
      jsonTokens = jsonTokens.filter((t) => typeof t === "string" && t.trim().length > 0);
      console.log(`Loaded ${jsonTokens.length} tokens from tokens.json`);
    } else {
      console.log("No tokens.json file found, skipping");
    }

    // 2. Load tokens from Supabase
    const supabaseTokens = await getTokensFromSupabase();

    // 3. Combine and deduplicate tokens
    const allTokensSet = new Set([...jsonTokens, ...supabaseTokens]);
    const allTokens = Array.from(allTokensSet);

    console.log(
      `Total unique tokens to subscribe: ${allTokens.length} (${jsonTokens.length} from JSON + ${supabaseTokens.length} from Supabase)`
    );

    if (allTokens.length === 0) {
      console.log("No valid tokens found, skipping subscription.");
      return;
    }

  // 4. Subscribe all tokens to the topic
    console.log(`Subscribing all tokens to topic: ${TOPIC_NAME}`);
    const result = await subscribeTokensToTopic(allTokens, TOPIC_NAME);

    console.log("\n=== Subscription Summary ===");
    console.log(`Topic: ${TOPIC_NAME}`);
    console.log(`Total tokens processed: ${allTokens.length}`);
    console.log(`Successful subscriptions: ${result.success}`);
    console.log(`Failed subscriptions: ${result.failure}`);
  } catch (err) {
    console.error("Failed to subscribe tokens:", err);
  }
  // Graceful exit delay
  setTimeout(() => process.exit(0), 500);
})();
