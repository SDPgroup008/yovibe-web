import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { AuthProvider } from './contexts/AuthContext'; // Adjust path as needed
import LoginScreen from './screens/LoginScreen'; // Adjust path as needed

// Web-specific App component
export default function App() {
  // Force the app to show the login screen on web
  useEffect(() => {
    // Any web-specific initialization can go here
    console.log('Web app initialized');
  }, []);

  return (
    <View style={styles.container}>
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
});