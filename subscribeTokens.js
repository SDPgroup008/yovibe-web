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
    const tokens = JSON.parse(fs.readFileSync("tokens.json", "utf-8"));
    const response = await admin.messaging().subscribeToTopic(tokens, "all-users");
    console.log("Subscribed tokens:", response);
  } catch (err) {
    console.error("Failed to subscribe tokens:", err);
  }
})();
