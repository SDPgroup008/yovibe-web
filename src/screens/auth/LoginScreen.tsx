"use client"

import type React from "react"
import { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ImageBackground,
  Platform,
} from "react-native"
import { useAuth } from "../../contexts/AuthContext"
import { Ionicons } from "@expo/vector-icons"

interface LoginScreenProps {
  navigation: any
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{
    email?: string
    password?: string
  }>({})

  const handleLogin = async () => {
    // Reset errors
    const newErrors: {
      email?: string
      password?: string
    } = {}

    // Validate fields
    if (!email.trim()) {
      newErrors.email = "Please enter your email"
    }
    if (!password.trim()) {
      newErrors.password = "Please enter your password"
    }

    // If there are errors, display them and highlight fields
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      const errorMessages = Object.values(newErrors).join("\n")
      if (Platform.OS === "web") {
        alert(`Form Errors\n${errorMessages}`)
      } else {
        Alert.alert("Form Errors", errorMessages)
      }
      return
    }

    // Clear errors if validation passes
    setErrors({})
    setLoading(true)
    try {
      console.log("Login attempt with:", email)
      await signIn(email, password)
      console.log("Login successful")
      // Navigate to main app after successful login
      navigation.reset({
        index: 0,
        routes: [{ name: "Main" }],
      })
      // The AuthContext will handle navigation
    } catch (error) {
      console.error("Login failed:", error)
      // Log the full error object to debug
      console.log("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        code: (error as any).code,
        error: error,
      })
      // Check for invalid credential errors (Firebase or generic)
      const errorCode = (error as any).code
      if (
        errorCode === "auth/invalid-credential" ||
        errorCode === "auth/invalid-email" ||
        errorCode === "auth/wrong-password" ||
        errorCode === "auth/user-not-found" ||
        (typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as any).message === "string" &&
          ((error as any).message.toLowerCase().includes("invalid email") ||
            (error as any).message.toLowerCase().includes("invalid password") ||
            (error as any).message.toLowerCase().includes("incorrect")))
      ) {
        if (Platform.OS === "web") {
          alert("Login Failed\nIncorrect email or password")
        } else {
          Alert.alert("Login Failed", "Incorrect email or password")
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : "Failed to login"
        if (Platform.OS === "web") {
          alert(`Login Failed\n${errorMessage}`)
        } else {
          Alert.alert("Login Failed", errorMessage)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ImageBackground
      source={{
        uri: "https://images.unsplash.com/photo-1571204829887-3b8d69e23af5?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
      }}
      style={styles.container}
    >
      <View style={styles.overlay}>
        <View style={styles.logoContainer}>
          <Text style={styles.title}>
            <Text style={styles.titleRed}>Yo</Text>Vibe
          </Text>
          <Text style={styles.tagline}>Find Your Next Vibe Plot Now</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.labelContainer}>
            <Text style={styles.label}>Email *</Text>
            {errors.email && <Text style={styles.errorStar}>*</Text>}
          </View>
          <View style={[styles.inputContainer, errors.email && styles.errorInput]}>
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
          {errors.email && <Text style={styles.errorText}>Please enter your email</Text>}

          <View style={styles.labelContainer}>
            <Text style={styles.label}>Password *</Text>
            {errors.password && <Text style={styles.errorStar}>*</Text>}
          </View>
          <View style={[styles.inputContainer, errors.password && styles.errorInput]}>
            <Ionicons name="lock-closed-outline" size={22} color="#FFFFFF" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          {errors.password && <Text style={styles.errorText}>Please enter your password</Text>}

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.buttonText}>Login</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={styles.buttonIcon} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("SignUp")} style={styles.signupButton}>
            <Text style={styles.signupText}>
              Don't have an account? <Text style={styles.signupTextBold}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 20,
    justifyContent: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
    marginBottom: 10,
  },
  titleRed: {
    color: "#FF3B30",
  },
  tagline: {
    fontSize: 18,
    color: "#FFFFFF",
    opacity: 0.8,
  },
  formContainer: {
    backgroundColor: "rgba(30, 30, 30, 0.8)",
    borderRadius: 15,
    padding: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  errorStar: {
    fontSize: 16,
    color: "#FF3B30",
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#FF3B30",
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  errorInput: {
    borderColor: "#FF3B30",
  },
  inputIcon: {
    padding: 15,
  },
  input: {
    flex: 1,
    height: 55,
    color: "#FFFFFF",
    fontSize: 16,
  },
  button: {
    flexDirection: "row",
    backgroundColor: "#FF3B30",
    height: 55,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: 10,
  },
  signupButton: {
    alignItems: "center",
  },
  signupText: {
    color: "#BBBBBB",
    fontSize: 16,
  },
  signupTextBold: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
})

export default LoginScreen  git push origin main