import React from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';

interface NotificationBannerProps {
  title: string;
  body: string;
  onClose: () => void;
}

const NotificationBanner: React.FC<NotificationBannerProps> = ({ title, body, onClose }) => {
  const slideAnim = React.useRef(new Animated.Value(-100)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      handleClose();
    }, 15000);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      <TouchableOpacity onPress={handleClose} style={styles.bannerClose}>
        <Text style={styles.bannerCloseText}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default NotificationBanner;