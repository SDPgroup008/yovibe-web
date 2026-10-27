import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Alert, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../contexts/AuthContext"
import SupabaseService from "../services/SupabaseService"
import VibeUpdateService from "../services/VibeUpdateService"
import { prepareVibeVideoClip, selectVibeMedia, type PreparedVibeMedia, type VibeMediaSource, type VibeVideoTrimCandidate } from "../services/VibeMediaPicker"
import type { Venue } from "../models/Venue"
import type { VibeUpdate, VibeUpdateVenue } from "../models/VibeUpdate"

type Placement = "mobile" | "desktop"
type ViewerPosition = { venueIndex: number; updateIndex: number } | null
type ComposerMediaState = "idle" | "picking" | "preparing" | "ready" | "error"
const IMAGE_DURATION_MS = 5000
const USE_NATIVE_DRIVER = Platform.OS !== "web"

function vibeMediaDiagnosticsEnabled() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false
  const host = window.location.hostname.toLowerCase()
  return host === "localhost" || host === "127.0.0.1" || host.includes("staging") || host.includes("stagging")
}

function usePulse(active: boolean) {
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!active) { pulse.stopAnimation(); pulse.setValue(0); return }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1150, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 1150, useNativeDriver: false }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [active, pulse])
  return pulse
}

function PulseGlyph({ active, iconSize, direction = "down", upright = false }: { active: boolean; iconSize: number; direction?: "down" | "left"; upright?: boolean }) {
  const pulse = usePulse(active)
  const color = active ? pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["#35D8FF", "#B15CFF", "#2EF2B1"] }) : "#697386"
  const lineLength = iconSize * 1.16
  const [leftRotation, rightRotation] = upright ? ["27deg", "-27deg"] : ["-27deg", "27deg"]
  return <View style={{ width: iconSize * 2, height: iconSize, alignItems: "center", justifyContent: "center", transform: [{ rotate: direction === "left" ? "-90deg" : "0deg" }] }}>
    <Animated.View style={[styles.chevronLine, { width: lineLength, backgroundColor: color, shadowColor: active ? "#49CFFF" : "transparent", left: iconSize * 0.03, transform: [{ rotate: leftRotation }] }]} />
    <Animated.View style={[styles.chevronLine, { width: lineLength, backgroundColor: color, shadowColor: active ? "#A463FF" : "transparent", right: iconSize * 0.03, transform: [{ rotate: rightRotation }] }]} />
  </View>
}

function PulseDigit({ count }: { count: number }) {
  const pulse = usePulse(count > 0)
  const borderColor = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["#55E1FF", "#B15CFF", "#2EF2B1"] })
  return <Animated.View style={[styles.unseenDigit, { borderColor, shadowColor: borderColor }]}><Text style={styles.unseenText}>{count > 99 ? "99+" : count}</Text></Animated.View>
}

function UpdateRing({ count, unseen }: { count: number; unseen: boolean }) {
  const safeCount = Math.min(Math.max(count, 1), 7)
  if (safeCount === 1) return <View style={[styles.singleRing, unseen && styles.unseenRing]} />
  const arcColor = unseen ? "#55E4FF" : "#64738B"
  return <View style={styles.ringFrame}>{Array.from({ length: safeCount }, (_, index) => <View key={index} style={[styles.ringArc, { borderTopColor: arcColor, borderLeftColor: arcColor, shadowColor: unseen ? "#A565FF" : "transparent", shadowOpacity: unseen ? 0.7 : 0, transform: [{ rotate: `${(360 / safeCount) * index + 12}deg` }] }]} />)}</View>
}

function formatClipTime(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

function VideoTrimEditor({ candidate, preparing, onProgress, error, onCancel, onUse }: { candidate: VibeVideoTrimCandidate; preparing: boolean; onProgress: number | null; error: string | null; onCancel: () => void; onUse: (startSeconds: number, durationSeconds: number) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [startSeconds, setStartSeconds] = useState(0)
  const [endSeconds, setEndSeconds] = useState(Math.min(60, candidate.durationSeconds))
  const [playhead, setPlayhead] = useState(0)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const clipDuration = Math.max(0, endSeconds - startSeconds)

  useEffect(() => {
    let cancelled = false
    const createThumbnails = async () => {
      const source = document.createElement("video")
      source.muted = true
      source.preload = "auto"
      source.src = candidate.previewUrl
      const waitFor = (event: "loadeddata" | "seeked") => new Promise<void>((resolve, reject) => {
        source.addEventListener(event, () => resolve(), { once: true })
        source.addEventListener("error", () => reject(new Error("Unable to create preview frames.")), { once: true })
      })
      try {
        await waitFor("loadeddata")
        const frames: string[] = []
        const count = 7
        for (let index = 0; index < count; index += 1) {
          source.currentTime = Math.min(candidate.durationSeconds - 0.05, (candidate.durationSeconds * index) / Math.max(count - 1, 1))
          await waitFor("seeked")
          const canvas = document.createElement("canvas")
          canvas.width = 144
          canvas.height = 80
          canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height)
          frames.push(canvas.toDataURL("image/jpeg", 0.72))
        }
        if (!cancelled) setThumbnails(frames)
      } catch {
        if (!cancelled) setThumbnails([])
      } finally {
        source.removeAttribute("src")
        source.load()
      }
    }
    if (Platform.OS === "web") void createThumbnails()
    return () => { cancelled = true }
  }, [candidate.durationSeconds, candidate.previewUrl])

  const seek = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    setPlayhead(seconds)
  }
  const updateStart = (value: number) => {
    const next = Math.max(0, Math.min(value, endSeconds - 1))
    setStartSeconds(next)
    seek(next)
  }
  const updateEnd = (value: number) => {
    const next = Math.min(candidate.durationSeconds, Math.max(value, startSeconds + 1))
    if (next - startSeconds > 60) setStartSeconds(next - 60)
    setEndSeconds(next)
    seek(Math.max(startSeconds, next - 60))
  }
  const onTimeUpdate = (event: any) => {
    const currentTime = event?.currentTarget?.currentTime || 0
    setPlayhead(currentTime)
    if (currentTime >= endSeconds) {
      seek(startSeconds)
      void videoRef.current?.play().catch(() => undefined)
    }
  }
  const selectedLeft = `${(startSeconds / candidate.durationSeconds) * 100}%`
  const selectedWidth = `${(clipDuration / candidate.durationSeconds) * 100}%`

  return <View style={styles.trimEditor}>
    <Text style={styles.trimHeading}>CHOOSE VIDEO CLIP</Text>
    <Text style={styles.trimSubheading}>Select up to 60 seconds to publish</Text>
    <View style={styles.trimPreviewStage}>
      {Platform.OS === "web" && React.createElement("video", { ref: videoRef, src: candidate.previewUrl, muted: true, playsInline: true, controls: true, onLoadedMetadata: () => seek(startSeconds), onTimeUpdate, style: styles.trimPreviewVideo as any })}
    </View>
    <View style={styles.trimTimingRow}><Text style={styles.trimTime}>{formatClipTime(startSeconds)}</Text><Text style={styles.trimDuration}>{formatClipTime(clipDuration)} selected</Text><Text style={styles.trimTime}>{formatClipTime(endSeconds)}</Text></View>
    <View style={styles.trimFilmstrip}>
      {thumbnails.length ? thumbnails.map((uri, index) => <Image key={`${uri.slice(-10)}-${index}`} source={{ uri }} style={styles.trimThumbnail} resizeMode="cover" />) : <View style={styles.trimFilmstripFallback} />}
      <View pointerEvents="none" style={[styles.trimSelectedRange, { left: selectedLeft, width: selectedWidth } as any]} />
      <View pointerEvents="none" style={[styles.trimPlayhead, { left: `${(Math.min(Math.max(playhead, startSeconds), endSeconds) / candidate.durationSeconds) * 100}%` } as any]} />
    </View>
    <View style={styles.trimControl}><Text style={styles.trimLabel}>START · {formatClipTime(startSeconds)}</Text>{React.createElement("input", { type: "range", min: 0, max: Math.max(0, endSeconds - 1), step: 0.1, value: startSeconds, disabled: preparing, onChange: (event: any) => updateStart(Number(event.target.value)), style: { ...styles.trimRange, accentColor: "#63E9FF" } as any })}</View>
    <View style={styles.trimControl}><Text style={styles.trimLabel}>END · {formatClipTime(endSeconds)}</Text>{React.createElement("input", { type: "range", min: Math.min(candidate.durationSeconds, startSeconds + 1), max: candidate.durationSeconds, step: 0.1, value: endSeconds, disabled: preparing, onChange: (event: any) => updateEnd(Number(event.target.value)), style: { ...styles.trimRange, accentColor: "#63E9FF" } as any })}</View>
    {preparing && <View style={styles.trimPreparing}><ActivityIndicator color="#63E9FF" /><Text style={styles.preparingText}>{onProgress === null ? "Preparing clip…" : `Preparing clip ${Math.round(onProgress * 100)}%`}</Text></View>}
    {error && <View style={styles.trimError}><Ionicons name="alert-circle-outline" color="#FFB4C3" size={17} /><Text style={styles.mediaErrorText}>{error}</Text></View>}
    <View style={styles.trimActions}><TouchableOpacity disabled={preparing} style={styles.trimCancelButton} onPress={onCancel}><Text style={styles.trimCancelText}>CHOOSE ANOTHER</Text></TouchableOpacity><TouchableOpacity disabled={preparing || clipDuration < 1 || clipDuration > 60} style={[styles.trimUseButton, (preparing || clipDuration < 1 || clipDuration > 60) && styles.publishDisabled]} onPress={() => onUse(startSeconds, clipDuration)}>{preparing ? <ActivityIndicator color="#06101B" /> : <Text style={styles.trimUseText}>USE CLIP</Text>}</TouchableOpacity></View>
  </View>
}

function MediaSurface({ update, muted, videoRef, onEnded }: { update: VibeUpdate; muted: boolean; videoRef: React.RefObject<HTMLVideoElement | null>; onEnded: () => void }) {
  if (update.mediaType === "video" && Platform.OS === "web") return React.createElement("video", { ref: videoRef, src: update.mediaUrl, autoPlay: true, muted, playsInline: true, onEnded, style: styles.video as any })
  return <Image source={{ uri: update.mediaUrl }} style={styles.viewerMedia} resizeMode="contain" />
}

export default function VibeUpdateHub({ placement, iconSize, barHeight }: { placement: Placement; iconSize: number; barHeight: number }) {
  const { user } = useAuth()
  const { width } = useWindowDimensions()
  const [panelMounted, setPanelMounted] = useState(false)
  const panelMotion = useRef(new Animated.Value(0)).current
  const [loading, setLoading] = useState(true)
  const [venues, setVenues] = useState<Venue[]>([])
  const [cards, setCards] = useState<VibeUpdateVenue[]>([])
  const [seen, setSeen] = useState<Record<string, number>>({})
  const [viewer, setViewer] = useState<ViewerPosition>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [composerVenue, setComposerVenue] = useState<VibeUpdateVenue | null>(null)
  const [caption, setCaption] = useState("")
  const [file, setFile] = useState<Blob | null>(null)
  const [fileName, setFileName] = useState("")
  const [contentType, setContentType] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewAspectRatio, setPreviewAspectRatio] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | undefined>()
  const [publishing, setPublishing] = useState(false)
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [sourceVenue, setSourceVenue] = useState<VibeUpdateVenue | null>(null)
  const plusPressVenueRef = useRef<string | null>(null)
  const [preparingMedia, setPreparingMedia] = useState(false)
  const [trimProgress, setTrimProgress] = useState<number | null>(null)
  const [composerMediaState, setComposerMediaState] = useState<ComposerMediaState>("idle")
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [trimCandidate, setTrimCandidate] = useState<VibeVideoTrimCandidate | null>(null)

  const isAdmin = user?.userType === "admin"
  const ownVenue = useCallback((venue: VibeUpdateVenue) => Boolean(user && venue.ownerId === user.id), [user])
  const viewableCards = useMemo(() => cards.filter((card) => card.updates.length > 0), [cards])
  const unseenVenueCount = useMemo(() => viewableCards.filter((card) => card.updates.some((update) => !seen[update.id])).length, [seen, viewableCards])
  const canPublish = Boolean(user && (user.userType === "club_owner" || isAdmin))
  const panelHeight = barHeight * 2
  const panelWidth = Math.min(width - 24, 560)
  const desktopPanelWidth = Math.min(panelWidth, 460)

  const openPanel = useCallback(() => {
    if (panelMounted) return
    setPanelMounted(true)
    requestAnimationFrame(() => Animated.spring(panelMotion, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, tension: 80, friction: 12 }).start())
  }, [panelMounted, panelMotion])
  const closePanel = useCallback(() => {
    Animated.timing(panelMotion, { toValue: 0, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }).start(({ finished }) => { if (finished) setPanelMounted(false) })
  }, [panelMotion])
  const clearSelectedMedia = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (trimCandidate) URL.revokeObjectURL(trimCandidate.previewUrl)
    setFile(null); setFileName(""); setContentType(""); setPreviewUrl(null); setPreviewAspectRatio(null); setDuration(undefined); setTrimProgress(null); setMediaError(null); setTrimCandidate(null); setComposerMediaState("idle")
  }, [previewUrl, trimCandidate])

  const openVenue = (card: VibeUpdateVenue) => {
    const venueIndex = viewableCards.findIndex((item) => item.venueSlug === card.venueSlug)
    if (venueIndex < 0) return
    const firstUnseen = card.updates.findIndex((update) => !seen[update.id])
    setMuted(true)
    setViewer({ venueIndex, updateIndex: firstUnseen >= 0 ? firstUnseen : 0 })
  }
  const load = useCallback(async () => {
    try {
      setLoading(true)
      const allVenues = await SupabaseService.getVenues()
      const active = await VibeUpdateService.getActiveUpdates(allVenues)
      const activeSlugs = new Set(active.map((card) => card.venueSlug))
      const ownedEmpty = canPublish && user && !isAdmin ? allVenues.filter((venue) => venue.ownerId === user.id && !activeSlugs.has(venue.slug || venue.id)).map((venue) => ({ venueSlug: venue.slug || venue.id, venueName: venue.name, posterUrl: venue.backgroundImageUrl, ownerId: venue.ownerId, updates: [] })) : []
      const allCards = [...active, ...ownedEmpty]
      setVenues(allVenues); setCards(allCards); setSeen(await VibeUpdateService.pruneSeen(allCards.flatMap((card) => card.updates)))
    } catch (error) { console.error("Unable to load Vibe Updates:", error) } finally { setLoading(false) }
  }, [canPublish, isAdmin, user])
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 60_000); return () => clearInterval(timer) }, [load])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  useEffect(() => () => { if (trimCandidate) URL.revokeObjectURL(trimCandidate.previewUrl) }, [trimCandidate])

  const current = useMemo(() => {
    if (!viewer) return null
    const venue = viewableCards[viewer.venueIndex]
    const update = venue?.updates[viewer.updateIndex]
    return venue && update ? { venue, update } : null
  }, [viewer, viewableCards])
  const markCurrentSeen = useCallback(async () => {
    if (!current || seen[current.update.id]) return
    await VibeUpdateService.markSeen(current.update.id)
    setSeen((previous) => ({ ...previous, [current.update.id]: Date.now() }))
  }, [current, seen])
  useEffect(() => { if (current) void markCurrentSeen() }, [current, markCurrentSeen])
  const next = useCallback(() => setViewer((position) => {
    if (!position) return position
    const venue = viewableCards[position.venueIndex]
    if (position.updateIndex + 1 < venue.updates.length) return { ...position, updateIndex: position.updateIndex + 1 }
    if (position.venueIndex + 1 < viewableCards.length) return { venueIndex: position.venueIndex + 1, updateIndex: 0 }
    return null
  }), [viewableCards])
  const previous = useCallback(() => setViewer((position) => {
    if (!position) return position
    if (position.updateIndex > 0) return { ...position, updateIndex: position.updateIndex - 1 }
    if (position.venueIndex > 0) { const venue = viewableCards[position.venueIndex - 1]; return { venueIndex: position.venueIndex - 1, updateIndex: venue.updates.length - 1 } }
    return position
  }), [viewableCards])
  useEffect(() => { if (!current || paused || current.update.mediaType !== "image") return; const timer = setTimeout(next, IMAGE_DURATION_MS); return () => clearTimeout(timer) }, [current, next, paused])
  useEffect(() => { if (!current || current.update.mediaType !== "video" || !videoRef.current) return; if (paused) videoRef.current.pause(); else void videoRef.current.play().catch(() => undefined) }, [current, paused])

  const applyPreparedMedia = (media: PreparedVibeMedia) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(media.file); setFileName(media.fileName); setContentType(media.contentType); setPreviewUrl(media.previewUrl); setPreviewAspectRatio(media.width / media.height); setDuration(media.durationSeconds)
    setComposerMediaState("ready")
  }

  const chooseMedia = async (source: VibeMediaSource) => {
    const targetVenue = sourceVenue || composerVenue || { venueSlug: "", venueName: "Select a venue", ownerId: "", updates: [] }
    setComposerVenue(targetVenue)
    setSourcePickerOpen(false)
    setSourceVenue(null)
    setMediaError(null)
    setComposerMediaState("preparing")
    try {
      setPreparingMedia(true); setTrimProgress(null)
      const selected = await selectVibeMedia(source, setTrimProgress)
      if (!selected) { setComposerMediaState(file ? "ready" : "idle"); return }
      if (selected.kind === "trim") {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setFile(null); setFileName(""); setContentType(""); setPreviewUrl(null); setPreviewAspectRatio(null); setDuration(undefined)
        setTrimCandidate(selected.candidate)
        setComposerMediaState("idle")
        return
      }
      applyPreparedMedia(selected.media)
    } catch (error: any) {
      const stage = error?.vibeMediaStage || "composer-boundary"
      if (vibeMediaDiagnosticsEnabled()) {
        console.error("[VibeMediaComposer]", {
          stage,
          errorName: error?.name || "Error",
          errorMessage: error?.message || "Unknown media preparation error",
          source,
        })
      }
      setMediaError(error?.userMessage || (vibeMediaDiagnosticsEnabled()
        ? `We could not prepare this media (diagnostic step: ${stage}). Try another file or send this step to support.`
        : "We could not prepare this media. Choose another photo or video."))
      setComposerMediaState("error")
    } finally { setPreparingMedia(false); setTrimProgress(null) }
  }
  const prepareSelectedClip = async (startSeconds: number, durationSeconds: number) => {
    if (!trimCandidate) return
    try {
      setPreparingMedia(true); setTrimProgress(null); setMediaError(null); setComposerMediaState("preparing")
      const prepared = await prepareVibeVideoClip(trimCandidate, startSeconds, durationSeconds, setTrimProgress)
      URL.revokeObjectURL(trimCandidate.previewUrl)
      setTrimCandidate(null)
      applyPreparedMedia(prepared)
      Alert.alert("Video prepared", "Your selected clip is ready to publish.")
    } catch (error: any) {
      const stage = error?.vibeMediaStage || "clip-preparation"
      if (vibeMediaDiagnosticsEnabled()) console.error("[VibeMediaComposer]", { stage, errorName: error?.name || "Error", errorMessage: error?.message || "Unknown clip preparation error", source: trimCandidate.source })
      setMediaError(error?.userMessage || "We could not prepare this clip. Choose another video or try again.")
      setComposerMediaState("error")
    } finally { setPreparingMedia(false); setTrimProgress(null) }
  }
  const cancelTrimSelection = () => {
    if (trimCandidate) URL.revokeObjectURL(trimCandidate.previewUrl)
    setTrimCandidate(null); setSourceVenue(composerVenue); setComposerMediaState("picking"); setSourcePickerOpen(true)
  }
  const publish = async () => {
    if (!user || !composerVenue?.venueSlug || !file) return
    if (composerVenue.updates.length >= 7) { Alert.alert("Limit reached", "A venue can have a maximum of seven active Vibe Updates."); return }
    try {
      setPublishing(true)
      await VibeUpdateService.publish({ venueSlug: composerVenue.venueSlug, authorId: user.id, file, fileName, contentType, durationSeconds: duration, caption })
      clearSelectedMedia(); setComposerVenue(null); setCaption(""); await load()
    } catch (error: any) { Alert.alert("Could not publish", error?.message || "Please try again.") } finally { setPublishing(false) }
  }
  const closeComposer = () => { clearSelectedMedia(); setComposerVenue(null); setSourceVenue(null); setSourcePickerOpen(false); setCaption("") }
  const openMediaOptions = (venue: VibeUpdateVenue) => {
    plusPressVenueRef.current = venue.venueSlug
    setComposerVenue(venue)
    setSourceVenue(venue)
    setMediaError(null)
    setComposerMediaState("picking")
    setSourcePickerOpen(true)
    setTimeout(() => { plusPressVenueRef.current = null }, 0)
  }
  const closeSourcePicker = () => { setSourcePickerOpen(false); setSourceVenue(null); setComposerMediaState(file ? "ready" : "idle") }
  const handleVenuePress = (card: VibeUpdateVenue) => {
    if (plusPressVenueRef.current === card.venueSlug) return
    if (card.updates.length) openVenue(card)
    else if (canPublish && ownVenue(card)) openMediaOptions(card)
  }
  const openAdminMediaOptions = () => { setComposerVenue({ venueSlug: "", venueName: "Select a venue", ownerId: "", updates: [] }); setSourceVenue(null); setMediaError(null); setComposerMediaState("picking"); setSourcePickerOpen(true) }
  const deleteCurrent = () => {
    if (!current || !user || (!isAdmin && current.update.authorId !== user.id)) return
    Alert.alert("Delete Vibe Update?", "This will immediately remove it from the Vibe Update feed.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { try { await VibeUpdateService.delete(current.update.id, user.id); setViewer(null); await load() } catch (error: any) { Alert.alert("Could not delete", error?.message || "Please try again.") } } }])
  }

  const rootStyle = placement === "mobile" ? { position: "absolute" as const, zIndex: 999, left: "50%" as const, top: -iconSize - 1, width: iconSize * 2, height: iconSize, transform: [{ translateX: -iconSize }] } : { position: "absolute" as const, zIndex: 999, left: "100%" as const, top: 8, width: iconSize * 2, height: iconSize }
  const panelPosition = placement === "mobile" ? { width: panelWidth, height: panelHeight, left: (iconSize * 2 - panelWidth) / 2, bottom: 0 } : { width: desktopPanelWidth, height: panelHeight, left: 1, top: -barHeight * 0.65 }
  const panelTransform = placement === "mobile" ? [{ translateY: panelMotion.interpolate({ inputRange: [0, 1], outputRange: [panelHeight + 1, 0] }) }] : [{ translateX: panelMotion.interpolate({ inputRange: [0, 1], outputRange: [-desktopPanelWidth - 1, 0] }) }]
  const triggerOpacity = panelMotion.interpolate({ inputRange: [0, 0.22, 1], outputRange: [1, 0, 0] })
  const titleOpacity = panelMotion.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0, 1] })
  const titleVTransform = placement === "mobile" ? [{ translateY: panelMotion.interpolate({ inputRange: [0, 1], outputRange: [panelHeight - 42, 0] }) }, { rotate: panelMotion.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "0deg"] }) }] : [{ translateX: panelMotion.interpolate({ inputRange: [0, 1], outputRange: [-desktopPanelWidth / 2, 0] }) }, { rotate: panelMotion.interpolate({ inputRange: [0, 1], outputRange: ["90deg", "0deg"] }) }]

  return <>
    <View pointerEvents="box-none" style={rootStyle}>
      {panelMounted && <Animated.View style={[styles.panel, panelPosition, { transform: panelTransform }]}>
        <View style={styles.panelHeader}><View style={styles.panelTitleRow}><Animated.View style={{ opacity: titleOpacity, transform: titleVTransform }}><TouchableOpacity onPress={closePanel} accessibilityLabel="Close Vibe Pulse" style={styles.titleV}><PulseGlyph active={unseenVenueCount > 0} iconSize={13} upright /></TouchableOpacity></Animated.View><Animated.Text style={[styles.panelTitle, { opacity: titleOpacity }]}>ibe Pulse</Animated.Text></View></View>
        {loading ? <ActivityIndicator color="#53E4FF" style={{ flex: 1 }} /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueRail}>
          {cards.map((card) => <TouchableOpacity key={card.venueSlug} style={styles.venueCard} onPress={() => handleVenuePress(card)}><View style={styles.posterFrame}><UpdateRing count={card.updates.length} unseen={card.updates.some((update) => !seen[update.id])} />{card.posterUrl ? <Image source={{ uri: card.posterUrl }} style={styles.venuePoster} /> : <View style={[styles.venuePoster, styles.posterFallback]}><Ionicons name="business" color="#B7C8FF" size={22} /></View>}{(isAdmin || ownVenue(card)) && <TouchableOpacity style={styles.addBadge} onPressIn={() => { plusPressVenueRef.current = card.venueSlug }} onPress={(event) => { event.stopPropagation?.(); openMediaOptions(card) }} accessibilityLabel={`Add Vibe Update for ${card.venueName}`}><Ionicons name="add" size={14} color="#07111F" /></TouchableOpacity>}</View><Text style={styles.venueName} numberOfLines={1}>{card.venueName}</Text></TouchableOpacity>)}
          {isAdmin && <TouchableOpacity style={styles.venueCard} onPress={openAdminMediaOptions}><View style={[styles.posterFrame, styles.adminAdd]}><Ionicons name="add" size={30} color="#5AE7FF" /></View><Text style={styles.venueName}>Add update</Text></TouchableOpacity>}
          {!cards.length && <View style={styles.emptyRail}><Ionicons name="pulse-outline" size={21} color="#6B7C98" /><Text style={styles.emptyRailText}>No live venue updates yet</Text></View>}
        </ScrollView>}
      </Animated.View>}
      <Animated.View pointerEvents={panelMounted ? "none" : "auto"} style={{ opacity: triggerOpacity }}><TouchableOpacity style={styles.trigger} onPress={openPanel} accessibilityLabel="Open Vibe Pulse"><PulseGlyph active={unseenVenueCount > 0} iconSize={iconSize} direction={placement === "desktop" ? "left" : "down"} />{unseenVenueCount > 0 && <PulseDigit count={unseenVenueCount} />}</TouchableOpacity></Animated.View>
    </View>

    <Modal visible={Boolean(viewer && current)} animationType="fade" transparent={false} onRequestClose={() => setViewer(null)}>{current && <View style={styles.viewer}><Pressable style={styles.mediaPress} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)}><MediaSurface update={current.update} muted={muted} videoRef={videoRef} onEnded={next} /></Pressable><View style={styles.viewerShade} pointerEvents="none" /><View style={styles.progressRow}>{current.venue.updates.map((update, index) => <View key={update.id} style={[styles.progressSegment, index < (viewer?.updateIndex || 0) && styles.progressDone, index === (viewer?.updateIndex || 0) && styles.progressActive]} />)}</View><View style={styles.viewerHeader}><View style={styles.viewerIdentity}>{current.venue.posterUrl && <Image source={{ uri: current.venue.posterUrl }} style={styles.viewerAvatar} />}<View><Text style={styles.viewerVenue}>{current.venue.venueName}</Text><Text style={styles.viewerMeta}>{current.update.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text></View></View><View style={styles.viewerActions}>{current.update.mediaType === "video" && <TouchableOpacity onPress={() => setMuted((value) => !value)}><Ionicons name={muted ? "volume-mute-outline" : "volume-high-outline"} size={21} color="#FFF" /></TouchableOpacity>}{(isAdmin || current.update.authorId === user?.id) && <TouchableOpacity onPress={deleteCurrent}><Ionicons name="trash-outline" size={21} color="#FFF" /></TouchableOpacity>}<TouchableOpacity onPress={() => setViewer(null)}><Ionicons name="close" size={26} color="#FFF" /></TouchableOpacity></View></View>{current.update.caption ? <View style={styles.captionShell}><Text style={styles.caption}>{current.update.caption}</Text></View> : null}<View style={styles.viewerZones}><Pressable style={styles.zone} onPress={previous} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} /><Pressable style={styles.zone} onPress={next} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} /></View></View>}</Modal>

    <Modal visible={Boolean(composerVenue) && !sourcePickerOpen} animationType="slide" transparent onRequestClose={closeComposer}>
      <View style={styles.composerOverlay}>
        <View style={styles.composer}>
          <View style={styles.composerHeader}>
            <Text style={styles.composerTitle}>{trimCandidate ? "CHOOSE VIDEO CLIP" : "CREATE VIBE UPDATE"}</Text>
            <TouchableOpacity onPress={closeComposer}><Ionicons name="close" color="#E7EEFF" size={24} /></TouchableOpacity>
          </View>
          {trimCandidate ? <ScrollView contentContainerStyle={styles.composerBody} showsVerticalScrollIndicator={false}><VideoTrimEditor candidate={trimCandidate} preparing={preparingMedia} onProgress={trimProgress} error={mediaError} onCancel={cancelTrimSelection} onUse={(startSeconds, durationSeconds) => void prepareSelectedClip(startSeconds, durationSeconds)} /></ScrollView> : <ScrollView contentContainerStyle={styles.composerBody} showsVerticalScrollIndicator={false}>
            {composerVenue?.venueSlug ? <Text style={styles.composerVenue}>{composerVenue.venueName}</Text> : <View style={styles.venueSelectSection}>
              {venues.map((venue) => <TouchableOpacity key={venue.slug || venue.id} style={styles.pickerItem} onPress={() => setComposerVenue({ venueSlug: venue.slug || venue.id, venueName: venue.name, posterUrl: venue.backgroundImageUrl, ownerId: venue.ownerId, updates: cards.find((card) => card.venueSlug === (venue.slug || venue.id))?.updates || [] })}><Text style={styles.pickerText}>{venue.name}</Text><Ionicons name="chevron-forward" color="#75E9FF" size={18} /></TouchableOpacity>)}
            </View>}
            <TouchableOpacity style={[styles.mediaPicker, previewAspectRatio !== null && styles.selectedMediaPicker, previewAspectRatio !== null ? { aspectRatio: previewAspectRatio } : null]} onPress={() => { setSourceVenue(composerVenue); setMediaError(null); setComposerMediaState("picking"); setSourcePickerOpen(true) }} disabled={preparingMedia}>
              {previewUrl ? (contentType.startsWith("video/") ? React.createElement("video", { src: previewUrl, muted: true, controls: true, style: styles.previewVideo as any }) : <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />) : <><Ionicons name="camera-outline" size={34} color="#62E6FF" /><Text style={styles.mediaPickerText}>Add photo or video</Text><Text style={styles.mediaPickerHint}>Camera or gallery · Videos are trimmed to 60 sec / 50 MB</Text></>}
              {composerMediaState === "preparing" && <View style={styles.preparingOverlay}><ActivityIndicator color="#63E9FF" /><Text style={styles.preparingText}>{trimProgress === null ? "Preparing media…" : `Trimming video ${Math.round(trimProgress * 100)}%`}</Text></View>}
            </TouchableOpacity>
            {mediaError && <View style={styles.mediaError}><Ionicons name="alert-circle-outline" color="#FFB4C3" size={18} /><View style={styles.mediaErrorCopy}><Text style={styles.mediaErrorText}>{mediaError}</Text><TouchableOpacity onPress={() => { setSourceVenue(composerVenue); setMediaError(null); setComposerMediaState("picking"); setSourcePickerOpen(true) }}><Text style={styles.mediaRetry}>TRY ANOTHER FILE</Text></TouchableOpacity></View></View>}
            <TextInput value={caption} onChangeText={setCaption} maxLength={220} multiline placeholder="Add Caption..." placeholderTextColor="#7B859B" style={styles.captionInput} />
            <Text style={styles.characterCount}>{caption.length}/220</Text>
            <TouchableOpacity disabled={!file || !composerVenue?.venueSlug || publishing || preparingMedia || composerVenue.updates.length >= 7} style={[styles.publishButton, (!file || !composerVenue?.venueSlug || publishing || preparingMedia || composerVenue.updates.length >= 7) && styles.publishDisabled]} onPress={publish}>{publishing ? <ActivityIndicator color="#06101B" /> : <><Ionicons name="flash" size={18} color="#06101B" /><Text style={styles.publishText}>PUBLISH PULSE</Text></>}</TouchableOpacity>
          </ScrollView>}
        </View>
      </View>
    </Modal>

    <Modal visible={sourcePickerOpen} transparent animationType="fade" onRequestClose={closeSourcePicker}><Pressable style={styles.sourceOverlay} onPress={closeSourcePicker}><Pressable style={styles.sourceSheet} onPress={(event) => event.stopPropagation()}><Text style={styles.sourceTitle}>ADD TO VIBE PULSE</Text><TouchableOpacity style={styles.sourceOption} onPress={(event) => { event.stopPropagation(); void chooseMedia("camera-photo") }}><Ionicons name="camera-outline" color="#65E7FF" size={22} /><Text style={styles.sourceOptionText}>Take photo</Text></TouchableOpacity><TouchableOpacity style={styles.sourceOption} onPress={(event) => { event.stopPropagation(); void chooseMedia("camera-video") }}><Ionicons name="videocam-outline" color="#B984FF" size={22} /><Text style={styles.sourceOptionText}>Record video</Text></TouchableOpacity><TouchableOpacity style={styles.sourceOption} onPress={(event) => { event.stopPropagation(); void chooseMedia("gallery") }}><Ionicons name="images-outline" color="#72F1B8" size={22} /><Text style={styles.sourceOptionText}>Choose from gallery</Text></TouchableOpacity></Pressable></Pressable></Modal>
  </>
}

const styles = StyleSheet.create({
  trigger: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }, chevronLine: { height: 3, position: "absolute", borderRadius: 1.5, shadowOpacity: 1, shadowRadius: 3, elevation: 7 }, unseenDigit: { position: "absolute", top: "84%", minWidth: 18, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: "#192B51", borderWidth: 1, shadowOpacity: 0.9, shadowRadius: 7, alignItems: "center", justifyContent: "center" }, unseenText: { color: "#A9F4FF", fontSize: 9, fontWeight: "900" },
  panel: { position: "absolute", backgroundColor: "rgba(10, 18, 36, 0.97)", borderWidth: 1, borderColor: "rgba(89, 224, 255, 0.55)", borderRadius: 0, shadowColor: "#4BD8FF", shadowOpacity: 0.25, shadowRadius: 20, elevation: 20, overflow: "hidden" }, panelHeader: { height: 30, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "rgba(167, 103, 255, 0.22)" }, panelTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" }, titleV: { width: 28, height: 18, alignItems: "center", justifyContent: "center", marginRight: 3 }, panelTitle: { color: "#E8F8FF", fontSize: 13, letterSpacing: 1.5, fontWeight: "900", textTransform: "uppercase" },
  venueRail: { alignItems: "center", paddingHorizontal: 14, gap: 14, flexGrow: 1 }, venueCard: { width: 66, alignItems: "center" }, posterFrame: { width: 54, height: 54, alignItems: "center", justifyContent: "center", position: "relative" }, venuePoster: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#21304A" }, posterFallback: { alignItems: "center", justifyContent: "center" }, venueName: { color: "#D9E6FF", fontSize: 9, marginTop: 5, width: 68, textAlign: "center" }, emptyRail: { flex: 1, minWidth: 185, alignItems: "center", justifyContent: "center", gap: 5 }, emptyRailText: { color: "#8C9AB2", fontSize: 11 }, singleRing: { position: "absolute", width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: "#60708D" }, ringFrame: { position: "absolute", width: 54, height: 54 }, ringArc: { position: "absolute", width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: "#64738B", borderRightColor: "transparent", borderBottomColor: "transparent" }, unseenRing: { borderColor: "#55E4FF", shadowColor: "#A565FF", shadowOpacity: 0.7, shadowRadius: 5 }, addBadge: { position: "absolute", right: 1, bottom: 0, width: 19, height: 19, borderRadius: 10, backgroundColor: "#69EDFF", borderWidth: 2, borderColor: "#0D1629", alignItems: "center", justifyContent: "center" }, adminAdd: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "#4DD8FF", borderRadius: 27, backgroundColor: "rgba(39, 65, 113, 0.34)" },
  viewer: { flex: 1, backgroundColor: "#050A12" }, mediaPress: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#03070D" }, viewerMedia: { width: "100%", height: "100%", backgroundColor: "#03070D" }, video: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#03070D" }, viewerShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.1)" }, progressRow: { position: "absolute", top: 16, left: 13, right: 13, flexDirection: "row", gap: 4 }, progressSegment: { flex: 1, height: 3, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.38)" }, progressDone: { backgroundColor: "#D5FAFF" }, progressActive: { backgroundColor: "#61E8FF" }, viewerHeader: { position: "absolute", top: 34, left: 15, right: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, viewerIdentity: { flexDirection: "row", alignItems: "center", gap: 9 }, viewerAvatar: { width: 34, height: 34, borderRadius: 17 }, viewerVenue: { color: "#FFF", fontWeight: "800", fontSize: 14 }, viewerMeta: { color: "rgba(255,255,255,0.72)", fontSize: 10, marginTop: 2 }, viewerActions: { flexDirection: "row", gap: 16, alignItems: "center" }, captionShell: { position: "absolute", bottom: 45, left: 24, right: 24, backgroundColor: "rgba(3,9,19,0.70)", borderWidth: 1, borderColor: "rgba(163,102,255,0.3)", borderRadius: 14, padding: 14 }, caption: { color: "#F4F8FF", fontSize: 14, textAlign: "center", lineHeight: 20 }, viewerZones: { ...StyleSheet.absoluteFill, flexDirection: "row" }, zone: { flex: 1 },
  composerOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.63)", justifyContent: "flex-end" }, composer: { height: "90%", minHeight: 480, maxHeight: "90%", width: "100%", backgroundColor: "#0B1425", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: "rgba(96,224,255,0.45)", padding: 20 }, composerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexShrink: 0 }, composerBody: { flexGrow: 1, paddingBottom: 8 }, composerTitle: { color: "#E6F8FF", letterSpacing: 1.5, fontWeight: "900", fontSize: 14 }, composerVenue: { color: "#64E8FF", fontWeight: "800", marginBottom: 10 }, venueSelectSection: { gap: 8, marginBottom: 14 }, mediaPicker: { width: "100%", minHeight: 190, borderRadius: 18, borderWidth: 1, borderColor: "rgba(98,230,255,0.48)", backgroundColor: "#03070D", alignItems: "center", justifyContent: "center", overflow: "hidden" }, selectedMediaPicker: { minHeight: 0 }, mediaPickerText: { color: "#D8F8FF", fontSize: 14, fontWeight: "700", marginTop: 8 }, mediaPickerHint: { color: "#8294B4", fontSize: 10, marginTop: 5, textAlign: "center", paddingHorizontal: 15 }, previewImage: { width: "100%", height: "100%", backgroundColor: "#03070D" }, previewVideo: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#03070D" }, preparingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(4, 12, 25, 0.78)", alignItems: "center", justifyContent: "center", gap: 9 }, preparingText: { color: "#DDF9FF", fontSize: 12, fontWeight: "700" }, mediaError: { marginTop: 10, flexDirection: "row", gap: 9, padding: 11, backgroundColor: "rgba(125, 30, 58, 0.32)", borderWidth: 1, borderColor: "rgba(255, 132, 161, 0.48)", borderRadius: 12 }, mediaErrorCopy: { flex: 1, gap: 7 }, mediaErrorText: { color: "#FFD7E1", fontSize: 12, lineHeight: 17 }, mediaRetry: { color: "#89F0FF", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, captionInput: { color: "#F5F8FF", minHeight: 65, marginTop: 14, borderRadius: 13, padding: 12, backgroundColor: "#101E35", borderWidth: 1, borderColor: "rgba(143,161,199,0.28)", textAlignVertical: "top" }, characterCount: { color: "#7E8BA2", fontSize: 10, textAlign: "right", marginTop: 5 }, publishButton: { height: 48, borderRadius: 14, marginTop: 12, backgroundColor: "#64E8FF", flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" }, publishDisabled: { opacity: 0.45 }, publishText: { color: "#07111F", fontWeight: "900", fontSize: 12, letterSpacing: 1 }, pickerItem: { minHeight: 52, borderRadius: 12, paddingHorizontal: 14, backgroundColor: "#11213A", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, pickerText: { color: "#E7F4FF", fontWeight: "700" },
  trimEditor: { gap: 13, paddingBottom: 8 }, trimHeading: { color: "#DDF9FF", fontWeight: "900", fontSize: 13, letterSpacing: 1.2, textAlign: "center" }, trimSubheading: { color: "#8FA4C6", fontSize: 11, textAlign: "center", marginTop: -8 }, trimPreviewStage: { width: "100%", height: 250, backgroundColor: "#03070D", borderRadius: 14, overflow: "hidden", alignSelf: "center" }, trimPreviewVideo: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#03070D" }, trimTimingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, trimTime: { color: "#D9E8FF", fontSize: 11, fontVariant: ["tabular-nums"] }, trimDuration: { color: "#67E7FF", fontWeight: "800", fontSize: 11 }, trimFilmstrip: { height: 72, borderRadius: 10, overflow: "hidden", flexDirection: "row", backgroundColor: "#14233B", position: "relative" }, trimThumbnail: { flex: 1, height: "100%" }, trimFilmstripFallback: { flex: 1, backgroundColor: "#1B3150" }, trimSelectedRange: { position: "absolute", top: 0, bottom: 0, borderWidth: 2, borderColor: "#69E9FF", backgroundColor: "rgba(76, 212, 255, 0.12)" }, trimPlayhead: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#FFFFFF" }, trimControl: { gap: 4 }, trimLabel: { color: "#BFD1EF", fontSize: 10, fontWeight: "800", letterSpacing: 0.7 }, trimRange: { width: "100%", height: 24 }, trimPreparing: { alignItems: "center", gap: 7, paddingVertical: 8 }, trimError: { flexDirection: "row", gap: 8, alignItems: "center", padding: 10, backgroundColor: "rgba(125, 30, 58, 0.32)", borderWidth: 1, borderColor: "rgba(255, 132, 161, 0.48)", borderRadius: 10 }, trimActions: { flexDirection: "row", gap: 10, marginTop: 4 }, trimCancelButton: { flex: 1, height: 46, borderWidth: 1, borderColor: "rgba(150, 179, 222, 0.5)", alignItems: "center", justifyContent: "center", borderRadius: 12 }, trimCancelText: { color: "#D6E4FA", fontSize: 11, fontWeight: "900", letterSpacing: 0.6 }, trimUseButton: { flex: 1, height: 46, backgroundColor: "#64E8FF", alignItems: "center", justifyContent: "center", borderRadius: 12 }, trimUseText: { color: "#06101B", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  sourceOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.58)", justifyContent: "flex-end" }, sourceSheet: { backgroundColor: "#0D182B", borderTopWidth: 1, borderColor: "rgba(98,230,255,0.5)", padding: 20, gap: 8 }, sourceTitle: { color: "#B9F6FF", fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: 6 }, sourceOption: { height: 54, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, backgroundColor: "#12233E" }, sourceOptionText: { color: "#EFFAFF", fontWeight: "700", fontSize: 14 },
})
