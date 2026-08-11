import React, { useEffect, useRef } from "react"
import { Modal, View, Text, StyleSheet, Animated, Easing } from "react-native"
import { Ionicons } from "@expo/vector-icons"

interface TicketCreationProgressProps {
  visible: boolean
  currentStep: number // 0..4 (index of the step currently executing)
  completed: boolean
  deliveryEmail: string
}

const ACCENT = "#00D4FF"
const SUCCESS = "#2BD576"
const MUTED = "#5A5A6E"
const LINE_ACTIVE = "#00D4FF"
const LINE_MUTED = "#2A2A3A"

export const TicketCreationProgress: React.FC<TicketCreationProgressProps> = ({
  visible,
  currentStep,
  completed,
  deliveryEmail,
}) => {
  const pulse = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0)).current
  const barFill = useRef(new Animated.Value(0)).current

  const steps = [
    "Creating ticket…",
    "Saving ticket…",
    "Generating ticket email…",
    `Sending email to ${deliveryEmail}…`,
    `Ticket successfully delivered to ${deliveryEmail}.`,
  ]

  // Animate the progress bar fill to the current step.
  useEffect(() => {
    const target = completed ? 100 : ((Math.min(currentStep, steps.length - 1) + 1) / steps.length) * 100
    Animated.timing(barFill, {
      toValue: target,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [currentStep, completed, barFill, steps.length])

  // Pulse the active node + glow ring.
  useEffect(() => {
    if (visible && !completed) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      )
      const glowLoop = Animated.loop(
        Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      )
      loop.start()
      glowLoop.start()
      return () => {
        loop.stop()
        glowLoop.stop()
      }
    }
    return () => {}
  }, [visible, completed, pulse, glow])

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] })
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] })

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoDot}>
              <Ionicons name="ticket" size={20} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Creating Your Ticket</Text>
              <Text style={styles.subtitle}>Securing your spot… one step at a time</Text>
            </View>
          </View>

          {/* Timeline */}
          <View style={styles.timeline}>
            {steps.map((label, i) => {
              const done = i < currentStep || completed
              const active = i === currentStep && !completed
              return (
                <View key={i} style={styles.stepRow}>
                  {/* Node + connector */}
                  <View style={styles.stepRail}>
                    <View style={styles.node}>
                      {done ? (
                        <View style={[styles.nodeDone, active && styles.nodeActive]}>
                          <Ionicons name="checkmark" size={14} color="#06121a" />
                        </View>
                      ) : active ? (
                        <>
                          <Animated.View style={[styles.glowRing, { opacity: glowOpacity, transform: [{ scale }] }]} />
                          <View style={[styles.nodeActive, styles.nodeActiveCore]}>
                            <View style={styles.nodeInnerDot} />
                          </View>
                        </>
                      ) : (
                        <View style={styles.nodePending} />
                      )}
                    </View>
                    {i < steps.length - 1 && (
                      <View style={[styles.connector, i < currentStep || completed ? styles.connectorActive : styles.connectorMuted]} />
                    )}
                  </View>

                  {/* Label */}
                  <Text
                    style={[
                      styles.stepLabel,
                      done && styles.stepLabelDone,
                      active && styles.stepLabelActive,
                    ]}
                    numberOfLines={2}
                  >
                    {label}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: barFill.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
          </View>
          <Text style={styles.progressText}>
            {completed ? "Done" : `${Math.round((Math.min(currentStep, steps.length - 1) + 1) / steps.length * 100)}%`}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,16,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "rgba(18,22,38,0.96)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.25)",
    padding: 22,
    shadowColor: ACCENT,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  logoDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,212,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.4)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "#7E7E96",
    fontSize: 12,
    marginTop: 2,
  },
  timeline: {
    marginBottom: 18,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepRail: {
    alignItems: "center",
    width: 28,
  },
  node: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeActive: {
    backgroundColor: ACCENT,
  },
  nodeActiveCore: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#06121a",
    alignItems: "center",
    justifyContent: "center",
  },
  nodeInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  glowRing: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ACCENT,
  },
  nodePending: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: MUTED,
  },
  connector: {
    width: 3,
    height: 26,
    borderRadius: 2,
    marginTop: 2,
  },
  connectorActive: {
    backgroundColor: LINE_ACTIVE,
  },
  connectorMuted: {
    backgroundColor: LINE_MUTED,
  },
  stepLabel: {
    flex: 1,
    color: "#8B8BA3",
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 4,
    paddingLeft: 8,
  },
  stepLabelDone: {
    color: "#D0D0E0",
  },
  stepLabelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#232338",
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  progressText: {
    color: "#7E7E96",
    fontSize: 12,
    textAlign: "right",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
})
