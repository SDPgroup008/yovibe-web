import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SEOMetadata } from '../components/SEOMetadata';

const capabilities = [
  {
    icon: '01',
    title: 'Find your next vibe',
    copy: 'Explore upcoming concerts, parties, nightlife, and community events across Uganda.',
  },
  {
    icon: '02',
    title: 'Know the place',
    copy: 'Discover venues, see what is happening there, and make plans with the people you enjoy.',
  },
  {
    icon: '03',
    title: 'Buy or sell with ease',
    copy: 'Get tickets for the moments you want, or share your own events with the people looking for them.',
  },
  {
    icon: '04',
    title: 'Plan with confidence',
    copy: 'Keep event details, dates, locations, and ticket information together before you go.',
  },
];

/** Public, indexable About page. Contact remains in Profile > Help & Support. */
export const PublicInfoScreen: React.FC = () => (
  <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
    <SEOMetadata
      title="About YoVibe"
      description="YoVibe is your No.1 ticketing platform for discovering venues, upcoming events, nightlife, and the vibe across Uganda, while making it easy to buy and sell tickets."
      keywords={['YoVibe ticketing platform', 'buy tickets', 'sell tickets', 'Uganda events', 'venues', 'event discovery']}
      url="https://yovibe.net/about"
    />

    <View style={styles.heroGlow} pointerEvents="none" />
    <View style={styles.hero}>
      <View style={styles.brandRow}>
        <View style={styles.logoFrame}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <View>
          <Text style={styles.brandName}>YoVibe</Text>
          <Text style={styles.brandTag}>YOUR NO.1 TICKETING PLATFORM</Text>
        </View>
      </View>

      <Text style={styles.eyebrow}>ABOUT THE PLATFORM</Text>
      <Text style={styles.title} accessibilityRole="header">Find the moments{ '\n' }that move you.</Text>
      <Text style={styles.lede}>
        YoVibe is your No.1 ticketing platform—a place to discover venues, upcoming events, and the vibe around you, while making it easy to buy and sell tickets. Explore Uganda’s events in one clear, easy-to-use place so you can spend less time searching and more time being there.
      </Text>
      <View style={styles.signalRow} accessibilityLabel="YoVibe event discovery platform">
        <View style={styles.signalDot} />
        <Text style={styles.signalText}>LIVE EVENT DISCOVERY · UGANDA</Text>
      </View>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionKicker}>BUILT FOR THE MOMENT</Text>
      <Text style={styles.sectionTitle}>Discover venues, events, and your vibe.</Text>
      <Text style={styles.sectionCopy}>
        From a spontaneous night out to a carefully planned weekend, YoVibe helps you see what is on, where it is happening, and what makes it worth showing up for.
      </Text>

      <View style={styles.capabilityGrid}>
        {capabilities.map((item) => (
          <View key={item.icon} style={styles.capabilityCard}>
            <Text style={styles.capabilityNumber}>{item.icon}</Text>
            <Text style={styles.capabilityTitle}>{item.title}</Text>
            <Text style={styles.capabilityCopy}>{item.copy}</Text>
          </View>
        ))}
      </View>
    </View>

    <View style={styles.footerCard}>
      <Text style={styles.footerKicker}>THE YO VIBE</Text>
      <Text style={styles.footerTitle}>Show up for something good.</Text>
      <Text style={styles.footerCopy}>
        YoVibe is for the artists, organisers, venues, and curious people who make Uganda’s culture feel alive.
      </Text>
    </View>
  </ScrollView>
);

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#070B16', paddingHorizontal: 20, paddingVertical: 28 },
  heroGlow: { position: 'absolute', top: -120, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(0, 212, 255, 0.13)' },
  hero: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 28, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(91, 213, 255, 0.28)', backgroundColor: 'rgba(17, 27, 49, 0.92)', shadowColor: '#00D4FF', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 54 },
  logoFrame: { width: 54, height: 54, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(111, 230, 255, 0.7)', backgroundColor: 'rgba(0, 212, 255, 0.12)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  logo: { width: 42, height: 42 },
  brandName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  brandTag: { color: '#79DFFF', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 3 },
  eyebrow: { color: '#6FE6FF', fontSize: 11, fontWeight: '800', letterSpacing: 2.2, marginBottom: 14 },
  title: { color: '#FFFFFF', fontSize: 46, lineHeight: 53, fontWeight: '800', letterSpacing: -1.2, marginBottom: 18 },
  lede: { color: '#C8D7EA', fontSize: 17, lineHeight: 27, maxWidth: 680 },
  signalRow: { flexDirection: 'row', alignItems: 'center', marginTop: 30 },
  signalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#60F0B2', marginRight: 9 },
  signalText: { color: '#93A9C5', fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
  section: { width: '100%', maxWidth: 920, alignSelf: 'center', paddingVertical: 52 },
  sectionKicker: { color: '#6FE6FF', fontSize: 11, fontWeight: '800', letterSpacing: 2.1, marginBottom: 12 },
  sectionTitle: { color: '#FFFFFF', fontSize: 30, lineHeight: 38, fontWeight: '800', marginBottom: 12 },
  sectionCopy: { color: '#A8B9D0', fontSize: 16, lineHeight: 25, maxWidth: 700, marginBottom: 26 },
  capabilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  capabilityCard: { flexGrow: 1, flexBasis: 220, minHeight: 170, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(128, 157, 198, 0.2)', backgroundColor: 'rgba(20, 32, 57, 0.72)' },
  capabilityNumber: { color: '#6FE6FF', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 26 },
  capabilityTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 9 },
  capabilityCopy: { color: '#A8B9D0', fontSize: 14, lineHeight: 21 },
  footerCard: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 26, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(162, 103, 255, 0.3)', backgroundColor: 'rgba(47, 29, 84, 0.42)', marginBottom: 18 },
  footerKicker: { color: '#D4B7FF', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  footerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  footerCopy: { color: '#CFC7E6', fontSize: 15, lineHeight: 23 },
});

export default PublicInfoScreen;
