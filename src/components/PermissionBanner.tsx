import React from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';

interface PermissionBannerProps {
  onAllow: () => void;
  onBlock: () => void;
}

const PermissionBanner: React.FC<PermissionBannerProps> = ({ onAllow, onBlock }) => {
  const slideAnim = React.useRef(new Animated.Value(-100)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleAction = (callback: () => void) => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      callback();
    });
  };

  return (
    <Animated.View style={[styles.permissionBanner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.permissionContent}>
        <Text style={styles.permissionTitle}>📢 Stay Updated!</Text>
        <Text style={styles.permissionBody}>Enable notifications to get updates about events and vibes</Text>
      </View>
      <View style={styles.permissionActions}>
        <TouchableOpacity onPress={() => handleAction(onBlock)} style={styles.blockButton}>
          <Text style={styles.blockButtonText}>Block</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleAction(onAllow)} style={styles.allowButton}>
          <Text style={styles.allowButtonText}>Allow</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default PermissionBanner;