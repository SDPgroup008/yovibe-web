const admin = require("firebase-admin");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT env var");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Build summary message for upcoming events between startDate and endDate.
 */
async function buildSummaryPayload(startDate, endDate, mode = "week") {
  const snap = await db
    .collection("YoVibe/data/events")
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .where("isDeleted", "==", false)
    .get();

  const events = [];
  snap.forEach((doc) => {
    const d = doc.data();
    events.push({
      id: doc.id,
      name: d.name || "Event",
      date: d.date ? d.date.toDate().toISOString() : null,
    });
  });

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

  const data = {
    type: "upcoming_summary",
    summaryMode: mode,
    eventIds: JSON.stringify(events.map((e) => e.id)),
  };

  return { notification: { title, body }, data, events };
}

/**
 * Compute start and end dates for today only (local time).
 */
function computeRangeForDay(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return {
    start: admin.firestore.Timestamp.fromDate(start),
    end: admin.firestore.Timestamp.fromDate(end),
  };
}

/**
 * Compute start and end dates for this week (local time).
 */
function computeRangeForWeek(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const day = start.getDay(); // local day of week, 0=Sun
  const daysUntilSunday = (7 - day) % 7;
  const end = new Date(start);
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);

  return {
    start: admin.firestore.Timestamp.fromDate(start),
    end: admin.firestore.Timestamp.fromDate(end),
  };
}

/**
 * Send a notification to all users via topic.
 */
async function sendToAllUsers(notification, data = {}) {
  try {
    const message = {
      topic: "all-users",
      notification,
      data,
    };
    const response = await messaging.send(message);
    console.log("Notification sent to all-users:", response);
    return { success: 1, failed: 0 };
  } catch (err) {
    console.error("Error sending to all-users:", err);
    return { success: 0, failed: 1 };
  }
}

/**
 * Main entrypoint.
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || process.env.MODE || "week";
  const payloadArg = args[1] ? JSON.parse(args[1]) : null;

  if (mode === "new_event" || mode === "new_venue") {
    const itemType = mode === "new_event" ? "Event" : "Venue";
    const title = payloadArg?.title || `${itemType} added`;
    const body = payloadArg?.body || `${itemType} was added. Tap to view details.`;
    const data = { type: mode, id: payloadArg?.id || "" };

    await sendToAllUsers({ title, body }, data);
    process.exit(0);
  }

  // summary mode
  const now = new Date();
  const range = mode === "today" ? computeRangeForDay(now) : computeRangeForWeek(now);
  const { notification, data, events } = await buildSummaryPayload(range.start, range.end, mode);

  data.rangeStart = range.start.toDate().toISOString();
  data.rangeEnd = range.end.toDate().toISOString();

  await sendToAllUsers(notification, data);

  console.log(`${mode} summary sent. eventsCount:`, events.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
