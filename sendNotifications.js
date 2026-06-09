/**
 * sendNotifications.js
 *
 * CLI script that queries upcoming events from Supabase and sends
 * a push notification summary to all subscribed users via FCM v1 API.
 *
 * Uses OAuth2 with the Firebase service account for authentication.
 *
 * Usage:
 *   node sendNotifications.js [mode]
 *   mode: "today" | "week" (default: "week")
 *
 * Environment variables required:
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_KEY      - Supabase service role key
 *   FIREBASE_SERVICE_ACCOUNT  - Full service account JSON string (optional if file exists)
 *   GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON file (optional)
 *
 * The service account file (eco-guardian-bd74f-...json) is also auto-detected.
 */

const { createClient } = require("@supabase/supabase-js");
const https = require("https");
const fs = require("fs");
const path = require("path");
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

// Initialize Supabase client with service role key for admin-level queries
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Date Helpers ────────────────────────────────────────────────────────────

/**
 * Compute start and end of today (local time).
 */
function computeRangeForDay(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Compute start of today and end of this week (local time).
 */
function computeRangeForWeek(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const day = start.getDay(); // 0=Sun
  const daysUntilSunday = (7 - day) % 7;
  const end = new Date(start);
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ─── Query Supabase ──────────────────────────────────────────────────────────

/**
 * Build summary message for upcoming events between startDate and endDate.
 */
async function buildSummaryPayload(startDate, endDate, mode = "week") {
  const { data, error } = await supabase
    .from("events")
    .select("slug, name, date")
    .eq("is_deleted", false)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) {
    console.error("Supabase query error:", error);
    throw error;
  }

  const events = (data || []).map((ev) => ({
    id: ev.slug,
    name: ev.name || "Event",
    date: ev.date || null,
  }));

  const count = events.length;
  const title =
    mode === "today"
      ? `Events happening today: ${count}`
      : `Events this week: ${count}`;
  const body =
    count > 0
      ? `There ${count === 1 ? "is" : "are"} ${count} event${
          count === 1 ? "" : "s"
        } ${mode === "today" ? "today" : "this week"}. Tap to view details.`
      : `No events scheduled ${mode === "today" ? "for today" : "this week"}.`;

  const dataPayload = {
    type: "upcoming_summary",
    summaryMode: mode,
    eventIds: JSON.stringify(events.map((e) => e.id)),
  };

  return { notification: { title, body }, data: dataPayload, events };
}

// ─── OAuth2 with Service Account ────────────────────────────────────────────

/**
 * Load the service account credentials from file or environment variable.
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

  console.warn("[FCM] No service account found. Will attempt ADC (Application Default Credentials).");
  return null;
}

/**
 * Get an OAuth2 access token for FCM using the service account.
 */
async function getAccessToken() {
  const serviceAccount = loadServiceAccount();

  if (serviceAccount) {
    // Use the service account directly
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token;
  }

  // Fallback to Application Default Credentials
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

// ─── Send via FCM v1 API ────────────────────────────────────────────────────

/**
 * Track sent notifications to prevent duplicates within a time window.
 */
const sentNotifications = new Map();

function getNotificationKey(notification) {
  const hour = new Date().getHours();
  return `${notification.title}-${hour}`;
}

function isDuplicateNotification(notification) {
  const key = getNotificationKey(notification);
  if (sentNotifications.has(key)) {
    console.log(`[DUPLICATE] Notification with key "${key}" already sent this hour, skipping`);
    return true;
  }
  sentNotifications.set(key, Date.now());
  return false;
}

/**
 * Send a push notification via FCM v1 HTTP API using OAuth2.
 * Sends to the "all-users" topic.
 */
async function sendToAllUsers(notification, data = {}) {
  // Check for duplicate notification
  if (isDuplicateNotification(notification)) {
    return { success: 0, failed: 0, duplicate: true };
  }

  // Get OAuth2 access token
  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.warn("[DRY RUN] Could not get access token:", err.message);
    console.log("[DRY RUN] Would send:", JSON.stringify({ notification, data }, null, 2));
    return { success: 1, failed: 0, dryRun: true };
  }

  // Build FCM v1 message payload
  const fcmMessage = {
    message: {
      topic: "all-users",
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: data || {},
    },
  };

  return new Promise((resolve) => {
    const postData = JSON.stringify(fcmMessage);

    const options = {
      hostname: "fcm.googleapis.com",
      path: `/v1/projects/${FCM_PROJECT_ID}/messages:send`,
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
          console.log("[FCM] Notification sent successfully:", body);
          resolve({ success: 1, failed: 0 });
        } else {
          console.error("[FCM] Error response:", res.statusCode, body);
          resolve({ success: 0, failed: 1, error: body });
        }
      });
    });

    req.on("error", (err) => {
      console.error("[FCM] Network error:", err);
      resolve({ success: 0, failed: 1 });
    });

    req.write(postData);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || process.env.MODE || "week";

  const now = new Date();
  const range = mode === "today" ? computeRangeForDay(now) : computeRangeForWeek(now);
  const { notification, data, events } = await buildSummaryPayload(range.start, range.end, mode);

  data.rangeStart = range.start;
  data.rangeEnd = range.end;

    const result = await sendToAllUsers(notification, data);

  console.log(`${mode} summary sent. eventsCount:`, events.length, "result:", JSON.stringify(result));
  // Allow pending network connections to close gracefully, then exit
  setTimeout(() => process.exit(0), 500);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});