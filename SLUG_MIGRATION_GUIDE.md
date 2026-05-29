# Slug Migration Guide - Venues and Events

## Overview
The database schema has been updated to use `slug` as the primary identifier for venues and events instead of numeric IDs. This guide explains what has been done and what still needs to be updated.

## Completed Changes

### SupabaseService.ts
✅ **Updated Methods:**
- `getEventById()` - Now queries by `slug` instead of `id`
- `getVenueById()` - Now queries by `slug` instead of `id`
- `getEventBySlug()` - Added for explicit slug-based queries
- `getVenueBySlug()` - Added for explicit slug-based queries

### Database Schema
✅ **Updated Tables:**
- `venues` - `slug TEXT PRIMARY KEY` (primary key changed from id)
- `events` - `slug TEXT PRIMARY KEY` (primary key changed from id)
- All foreign key references updated to use TEXT slug instead of ID
- `generateSlug()` utility function available in SupabaseService

## What Still Needs Updating

### Screen Navigation Links
When creating navigation links to events and venues, use the `slug` field instead of `id`:

**BEFORE (Firebase):**
```typescript
// In screens, creating links
const eventId = event.id  // Firebase ID like "7st0bbIdDtOWxJiAmhhl"
navigation.push(`/events/${eventId}`)
```

**AFTER (Supabase):**
```typescript
// Use slug for navigation
const eventSlug = event.slug  // Slug like "summer-music-fest"
navigation.push(`/events/${eventSlug}`)
```

### Files Requiring Updates

#### Screens to Update:
1. **EventsScreen.tsx** - Update event card navigation to use `event.slug`
2. **VenuesScreen.tsx** - Update venue card navigation to use `venue.slug`
3. **MapScreen.tsx** - Update venue/event markers to use slugs
4. **MapScreen.web.tsx** - Update venue/event markers to use slugs
5. **VenueDetailScreen.tsx** - Update internal event links to use slugs
6. **EventCalendarScreen.tsx** - Update event link generation
7. **TodaysVibeScreen.tsx** - Update venue link generation
8. **MyVenuesScreen.tsx** - Update venue link generation
9. **AdminEventsScreen.tsx** - Update event navigation
10. **AdminVenuesScreen.tsx** - Update venue navigation

#### Example Update for EventsScreen.tsx:
```typescript
// BEFORE
const handleEventPress = (event: Event) => {
  navigation.push(`/events/${event.id}`)
}

// AFTER
const handleEventPress = (event: Event) => {
  navigation.push(`/events/${event.slug}`)
}
```

#### Example Update for VenuesScreen.tsx:
```typescript
// BEFORE
const handleVenuePress = (venue: Venue) => {
  navigation.push(`/venues/${venue.id}`)
}

// AFTER
const handleVenuePress = (venue: Venue) => {
  navigation.push(`/venues/${venue.slug}`)
}
```

## Slug Generation

When creating new venues and events, slugs are automatically generated:

```typescript
import { generateSlug } from "../services/SupabaseService"

const slug = generateSlug("Summer Music Festival")
// Result: "summer-music-festival"
```

The `generateSlug()` function:
- Converts to lowercase
- Removes special characters
- Replaces spaces with hyphens
- Removes consecutive hyphens

## Testing After Updates

1. **Create a new venue** - Verify slug is generated correctly
2. **Create a new event** - Verify slug is generated correctly
3. **Navigate to event** - Verify URL contains slug (e.g., `/events/summer-music-fest`)
4. **Navigate to venue** - Verify URL contains slug (e.g., `/venues/luna-nightclub`)
5. **View event details** - Should load correctly using slug
6. **View venue details** - Should load correctly using slug

## Database Migration Notes

- All existing venue and event IDs have been converted to slugs
- Foreign key relationships have been updated
- Backup of old Firebase IDs is recommended before final production deployment

## Quick Reference

**Venues Table:**
- Primary Key: `slug` (TEXT)
- Queries: `.eq("slug", venueSlug)`
- Navigation: `/venues/${venue.slug}`

**Events Table:**
- Primary Key: `slug` (TEXT)
- Queries: `.eq("slug", eventSlug)`
- Navigation: `/events/${event.slug}`

## Common Issues & Solutions

### Issue: "Event not found" errors
**Solution:** Ensure you're passing the slug (e.g., "summer-fest") not the old Firebase ID (e.g., "7st0bbIdDtOWxJiAmhhl")

### Issue: Navigation not working
**Solution:** Check that the route parameter matches the slug format (lowercase, hyphen-separated)

### Issue: New events/venues not appearing
**Solution:** Verify that `generateSlug()` is being called when creating new items
