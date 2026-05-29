# Supabase Migration Setup Guide for YoVibe

This guide provides a comprehensive step-by-step plan to set up Supabase for your YoVibe project before migrating from Firebase. **No code changes will be made in this phase** - this is purely infrastructure and database setup.

---

## Phase 1: Supabase Project Setup

### Step 1.1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up/log in
2. Click **"New Project"** in your organization dashboard
3. Configure:
   - **Name**: `yovibe` (or similar)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the region closest to your users (Uganda/East Africa)
   - **Pricing**: Start with Free tier to test, upgrade later
4. Wait for project initialization (5-10 minutes)
5. Once ready, note these credentials:
   - Supabase URL: `https://[project-id].supabase.co`
   - Supabase Anon Key: Found in Settings → API
   - Supabase Service Role Key: Found in Settings → API (for admin operations)

### Step 1.2: Enable Required Authentication Methods
1. Go to **Authentication** → **Providers**
2. Enable:
   - ✅ **Email/Password** (primary auth method)
   - (Optional) Social providers if needed
3. Configure **Email Settings**:
   - Go to **Auth** → **Email Templates**
   - Customize confirmation and password reset emails
4. Configure **User Metadata**:
   - Go to **Auth** → **User Metadata**
   - You'll store `userType` and other profile info here

---

## Phase 2: Database Schema Design

### Step 2.1: Understand the Key Differences
**Firebase Firestore → Supabase PostgreSQL**
- Firestore: Flexible, document-based, schema-less
- PostgreSQL: Structured, relational, schema-required
- **Action**: You'll need to define explicit schemas for all data

### Step 2.2: Database Tables to Create

Use the Supabase SQL Editor to create the following tables:

#### **Table 1: users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT UNIQUE NOT NULL,  -- Firebase UID or mapped identifier
  email TEXT UNIQUE NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('user', 'club_owner', 'admin')),
  display_name TEXT,
  photo_url TEXT,
  venue_id TEXT REFERENCES venues(slug),
  is_frozen BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  payment_details JSONB,  -- Store payment info as JSON
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  frozen_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_uid ON users(uid);
CREATE INDEX idx_users_email ON users(email);
```

#### **Table 2: venues**
```sql
CREATE TABLE venues (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  background_image_url TEXT,
  categories TEXT[],  -- Array of categories
  vibe_rating FLOAT DEFAULT 0,
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL,
  weekly_programs JSONB,  -- Store as JSON object
  owner_id UUID NOT NULL REFERENCES users(id),
  venue_type TEXT CHECK (venue_type IN ('nightlife', 'recreation')),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_venues_owner_id ON venues(owner_id);
CREATE INDEX idx_venues_is_deleted ON venues(is_deleted);
```

#### **Table 3: events**
```sql
CREATE TABLE events (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  venue_id TEXT NOT NULL REFERENCES venues(slug),
  venue_name TEXT NOT NULL,
  description TEXT,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  time TEXT,
  poster_image_url TEXT,
  artists TEXT[],
  is_featured BOOLEAN DEFAULT FALSE,
  location TEXT,
  price_indicator INTEGER DEFAULT 1,
  is_free_entry BOOLEAN DEFAULT FALSE,
  entry_fees JSONB,  -- Array of entry fee objects
  ticket_contacts JSONB,  -- Array of contact objects
  attendees TEXT[],  -- Array of user IDs
  created_by UUID REFERENCES users(id),
  created_by_type TEXT CHECK (created_by_type IN ('user', 'club_owner', 'admin')),
  payment_methods JSONB,  -- Mobile money and bank accounts
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_events_venue_id ON events(venue_id);
CREATE INDEX idx_events_date ON events(date);
CREATE INDEX idx_events_is_featured ON events(is_featured);
CREATE INDEX idx_events_is_deleted ON events(is_deleted);
CREATE INDEX idx_events_created_by ON events(created_by);
```

#### **Table 4: tickets**
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL REFERENCES events(slug),
  event_name TEXT NOT NULL,
  buyer_id UUID NOT NULL REFERENCES users(id),
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  quantity INTEGER NOT NULL,
  total_amount FLOAT NOT NULL,
  base_price FLOAT NOT NULL,
  late_fee FLOAT DEFAULT 0,
  venue_revenue FLOAT NOT NULL,
  app_commission FLOAT NOT NULL,
  qr_code TEXT NOT NULL UNIQUE,
  qr_code_data_url TEXT,
  buyer_photo_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'used', 'cancelled', 'refunded', 'expired')),
  entry_fee_type TEXT,
  payment_id TEXT,
  payment_status TEXT CHECK (payment_status IN ('pending', 'completed', 'failed')),
  payment_reference TEXT,
  pesapal_transaction_id TEXT,
  is_late_purchase BOOLEAN DEFAULT FALSE,
  is_scanned BOOLEAN DEFAULT FALSE,
  purchase_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  payout_eligible BOOLEAN DEFAULT FALSE,
  payout_status TEXT DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed')),
  scanned_at TIMESTAMP WITH TIME ZONE,
  payout_date TIMESTAMP WITH TIME ZONE,
  payment_method TEXT CHECK (payment_method IN ('mobile_money', 'credit_card', 'bank_transfer')),
  payment_provider TEXT,
  payment_number TEXT,
  payment_name TEXT,
  qr_signature TEXT,
  purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  event_start_time TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_buyer_id ON tickets(buyer_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_qr_code ON tickets(qr_code);
```

#### **Table 5: ticket_validations**
```sql
CREATE TABLE ticket_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  event_id TEXT NOT NULL REFERENCES events(slug),
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validated_by UUID NOT NULL REFERENCES users(id),
  location TEXT,
  status TEXT NOT NULL CHECK (status IN ('granted', 'denied')),
  reason TEXT
);

CREATE INDEX idx_ticket_validations_ticket_id ON ticket_validations(ticket_id);
CREATE INDEX idx_ticket_validations_event_id ON ticket_validations(event_id);
```

#### **Table 6: notifications**
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- NULL for broadcast notifications
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('event_summary', 'ticket_purchase', 'ticket_validation', 'payment_confirmation', 'event_reminder', 'welcome', 'upcoming_summary', 'other')),
  data JSONB,
  image_url TEXT,
  deep_link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
```

#### **Table 7: notification_analytics**
```sql
CREATE TABLE notification_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_read INTEGER DEFAULT 0,
  unique_users_received INTEGER DEFAULT 0,
  unique_users_opened INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notification_analytics_notification_id ON notification_analytics(notification_id);
```

#### **Table 8: daily_notification_stats**
```sql
CREATE TABLE daily_notification_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  notifications_sent INTEGER DEFAULT 0,
  users_received INTEGER DEFAULT 0,
  notifications_opened INTEGER DEFAULT 0,
  new_subscriptions INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_daily_notification_stats_date ON daily_notification_stats(date);
```

#### **Table 9: notification_user_interactions**
```sql
CREATE TABLE notification_user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,  -- Can be user ID or FCM token
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  opened_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_notification_user_interactions_notification_id ON notification_user_interactions(notification_id);
CREATE INDEX idx_notification_user_interactions_user_id ON notification_user_interactions(user_id);
```

#### **Table 10: vibe_ratings**
```sql
CREATE TABLE vibe_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id TEXT NOT NULL REFERENCES venues(slug),
  rating FLOAT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vibe_ratings_venue_id ON vibe_ratings(venue_id);
```

#### **Table 11: vibe_images**
```sql
CREATE TABLE vibe_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id TEXT NOT NULL REFERENCES venues(slug),
  image_url TEXT NOT NULL,
  vibe_rating FLOAT DEFAULT 0,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vibe_images_venue_id ON vibe_images(venue_id);
```

#### **Table 12: venue_ownership_requests**
```sql
CREATE TABLE venue_ownership_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id TEXT NOT NULL REFERENCES venues(slug),
  venue_name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  reason TEXT,
  experience TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES users(id),
  review_note TEXT
);

CREATE INDEX idx_venue_ownership_requests_venue_id ON venue_ownership_requests(venue_id);
CREATE INDEX idx_venue_ownership_requests_user_id ON venue_ownership_requests(user_id);
CREATE INDEX idx_venue_ownership_requests_status ON venue_ownership_requests(status);
```

#### **Table 13: notification_tokens**
```sql
CREATE TABLE notification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- Can be NULL for unauthenticated users
  fcm_token TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notification_tokens_user_id ON notification_tokens(user_id);
CREATE INDEX idx_notification_tokens_fcm_token ON notification_tokens(fcm_token);
```

#### **Table 14: organizer_wallets** (Subcollection replacement)
```sql
CREATE TABLE organizer_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  available_balance FLOAT DEFAULT 0,
  pending_balance FLOAT DEFAULT 0,
  total_earnings FLOAT DEFAULT 0,
  total_payouts FLOAT DEFAULT 0,
  last_payout_date TIMESTAMP WITH TIME ZONE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organizer_id)
);

CREATE INDEX idx_organizer_wallets_organizer_id ON organizer_wallets(organizer_id);
```

#### **Table 15: payouts**
```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users(id),
  ticket_ids UUID[],
  amount FLOAT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  request_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_date TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  transaction_reference TEXT,
  payout_method TEXT NOT NULL CHECK (payout_method IN ('mobile_money', 'bank_transfer')),
  recipient_name TEXT NOT NULL,
  recipient_account_number TEXT,
  recipient_phone_number TEXT,
  recipient_bank_name TEXT
);

CREATE INDEX idx_payouts_organizer_id ON payouts(organizer_id);
CREATE INDEX idx_payouts_status ON payouts(status);
```

#### **Table 16: analytics_sessions**
```sql
CREATE TABLE analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- NULL for unauthenticated
  unique_visitor_id TEXT NOT NULL,
  is_authenticated BOOLEAN DEFAULT FALSE,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  duration INTEGER,  -- in seconds
  platform TEXT CHECK (platform IN ('web', 'mobile')),
  user_agent TEXT,
  visit_number INTEGER
);

CREATE INDEX idx_analytics_sessions_user_id ON analytics_sessions(user_id);
CREATE INDEX idx_analytics_sessions_unique_visitor_id ON analytics_sessions(unique_visitor_id);
CREATE INDEX idx_analytics_sessions_start_time ON analytics_sessions(start_time);
```

#### **Table 17: admins** (For role checking)
```sql
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_admins_user_id ON admins(user_id);
```

---

## Phase 3: Row-Level Security (RLS) Policies

### Step 3.1: Enable RLS
1. Go to **Authentication** → **Policies** in Supabase Dashboard
2. For each table, enable RLS

### Step 3.2: Create RLS Policies

Create policies for each table to match your Firebase security rules:

#### **Users Table Policies**
```sql
-- Allow users to read all users
CREATE POLICY "Allow authenticated users to read users"
  ON users FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow users to update their own profile
CREATE POLICY "Allow users to update own profile"
  ON users FOR UPDATE
  USING (auth.uid()::text = uid)
  WITH CHECK (auth.uid()::text = uid);
```

#### **Venues Table Policies**
```sql
-- Allow public read access
CREATE POLICY "Allow public read access to venues"
  ON venues FOR SELECT
  USING (true);

-- Allow authenticated users to create venues
CREATE POLICY "Allow authenticated users to create venues"
  ON venues FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow venue owners or admins to update
CREATE POLICY "Allow owners and admins to update venues"
  ON venues FOR UPDATE
  USING (
    auth.uid()::text IN (
      SELECT uid FROM users WHERE id = owner_id
    ) OR 
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()::uuid)
  );
```

#### **Events Table Policies**
```sql
-- Allow public read access
CREATE POLICY "Allow public read access to events"
  ON events FOR SELECT
  USING (true);

-- Allow authenticated users to create events
CREATE POLICY "Allow authenticated users to create events"
  ON events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow event creators to update their events
CREATE POLICY "Allow event creators to update events"
  ON events FOR UPDATE
  USING (
    auth.uid()::text IN (
      SELECT uid FROM users WHERE id = created_by
    )
  );
```

#### **Notifications Table Policies**
```sql
-- Allow users to read broadcast notifications
CREATE POLICY "Allow public read broadcast notifications"
  ON notifications FOR SELECT
  USING (user_id IS NULL);

-- Allow users to read their own notifications
CREATE POLICY "Allow users to read own notifications"
  ON notifications FOR SELECT
  USING (
    auth.uid()::uuid = user_id OR
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()::uuid)
  );

-- Allow anyone to create notifications (for FCM/system)
CREATE POLICY "Allow creation of notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Allow users to update their own notifications
CREATE POLICY "Allow users to update own notifications"
  ON notifications FOR UPDATE
  USING (
    auth.uid()::uuid = user_id OR user_id IS NULL
  );
```

---

## Phase 4: Authentication Setup

### Step 4.1: Configure JWT Settings
1. Go to **Authentication** → **Settings** → **JWT Settings**
2. Configure **JWT Secret** (auto-generated, note it)
3. Set **JWT Expiry** to match your needs (default 3600 seconds)

### Step 4.2: Set Up Email Configuration
1. Go to **Authentication** → **Email Templates**
2. Customize:
   - Confirmation Email
   - Password Reset Email
   - Magic Link Email

### Step 4.3: User Metadata Structure
When users sign up, you'll store custom metadata:
```json
{
  "user_type": "user|club_owner|admin",
  "display_name": "User Name"
}
```

---

## Phase 5: Storage Setup (if needed)

### Step 5.1: Create Storage Buckets
1. Go to **Storage** in Supabase Dashboard
2. Create buckets:
   - `venue-images` - Public bucket for venue background images
   - `event-posters` - Public bucket for event poster images
   - `vibe-images` - Public bucket for vibe images
   - `user-avatars` - Public bucket for user profile photos

### Step 5.2: Configure Bucket Policies
For each bucket, set up policies to allow:
- Public read access
- Authenticated user uploads

---

## Phase 6: Environment Variables Setup

### Step 6.1: Create `.env.local` for Supabase
Add these to your `.env.local`:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]

# PesaPal (existing)
PESAPAL_CONSUMER_KEY=your_sandbox_consumer_key_here
PESAPAL_CONSUMER_SECRET=your_sandbox_consumer_secret_here
PESAPAL_API_URL=https://cybqa.pesapal.com/pesapalv3/api
SITE_URL=https://yovibe.net
PESAPAL_NOTIFICATION_ID=your_ipn_notification_id_here

# Firebase (keep for now during migration)
NEXT_PUBLIC_FIREBASE_API_KEY=[your-firebase-key]
NEXT_PUBLIC_FIREBASE_PROJECT_ID=[your-firebase-project]
```

---

## Phase 7: Data Migration Planning

### Step 7.1: Identify Migration Strategy
Three approaches:

**Option A: Direct SQL Import (Recommended)**
- Export Firebase data to JSON
- Transform to CSV
- Import via Supabase SQL Editor

**Option B: Incremental Migration**
- Keep both systems running
- Sync new writes to both
- Gradually migrate users

**Option C: Fresh Start** (if acceptable)
- Start with empty database
- Let users re-signup
- Useful if data volume is low

### Step 7.2: Data Export from Firebase
You'll need to export:
1. Firebase Auth users → CSV with uid, email
2. Firestore collections → JSON files
   - `YoVibe/data/users` → users.json
   - `YoVibe/data/venues` → venues.json
   - `YoVibe/data/events` → events.json
   - `YoVibe/data/tickets` → tickets.json
   - `YoVibe/data/notifications` → notifications.json
   - And all other collections...

---

## Phase 8: Third-Party Integrations

### Step 8.1: FCM Setup (No changes needed)
- Keep Firebase Cloud Messaging as-is
- Supabase doesn't replace FCM
- Your FCM tokens continue to work

### Step 8.2: Payment Integration (No changes needed)
- PesaPal integration stays the same
- No dependency on Firebase

### Step 8.3: Storage Migration
- If using Firebase Storage now:
  - Migrate files to Supabase Storage buckets
  - Update file URLs in database

---

## Phase 9: Testing Infrastructure

### Step 9.1: Set Up Local Development
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Create local development environment (optional)
supabase init
supabase start
```

### Step 9.2: Test Database Queries
Create test scripts to verify:
- ✅ Database connections work
- ✅ All tables created successfully
- ✅ RLS policies function correctly
- ✅ Indexes are created

---

## Phase 10: Pre-Migration Checklist

- [ ] Supabase project created
- [ ] All 17 tables created in PostgreSQL
- [ ] All indexes created
- [ ] RLS policies configured
- [ ] Authentication providers enabled
- [ ] Storage buckets created
- [ ] Environment variables documented
- [ ] Data export plan finalized
- [ ] RLS policies tested
- [ ] FCM/PesaPal integration validated
- [ ] Backup of Firebase data created
- [ ] Team trained on Supabase console access

---

## Phase 11: Post-Setup Validation

### Step 11.1: Test Connections
In your terminal, test the connection:
```bash
curl -H "Authorization: Bearer [ANON_KEY]" \
  https://[PROJECT_ID].supabase.co/rest/v1/users?limit=1
```

### Step 11.2: Verify RLS
- Create a test user
- Verify they can only see their data
- Test public read policies

### Step 11.3: Monitor Performance
- Check query performance
- Verify indexes are being used
- Set up monitoring alerts

---

## Key Differences to Remember

| Feature | Firebase | Supabase |
|---------|----------|----------|
| **Auth** | Firebase Auth | Supabase Auth (PostgreSQL) |
| **Database** | Firestore (NoSQL) | PostgreSQL (SQL) |
| **Queries** | Document paths | SQL with PostgREST API |
| **Relationships** | Manual joins in code | Built-in foreign keys |
| **Timestamps** | Firestore Timestamp | PostgreSQL TIMESTAMP |
| **Arrays** | Arrays in documents | TEXT[] or JSONB |
| **Nested Data** | Subcollections | JSONB or separate tables |
| **Security** | Firestore Rules | RLS Policies |
| **Storage** | Firebase Storage | Supabase Storage |

---

## Common Gotchas to Avoid

1. **UID Mapping**: Firebase UIDs are different from Supabase UUIDs
   - Store original Firebase UID for reference
   - Map during migration

2. **Timestamp Handling**: 
   - Firestore: Custom Timestamp type
   - PostgreSQL: TIMESTAMP WITH TIME ZONE
   - Always convert when migrating

3. **Nested Data**:
   - Firestore: Nested objects/subcollections
   - PostgreSQL: Use JSONB or separate tables
   - Plan structure carefully

4. **Array Handling**:
   - Firestore: Flexible arrays
   - PostgreSQL: TEXT[] is strict
   - Use JSONB for flexibility

5. **Real-time Subscriptions**:
   - Firebase: onSnapshot()
   - Supabase: .on('*') or PostgREST polling
   - Different implementation needed

---

## Next Steps

Once you've completed this setup:

1. **Phase 1**: Create a Supabase project ✅ (this guide)
2. **Phase 2**: Set up all database tables ✅ (this guide)
3. **Phase 3**: Configure RLS policies ✅ (this guide)
4. **Phase 4**: Export and migrate data (next phase)
5. **Phase 5**: Update code to use Supabase (code migration)
6. **Phase 6**: Testing and validation
7. **Phase 7**: Go live and decommission Firebase

---

## Contact & Support

- **Supabase Docs**: https://supabase.com/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Supabase Community**: https://discord.supabase.io
- **RLS Best Practices**: https://supabase.com/docs/guides/auth/row-level-security

---

## Appendix: Quick Reference

### Important Supabase Concepts

**PostgREST API**: Automatically generated REST API from your schema
- Read: GET `/rest/v1/table_name`
- Create: POST `/rest/v1/table_name`
- Update: PATCH `/rest/v1/table_name`
- Delete: DELETE `/rest/v1/table_name`

**Real-time**: Enable via Postgres Changes
```typescript
supabase
  .channel('schema-db-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'events'
    },
    (payload) => console.log('Change received!', payload)
  )
  .subscribe()
```

**Auth Flow**:
1. User signs up with email/password
2. Supabase creates auth.users entry
3. JWT token returned
4. Token used for authenticated requests
5. RLS policies enforce data access

---

## Document History

- **Created**: 2024
- **Purpose**: Pre-migration setup planning
- **Status**: Ready for implementation
- **Next Review**: Before code migration phase


