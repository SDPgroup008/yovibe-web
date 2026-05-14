// netlify/functions/save-token.js
// This function saves FCM tokens to Firestore and subscribes them to the "all-users" topic

const admin = require("firebase-admin");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const TOKENS_COLLECTION = "YoVibe/data/notificationTokens";
const TOPIC_NAME = "all-users";

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

    const now = new Date();
    const isAuthenticated = userId !== null && userId !== undefined;

    // Check if token already exists in Firestore
    const tokensRef = db.collection(TOKENS_COLLECTION);
    const existingQuery = await tokensRef.where("token", "==", token).limit(1).get();
    
    let docRef;
    
    if (!existingQuery.empty) {
      // Token exists - update it
      const existingDoc = existingQuery.docs[0];
      docRef = tokensRef.doc(existingDoc.id);
      
      const updateData = {
        lastActiveAt: admin.firestore.Timestamp.now(),
        isActive: true,
      };
      
      // Link to user if previously unauthenticated and now authenticated
      const existingData = existingDoc.data();
      if (!existingData.isAuthenticated && isAuthenticated) {
        updateData.userId = userId;
        updateData.isAuthenticated = true;
        if (userEmail) updateData.userEmail = userEmail;
        if (userName) updateData.userName = userName;
      }
      
      await docRef.update(updateData);
      console.log("[save-token] Updated existing token:", existingDoc.id);
    } else {
      // Create new token document
      const tokenData = {
        token,
        userId: userId || null,
        isAuthenticated,
        deviceInfo: {
          platform: 'web', // Default to web, can be enhanced
        },
        subscribedAt: admin.firestore.Timestamp.now(),
        lastActiveAt: admin.firestore.Timestamp.now(),
        createdAt: admin.firestore.Timestamp.now(),
        isActive: true,
      };
      
      if (userEmail) tokenData.userEmail = userEmail;
      if (userName) tokenData.userName = userName;
      
      docRef = await tokensRef.add(tokenData);
      console.log("[save-token] Created new token:", docRef.id);
    }

    // Subscribe the token to the "all-users" topic
    let subscriptionResult = null;
    try {
      const subscriptionResponse = await admin.messaging().subscribeToTopic([token], TOPIC_NAME);
      subscriptionResult = {
        successCount: subscriptionResponse.successCount,
        failureCount: subscriptionResponse.failureCount,
      };
      console.log(`[save-token] Subscribed token to "${TOPIC_NAME}":`, subscriptionResult);
    } catch (subError) {
      console.error("[save-token] Error subscribing token to topic:", subError);
      // Don't fail the whole request if subscription fails - token is still saved
      subscriptionResult = { error: subError.message };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        tokenId: docRef.id,
        subscription: subscriptionResult,
      }),
    };
  } catch (err) {
    console.error("[save-token] Error:", err);
    return { statusCode: 500, body: err.message };
  }
}
