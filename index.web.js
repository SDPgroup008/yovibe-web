// This is a web-specific entry point
import './polyfills';
import { AppRegistry, Platform } from 'react-native';
import App from './App'; // Your main App component

// Register the app
AppRegistry.registerComponent('YoVibe', () => App);

// Web-specific setup
if (Platform.OS === 'web') {
  const rootTag = document.getElementById('root');
  AppRegistry.runApplication('YoVibe', { rootTag });
}