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

const styles = StyleSheet.create({
  permissionBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#121212',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#FF3B30',
  },
  permissionContent: {
    flex: 1,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  permissionBody: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  permissionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  blockButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  blockButtonText: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  allowButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  allowButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});