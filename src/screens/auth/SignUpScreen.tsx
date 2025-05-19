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
  ScrollView,
  ActivityIndicator,
  ImageBackground,
} from "react-native"
import { useAuth } from "../../contexts/AuthContext"
import type { UserType } from "../../models/User"
import { Ionicons } from "@expo/vector-icons"

interface SignUpScreenProps {
  navigation: any
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation }) => {
  const { signUp } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [userType, setUserType] = useState<UserType>("user")
  const [loading, setLoading] = useState(false)
  const [adminDotsPressed, setAdminDotsPressed] = useState(0)

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password")
      return
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters")
      return
    }

    setLoading(true)
    try {
      console.log("Sign up attempt with:", email, "as", userType)
      await signUp(email, password, userType)
      console.log("Sign up successful")
      // Navigate to main app after successful signup
      navigation.reset({
        index: 0,
        routes: [{ name: "Main" }],
      })
      // The AuthContext will handle navigation
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
                secureTextEntry
              />
            </View>

            <Text style={styles.accountTypeLabel}>Account Type:</Text>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.typeButton, userType === "user" && styles.selectedButton]}
                onPress={() => setUserType("user")}
              >
                <Ionicons name="person" size={20} color={userType === "user" ? "#FFFFFF" : "#BBBBBB"} />
                <Text style={[styles.typeButtonText, userType === "user" && styles.selectedButtonText]}>
                  Regular User
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, userType === "club_owner" && styles.selectedButton]}
                onPress={() => setUserType("club_owner")}
              >
                <Ionicons name="business" size={20} color={userType === "club_owner" ? "#FFFFFF" : "#BBBBBB"} />
                <Text style={[styles.typeButtonText, userType === "club_owner" && styles.selectedButtonText]}>
                  Club Owner
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Sign Up</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={styles.buttonIcon} />
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
    padding: 20,
    justifyContent: "center",
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 30,
    position: "relative",
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: "#BBBBBB",
  },
  adminDotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    width: 20,
    marginBottom: 5,
  },
  adminDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: 2,
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
  accountTypeLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 10,
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 10,
    marginHorizontal: 5,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  selectedButton: {
    backgroundColor: "#FF3B30",
    borderColor: "#FF3B30",
  },
  typeButtonText: {
    color: "#BBBBBB",
    fontSize: 14,
    marginLeft: 5,
  },
  selectedButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
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
  loginButton: {
    alignItems: "center",
  },
  loginText: {
    color: "#BBBBBB",
    fontSize: 16,
  },
  loginTextBold: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
})

export default SignUpScreen
