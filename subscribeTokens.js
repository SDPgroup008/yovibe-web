const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

(async () => {
  try {
    let tokens = [];
    if (fs.existsSync("tokens.json")) {
      tokens = JSON.parse(fs.readFileSync("tokens.json", "utf-8"));
    }
    // Ensure tokens is an array of non-empty strings
    tokens = tokens.filter(t => typeof t === "string" && t.trim().length > 0);
    if (tokens.length === 0) {
      console.log("No valid tokens found in tokens.json, skipping subscription.");
      return;
    }
    const response = await admin.messaging().subscribeToTopic(tokens, "all-users");
    console.log("Subscribed tokens:", response);
  } catch (err) {
    console.error("Failed to subscribe tokens:", err);
  }
})();
