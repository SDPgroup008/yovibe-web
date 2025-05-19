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

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password")
      return
    }

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
      Alert.alert("Login Failed", error instanceof Error ? error.message : "Failed to login")
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
          <Text style={styles.tagline}>Find Your Perfect Night Out</Text>
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
              secureTextEntry
            />
          </View>

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
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
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

export default LoginScreen
