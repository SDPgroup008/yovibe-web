import './polyfills';
import React from 'react';
import { AppRegistry, View, Text, StyleSheet, Platform } from 'react-native';
import App from './App'; // Your regular App component

// Fallback component in case the main app fails to render
const FallbackApp = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Welcome to YoVibe</Text>
    <Text style={styles.subtitle}>
      Your ultimate nightlife discovery platform
    </Text>
    <Text style={styles.message}>
      For the best experience, please download our mobile app where you can browse events, purchase tickets, and more.
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#cccccc',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#aaaaaa',
    textAlign: 'center',
  },
});

// Register the app
AppRegistry.registerComponent('YoVibe', () => App);

// Register the fallback app
AppRegistry.registerComponent('YoVibeFallback', () => FallbackApp);

// Initialize the app for web
if (Platform.OS === 'web' && typeof window !== 'undefined' && window.document) {
  try {
    AppRegistry.runApplication('YoVibe', {
      rootTag: document.getElementById('root')
    });
  } catch (error) {
    console.error('Failed to run main app:', error);
    // Run fallback if main app fails
    try {
      AppRegistry.runApplication('YoVibeFallback', {
        rootTag: document.getElementById('root')
      });
    } catch (fallbackError) {
      console.error('Failed to run fallback app:', fallbackError);
      // If all else fails, show the fallback HTML
      if (document.getElementById('fallback')) {
        document.getElementById('fallback').style.display = 'flex';
        if (document.querySelector('.loading')) {
          document.querySelector('.loading').style.display = 'none';
        }
      }
    }
  }
}