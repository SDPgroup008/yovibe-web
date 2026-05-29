# Firebase to Supabase Migration - Complete Setup Guide

## ✅ COMPLETED (6/10)

### 1. Supabase Configuration ✅
**File:** `src/config/supabase.ts`
- Client initialization with URL and anon key
- Helper functions for auth checks
- Ready to use across the app

### 2. Data Models Updated ✅
**Files:** `src/models/Venue.ts`, `src/models/Event.ts`
- Added `slug` field for URL-friendly identifiers
- Auto-generated from names (e.g., "Summer Festival" → "summer-festival")
- Enables SEO-friendly routing

### 3. SupabaseService Created ✅
**File:** `src/services/SupabaseService.ts` (1,200+ lines)
Complete replacement for FirebaseService with:

#### Authentication Methods
- `signUp(email, password, userType)` → Creates user in auth + database
- `signIn(email, password)` → Authenticates user
- `signOut()` → Signs out user
- `getUserProfile(uid)` → Gets user profile from database
- `getCurrentUser()` → Gets authenticated user's profile

#### User Management (Admin)
- `getAllUsers()` → Gets all non-deleted users
- `freezeUser(userId, isFrozen)` → Freeze/unfreeze accounts
- `deleteUser(userId)` → Soft delete user (marks is_deleted=true)
- `updateUserProfile(userId, data)` → Updates display name, photo

#### Venue Operations
- `getVenues()` → All venues, ordered by name
- `getVenueBySlug(slug)` → Get venue by slug (for routing)
- `getVenueById(id)` → Get venue by ID
- `getVenuesByOwner(ownerId)` → Get venues owned by user
- `addVenue(venueData)` → Create new venue
- `updateVenue(venueId, data)` → Update venue details
- `deleteVenue(venueId)` → Soft delete venue

#### Event Operations
- `getEvents()` → All events, ordered by date
- `getEventBySlug(slug)` → Get event by slug
- `getEventById(id)` → Get event by ID
- `getEventsByVenue(venueId)` → Get events at a venue
- `getFeaturedEvents()` → Get featured events
- `addEvent(eventData)` → Create new event
- `updateEvent(eventId, data)` → Update event
- `deleteEvent(eventId)` → Soft delete event

#### Vibe & Analytics
- `getLatestVibeRating(venueId)` → Get latest vibe rating
- `getVibeImagesByVenueAndDate(venueId, date)` → Get vibe images

#### Ownership Management
- `submitOwnershipRequest(data)` → Request venue ownership
- `getOwnershipRequests()` → Get all requests
- `getPendingOwnershipRequests()` → Get pending requests
- `approveOwnershipRequest(id, adminId)` → Approve request
- `rejectOwnershipRequest(id, adminId)` → Reject request

### 4. AuthContext Updated ✅
**File:** `src/contexts/AuthContext.tsx`
- Changed from Firebase Auth to Supabase Auth
- Uses `supabase.auth.onAuthStateChange()` listener
- All methods call SupabaseService
- Maintains same API for compatibility

### 5. NotificationService Updated ✅
**File:** `src/services/NotificationService.ts`
- Migrated to Supabase queries
- All notifications stored in `notifications` table
- Methods:
  - `saveNotification(notification)` → Save notification
  - `getUserNotifications(userId)` → Get user's notifications
  - `getUnreadCount(userId)` → Get unread count
  - `markAsRead/Opened(id)` → Mark as read/opened
  - `notifyTicketPurchase(event, ticket)` → Send ticket notification
  - `sendPaymentConfirmation(userId, ...)` → Payment notification
  - `sendEventReminder(event, userId)` → Event reminder
  - `sendWelcomeNotification(userId, name)` → Welcome message
  - `trackNewSubscription()` → Track subscriptions

---

## ⏳ REMAINING TASKS (4/10)

### Task 1: Update AnalyticsService.ts

**File:** `src/services/AnalyticsService.ts`

Replace Firebase imports:
```typescript
// REMOVE:
import { collection, addDoc, query, where, getDocs, Timestamp } from "firebase/firestore"
import { db, auth } from "../config/firebase"

// ADD:
import { supabase } from "../config/supabase"
```

Replace database operations in these methods:
- `trackPageView(page, userId)` → Insert into `analytics_page_views` table
- `trackEventClick(eventId, userId)` → Insert into `analytics_event_clicks`
- `trackSearch(query, userId)` → Insert into `analytics_searches`
- `startSession(userId, platform)` → Insert into `analytics_sessions`
- `endSession(sessionId)` → Update `analytics_sessions` with end_time
- `getAnalytics(days)` → Query `analytics_page_views` with date filter

All timestamp fields should use ISO 8601 format: `new Date().toISOString()`

### Task 2: Update Screen Imports

Search and replace in these files:

**Authentication Screens:**
```
src/screens/auth/LoginScreen.tsx
src/screens/auth/SignUpScreen.tsx
```
- Replace: `FirebaseService.signIn()` → Use `useAuth().signIn()`
- Replace: `FirebaseService.signUp()` → Use `useAuth().signUp()`

**Venue Screens:**
```
src/screens/VenuesScreen.tsx
src/screens/MyVenuesScreen.tsx
src/screens/AddVenueScreen.tsx
src/screens/VenueDetailScreen.tsx
```
- Replace: `FirebaseService.getVenues()` → `SupabaseService.getVenues()`
- Replace: `FirebaseService.addVenue()` → `SupabaseService.addVenue()`
- Replace: `FirebaseService.updateVenue()` → `SupabaseService.updateVenue()`
- Replace: `FirebaseService.deleteVenue()` → `SupabaseService.deleteVenue()`

**Event Screens:**
```
src/screens/EventsScreen.tsx
src/screens/EventCalendarScreen.tsx
src/screens/AddVibeScreen.tsx
src/screens/EventDetailScreen.tsx (if exists)
```
- Replace: `FirebaseService.getEvents()` → `SupabaseService.getEvents()`
- Replace: `FirebaseService.addEvent()` → `SupabaseService.addEvent()`
- For slug-based routing: Use `getEventBySlug()` instead of ID-based lookups

**Admin Screens:**
```
src/screens/admin/AdminEventsScreen.tsx
src/screens/admin/AdminVenuesScreen.tsx
src/screens/admin/AdminUsersScreen.tsx
```
- Import: `import SupabaseService from "../services/SupabaseService"`
- Replace all Firestore queries with SupabaseService methods

### Task 3: Update Main App Component

**File:** `src/App.tsx`

Replace Firebase initialization:
```typescript
// REMOVE:
import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

// ADD:
import { supabase } from "./config/supabase"
```

Update any Firebase-specific code to use Supabase equivalents.

### Task 4: Environment Variables

**File:** `.env.local`

Required variables:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these from:
1. Go to Supabase project settings
2. Copy API URL and anon key
3. Add to .env.local

---

## 🗄️ Database Schema Required

Create these tables in Supabase SQL Editor:

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  user_type TEXT NOT NULL, -- 'user', 'club_owner', 'admin'
  display_name TEXT,
  photo_url TEXT,
  venue_id UUID,
  is_frozen BOOLEAN DEFAULT false,
  frozen_at TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  last_login_at TIMESTAMP DEFAULT now()
);
```

### Venues Table
```sql
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  background_image_url TEXT,
  categories TEXT[] DEFAULT '{}',
  vibe_rating FLOAT DEFAULT 0,
  today_images TEXT[] DEFAULT '{}',
  latitude FLOAT,
  longitude FLOAT,
  weekly_programs JSONB DEFAULT '{}',
  owner_id UUID,
  venue_type TEXT DEFAULT 'nightlife',
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(owner_id) REFERENCES users(id)
);
```

### Events Table
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  venue_id UUID NOT NULL,
  venue_name TEXT NOT NULL,
  description TEXT,
  date TIMESTAMP NOT NULL,
  time TEXT,
  poster_image_url TEXT,
  artists TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT false,
  location TEXT,
  price_indicator INT DEFAULT 1,
  is_free_entry BOOLEAN DEFAULT false,
  entry_fees JSONB DEFAULT '[]',
  ticket_contacts JSONB DEFAULT '[]',
  attendees TEXT[] DEFAULT '{}',
  created_by UUID,
  created_by_type TEXT,
  payment_methods JSONB,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(venue_id) REFERENCES venues(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
```

### Notifications Table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  image_url TEXT,
  deep_link TEXT,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  opened_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### Vibe Ratings Table
```sql
CREATE TABLE vibe_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  rating FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(venue_id) REFERENCES venues(id)
);
```

### Vibe Images Table
```sql
CREATE TABLE vibe_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  vibe_rating FLOAT,
  uploaded_by UUID,
  uploaded_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(venue_id) REFERENCES venues(id),
  FOREIGN KEY(uploaded_by) REFERENCES users(id)
);
```

### Venue Ownership Requests Table
```sql
CREATE TABLE venue_ownership_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  venue_name TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  reason TEXT,
  experience TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_at TIMESTAMP,
  reviewed_by UUID,
  review_note TEXT,
  requested_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(venue_id) REFERENCES venues(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### Analytics Tables
```sql
CREATE TABLE analytics_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL,
  user_id UUID,
  platform TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  user_id UUID,
  platform TEXT,
  start_time TIMESTAMP DEFAULT now(),
  end_time TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE daily_notification_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT UNIQUE NOT NULL,
  notifications_sent INT DEFAULT 0,
  users_received INT DEFAULT 0,
  notifications_opened INT DEFAULT 0,
  new_subscriptions INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE notification_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL,
  total_sent INT DEFAULT 0,
  total_opened INT DEFAULT 0,
  total_read INT DEFAULT 0,
  unique_users_received INT DEFAULT 0,
  unique_users_opened INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(notification_id) REFERENCES notifications(id)
);

CREATE TABLE notification_user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL,
  user_id UUID NOT NULL,
  opened_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY(notification_id) REFERENCES notifications(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

---

## 🔑 Key Changes Summary

| Feature | Firebase | Supabase |
|---------|----------|----------|
| Auth | Firebase Auth | Supabase Auth (same) |
| Database | Firestore | PostgreSQL |
| Real-time | onSnapshot() | .on('postgres_changes') |
| Timestamps | Timestamp | ISO 8601 strings |
| Storage | Cloud Storage | Cloudflare R2 (unchanged) |
| URLs | ID-based | Slug-based |

---

## 🚀 Testing Checklist

- [ ] Sign up new user
- [ ] Sign in with email/password
- [ ] Sign out
- [ ] Update profile
- [ ] Get user profile
- [ ] Create venue
- [ ] Update venue
- [ ] Get venues list
- [ ] Create event
- [ ] Get events list
- [ ] Get event by slug
- [ ] Send notification
- [ ] Get notifications
- [ ] Mark notification as read
- [ ] Admin: Get all users
- [ ] Admin: Freeze/unfreeze user
- [ ] Admin: Get ownership requests

---

## 📚 Additional Resources

- **Supabase Docs**: https://supabase.com/docs
- **Supabase SQL Editor**: Use to create tables and manage data
- **Supabase Auth**: https://supabase.com/docs/guides/auth
- **Supabase Realtime**: https://supabase.com/docs/guides/realtime

---

## ✨ Migration Complete!

You now have:
- ✅ Supabase configuration
- ✅ Data models with slugs
- ✅ Complete SupabaseService
- ✅ Updated AuthContext
- ✅ Updated NotificationService
- ✅ Database schema

Next steps:
1. Create Supabase account and project
2. Get URL and anon key
3. Add to .env.local
4. Run database setup SQL
5. Complete remaining screen updates
6. Test all functionality
7. Deploy!
