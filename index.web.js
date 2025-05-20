import './polyfills';
import React from 'react';
import { AppRegistry, View, Text, StyleSheet } from 'react-native';
import App from './App'; // Your regular App component

// Fallback component in case the main app fails to render
const FallbackApp = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Welcome to YoVibe</Text>
    <Text style={styles.subtitle}>
      We're experiencing some technical difficulties with the web version.
    </Text>
    <Text style={styles.message}>
      Please try again later or download our mobile app for the full experience.
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
  },
});

// Register the app
AppRegistry.registerComponent('YoVibe', () => App);

// Register the fallback app
AppRegistry.registerComponent('YoVibeFallback', () => FallbackApp);

// Initialize the app for web
if (window.document) {
  try {
    AppRegistry.runApplication('YoVibe', {
      rootTag: document.getElementById('root')
    });
  } catch (error) {
    console.error('Failed to run main app:', error);
    // Run fallback if main app fails
    AppRegistry.runApplication('YoVibeFallback', {
      rootTag: document.getElementById('root')
    });
  }
}