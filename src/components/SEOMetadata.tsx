"use client"

import React, { useEffect } from "react"
import { View, Text, StyleSheet } from "react-native"

// SEO Keywords for YoVibe - used across the app
export const SEO_KEYWORDS = {
  brand: ["yovibe", "yo vibe", "yovibe app", "yo vibe app"],
  primary: ["nightlife", "events", "venues", "parties", "entertainment"],
  secondary: ["concerts", "clubs", "bars", "lounges", "rooftops", "vibes", "vybz"],
  tertiary: ["happiness", "fun", "trip", "tours", "hotels", "uganda", "kampala"],
  semantic: ["DJ nights", "live music", "happy hours", "weekend events", "night out", "party vibes"],
}

// Default SEO configuration for YoVibe
export const DEFAULT_SEO = {
  title: "YoVibe | Best Nightlife Events, Parties & Venues in Uganda",
  description:
    "YoVibe is your ultimate guide to nightlife, events, entertainment, and vibes in Uganda. Discover the best venues, clubs, bars, parties, concerts, and experiences. Find events, see who's going, buy tickets, and share the happiness.",
  keywords: SEO_KEYWORDS,
  url: "https://yovibe.net",
  siteName: "YoVibe",
  image: "https://yovibe.net/assets/og-image.png",
  twitterHandle: "@yovibe",
  locale: "en_UG",
  region: "UG",
  city: "Kampala",
  latitude: "0.347596",
  longitude: "32.582520",
}

// Interface for SEO props
export interface SEOMetadataProps {
  title?: string
  description?: string
  keywords?: string[]
  image?: string
  url?: string
  canonicalUrl?: string
  type?: "website" | "article" | "event" | "venue" | "profile"
  publishedTime?: string
  modifiedTime?: string
  author?: string
  section?: string
  tags?: string[]
  noindex?: boolean
  nofollow?: boolean
  eventData?: {
    name: string
    description: string
    startDate: string
    endDate: string
    venueName: string
    venueAddress?: string
    image?: string
    price?: string
    currency?: string
  }
  venueData?: {
    name: string
    description: string
    address?: string
    latitude?: string
    longitude?: string
    telephone?: string
    image?: string
    priceRange?: string
    rating?: number
    reviewCount?: number
  }
}

// Helper to generate title with YoVibe branding
export const generateTitle = (pageTitle: string): string => {
  const baseTitle = "YoVibe"
  if (pageTitle.toLowerCase().includes(baseTitle.toLowerCase())) {
    return pageTitle
  }
  return `${pageTitle} | ${baseTitle}`
}

// Helper to generate meta description
export const generateDescription = (description: string): string => {
  if (description.length > 160) {
    return description.substring(0, 157) + "..."
  }
  return description
}

// Generate keywords string from array
export const generateKeywords = (keywords: string[]): string => {
  const allKeywords = [...DEFAULT_SEO.keywords.brand, ...DEFAULT_SEO.keywords.primary, ...DEFAULT_SEO.keywords.secondary, ...DEFAULT_SEO.keywords.tertiary, ...keywords]
  return [...new Set(allKeywords)].join(", ")
}

// SEOMetadata Component - Updates document head for SEO
export const SEOMetadata: React.FC<SEOMetadataProps> = ({
  title,
  description,
  keywords = [],
  image,
  url,
  canonicalUrl,
  type = "website",
  publishedTime,
  modifiedTime,
  author,
  section,
  tags = [],
  noindex = false,
  nofollow = false,
  eventData,
  venueData,
}) => {
  const finalTitle = generateTitle(title || DEFAULT_SEO.title)
  const finalDescription = generateDescription(description || DEFAULT_SEO.description)
  const finalKeywords = generateKeywords(keywords)
  const finalUrl = url || DEFAULT_SEO.url
  const finalImage = image || DEFAULT_SEO.image
  const finalCanonicalUrl = canonicalUrl || finalUrl

  // Robots directive
  const robots = [
    noindex ? "noindex" : "index",
    nofollow ? "nofollow" : "follow",
  ].join(", ")

  useEffect(() => {
    // Update document title
    document.title = finalTitle

    // Helper function to update or create meta tag
    const updateMetaTag = (name: string, content: string, isProperty = false) => {
      const selector = isProperty
        ? `meta[property="${name}"]`
        : `meta[name="${name}"]`
      let element = document.querySelector(selector) as HTMLMetaElement

      if (!element) {
        element = document.createElement("meta")
        if (isProperty) {
          element.setAttribute("property", name)
        } else {
          element.setAttribute("name", name)
        }
        document.head.appendChild(element)
      }
      element.setAttribute("content", content)
    }

    // Helper to create link tag
    const updateLinkTag = (rel: string, content: string) => {
      let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement

      if (!element) {
        element = document.createElement("link")
        element.setAttribute("rel", rel)
        document.head.appendChild(element)
      }
      element.setAttribute("href", content)
    }

    // Update standard meta tags
    updateMetaTag("title", finalTitle)
    updateMetaTag("description", finalDescription)
    updateMetaTag("keywords", finalKeywords)
    updateMetaTag("robots", robots)
    updateMetaTag("author", author || "YoVibe")
    updateMetaTag("distribution", "global")
    updateMetaTag("revisit-after", "1 day")

    // Geographic meta tags
    updateMetaTag("geo.region", DEFAULT_SEO.region)
    updateMetaTag("geo.placename", DEFAULT_SEO.city)
    updateMetaTag("geo.position", `${DEFAULT_SEO.latitude};${DEFAULT_SEO.longitude}`)
    updateMetaTag("ICBM", `${DEFAULT_SEO.latitude}, ${DEFAULT_SEO.longitude}`)

    // Open Graph tags
    updateMetaTag("og:type", type, true)
    updateMetaTag("og:url", finalUrl, true)
    updateMetaTag("og:title", finalTitle, true)
    updateMetaTag("og:description", finalDescription, true)
    updateMetaTag("og:image", finalImage, true)
    updateMetaTag("og:image:width", "1200", true)
    updateMetaTag("og:image:height", "630", true)
    updateMetaTag("og:site_name", DEFAULT_SEO.siteName, true)
    updateMetaTag("og:locale", DEFAULT_SEO.locale, true)

    // Article specific OG tags
    if (type === "article" && publishedTime) {
      updateMetaTag("article:published_time", publishedTime, true)
    }
    if (type === "article" && modifiedTime) {
      updateMetaTag("article:modified_time", modifiedTime, true)
    }
    if (type === "article" && author) {
      updateMetaTag("article:author", author, true)
    }
    if (type === "article" && section) {
      updateMetaTag("article:section", section, true)
    }
    if (type === "article" && tags.length > 0) {
      tags.forEach((tag) => {
        updateMetaTag("article:tag", tag, true)
      })
    }

    // Twitter Card tags
    updateMetaTag("twitter:card", "summary_large_image")
    updateMetaTag("twitter:url", finalUrl)
    updateMetaTag("twitter:title", finalTitle)
    updateMetaTag("twitter:description", finalDescription)
    updateMetaTag("twitter:image", finalImage)
    updateMetaTag("twitter:site", DEFAULT_SEO.twitterHandle)
    updateMetaTag("twitter:creator", DEFAULT_SEO.twitterHandle)

    // Canonical URL
    updateLinkTag("canonical", finalCanonicalUrl)

    // Cleanup function to reset to default on unmount
    return () => {
      // Reset to default title
      document.title = DEFAULT_SEO.title

      // Note: We don't remove the meta tags as they may be needed by other components
      // The parent component or default index.html will handle restoration
    }
  }, [
    finalTitle,
    finalDescription,
    finalKeywords,
    finalImage,
    finalUrl,
    finalCanonicalUrl,
    robots,
    type,
    publishedTime,
    modifiedTime,
    author,
    section,
    tags,
    eventData,
    venueData,
  ])

  // Generate JSON-LD structured data
  useEffect(() => {
    // Remove any existing YoVibe JSON-LD
    const existingLd = document.querySelector('#yovibe-seo-jsonld')
    if (existingLd) {
      existingLd.remove()
    }

    let structuredData: Record<string, unknown> = {}

    if (type === "event" && eventData) {
      structuredData = {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": eventData.name,
        "description": eventData.description,
        "startDate": eventData.startDate,
        "endDate": eventData.endDate,
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "location": {
          "@type": "Place",
          "name": eventData.venueName,
          "address": eventData.venueAddress || {
            "@type": "PostalAddress",
            "addressLocality": DEFAULT_SEO.city,
            "addressCountry": "UG",
          },
        },
        "image": eventData.image || finalImage,
        "offers": eventData.price
          ? {
              "@type": "Offer",
              "price": eventData.price,
              priceCurrency: eventData.currency || "UGX",
              availability: "https://schema.org/InStock",
            }
          : undefined,
        "organizer": {
          "@type": "Organization",
          "name": "YoVibe",
          url: "https://yovibe.net",
        },
      }
    } else if (type === "venue" && venueData) {
      structuredData = {
        "@context": "https://schema.org",
        "@type": ["NightClub", "BarAndGrill"],
        "name": venueData.name,
        "description": venueData.description,
        url: finalUrl,
        address: venueData.address
          ? {
              "@type": "PostalAddress",
              addressLocality: venueData.address,
            }
          : {
              "@type": "PostalAddress",
              addressLocality: DEFAULT_SEO.city,
              addressCountry: "UG",
            },
        geo: venueData.latitude
          ? {
              "@type": "GeoCoordinates",
              latitude: venueData.latitude,
              longitude: venueData.longitude,
            }
          : undefined,
        telephone: venueData.telephone,
        image: venueData.image || finalImage,
        priceRange: venueData.priceRange,
        aggregateRating: venueData.rating
          ? {
              "@type": "AggregateRating",
              ratingValue: venueData.rating.toString(),
              reviewCount: venueData.reviewCount?.toString() || "0",
              bestRating: "5",
            }
          : undefined,
      }
    } else {
      // Default WebSite schema
      structuredData = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: DEFAULT_SEO.siteName,
        url: DEFAULT_SEO.url,
        description: DEFAULT_SEO.description,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${DEFAULT_SEO.url}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
        publisher: {
          "@type": "Organization",
          name: "YoVibe",
        },
      }
    }

    // Create and append JSON-LD script
    if (Object.keys(structuredData).length > 0) {
      const script = document.createElement("script")
      script.type = "application/ld+json"
      script.id = "yovibe-seo-jsonld"
      script.textContent = JSON.stringify(structuredData)
      document.head.appendChild(script)
    }
  }, [type, eventData, venueData, finalImage])

  // This component doesn't render anything visually
  return null
}

// Screen-specific SEO configurations for YoVibe
export const SCREEN_SEO = {
  events: {
    title: "Events in Kampala - Parties, Concerts & Nightlife",
    description:
      "Browse all upcoming events, parties, concerts, DJ nights, and live music in Kampala and Uganda. Find the best events, see who's going, and buy tickets on YoVibe.",
    keywords: ["events", "parties", "concerts", "DJ nights", "live music", "Kampala events", "Uganda events"],
    type: "website" as const,
  },
  venues: {
    title: "Nightlife Venues & Clubs in Kampala",
    description:
      "Discover the best nightlife venues, clubs, bars, lounges, and rooftop bars in Kampala. Find the perfect venue for your night out with YoVibe.",
    keywords: ["venues", "clubs", "bars", "lounges", "rooftops", "nightlife", "Kampala venues"],
    type: "website" as const,
  },
  map: {
    title: "Explore Nightlife Map - YoVibe",
    description:
      "Explore nightlife venues and events on the map. Find clubs, bars, and entertainment spots near you in Kampala and Uganda.",
    keywords: ["map", "nightlife map", "venues near me", "clubs near me"],
    type: "website" as const,
  },
  calendar: {
    title: "Event Calendar - Upcoming Events",
    description:
      "View the complete calendar of events, parties, concerts, and nightlife experiences in Kampala and Uganda. Plan your weekends with YoVibe.",
    keywords: ["calendar", "events calendar", "schedule", "upcoming events"],
    type: "website" as const,
  },
  profile: {
    title: "My Profile - YoVibe",
    description: "Manage your YoVibe profile, saved venues, attending events, and preferences.",
    keywords: ["profile", "my account", "settings"],
    type: "profile" as const,
    noindex: true, // Profile pages should not be indexed
  },
  login: {
    title: "Login - YoVibe",
    description: "Sign in to your YoVibe account to discover events, venues, and connect with friends.",
    keywords: ["login", "sign in", "yovibe account"],
    type: "website" as const,
    noindex: true,
  },
  signup: {
    title: "Sign Up - YoVibe",
    description: "Create a YoVibe account to discover the best nightlife, events, and venues in Uganda.",
    keywords: ["signup", "register", "create account", "join yovibe"],
    type: "website" as const,
    noindex: true,
  },
}

// Export utility functions for generating dynamic SEO
export const SEOUtils = {
  // Generate event page SEO
  generateEventSEO: (event: {
    name: string
    description: string
    date: Date
    venueName: string
    posterImageUrl?: string
  }) => ({
    title: `${event.name} - YoVibe`,
    description: event.description,
    keywords: [
      event.name,
      event.venueName,
      "event",
      "party",
      "concert",
      "DJ",
      "nightlife",
      "Kampala",
      "Uganda",
    ],
    type: "event" as const,
    eventData: {
      name: event.name,
      description: event.description,
      startDate: event.date.toISOString(),
      endDate: event.date.toISOString(),
      venueName: event.venueName,
      image: event.posterImageUrl,
    },
  }),

  // Generate venue page SEO
  generateVenueSEO: (venue: {
    name: string
    description: string
    location?: string
    backgroundImageUrl?: string
    vibeRating?: number
  }) => ({
    title: `${venue.name} - Nightlife Venue - YoVibe`,
    description: venue.description,
    keywords: [
      venue.name,
      "venue",
      "club",
      "bar",
      "nightlife",
      venue.location || "Kampala",
      "Uganda",
    ],
    type: "venue" as const,
    venueData: {
      name: venue.name,
      description: venue.description,
      address: venue.location,
      image: venue.backgroundImageUrl,
      rating: venue.vibeRating,
    },
  }),

  // Generate search results SEO
  generateSearchSEO: (query: string) => ({
    title: `Search: ${query} - YoVibe`,
    description: `Search results for ${query} - Find events, venues, parties, and nightlife in Uganda.`,
    keywords: ["search", query, "events", "venues", "nightlife"],
    type: "website" as const,
  }),
}

export default SEOMetadata
