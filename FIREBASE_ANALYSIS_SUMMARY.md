# Firebase to Supabase Migration - Codebase Analysis Summary

## Executive Summary

Your YoVibe application currently uses Firebase for:
- **Authentication**: Email/Password via Firebase Auth
- **Database**: Firestore with nested collections
- **Cloud Messaging**: Firebase Cloud Messaging (FCM) for push notifications
- **Storage**: R2 (Cloudflare) for image storage, not Firebase Storage

**Key Finding**: Your project has minimal Firebase Storage usage (using R2 instead), which simplifies the migration.

---

## Current Firebase Usage Overview

### 1. Authentication System
**Files**: `src/config/firebase.ts`, `src/contexts/AuthContext.tsx`, `src/services/FirebaseService.ts`

#### Current Implementation:
```typescript
// Firebase Auth Methods
- signUp(email, password, userType) → Creates user in auth + Firestore
- signIn(email, password) → Authenticates user
- signOut() → Logs out and clears state
- getUserProfile(uid) → Fetches user from Firestore
- updateUserProfile(userId, data) → Updates user document
```

#### User Types Supported:
- `user` - Regular user
- `club_owner` - Venue/Event owner
- `admin` - Administrator

#### Auth Features:
- ✅ Session persistence (browserSessionPersistence)
- ✅ Real-time auth state listener (onAuthStateChanged)
- ✅ Redirect intent tracking
- ✅ Profile auto-creation for missing Firestore records

---

### 2. Database Structure (Firestore)

#### Collections Used:
```
YoVibe/
  data/
    ├── users/
    ├── venues/
    ├── events/
    ├── tickets/
    ├── ticket_validations/
    ├── notifications/
    ├── notification_analytics/
    ├── notification_user_interactions/
    ├── daily_notification_stats/
    ├── vibeRatings/
    ├── vibeImages/
    ├── ownershipRequests/
    ├── notificationTokens/
    ├── organizers/{organizerId}/wallet/
    ├── payouts/
    ├── reports/
    └── analytics_sessions/
```

#### Key Data Models:

**Users**
- Fields: uid, email, userType, displayName, photoURL, venueId, isFrozen, createdAt, lastLoginAt
- Relationships: Links to venues (through venueId)
- Special: Payment details stored as nested object

**Venues**
- Fields: name, location, description, backgroundImageUrl, categories, vibeRating, latitude, longitude, weeklyPrograms, ownerId, createdAt
- Relationships: Owner (ownerId → users), Related events (venueId)
- Soft delete: isDeleted flag

**Events**
- Fields: name, venueId, venueName, description, date, time, posterImageUrl, artists, isFeatured, priceIndicator, entryFees[], ticketContacts[], attendees[], createdBy, createdByType, paymentMethods{}
- Relationships: Venue (venueId → venues), Creator (createdBy → users)
- Soft delete: isDeleted flag
- Date handling: Uses Firestore Timestamp type

**Tickets**
- Fields: eventId, eventName, buyerId, buyerName, buyerEmail, quantity, totalAmount, basePrice, lateFee, venueRevenue, appCommission, qrCode, status, paymentStatus, pesapalTransactionId, payoutStatus
- Relationships: Event (eventId → events), Buyer (buyerId → users)
- Complex: Tracks payment, validation, and payout status
- Validation history: Nested array of TicketValidation

**Notifications**
- Fields: userId (NULL for broadcast), title, body, type, data, imageUrl, deepLink, isRead, createdAt, readAt, openedAt
- Types: event_summary, ticket_purchase, ticket_validation, payment_confirmation, event_reminder, welcome, upcoming_summary, other
- Broadcast support: NULL userId for system-wide notifications
- Analytics: Separate collection for per-notification stats

---

### 3. Cloud Messaging (FCM)

**Files**: `src/config/firebase.ts`, `src/App.tsx`, `src/services/NotificationService.ts`

#### FCM Features:
- ✅ Special iOS/Safari support (16.4+)
- ✅ Deferred initialization (waits for service worker)
- ✅ VAPID key configured
- ✅ Token generation with error handling
- ✅ Push notification permission handling
- ✅ Message listening with onMessage()

#### Important Notes:
- FCM tokens stored in `YoVibe/data/notificationTokens`
- Handles both authenticated and unauthenticated users
- Service worker integration for web platform

---

### 4. Firestore Security Rules

**File**: `firestore.rules`

#### Key Security Rules:
- Public read for: events, vibeRatings, vibeImages, venues, ownershipRequests
- Admin-only: Notification analytics, daily stats, payouts
- Broadcast notifications: Public read (userId == NULL)
- Soft delete enforcement: isDeleted flag checked in queries
- User isolation: Users can only update their own data

---

### 5. Storage & File Handling

#### Current Implementation:
```typescript
// Using R2 (Cloudflare) instead of Firebase Storage
uploadVenueImage() → R2Service.uploadToR2()
uploadToR2() → R2 bucket storage
```

**Note**: No Firebase Storage usage detected - already using R2 for object storage

---

### 6. Analytics

**File**: `src/services/AnalyticsService.ts`

#### Tracked Metrics:
- Session data (userId, startTime, endTime, duration)
- User authentication status
- Platform (web/mobile)
- Unique visitor tracking
- Daily/trend analytics
- Session-level analytics

#### Storage:
- `analytics_sessions` collection in Firestore
- Stores: sessionId, userId, uniqueVisitorId, startTime, endTime, platform

---

## Code Dependencies on Firebase

### Direct Imports (23 instances found):

```typescript
// Config
import { auth, db, storage, messaging } from './config/firebase'

// Auth
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth'

// Firestore
import { collection, addDoc, getDocs, getDoc, updateDoc, doc, query, where, orderBy, limit, Timestamp, deleteDoc, startAfter } from 'firebase/firestore'

// Messaging
import { onMessage, getToken, isSupported, getMessaging } from 'firebase/messaging'
```

### Files with Firebase Dependencies:

| File | Dependencies | Scope |
|------|-------------|-------|
| `src/config/firebase.ts` | Direct Firebase init | CRITICAL |
| `src/config/firebase-simple.ts` | Firebase init (alt config) | CRITICAL |
| `src/contexts/AuthContext.tsx` | onAuthStateChanged | CRITICAL |
| `src/services/FirebaseService.ts` | All Firestore operations | CRITICAL |
| `src/services/NotificationService.ts` | Firestore + Timestamp | HIGH |
| `src/services/AnalyticsService.ts` | Firestore + Timestamp | MEDIUM |
| `src/screens/MapScreen.web.tsx` | Firestore queries | MEDIUM |
| `src/screens/EventDetailScreen.tsx` | Firestore queries | MEDIUM |
| `src/App.tsx` | FCM messaging | MEDIUM |
| `src/AppURL.tsx` | onMessage listener | MEDIUM |
| `src/services/TokenService.ts` | Firestore | MEDIUM |

---

## Detailed File Analysis

### Critical Files to Migrate

#### 1. `src/config/firebase.ts` (239 lines)
**Current Role**: Firebase initialization and configuration

**Key Features**:
- Initializes Firebase Auth, Firestore, Storage, Messaging
- Handles iOS Safari push notification detection
- Exports FCM token functions
- Manages messaging initialization state

**Migration Impact**: HIGH
- Must create equivalent `src/config/supabase.ts`
- FCM can stay (Supabase doesn't replace it)
- Auth initialization will change

#### 2. `src/services/FirebaseService.ts` (2018 lines)
**Current Role**: Main database service layer

**Operations**:
- User management (CRUD, freezing, deletion)
- Venue management (CRUD, pagination, ownership)
- Event management (CRUD, pagination, featured events)
- Vibe ratings and images
- Ownership requests
- Query building with pagination

**Migration Impact**: CRITICAL
- Largest file to refactor
- Every method needs Supabase equivalent
- Pagination logic needs adjustment (cursor-based → limit/offset)
- Soft delete logic stays the same

#### 3. `src/contexts/AuthContext.tsx` (279 lines)
**Current Role**: React context for authentication state

**Key Hooks**:
- `useAuth()` - Access auth state
- Manages user session
- Profile loading
- Sign up/in/out operations

**Migration Impact**: HIGH
- Change `onAuthStateChanged` → Supabase auth listener
- Still uses same context API
- Profile loading logic stays similar

#### 4. `src/services/NotificationService.ts` (816 lines)
**Current Role**: In-app notification management

**Operations**:
- Save notifications to Firestore
- Fetch user notifications
- Mark as read/opened
- Analytics tracking
- Daily statistics

**Migration Impact**: HIGH
- Replace Firestore collection calls with Supabase
- Timestamp handling changes
- SQL queries instead of Firestore queries

---

## Data Migration Requirements

### Total Collections to Migrate: 15+

| Collection | Est. Documents | Complexity | Strategy |
|-----------|----------------|-----------|----------|
| users | Low-Medium | Low | Direct export & import |
| venues | Low | Low | Direct export & import |
| events | Medium | Low | Direct export & import |
| tickets | High | Medium | Export with validation |
| notifications | Very High | Medium | Incremental or batch |
| vibe_images | High | Low | Keep URLs, just copy data |
| vibe_ratings | Medium | Low | Direct export & import |
| analytics_sessions | Very High | Low | Optional - can start fresh |
| notification_tokens | High | Low | Re-generate on client |
| ticket_validations | Medium | Low | Direct export & import |
| notification_analytics | Low | Low | Can recalculate |
| daily_notification_stats | Low | Low | Can recalculate |
| ownership_requests | Low | Low | Direct export & import |
| organizer_wallets | Low | Low | Direct export & import |
| payouts | Medium | Medium | Direct export & import |

---

## Package.json Analysis

### Firebase Dependencies Currently Used:
```json
"firebase": "^10.8.0",
"firebase-admin": "^13.6.0"
```

### Will Be Removed:
- `firebase` - Client-side SDK (replace with @supabase/supabase-js)
- `firebase-admin` - Server-side SDK (if used in backend)

### Will Be Added:
- `@supabase/supabase-js` - Supabase client SDK
- `@supabase/auth-helpers-react` - Optional auth helpers

---

## Environment Configuration

### Current `.env.example`:
```env
# Only has PesaPal configuration
# Firebase config is hardcoded in firebase.ts
```

### Will Need to Add:
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Third-Party Integrations

### Not Affected by Firebase Migration:
- ✅ **PesaPal** - Payment processor (independent)
- ✅ **Firebase Cloud Messaging** - Can continue using
- ✅ **AWS S3/Cloudflare R2** - Already using R2, not Firebase Storage
- ✅ **Netlify Functions** - Independent deployment

### No Changes Required:
- Payment integration logic
- Token subscription system
- Notification sending (uses FCM)

---

## Migration Complexity Assessment

### By File:

| File | Complexity | Estimated Time |
|------|-----------|----------------|
| src/config/firebase.ts | HIGH | 2-3 hours |
| src/services/FirebaseService.ts | CRITICAL | 6-8 hours |
| src/contexts/AuthContext.tsx | HIGH | 2-3 hours |
| src/services/NotificationService.ts | HIGH | 3-4 hours |
| src/services/AnalyticsService.ts | MEDIUM | 2-3 hours |
| src/screens/* (Firestore queries) | MEDIUM | 4-5 hours |
| src/models/* (Type updates) | LOW | 1-2 hours |

### Total Estimated Migration Time: 20-30 hours

---

## Key Challenges & Solutions

### 1. **UID/UUID Conversion**
- **Problem**: Firebase UIDs are strings, Supabase uses UUIDs
- **Solution**: Store original Firebase UID, maintain mapping

### 2. **Timestamp Conversion**
- **Problem**: Firestore Timestamp → PostgreSQL TIMESTAMP
- **Solution**: All Firestore timestamps must be converted during migration

### 3. **Nested Collections**
- **Problem**: Firestore supports organizers/{id}/wallet, Supabase uses tables
- **Solution**: Create separate tables with foreign keys

### 4. **Real-time Subscriptions**
- **Problem**: `onSnapshot()` doesn't exist in Supabase
- **Solution**: Use Supabase Realtime with `.on('postgres_changes')`

### 5. **Pagination**
- **Problem**: Firestore uses cursor-based, Supabase uses offset
- **Solution**: Implement limit/offset pagination (or use cursor via range queries)

### 6. **Soft Delete Enforcement**
- **Problem**: Firestore rules check isDeleted, need SQL equivalent
- **Solution**: RLS policies check `WHERE is_deleted = false` before returning data

---

## Best Practices for Migration

### DO:
- ✅ Create Supabase project first (this guide)
- ✅ Set up all tables before data migration
- ✅ Configure RLS policies before importing data
- ✅ Test thoroughly in staging environment
- ✅ Maintain Firebase backup during transition
- ✅ Use API keys separate for dev/prod

### DON'T:
- ❌ Delete Firebase until verified on Supabase
- ❌ Modify Firestore rules during migration
- ❌ Migrate without backup
- ❌ Skip RLS configuration
- ❌ Use Service Role key on frontend

---

## Code Patterns to Update

### Auth Pattern Change:
```typescript
// Firebase
import { onAuthStateChanged } from 'firebase/auth'

const unsubscribe = onAuthStateChanged(auth, (user) => {
  // Handle user
})

// Supabase
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  // Handle session
})
```

### Database Query Pattern Change:
```typescript
// Firebase
const q = query(collection(db, 'users'), where('status', '==', 'active'))
const snapshot = await getDocs(q)

// Supabase
const { data, error } = await supabase
  .from('users')
  .select()
  .eq('status', 'active')
```

### Timestamp Pattern Change:
```typescript
// Firebase
createdAt: Timestamp.now()
createdAt: data.createdAt.toDate()

// Supabase
created_at: new Date().toISOString()
created_at: new Date(row.created_at)
```

---

## Success Criteria

After migration, you should have:
- ✅ All users migrated to Supabase Auth
- ✅ All Firestore data in PostgreSQL tables
- ✅ RLS policies working correctly
- ✅ All queries returning same results
- ✅ No Firebase calls in codebase
- ✅ FCM still working for push notifications
- ✅ PesaPal payments still functional
- ✅ Analytics still tracking

---

## Next Phase

Once setup is complete, follow this order:

1. **Data Migration** (1-2 days)
   - Export Firebase data
   - Transform to SQL format
   - Import to Supabase

2. **Code Migration** (3-5 days)
   - Migrate FirebaseService.ts
   - Update AuthContext.tsx
   - Update all service files
   - Update screen components

3. **Testing** (2-3 days)
   - Unit tests
   - Integration tests
   - Manual testing
   - Staging deployment

4. **Launch** (1 day)
   - Enable Supabase in production
   - Monitor for errors
   - Keep Firebase as backup

---

## Resources & References

- **Supabase Documentation**: https://supabase.com/docs
- **Firestore to PostgreSQL**: https://supabase.com/docs/guides/migrations/firebase
- **Auth Patterns**: https://supabase.com/docs/guides/auth
- **RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security
- **PostgREST API**: https://postgrest.org/en/stable/
- **Supabase CLI**: https://supabase.com/docs/guides/cli

---

## Sign-Off

**Analysis Date**: 2024
**Analyzed By**: Codebase Audit
**Status**: Ready for Supabase Setup Phase
**Code Freeze**: Recommended before setup
**Backup Status**: Please backup Firebase before proceeding

---

## Quick Comparison Table

| Aspect | Firebase | Supabase |
|--------|----------|----------|
| **Setup Time** | 10 min | 15 min |
| **Schema Required** | No | Yes (SQL) |
| **Real-time** | onSnapshot() | postgres_changes |
| **Auth** | Firebase Auth | Built-in Auth |
| **Cost (Free)** | 1GB storage | 500MB database |
| **Query Language** | Custom DSL | SQL via PostgREST |
| **Scalability** | Expensive at scale | Cheaper at scale |
| **Learning Curve** | Easier | Moderate |
| **Hosting** | Google | AWS |


