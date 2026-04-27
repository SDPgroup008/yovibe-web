# Cloudflare R2 Setup Guide

## Problem
You're getting "Resolved credential object is not valid" errors when trying to upload files to R2 storage.

## Root Cause
The Cloudflare R2 credentials in your environment are not properly configured with real API tokens.

## Solution: Set up Cloudflare R2

### 1. Create a Cloudflare R2 Bucket
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** → **Create bucket**
3. Name your bucket (e.g., `yovibe`)
4. Note the **Public URL** (something like `https://pub-xxxxx.r2.dev`)

### 2. Create R2 API Tokens
1. In R2 dashboard, go to **Manage R2 API Tokens**
2. Click **Create API Token**
3. Set permissions:
   - **Object Read & Write**
   - **Bucket Read & Write**
4. Copy the **Access Key ID** and **Secret Access Key**

### 3. Configure Environment Variables

#### For Local Development (.env.local)
Update your `.env.local` file:
```env
# Cloudflare R2 Config
R2_ACCOUNT_ID=your_actual_account_id
R2_BUCKET_NAME=yovibe
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
R2_ENDPOINT=https://xxxxxxxxxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_actual_access_key_id
R2_SECRET_ACCESS_KEY=your_actual_secret_access_key
```

#### For Netlify Deployment
1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Select your site → **Site settings** → **Environment variables**
3. Add these variables:
   - `R2_ACCESS_KEY_ID` = your actual access key
   - `R2_SECRET_ACCESS_KEY` = your actual secret key
   - `R2_ACCOUNT_ID` = your Cloudflare account ID
   - `R2_BUCKET_NAME` = yovibe
   - `R2_PUBLIC_URL` = your bucket's public URL
   - `R2_ENDPOINT` = your bucket's endpoint URL

### 4. Update CORS Policy (if needed)
In your R2 bucket settings, ensure CORS allows your domain:
```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com", "http://localhost:19006"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"]
  }
]
```

### 5. Test the Setup
After configuration, redeploy and test file uploads. The error should be resolved.

## Alternative: Temporary Fallback
If you need immediate functionality without R2, you can temporarily modify `R2Service.ts` to use Firebase Storage as fallback:

```typescript
// In uploadToR2 function, add fallback logic
if (!r2Configured) {
  // Fallback to Firebase Storage
  return await uploadToFirebaseStorage(options);
}
```

## Need Help?
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Netlify Environment Variables](https://docs.netlify.com/configure-builds/environment-variables/)