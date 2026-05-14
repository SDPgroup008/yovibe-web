# Analytics Dashboard - Setup Guide

## Overview
The Analytics Dashboard tracks user sessions on the web app, recording:
- Authenticated vs unauthenticated user visits
- Session duration (time spent on site)
- Daily, weekly, and monthly trends

## Features Implemented

### 1. Session Tracking (AnalyticsService)
- **Location**: `src/services/AnalyticsService.ts`
- Automatically tracks sessions when users visit the web app
- Records start time, end time, duration, authentication status
- Stores data in Firestore `analytics_sessions` collection

### 2. Admin Dashboard
- **Location**: `src/screens/admin/AdminDashboardScreen.tsx`
- **Access**: Admin users only, via Profile → Analytics Dashboard
- **Features**:
  - Summary cards showing total sessions, authenticated/unauthenticated counts, average duration
  - Period selector (Daily/Weekly/Monthly trends)
  - Visual bar charts comparing authenticated vs unauthenticated sessions
  - Detailed statistics table for recent periods

### 3. Automatic Session Management
- Sessions start when the app loads (via AuthContext)
- Sessions end when the user leaves or closes the tab
- Works for both authenticated and unauthenticated users
- Web-only (Platform.OS === 'web')

## Firestore Structure

### Collection: `analytics_sessions`
```typescript
{
  id: string,
  userId: string | null,  // null for unauthenticated users
  uniqueVisitorId: string,  // Generated ID stored in localStorage
  isAuthenticated: boolean,
  startTime: Timestamp,
  endTime?: Timestamp,
  duration?: number,  // in seconds
  platform: 'web',
  userAgent?: string,
  visitNumber?: number  // How many times this user visited today
}
```

### Unique Visitor Tracking
- **Authenticated users**: Tracked by `userId`
- **Unauthenticated users**: Tracked by `uniqueVisitorId` (stored in browser localStorage)
- Each visitor gets a unique ID that persists across sessions
- Visit count increments each time the same user visits within the same day

## Firestore Security Rules

Add these rules to your `firestore.rules`:

```javascript
// Analytics sessions - admin read, system write
match /analytics_sessions/{sessionId} {
  // Anyone can create a session
  allow create: if true;
  
  // Only the session owner (or system) can update their session
  allow update: if request.auth.uid == resource.data.userId || resource.data.userId == null;
  
  // Only admins can read analytics data
  allow read: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.userType == 'admin';
  
  // Prevent deletion
  allow delete: if false;
}
```

### Composite Index Required
Create this index in Firestore for efficient queries:

Collection: `analytics_sessions`
- `uniqueVisitorId` (Ascending)
- `startTime` (Ascending)

And another:
- `startTime` (Ascending)
- `__name__` (Ascending)

## Navigation Updates

### Types (`src/navigation/types.ts`)
Added `AdminDashboard: undefined` to `ProfileStackParamList`

### Navigator (`src/navigation/AppNavigator.web.tsx`)
- Imported `AdminDashboardScreen`
- Added route: `<ProfileStack.Screen name="AdminDashboard" .../>`

### Profile Screen (`src/screens/ProfileScreen.tsx`)
- Added "Analytics Dashboard" menu item for admins
- Uses `analytics-outline` icon
- Appears at the top of admin menu section

## Usage

### For Admins
1. Sign in as an admin user
2. Navigate to Profile tab
3. Tap "Analytics Dashboard"
4. View metrics and trends
5. Switch between Daily/Weekly/Monthly views
6. Pull down or tap refresh icon to reload data

### Session Tracking
- Happens automatically
- No user action required
- Tracks all web visitors (authenticated and guests)
- Sessions are tied to browser tabs (each tab = separate session)

## Data Aggregation

### Summary Metrics (Last 30 Days)
- Total sessions
- Unique authenticated users
- Unique unauthenticated visitors
- Total unique users (auth + unauth)
- Average session duration
- Average visits per user

### Trend Data
- **Daily**: Shows last 30 days
- **Weekly**: Shows last 12 weeks
- **Monthly**: Shows last 12 months
- Each period shows unique user counts
Authenticated users tracked by user ID
- Unauthenticated users tracked by generated visitor ID (localStorage)
- Visitor IDs persist across sessions in same browser
- Clearing browser data resets visitor ID
- No personal data stored beyond user IDs
- User agent string stored for device type analysis
- Data only accessible to admin users
- No tracking of specific pages or actions (just overall sessions)
- Each visit within a day is counted separately
- Shows both authenticated and guest users
- Includes last visit time

## Privacy Considerations

- Only user IDs are stored (no personal data)
- Unauthenticated users have `userId: null`
- User agent string stored for device type analysis
- Data is only accessible to admin users
- No tracking of specific pages or actions (just overall session)

## Future Enhancements

Potential additions:
- Page view tracking
- Event tracking (button clicks, feature usage)
- Geographic data (if needed)
- Real-time active users
- Export data to CSV
- Retention analysis
- Funnel tracking (guest → signup → authenticated)

## Testing

1. **As Guest**:
   - Visit the site without logging in
   - Browse for a minute
   - Close the tab
   - Check admin dashboard to see unauthenticated session

2. **As Authenticated User**:
   - Sign in
   - Browse the app
   - Close tab
   - Check admin dashboard to see authenticated session

3. **As Admin**:
   - Navigate to Analytics Dashboard
   - Verify summary cards show correct counts
   - Switch between periods
   - Verify charts render correctly
   - Check detailed statistics

## Troubleshooting

**Sessions not being recorded:**
- Check browser console for errors
- Verify Firestore rules allow session creation
- Ensure AnalyticsService is imported in AuthContext

**Dashboard shows 0 sessions:**
- Wait 24 hours for data to accumulate
- Check Firestore collection `analytics_sessions` exists
- Verify user is admin (`userType === 'admin'`)

**Duration shows 0:**
- Sessions need to end to record duration
- Close and reopen browser tab to trigger endSession
- Check that session updates are allowed in Firestore rules
