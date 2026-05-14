# YoVibe Meta Tags Setup

## For Development Testing

### Option 1: Use ngrok (Recommended for testing with WhatsApp)
1. Install ngrok: `npm install -g ngrok`
2. Start your app: `npm start`
3. In another terminal: `ngrok http 8081`
4. Use the ngrok URL (e.g., `https://abc123.ngrok.io`) instead of localhost
5. Share links like: `https://abc123.ngrok.io/events/YOUR_EVENT_ID`

### Option 2: Use the meta server
1. Install dependencies: `npm install cors express --save-dev`
2. Create Firebase service account key file: `firebase-service-account.json`
3. Run meta server: `npm run meta-server`
4. Use meta URLs: `http://localhost:3001/meta/events/YOUR_EVENT_ID`

## For Production
The Open Graph meta tags are automatically injected and will work with all social platforms when deployed to yovibe.net.

## Testing Social Sharing
1. Use Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/)
2. Use Twitter's Card Validator
3. Test directly on WhatsApp (using ngrok URL)

## Current Implementation
- ✅ Open Graph meta tags injected dynamically
- ✅ Twitter Card support
- ✅ Deep linking with proper URLs
- ✅ JSON-LD structured data for SEO
- ✅ Clean URL structure (`/events/{id}`)