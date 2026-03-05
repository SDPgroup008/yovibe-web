const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Try to load service account from file first, then environment variable
let serviceAccount;
const serviceAccountPath = path.join(__dirname, "eco-guardian-bd74f-firebase-adminsdk-thlcj-b60714ed55.json");

if (fs.existsSync(serviceAccountPath)) {
  console.log("Loading service account from file:", serviceAccountPath);
  serviceAccount = require(serviceAccountPath);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log("Loading service account from environment variable");
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT env var and service account file not found");
  console.error("Please either:");
  console.error("  1. Create the service account file at:", serviceAccountPath);
  console.error("  2. Set the FIREBASE_SERVICE_ACCOUNT environment variable");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const TOPIC_NAME = "all-users";

/**
 * Subscribe an array of tokens to a topic
 * Handles batching for large numbers of tokens
 */
async function subscribeTokensToTopic(tokens, topic) {
  if (!tokens || tokens.length === 0) {
    console.log("No tokens to subscribe");
    return { success: 0, failure: 0 };
  }

  // FCM allows max 500 tokens per subscribe request
  const BATCH_SIZE = 500;
  let totalSuccess = 0;
  let totalFailure = 0;

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    try {
      const response = await admin.messaging().subscribeToTopic(batch, topic);
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${response.successCount} succeeded, ${response.failureCount} failed`);
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;
    } catch (err) {
      console.error(`Error subscribing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err);
      totalFailure += batch.length;
    }
  }

  return { success: totalSuccess, failure: totalFailure };
}

/**
 * Fetch all tokens from Firestore
 */
async function getTokensFromFirestore() {
  try {
    const db = admin.firestore();
    
    // Tokens are stored in YoVibe/data/notificationTokens collection
    const collectionPath = "YoVibe/data/notificationTokens";
    
    const tokensCollection = db.collection(collectionPath);
    const snapshot = await tokensCollection.get();
    
    const tokens = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token && typeof data.token === "string") {
        tokens.push(data.token);
      }
    });
    
    console.log(`Fetched ${tokens.length} tokens from Firestore`);
    return tokens;
  } catch (err) {
    console.error("Error fetching tokens from Firestore:", err);
    return [];
  }
}

(async () => {
  try {
    let jsonTokens = [];
    
    // 1. Load tokens from tokens.json (legacy)
    if (fs.existsSync("tokens.json")) {
      jsonTokens = JSON.parse(fs.readFileSync("tokens.json", "utf-8"));
      // Ensure tokens is an array of non-empty strings
      jsonTokens = jsonTokens.filter(t => typeof t === "string" && t.trim().length > 0);
      console.log(`Loaded ${jsonTokens.length} tokens from tokens.json`);
    } else {
      console.log("No tokens.json file found, skipping");
    }

    // 2. Load tokens from Firestore
    const firestoreTokens = await getTokensFromFirestore();

    // 3. Combine and deduplicate tokens
    const allTokensSet = new Set([...jsonTokens, ...firestoreTokens]);
    const allTokens = Array.from(allTokensSet);
    
    console.log(`Total unique tokens to subscribe: ${allTokens.length} (${jsonTokens.length} from JSON + ${firestoreTokens.length} from Firestore)`);

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
})();
