import "react-native-get-random-values"
import React, { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  ImageBackground,
  Dimensions,
} from "react-native"
import { useAuth } from "../../contexts/AuthContext"
import type { UserType } from "../../models/User"
import { Ionicons } from "@expo/vector-icons"
import { useCompatNavigation } from "../../utils/compatNavigation"
import { supabase } from "../../config/supabase"

// Responsive breakpoints for signup screen
const { width } = Dimensions.get('window');
const isSmallDevice = width < 380;
const isTablet = width >= 768;
const isLargeScreen = width >= 1024;

console.log("[v0] SignUpScreen responsiveness initialized - Screen width:", width, "px | Device type:", isLargeScreen ? "Large/Desktop" : isTablet ? "Tablet" : "Mobile");

// Responsive helper function for signup screen
const responsiveSize = (small: number, medium: number, large: number) => {
  if (isLargeScreen) return large;
  if (isTablet) return medium;
  return small;
};

interface SignUpScreenProps {
  navigation: any
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation: propNavigation }) => {
  const navigation = useCompatNavigation()
  const { signUp, consumeRedirectIntent, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [userType, setUserType] = useState<UserType>("regular_user")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [adminDotsPressed, setAdminDotsPressed] = useState(0)
  const [termsAgreed, setTermsAgreed] = useState(false)

  // visibility toggles for password fields
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert("Error", "Please enter email, password and confirm password")
      return
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters")
      return
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match")
      return
    }

    setLoading(true)
    try {
      console.log("Sign up attempt with:", email, "as", userType)
      await signUp(email, password, userType)

      // Check if user was signed in immediately (confirmation disabled or already confirmed)
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        console.log("Sign up successful - user is signed in")

        // Handle redirect intent (e.g. user clicked Add Event / Add Venue while logged out)
        const redirectIntent = consumeRedirectIntent()
        if (redirectIntent?.routeName) {
          navigation.navigate(redirectIntent.routeName as any, redirectIntent.params || {})
        } else {
          navigation.navigate("Events")
        }
      } else {
        // Fallback: user might need to log in manually (rare now that confirmation is disabled)
        console.log("Sign up successful but no active session")
        Alert.alert(
          "Account Created",
          "Please log in with your new credentials to continue."
        )
        navigation.navigate("Login")
      }
    } catch (error) {
      console.error("Sign up failed:", error)
      Alert.alert("Sign Up Failed", error instanceof Error ? error.message : "Failed to create account")
    } finally {
      setLoading(false)
    }
  }

  const handleAdminDotPress = () => {
    const newCount = adminDotsPressed + 1
    setAdminDotsPressed(newCount)

    if (newCount === 5) {
      setUserType("admin")
      Alert.alert("Admin Mode", "Admin account type selected")
    }
  }

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      Alert.alert("Error", "Failed to sign in with Google. Please try again.")
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollView}>
      <ImageBackground
        source={{
          uri: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
        }}
        style={styles.container}
      >
        <View style={styles.overlay}>
          <View style={styles.headerContainer}>
            <Text style={styles.title}>Create Account</Text>
            <TouchableOpacity onPress={handleAdminDotPress} style={styles.adminDotsContainer}>
              <View style={styles.adminDot} />
              <View style={styles.adminDot} />
            </TouchableOpacity>
            <Text style={styles.subtitle}>Join the nightlife community</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={22} color="#FFFFFF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={22} color="#FFFFFF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((s) => !s)}
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                style={styles.visibilityToggle}
              >
                <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={22} color="#FFFFFF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((s) => !s)}
                accessibilityLabel={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                style={styles.visibilityToggle}
              >
                <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.accountTypeLabel}>Account Type:</Text>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.typeButton, userType === "regular_user" && styles.selectedButton]}
                onPress={() => setUserType("regular_user")}
              >
                <Ionicons name="person" size={20} color={userType === "regular_user" ? "#FFFFFF" : "#BBBBBB"} />
                <Text style={[styles.typeButtonText, userType === "regular_user" && styles.selectedButtonText]}>
                  Regular User
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, userType === "club_owner" && styles.selectedButton]}
                onPress={() => setUserType("club_owner")}
              >
                <Ionicons name="business" size={20} color={userType === "club_owner" ? "#FFFFFF" : "#BBBBBB"} />
                <Text style={[styles.typeButtonText, userType === "club_owner" && styles.selectedButtonText]}>
                  Venue Owner
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.termsContainer, !termsAgreed && styles.termsContainerInactive]}
              onPress={() => setTermsAgreed(!termsAgreed)}
            >
              <View style={[styles.checkbox, termsAgreed && styles.checkboxActive]}>
                {termsAgreed && (
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                )}
              </View>
              <Text style={[styles.termsText, !termsAgreed && styles.termsTextInactive]}>
                I agree to the{" "}
                <Text
                  style={styles.termsLink}
                  onPress={() => navigation.navigate("TermsAndConditions")}
                >
                  Terms and Conditions
                </Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, !termsAgreed && styles.buttonDisabled]} 
              onPress={handleSignUp} 
              disabled={loading || !termsAgreed}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={[styles.buttonText, !termsAgreed && styles.buttonTextDisabled]}>Sign Up</Text>
                  <Ionicons name="arrow-forward" size={20} color={!termsAgreed ? "#666666" : "#FFFFFF"} style={styles.buttonIcon} />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity 
              style={[styles.googleButton, !termsAgreed && styles.googleButtonDisabled]} 
              onPress={handleGoogleSignIn} 
              disabled={googleLoading || !termsAgreed}
            >
              {googleLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color={!termsAgreed ? "#666666" : "#FFFFFF"} />
                  <Text style={[styles.googleButtonText, !termsAgreed && styles.googleButtonTextDisabled]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate("Login")} style={styles.loginButton}>
              <Text style={styles.loginText}>
                Already have an account? <Text style={styles.loginTextBold}>Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: responsiveSize(16, 24, 40),
    justifyContent: "center",
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: responsiveSize(24, 32, 48),
    position: "relative",
  },
  title: {
    fontSize: responsiveSize(28, 36, 44),
    fontWeight: "bold",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
    marginBottom: responsiveSize(4, 6, 8),
  },
  subtitle: {
    fontSize: responsiveSize(13, 15, 17),
    color: "#BBBBBB",
  },
  adminDotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    width: 20,
    marginBottom: responsiveSize(4, 6, 8),
  },
  adminDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: 2,
  },
  formContainer: {
    backgroundColor: "rgba(30, 30, 30, 0.9)",
    borderRadius: responsiveSize(12, 16, 20),
    padding: responsiveSize(20, 24, 32),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: responsiveSize(8, 10, 14),
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.1)",
    maxWidth: isLargeScreen ? 500 : "100%",
    alignSelf: "center",
    width: "100%",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: responsiveSize(8, 10, 12),
    marginBottom: responsiveSize(14, 16, 18),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  inputIcon: {
    padding: responsiveSize(12, 14, 16),
  },
  input: {
    flex: 1,
    height: responsiveSize(48, 52, 56),
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
  },
  visibilityToggle: {
    paddingHorizontal: responsiveSize(10, 12, 14),
    justifyContent: "center",
    alignItems: "center",
  },
  accountTypeLabel: {
    color: "#FFFFFF",
    fontSize: responsiveSize(14, 15, 16),
    marginBottom: responsiveSize(10, 12, 14),
    fontWeight: "500",
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: responsiveSize(16, 20, 24),
    gap: responsiveSize(8, 10, 12),
  },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: responsiveSize(10, 12, 14),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: responsiveSize(8, 10, 12),
    marginHorizontal: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  selectedButton: {
    backgroundColor: "#FF3B30",
    borderColor: "#FF3B30",
  },
  typeButtonText: {
    color: "#BBBBBB",
    fontSize: responsiveSize(12, 13, 14),
    marginLeft: responsiveSize(4, 6, 8),
    textAlign: "center",
  },
  selectedButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  button: {
    flexDirection: "row",
    backgroundColor: "#FF3B30",
    height: responsiveSize(48, 52, 56),
    borderRadius: responsiveSize(8, 10, 12),
    justifyContent: "center",
    alignItems: "center",
    marginTop: responsiveSize(8, 10, 14),
    marginBottom: responsiveSize(16, 20, 24),
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonDisabled: {
    backgroundColor: "rgba(255, 59, 48, 0.3)",
    shadowOpacity: 0,
  },
  buttonTextDisabled: {
    color: "#666666",
  },
  buttonText: {
    color: "white",
    fontSize: responsiveSize(15, 16, 17),
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: responsiveSize(8, 10, 12),
  },
  loginButton: {
    alignItems: "center",
    paddingVertical: responsiveSize(12, 14, 16),
  },
  loginText: {
    color: "#BBBBBB",
    fontSize: responsiveSize(13, 14, 15),
  },
  loginTextBold: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: responsiveSize(16, 20, 24),
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dividerText: {
    color: "#888888",
    fontSize: responsiveSize(12, 13, 14),
    marginHorizontal: responsiveSize(10, 12, 16),
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4285F4",
    height: responsiveSize(48, 52, 56),
    borderRadius: responsiveSize(8, 10, 12),
    justifyContent: "center",
    alignItems: "center",
    marginTop: responsiveSize(8, 10, 14),
    marginBottom: responsiveSize(16, 20, 24),
    shadowColor: "#4285F4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  googleButtonDisabled: {
    backgroundColor: "rgba(66, 133, 244, 0.3)",
    shadowOpacity: 0,
  },
  googleButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveSize(15, 16, 17),
    fontWeight: "bold",
    marginLeft: responsiveSize(8, 10, 12),
  },
  googleButtonTextDisabled: {
    color: "#666666",
  },
  termsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: responsiveSize(12, 14, 16),
    paddingVertical: responsiveSize(8, 10, 12),
  },
  termsContainerInactive: {
    opacity: 0.7,
  },
  checkbox: {
    width: responsiveSize(24, 28, 32),
    height: responsiveSize(24, 28, 32),
    borderRadius: responsiveSize(4, 6, 8),
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: responsiveSize(12, 14, 16),
  },
  checkboxActive: {
    borderColor: "#FF3B30",
    backgroundColor: "#FF3B30",
  },
  termsText: {
    color: "#CCCCCC",
    fontSize: responsiveSize(13, 14, 15),
    flex: 1,
  },
  termsTextInactive: {
    color: "#888888",
  },
  termsLink: {
    color: "#00D4FF",
    textDecorationLine: "underline",
    fontWeight: "500",
  },
})

export default SignUpScreen
