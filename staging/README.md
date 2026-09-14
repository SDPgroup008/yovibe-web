# Isolated staging certification

This directory contains non-secret staging setup artifacts. It must never contain credentials, production data, or customer data.

## Supabase

1. Run `schema.sql` once in the empty staging project's SQL Editor.
2. Create the three named tester accounts in Authentication with unique temporary passwords and require testers to change them.
3. Run `seed-testers.sql` to assign buyer, organiser, and admin roles.
4. Disable public sign-ups after the three accounts exist. Keep email confirmation enabled.
5. Set Site URL and allowed redirect URLs to the staging Netlify origin only.

## Cloudflare R2 CORS

Replace the example origin with the exact staging Netlify origin. Apply the first policy to `yovibe-stagging` and keep that bucket's public development URL disabled:

```json
[
  {
    "AllowedOrigins": ["https://REPLACE-WITH-STAGING-SITE.netlify.app"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

For `yovibe-stagging-public`, enable its `r2.dev` URL and use:

```json
[
  {
    "AllowedOrigins": ["https://REPLACE-WITH-STAGING-SITE.netlify.app"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": [],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Netlify

- Create a separate project from this repository and set `stagging` as its production branch.
- Build command: `npm run build:web`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Do not attach a production domain.
- Enter values from `netlify.env.example` in the new project's environment-variable UI.
- Keep the staging access gate enabled and share its password only with the named testers.

Before the first push, record the production site's deploy ID and verify its production branch is `main`, branch deploys exclude `stagging`, and no build hook deploys every push. After the staging push, confirm the production deploy ID did not change.

## Payment callbacks

Register the PesaPal sandbox IPN as a `GET` endpoint:

```text
https://yovibe-stagging.netlify.app/.netlify/functions/pesapal-ipn
```

The browser return URL for PesaPal checkout is:

```text
https://yovibe-stagging.netlify.app/events/payment-callback
```

Configure the pawaPay sandbox dashboard with these `POST` callback URLs:

```text
Deposit: https://yovibe-stagging.netlify.app/.netlify/functions/pawapay-deposit-callback
Payout:  https://yovibe-stagging.netlify.app/.netlify/functions/pawapay-payout-callback
Refund:  https://yovibe-stagging.netlify.app/.netlify/functions/pawapay-refund-callback
Checkout: https://yovibe-stagging.netlify.app/.netlify/functions/pawapay-checkout-callback
```

Leave unsupported remittance and statement callbacks blank. If `PAWAPAY_SIGNED_CALLBACKS=true`, enable signed callbacks in the pawaPay sandbox dashboard before testing.

## Notifications paused

Staging does not use Firebase while push notifications are paused. Set `NEXT_PUBLIC_FIREBASE_ENABLED=false` and `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false`. The app continues to use Supabase for certification data, does not request browser notification permission, and removes Firebase Cloud Messaging code from the generated service worker.
