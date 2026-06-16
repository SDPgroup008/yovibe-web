import "react-native-get-random-values"
import { supabase } from "../config/supabase"
import { uploadToR2 } from "./R2Service"
import { Dimensions } from "react-native"
import type { User, UserType } from "../models/User"
import type { Venue } from "../models/Venue"
import type { Event } from "../models/Event"
import type { VibeImage } from "../models/VibeImage"
import type { VenueOwnershipRequest } from "../models/VenueOwnershipRequest"
import { v4 as uuidv4 } from "uuid"

// Responsive breakpoints for image loading optimization
const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isTablet = screenWidth >= 768;
const isLargeScreen = screenWidth >= 1024;

// Generate slug from name
export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// Determine optimal image size based on device
const getOptimalImageSize = (): { width: number; quality: number } => {
  if (isSmallDevice) return { width: 400, quality: 75 };
  if (isTablet) return { width: 800, quality: 85 };
  return { width: 1200, quality: 90 };
};

class SupabaseService {
  private static instance: SupabaseService;

  private constructor() {
    // SupabaseService initialized
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  // ============ Auth Methods ============

  async signUp(email: string, password: string, userType: UserType): Promise<void> {
    try {
      console.log("SupabaseService.signUp: Starting sign up for:", email);

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            user_type: userType,
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("Failed to create user in authentication system");
      }

      const uid = authData.user.id;

      // Create or update user profile in public.users table
      const { error: profileError } = await supabase
        .from("users")
        .upsert(
          {
            uid,
            email,
            user_type: userType,
            created_at: new Date().toISOString(),
            last_login_at: new Date().toISOString(),
            is_deleted: false,
          },
          { onConflict: "uid" }
        );

      if (profileError) {
        console.error("SupabaseService.signUp: Error creating/updating profile:", profileError);
        throw profileError;
      }

      console.log("SupabaseService.signUp: Sign up successful. Profile created in public.users");
    } catch (error) {
      console.error("SupabaseService.signUp: Error:", error);
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    console.log("SupabaseService.signIn: Starting sign in for", email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      console.log("SupabaseService.signIn: Sign in successful, UID:", data.user.id);

      // Update last login
      await supabase
        .from("users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("uid", data.user.id);
    } catch (error) {
      console.error("SupabaseService.signIn: Error signing in:", error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
      console.log("SupabaseService: Signed out successfully");
    } catch (error) {
      console.error("SupabaseService: Error during sign out:", error);
    }
  }

  // ============ User Methods ============

  private mapUserRowToUser(data: any): User {
    return {
      id: data.id,
      uid: data.uid,
      email: data.email,
      userType: data.user_type,
      displayName: data.display_name,
      photoURL: data.photo_url,
      venueId: data.venue_slug,
      isFrozen: data.is_frozen,
      paymentDetails: data.payment_details || undefined,
      createdAt: new Date(data.created_at),
      lastLoginAt: new Date(data.last_login_at),
    };
  }

  async getUserProfileOrNull(userIdentifier: string): Promise<User | null> {
    console.log("SupabaseService.getUserProfile: Looking for user with identifier:", userIdentifier);
    try {
      const { data: byUidData, error: byUidError } = await supabase
        .from("users")
        .select("*")
        .eq("uid", userIdentifier)
        .maybeSingle();

      if (byUidError) throw byUidError;
      if (byUidData) {
        console.log("SupabaseService.getUserProfile: User profile found by uid:", byUidData.email);
        return this.mapUserRowToUser(byUidData);
      }

      const { data: byIdData, error: byIdError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userIdentifier)
        .maybeSingle();

      if (byIdError) throw byIdError;
      if (!byIdData) return null;

      console.log("SupabaseService.getUserProfile: User profile found by id:", byIdData.email);
      return this.mapUserRowToUser(byIdData);
    } catch (error) {
      console.error("SupabaseService.getUserProfile: Error:", error);
      throw error;
    }
  }

  async getUserProfile(uid: string): Promise<User> {
    const user = await this.getUserProfileOrNull(uid);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      return await this.getUserProfile(authUser.id);
    } catch (error) {
      console.error("SupabaseService.getCurrentUser: Error:", error);
      throw error;
    }
  }

  /**
   * Ensures a user profile exists in public.users.
   * If the profile doesn't exist, it creates one automatically using auth user data + metadata.
   * This prevents the "endless loading" issue when a user signs up but the profile row is missing.
   */
  async ensureUserProfile(authUser: any): Promise<User> {
    try {
      // First, try to get existing profile
      const existingProfile = await this.getUserProfile(authUser.id);
      if (existingProfile) {
        return existingProfile;
      }
    } catch (error) {
      // Profile doesn't exist yet — we'll create it below
      console.log("SupabaseService.ensureUserProfile: No profile row found for UID:", authUser.id);
    }

    // Get user_type from metadata (set during signup in SignUpScreen)
    const userType = authUser.user_metadata?.user_type || 'regular_user';

    const profileData = {
      uid: authUser.id,
      email: authUser.email || '',
      user_type: userType,
      display_name: authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || 'User',
      photo_url: authUser.user_metadata?.photo_url || authUser.user_metadata?.avatar_url || null,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      is_deleted: false,
    };

    try {
      const { error: insertError } = await supabase
        .from("users")
        .insert(profileData);

      if (insertError) {
        console.error("SupabaseService.ensureUserProfile: Failed to insert profile:", insertError);
        return this.createBasicProfile(authUser, userType);
      }

      console.log("SupabaseService.ensureUserProfile: Profile created successfully for:", authUser.email);

      // Fetch the newly created profile
      return await this.getUserProfile(authUser.id);
    } catch (error) {
      console.error("SupabaseService.ensureUserProfile: Unexpected error while creating profile:", error);
      return this.createBasicProfile(authUser, userType);
    }
  }

  private createBasicProfile(authUser: any, userType: string = 'regular_user'): User {
    return {
      id: authUser.id,
      uid: authUser.id,
      email: authUser.email || '',
      userType: userType as any,
      displayName: authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || 'User',
      photoURL: authUser.user_metadata?.photo_url || null,
      venueId: undefined,
      isFrozen: false,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    };
  }

  async updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
    try {
      const updateData: any = { last_login_at: new Date().toISOString() };

      if (data.displayName) updateData.display_name = data.displayName;
      if (data.photoURL) updateData.photo_url = data.photoURL;

      const { error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", userId);

      if (error) throw error;

      console.log("SupabaseService: User profile updated");
    } catch (error) {
      console.error("SupabaseService: Error updating user profile:", error);
      throw error;
    }
  }

  // ============ Admin Methods - User Management ============

  async getAllUsers(): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("is_deleted", false);

      if (error) throw error;

      const users: User[] = [];
      if (data) {
        data.forEach((doc) => {
          users.push({
            id: doc.id,
            uid: doc.uid,
            email: doc.email,
            userType: doc.user_type,
            displayName: doc.display_name,
            photoURL: doc.photo_url,
            venueId: doc.venue_slug,
            isFrozen: doc.is_frozen || false,
            createdAt: new Date(doc.created_at),
            lastLoginAt: new Date(doc.last_login_at),
          });
        });
      }

      return users;
    } catch (error) {
      console.error("SupabaseService: Error getting all users:", error);
      throw error;
    }
  }

  async freezeUser(userId: string, isFrozen: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from("users")
        .update({
          is_frozen: isFrozen,
          frozen_at: isFrozen ? new Date().toISOString() : null,
        })
        .eq("id", userId);

      if (error) throw error;

      console.log("SupabaseService: User frozen status updated");
    } catch (error) {
      console.error("SupabaseService: Error freezing/unfreezing user:", error);
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("users")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          email: `deleted_${Date.now()}@yovibe.app`,
          display_name: "Deleted User",
        })
        .eq("id", userId);

      if (error) throw error;

      console.log("SupabaseService: User soft deleted successfully");
    } catch (error) {
      console.error("SupabaseService: Error deleting user:", error);
      throw error;
    }
  }

  // ============ Venue Methods ============

  async getVenues(): Promise<Venue[]> {
    try {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("is_deleted", false)
        .order("name", { ascending: true });

      if (error) throw error;

      const venues: Venue[] = [];
      if (data) {
        data.forEach((doc) => {
          venues.push({
            id: doc.id,
            slug: doc.slug,
            name: doc.name,
            location: doc.location,
            description: doc.description,
            backgroundImageUrl: doc.background_image_url,
            categories: doc.categories || [],
            vibeRating: doc.vibe_rating || 0,
            todayImages: doc.today_images || [],
            latitude: doc.latitude,
            longitude: doc.longitude,
            weeklyPrograms: doc.weekly_programs || {},
            ownerId: doc.owner_id,
            createdAt: new Date(doc.created_at),
            venueType: doc.venue_type || "nightlife",
          });
        });
      }

      return venues;
    } catch (error) {
      console.error("SupabaseService: Error getting venues:", error);
      return [];
    }
  }

  async getVenuesPaginated(pageSize: number = 10, lastCreatedAt?: string): Promise<{ venues: Venue[], lastCreatedAt: string | null }> {
    try {
      let query = supabase
        .from("venues")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(pageSize);

      if (lastCreatedAt) {
        query = query.gt("created_at", lastCreatedAt);
      }

      const { data, error } = await query;

      if (error) throw error;

      const venues: Venue[] = (data || []).map((doc) => ({
        id: doc.id,
        slug: doc.slug,
        name: doc.name,
        location: doc.location,
        description: doc.description,
        backgroundImageUrl: doc.background_image_url,
        categories: doc.categories || [],
        vibeRating: doc.vibe_rating || 0,
        todayImages: doc.today_images || [],
        latitude: doc.latitude,
        longitude: doc.longitude,
        weeklyPrograms: doc.weekly_programs || {},
        ownerId: doc.owner_id,
        createdAt: new Date(doc.created_at),
        venueType: doc.venue_type || "nightlife",
      }));

      const newLastCreatedAt = data && data.length > 0 ? data[data.length - 1].created_at : null;

      return { venues, lastCreatedAt: newLastCreatedAt };
    } catch (error) {
      console.error("SupabaseService: Error getting paginated venues:", error);
      return { venues: [], lastCreatedAt: null };
    }
  }

  async getVenueBySlug(slug: string): Promise<Venue | null> {
    try {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("slug", slug)
        .eq("is_deleted", false)
        .single();

      if (error) throw error;

      if (!data) return null;

      return {
        id: data.id,
        slug: data.slug,
        name: data.name,
        location: data.location,
        description: data.description,
        backgroundImageUrl: data.background_image_url,
        categories: data.categories || [],
        vibeRating: data.vibe_rating || 0,
        todayImages: data.today_images || [],
        latitude: data.latitude,
        longitude: data.longitude,
        weeklyPrograms: data.weekly_programs || {},
        ownerId: data.owner_id,
        createdAt: new Date(data.created_at),
        venueType: data.venue_type || "nightlife",
      };
    } catch (error) {
      console.error("SupabaseService: Error getting venue by slug:", error);
      return null;
    }
  }

  async getVenueById(venueId: string): Promise<Venue | null> {
    if (!venueId || venueId === 'undefined' || venueId === 'null') {
      console.warn("SupabaseService: getVenueById called with undefined/empty value");
      return null;
    }
    try {
      const venueSlug = venueId; // value passed in is the venue's slug (venues table PK is "slug")
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("slug", venueSlug)
        .eq("is_deleted", false)
        .single();

      if (error) throw error;

      if (!data) return null;

      return {
        id: data.id,
        slug: data.slug,
        name: data.name,
        location: data.location,
        description: data.description,
        backgroundImageUrl: data.background_image_url,
        categories: data.categories || [],
        vibeRating: data.vibe_rating || 0,
        todayImages: data.today_images || [],
        latitude: data.latitude,
        longitude: data.longitude,
        weeklyPrograms: data.weekly_programs || {},
        ownerId: data.owner_id,
        createdAt: new Date(data.created_at),
        venueType: data.venue_type || "nightlife",
      };
    } catch (error) {
      console.error("SupabaseService: Error getting venue by ID:", error);
      return null;
    }
  }

  async getVenuesByOwner(ownerId: string): Promise<Venue[]> {
    try {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("is_deleted", false);

      if (error) throw error;

      const venues: Venue[] = [];
      if (data) {
        data.forEach((doc) => {
          venues.push({
            id: doc.id,
            slug: doc.slug,
            name: doc.name,
            location: doc.location,
            description: doc.description,
            backgroundImageUrl: doc.background_image_url,
            categories: doc.categories || [],
            vibeRating: doc.vibe_rating || 0,
            todayImages: doc.today_images || [],
            latitude: doc.latitude,
            longitude: doc.longitude,
            weeklyPrograms: doc.weekly_programs || {},
            ownerId: doc.owner_id,
            createdAt: new Date(doc.created_at),
            venueType: doc.venue_type || "nightlife",
          });
        });
      }

      return venues;
    } catch (error) {
      console.error("SupabaseService: Error getting venues by owner:", error);
      return [];
    }
  }

  async addVenue(venueData: Omit<Venue, "id" | "slug">): Promise<string> {
    try {
      const slug = generateSlug(venueData.name);

      const { data, error } = await supabase
        .from("venues")
        .insert({
          slug,
          name: venueData.name,
          location: venueData.location,
          description: venueData.description,
          background_image_url: venueData.backgroundImageUrl,
          categories: venueData.categories,
          vibe_rating: venueData.vibeRating,
          latitude: venueData.latitude,
          longitude: venueData.longitude,
          weekly_programs: venueData.weeklyPrograms,
          owner_id: venueData.ownerId,
          venue_type: venueData.venueType,
          created_at: new Date().toISOString(),
          is_deleted: false,
        })
        .select("slug")
        .single();

      if (error) throw error;

      return data.slug;
    } catch (error) {
      console.error("SupabaseService: Error adding venue:", error);
      throw error;
    }
  }

  async updateVenue(venueSlug: string, data: Partial<Venue>): Promise<void> {
    try {
      const updateData: any = {};

      if (data.name) updateData.name = data.name;
      if (data.location) updateData.location = data.location;
      if (data.description) updateData.description = data.description;
      if (data.backgroundImageUrl) updateData.background_image_url = data.backgroundImageUrl;
      if (data.categories) updateData.categories = data.categories;
      if (data.vibeRating !== undefined) updateData.vibe_rating = data.vibeRating;
      if (data.latitude) updateData.latitude = data.latitude;
      if (data.longitude) updateData.longitude = data.longitude;
      if (data.weeklyPrograms) updateData.weekly_programs = data.weeklyPrograms;
      if (data.venueType) updateData.venue_type = data.venueType;

      const { error } = await supabase
        .from("venues")
        .update(updateData)
        .eq("slug", venueSlug);

      if (error) throw error;
    } catch (error) {
      console.error("SupabaseService: Error updating venue:", error);
      throw error;
    }
  }

  async deleteVenue(venueId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("venues")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("slug", venueId);

      if (error) throw error;

      console.log("SupabaseService: Venue soft deleted successfully");
    } catch (error) {
      console.error("SupabaseService: Error deleting venue:", error);
      throw error;
    }
  }

  async updateVenuePrograms(venueId: string, programs: Record<string, string>): Promise<void> {
    try {
      const { error } = await supabase
        .from("venues")
        .update({ weekly_programs: programs })
        .eq("slug", venueId);

      if (error) throw error;

      console.log("SupabaseService: Venue programs updated");
    } catch (error) {
      console.error("SupabaseService: Error updating venue programs:", error);
      throw error;
    }
  }

  async restoreVenue(venueId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("venues")
        .update({ is_deleted: false, deleted_at: null })
        .eq("slug", venueId);

      if (error) throw error;

      console.log("SupabaseService: Venue restored successfully");
    } catch (error) {
      console.error("SupabaseService: Error restoring venue:", error);
      throw error;
    }
  }

  async getDeletedVenues(): Promise<Venue[]> {
    try {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("is_deleted", true);

      if (error) throw error;

      return (data || []).map((doc) => ({
        id: doc.id,
        slug: doc.slug,
        name: doc.name,
        location: doc.location,
        description: doc.description,
        backgroundImageUrl: doc.background_image_url,
        categories: doc.categories || [],
        vibeRating: doc.vibe_rating || 0,
        todayImages: doc.today_images || [],
        latitude: doc.latitude,
        longitude: doc.longitude,
        weeklyPrograms: doc.weekly_programs || {},
        ownerId: doc.owner_id,
        createdAt: new Date(doc.created_at),
        venueType: doc.venue_type || "nightlife",
      }));
    } catch (error) {
      console.error("SupabaseService: Error getting deleted venues:", error);
      return [];
    }
  }

  async getEvents(): Promise<Event[]> {
    try {
      // Get today's date at midnight to compare with event dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_deleted", false)
        .gte("date", today.toISOString())
        .order("date", { ascending: true });

      if (error) throw error;

      const events: Event[] = [];
      if (data) {
        data.forEach((doc) => {
          events.push({
            id: doc.slug,
            slug: doc.slug,
            name: doc.name,
            description: doc.description,
            date: new Date(doc.date),
            time: doc.time || "00:00",
            location: doc.location,
            venueName: doc.venue_name,
            venueSlug: doc.venue_slug,
            artists: doc.artists || [],
            posterImageUrl: doc.poster_image_url,
            isFeatured: doc.is_featured || false,
            isFreeEntry: doc.is_free_entry || false,
            entryFees: doc.entry_fees || [],
            ticketContacts: doc.ticket_contacts || [],
            paymentMethods: doc.payment_methods || { mobileMoney: [], bankAccounts: [] },
            attendees: doc.attendees || [],
            createdBy: doc.created_by,
            createdByType: doc.created_by_type,
            createdAt: new Date(doc.created_at),
          });
        });
      }

      return events;
    } catch (error) {
      console.error("SupabaseService: Error getting events:", error);
      return [];
    }
  }

  async getEventById(eventSlug: string): Promise<Event | null> {
    try {
      if (!eventSlug || eventSlug === 'undefined' || eventSlug === 'null') {
        console.warn("SupabaseService.getEventById: Invalid eventSlug provided:", eventSlug);
        return null;
      }

      // Fetch event by slug (events table uses slug as primary identifier)
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("slug", eventSlug)
        .eq("is_deleted", false)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return {
        id: data.slug,
        slug: data.slug,
        name: data.name,
        description: data.description,
        date: new Date(data.date),
        time: data.time || "00:00",
        location: data.location,
        venueName: data.venue_name,
        venueSlug: data.venue_slug,
        artists: data.artists || [],
        posterImageUrl: data.poster_image_url,
        isFeatured: data.is_featured || false,
        isFreeEntry: data.is_free_entry || false,
        entryFees: data.entry_fees || [],
        ticketContacts: data.ticket_contacts || [],
        paymentMethods: data.payment_methods || { mobileMoney: [], bankAccounts: [] },
        attendees: data.attendees || [],
        createdBy: data.created_by,
        createdByType: data.created_by_type,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("SupabaseService: Error getting event by slug:", error);
      return null;
    }
  }

  async getEventsByVenue(venueSlug: string): Promise<Event[]> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("venue_slug", venueSlug)
        .eq("is_deleted", false)
        .gte("date", today.toISOString())
        .order("date", { ascending: true });

      if (error) throw error;

      const events: Event[] = [];
      if (data) {
        data.forEach((doc) => {
          events.push({
            id: doc.slug,
            slug: doc.slug,
            name: doc.name,
            description: doc.description,
            date: new Date(doc.date),
            time: doc.time || "00:00",
            location: doc.location,
            venueName: doc.venue_name,
            venueSlug: doc.venue_slug,
            artists: doc.artists || [],
            posterImageUrl: doc.poster_image_url,
            isFeatured: doc.is_featured || false,
            isFreeEntry: doc.is_free_entry || false,
            entryFees: doc.entry_fees || [],
            ticketContacts: doc.ticket_contacts || [],
            paymentMethods: doc.payment_methods || { mobileMoney: [], bankAccounts: [] },
            attendees: doc.attendees || [],
            createdBy: doc.created_by,
            createdByType: doc.created_by_type,
            createdAt: new Date(doc.created_at),
          });
        });
      }

      return events;
    } catch (error) {
      console.error("SupabaseService: Error getting events by venue:", error);
      return [];
    }
  }

  async addEvent(eventData: Omit<Event, "id" | "slug">): Promise<string> {
    try {
      if (!(eventData.date instanceof Date) || isNaN(eventData.date.getTime())) {
        throw new Error("Invalid event date provided")
      }

      const baseSlug = generateSlug(eventData.name)
      const MAX_SLUG_ATTEMPTS = 6

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const slug =
          attempt === 0
            ? baseSlug
            : `${baseSlug}-${Date.now().toString(36)}-${attempt}`

        const { data, error } = await supabase
          .from("events")
          .insert({
            slug,
            name: eventData.name,
            venue_slug: eventData.venueSlug,
            venue_name: eventData.venueName,
            description: eventData.description,
            date: eventData.date.toISOString(),
            time: eventData.time,
            poster_image_url: eventData.posterImageUrl,
            artists: eventData.artists,
            is_featured: eventData.isFeatured,
            location: eventData.location || "",
            price_indicator: eventData.priceIndicator || 0,
            is_free_entry: eventData.isFreeEntry,
            entry_fees: eventData.entryFees || [],
            ticket_contacts: eventData.ticketContacts || [],
            attendees: eventData.attendees || [],
            created_by: eventData.createdBy,
            created_by_type: eventData.createdByType,
            payment_methods: eventData.paymentMethods || { mobileMoney: [], bankAccounts: [] },
            created_at: new Date().toISOString(),
            is_deleted: false,
          })
          .select("slug")
          .single()

        if (!error) {
          return data.slug
        }

        const isDuplicateKey =
          error.code === "23505" ||
          (typeof error.message === "string" && error.message.toLowerCase().includes("duplicate key"))

        if (!isDuplicateKey) {
          throw error
        }

        if (attempt === MAX_SLUG_ATTEMPTS - 1) {
          throw error
        }
      }

      throw new Error("Failed to create event due to repeated slug conflicts")
    } catch (error) {
      console.error("SupabaseService: Error adding event:", error)
      throw error
    }
  }

  async deleteEvent(eventSlug: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("events")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("slug", eventSlug);

      if (error) throw error;

      console.log("SupabaseService: Event soft deleted successfully");
    } catch (error) {
      console.error("SupabaseService: Error deleting event:", error);
      throw error;
    }
  }

  async updateEvent(eventSlug: string, data: Partial<Event>): Promise<void> {
    try {
      const updateData: any = {};

      if (data.name) updateData.name = data.name;
      if (data.description) updateData.description = data.description;
      if (data.date) updateData.date = data.date;
      if (data.time) updateData.time = data.time;
      if (data.artists) updateData.artists = data.artists;
      if (data.posterImageUrl) updateData.poster_image_url = data.posterImageUrl;
      if (data.isFeatured !== undefined) updateData.is_featured = data.isFeatured;
      if (data.isFreeEntry !== undefined) updateData.is_free_entry = data.isFreeEntry;
      if (data.entryFees) updateData.entry_fees = data.entryFees;
      if (data.ticketContacts) updateData.ticket_contacts = data.ticketContacts;
      if (data.paymentMethods) updateData.payment_methods = data.paymentMethods;
      if (data.attendees) updateData.attendees = data.attendees;

      const { error } = await supabase
        .from("events")
        .update(updateData)
        .eq("slug", eventSlug);

      if (error) throw error;

      console.log("SupabaseService: Event updated successfully");
    } catch (error) {
      console.error("SupabaseService: Error updating event:", error);
      throw error;
    }
  }

  async getUserOwnershipRequest(venueSlug: string, userId: string): Promise<VenueOwnershipRequest | null> {
    try {
      const { data, error } = await supabase
        .from("venue_ownership_requests")
        .select("*")
        .eq("venue_slug", venueSlug)
        .eq("user_id", userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      return {
        id: data.id,
        venueId: data.venue_slug,
        venueName: data.venue_name,
        userId: data.user_id,
        userName: data.user_name,
        userEmail: data.user_email,
        userPhone: data.user_phone,
        reason: data.reason,
        experience: data.experience,
        status: data.status,
        requestedAt: new Date(data.requested_at),
        reviewedAt: data.reviewed_at ? new Date(data.reviewed_at) : undefined,
        reviewedBy: data.reviewed_by,
        reviewNote: data.review_note,
      };
    } catch (error) {
      console.error("SupabaseService: Error getting user ownership request:", error);
      return null;
    }
  }

  async deletePastEvents(): Promise<void> {
    try {
      const now = new Date();

      const { data: events, error } = await supabase
        .from("events")
        .select("slug, name, date, is_deleted")
        .eq("is_deleted", false);

      if (error) throw error;
      if (!events || events.length === 0) return;

      let deletedCount = 0;
      const failedUpdates: string[] = [];

      for (const event of events) {
        if (!event.date) continue;

        const eventDate = new Date(event.date);

        // Expiry date = next day at 05:00 AM (matching Firebase logic)
        const expiryDate = new Date(eventDate);
        expiryDate.setDate(expiryDate.getDate() + 1);
        expiryDate.setHours(5, 0, 0, 0);

        if (expiryDate <= now) {
          const { error: updateError } = await supabase
            .from("events")
            .update({
              is_deleted: true,
              deleted_at: now.toISOString(),
            })
            .eq("slug", event.slug);

          if (updateError) {
            console.error(`SupabaseService.deletePastEvents: Failed to soft-delete event "${event.name}" (${event.slug}):`, updateError);
            failedUpdates.push(event.slug);
          } else {
            deletedCount++;
            console.log(`SupabaseService: Soft-deleted past event: "${event.name}" (slug: ${event.slug})`);
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`SupabaseService: Successfully soft-deleted ${deletedCount} past events in the database.`);
      }
      if (failedUpdates.length > 0) {
        console.warn(`SupabaseService: Failed to soft-delete ${failedUpdates.length} events (possible RLS issue).`);
      }
    } catch (error) {
      console.error("SupabaseService: Error in deletePastEvents:", error);
    }
  }

  // ============ Vibe Ratings & Images ============

  async getLatestVibeRating(venueId: string): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from("vibe_ratings")
        .select("rating")
        .eq("venue_slug", venueId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) return null;

      return data?.rating || null;
    } catch (error) {
      console.error("SupabaseService: Error getting vibe rating:", error);
      return null;
    }
  }

  async getVibeImagesByVenueAndDate(venueId: string, date: Date): Promise<VibeImage[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("vibe_images")
        .select("*")
        .eq("venue_slug", venueId)
        .gte("uploaded_at", startOfDay.toISOString())
        .lte("uploaded_at", endOfDay.toISOString());

      if (error) throw error;

      const vibeImages: VibeImage[] = [];
      if (data) {
        data.forEach((doc) => {
          vibeImages.push({
            id: doc.id,
            venueId: doc.venue_slug,
            imageUrl: doc.image_url,
            vibeRating: doc.vibe_rating || Math.random() * 5,
            uploadedAt: new Date(doc.uploaded_at),
            uploadedBy: doc.uploaded_by,
          });
        });
      }

      return vibeImages;
    } catch (error) {
      console.error("SupabaseService: Error getting vibe images:", error);
      return [];
    }
  }

  // ============ Ownership Requests ============

  async submitOwnershipRequest(
    requestData: Omit<VenueOwnershipRequest, "id" | "status" | "requestedAt">
  ): Promise<string> {
    try {
      const { data, error } = await supabase
        .from("venue_ownership_requests")
        .insert({
          venue_slug: requestData.venueId,
          venue_name: requestData.venueName,
          user_id: requestData.userId,
          user_name: requestData.userName,
          user_email: requestData.userEmail,
          user_phone: requestData.userPhone,
          reason: requestData.reason,
          experience: requestData.experience,
          status: "pending",
          requested_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;

      return data.id;
    } catch (error) {
      console.error("SupabaseService: Error submitting ownership request:", error);
      throw error;
    }
  }

  async getOwnershipRequests(): Promise<VenueOwnershipRequest[]> {
    try {
      const { data, error } = await supabase
        .from("venue_ownership_requests")
        .select("*")
        .order("requested_at", { ascending: false });

      if (error) throw error;

      const requests: VenueOwnershipRequest[] = [];
      if (data) {
        data.forEach((doc) => {
          requests.push({
            id: doc.id,
            venueId: doc.venue_slug,
            venueName: doc.venue_name,
            userId: doc.user_id,
            userName: doc.user_name,
            userEmail: doc.user_email,
            userPhone: doc.user_phone,
            reason: doc.reason,
            experience: doc.experience,
            status: doc.status,
            requestedAt: new Date(doc.requested_at),
            reviewedAt: doc.reviewed_at ? new Date(doc.reviewed_at) : undefined,
            reviewedBy: doc.reviewed_by,
            reviewNote: doc.review_note,
          });
        });
      }

      return requests;
    } catch (error) {
      console.error("SupabaseService: Error getting ownership requests:", error);
      return [];
    }
  }

  async getPendingOwnershipRequests(): Promise<VenueOwnershipRequest[]> {
    try {
      const { data, error } = await supabase
        .from("venue_ownership_requests")
        .select("*")
        .eq("status", "pending")
        .order("requested_at", { ascending: false });

      if (error) throw error;

      const requests: VenueOwnershipRequest[] = [];
      if (data) {
        data.forEach((doc) => {
          requests.push({
            id: doc.id,
            venueId: doc.venue_slug,
            venueName: doc.venue_name,
            userId: doc.user_id,
            userName: doc.user_name,
            userEmail: doc.user_email,
            userPhone: doc.user_phone,
            reason: doc.reason,
            experience: doc.experience,
            status: doc.status,
            requestedAt: new Date(doc.requested_at),
            reviewedAt: doc.reviewed_at ? new Date(doc.reviewed_at) : undefined,
            reviewedBy: doc.reviewed_by,
            reviewNote: doc.review_note,
          });
        });
      }

      return requests;
    } catch (error) {
      console.error("SupabaseService: Error getting pending ownership requests:", error);
      return [];
    }
  }

  async approveOwnershipRequest(
    requestId: string,
    adminId: string,
    reviewNote?: string
  ): Promise<void> {
    try {
      // Get the request
      const { data: requestData, error: requestError } = await supabase
        .from("venue_ownership_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (requestError) throw requestError;

      const userId = requestData.user_id;
      const venueId = requestData.venue_slug;

      // Update user to club_owner
      await supabase
        .from("users")
        .update({
          user_type: "club_owner",
          venue_slug: venueId,
        })
        .eq("id", userId);

      // Update venue owner
      await supabase
        .from("venues")
        .update({
          owner_id: userId,
        })
        .eq("slug", venueId);

      // Update request status
      await supabase
        .from("venue_ownership_requests")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          review_note: reviewNote || "",
        })
        .eq("id", requestId);

      console.log("SupabaseService: Ownership request approved");
    } catch (error) {
      console.error("SupabaseService: Error approving ownership request:", error);
      throw error;
    }
  }

  async rejectOwnershipRequest(
    requestId: string,
    adminId: string,
    reviewNote?: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from("venue_ownership_requests")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          review_note: reviewNote || "",
        })
        .eq("id", requestId);

      if (error) throw error;

      console.log("SupabaseService: Ownership request rejected");
    } catch (error) {
      console.error("SupabaseService: Error rejecting ownership request:", error);
      throw error;
    }
  }

  // ============ Image Upload Methods (via R2) ============

  async uploadVenueImage(imageUri: string): Promise<string> {
    try {
      if (!imageUri) throw new Error("No image provided for venue upload");

      const filename = `venue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;

      const result = await uploadToR2({
        path: "venues",
        filename,
        contentType: "image/jpeg",
        body: imageUri,
      });

      return result.url;
    } catch (error) {
      console.error("SupabaseService: Error uploading venue image:", error);
      throw error;
    }
  }

  async uploadEventImage(imageUri: string | Blob): Promise<string> {
    try {
      if (!imageUri) throw new Error("No image provided for event upload");

      const filename = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;

      const result = await uploadToR2({
        path: "events",
        filename,
        contentType: "image/jpeg",
        body: imageUri,
      });

      return result.url;
    } catch (error) {
      console.error("SupabaseService: Error uploading event image:", error);
      throw error;
    }
  }

  async uploadVibeImage(imageUri: string, venueId: string = ""): Promise<string> {
    try {
      if (!imageUri) throw new Error("No image provided for vibe upload");

      const prefix = venueId ? `vibe-${venueId}` : "vibe";
      const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;

      const result = await uploadToR2({
        path: "vibes",
        filename,
        contentType: "image/jpeg",
        body: imageUri,
      });

      return result.url;
    } catch (error) {
      console.error("SupabaseService: Error uploading vibe image:", error);
      throw error;
    }
  }

  // ============ Additional Missing Methods ============

  async deleteExpiredCustomVenues(): Promise<void> {
    try {
      const now = new Date();

      const { data: venues, error } = await supabase
        .from("venues")
        .select("slug, name, created_at")
        .eq("is_deleted", false);

      if (error) throw error;
      if (!venues || venues.length === 0) return;

      const deletePromises: Promise<any>[] = [];

      for (const venue of venues) {
        // Custom venues are considered expired if older than 30 days (matching old Firebase logic)
        const createdAt = new Date(venue.created_at);
        const daysOld = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

        if (daysOld > 30) {
          deletePromises.push(
            (async () => {
              await supabase
                .from("venues")
                .update({
                  is_deleted: true,
                  deleted_at: now.toISOString(),
                })
                .eq("slug", venue.slug);
            })()
          );
        }
      }

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`SupabaseService: Soft-deleted ${deletePromises.length} expired custom venues`);
      }
    } catch (error) {
      console.error("SupabaseService: Error deleting expired custom venues:", error);
    }
  }

  async getVibeImagesByVenueAndWeek(venueId: string): Promise<Record<string, VibeImage[]>> {
    try {
      const { data, error } = await supabase
        .from("vibe_images")
        .select("*")
        .eq("venue_slug", venueId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;

      const grouped: Record<string, VibeImage[]> = {};

      (data || []).forEach((doc) => {
        const date = new Date(doc.uploaded_at);
        const weekKey = `${date.getFullYear()}-W${this.getWeekNumber(date)}`;

        if (!grouped[weekKey]) grouped[weekKey] = [];

        grouped[weekKey].push({
          id: doc.id,
          venueId: doc.venue_slug,
          imageUrl: doc.image_url,
          vibeRating: doc.vibe_rating || 0,
          uploadedAt: new Date(doc.uploaded_at),
          uploadedBy: doc.uploaded_by,
        });
      });

      return grouped;
    } catch (error) {
      console.error("SupabaseService: Error getting vibe images by week:", error);
      return {};
    }
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  async addVibeImage(vibeImageData: Omit<VibeImage, "id">): Promise<string> {
    try {
      const { data, error } = await supabase
        .from("vibe_images")
        .insert({
          venue_slug: vibeImageData.venueId,
          image_url: vibeImageData.imageUrl,
          vibe_rating: vibeImageData.vibeRating || 0,
          uploaded_by: vibeImageData.uploadedBy,
          uploaded_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error("SupabaseService: Error adding vibe image:", error);
      throw error;
    }
  }

  async saveEmailRecord(record: any): Promise<string> {
    try {
      const { data, error } = await supabase
        .from("email_records")
        .insert({
          ...record,
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error("SupabaseService: Error saving email record:", error);
      throw error;
    }
  }

  // ============ Ticket Methods ============

  async saveTicket(ticket: any): Promise<string> {
    try {
      const ticketData = {
        ...ticket,
        event_slug: ticket.eventSlug || ticket.eventId,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("tickets")
        .insert(ticketData)
        .select("id")
        .single();

      if (error) throw error;

      return data.id;
    } catch (error) {
      console.error("SupabaseService: Error saving ticket:", error);
      throw error;
    }
  }

  async getTicketById(ticketId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (error) return null;
      return data;
    } catch (error) {
      console.error("SupabaseService: Error getting ticket by ID:", error);
      return null;
    }
  }

  async getTicketByQRCode(qrCode: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("qr_code", qrCode)
        .single();

      if (error) return null;
      return data;
    } catch (error) {
      console.error("SupabaseService: Error getting ticket by QR code:", error);
      return null;
    }
  }

  async updateTicket(ticketId: string, data: any): Promise<void> {
    try {
      const { error } = await supabase
        .from("tickets")
        .update(data)
        .eq("id", ticketId);

      if (error) throw error;
    } catch (error) {
      console.error("SupabaseService: Error updating ticket:", error);
      throw error;
    }
  }

  async getTicketsByEvent(eventId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("event_slug", eventId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("SupabaseService: Error getting tickets by event:", error);
      return [];
    }
  }

  async getTicketsByUser(userId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("buyer_id", userId);

      if (error) throw error;

      const getTime = (ticket: any): number => {
        const candidate =
          ticket.purchase_date ??
          ticket.created_at ??
          ticket.createdAt ??
          ticket.updated_at ??
          ticket.event_start_time;

        const parsed = candidate ? new Date(candidate).getTime() : 0;
        return Number.isFinite(parsed) ? parsed : 0;
      };

      return (data || []).sort((a, b) => getTime(b) - getTime(a));
    } catch (error) {
      console.error("SupabaseService: Error getting tickets by user:", error);
      return [];
    }
  }

  async saveTicketValidation(validation: any): Promise<string> {
    try {
      const { data, error } = await supabase
        .from("ticket_validations")
        .insert({
          ...validation,
          validated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error("SupabaseService: Error saving ticket validation:", error);
      throw error;
    }
  }

  async getTicketValidationsByEvent(eventId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("ticket_validations")
        .select("*")
        .eq("event_slug", eventId)
        .order("validated_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("SupabaseService: Error getting ticket validations:", error);
      return [];
    }
  }

  // ============ Payouts & Wallets ============

  async getOrganizerWallet(organizerId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from("organizer_wallets")
        .select("*")
        .eq("organizer_id", organizerId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    } catch (error) {
      console.error("SupabaseService: Error getting organizer wallet:", error);
      return null;
    }
  }

  async createOrUpdateOrganizerWallet(organizerId: string, walletData: any): Promise<void> {
    try {
      const { error } = await supabase
        .from("organizer_wallets")
        .upsert(
          {
            organizer_id: organizerId,
            ...walletData,
            last_updated: new Date().toISOString(),
          },
          { onConflict: "organizer_id" }
        );

      if (error) throw error;
    } catch (error) {
      console.error("SupabaseService: Error creating/updating organizer wallet:", error);
      throw error;
    }
  }

  async savePayout(payout: any): Promise<string> {
    try {
      const { data, error } = await supabase
        .from("payouts")
        .insert({
          ...payout,
          request_date: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error("SupabaseService: Error saving payout:", error);
      throw error;
    }
  }

  async getPayoutById(payoutId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("id", payoutId)
        .single();

      if (error) return null;
      return data;
    } catch (error) {
      console.error("SupabaseService: Error getting payout by ID:", error);
      return null;
    }
  }

  async getPayoutsByOrganizer(organizerId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("organizer_id", organizerId)
        .order("request_date", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("SupabaseService: Error getting payouts by organizer:", error);
      return [];
    }
  }

  async updatePayout(payoutId: string, data: any): Promise<void> {
    try {
      const { error } = await supabase
        .from("payouts")
        .update(data)
        .eq("id", payoutId);

      if (error) throw error;
    } catch (error) {
      console.error("SupabaseService: Error updating payout:", error);
      throw error;
    }
  }

  async getEligibleTicketsForPayout(organizerId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("payout_status", "pending")
        .eq("payout_eligible", true);

      // Note: In a real implementation you would also filter by the organizer's venues/events
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("SupabaseService: Error getting eligible tickets for payout:", error);
      return [];
    }
  }

  async getEligibleTicketsForEvent(eventId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("event_slug", eventId)
        .eq("payout_status", "pending")
        .eq("payout_eligible", true);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("SupabaseService: Error getting eligible tickets for event:", error);
      return [];
    }
  }
}

export default SupabaseService.getInstance();
