import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SEOMetadata } from '../components/SEOMetadata';

const CONTACT_EMAIL = 'reinolmartin0001@gmail.com';
const CONTACT_PHONE = '+256764336256';

const publicLinks = [
  { label: 'Events', href: '/events' },
  { label: 'Venues', href: '/venues' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Map', href: '/map' },
];

const webLinkStyle = { color: '#00D4FF', fontSize: 15, fontWeight: '600', textDecoration: 'none' };

type PublicInfoScreenProps = { page: 'about' | 'contact' };

export const PublicInfoScreen: React.FC<PublicInfoScreenProps> = ({ page }) => {
  const isContact = page === 'contact';
  const title = isContact ? 'Contact YoVibe' : 'About YoVibe';
  const description = isContact
    ? 'Contact YoVibe for help discovering events, venues, and event tickets in Uganda.'
    : 'Learn how YoVibe helps people discover events, concerts, parties, nightlife, and venues across Uganda.';

  const open = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SEOMetadata
        title={title}
        description={description}
        keywords={isContact ? ['contact', 'event support', 'Uganda tickets'] : ['about', 'Uganda events', 'nightlife']}
        url={`https://yovibe.net/${page}`}
      />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>YoVibe</Text>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {isContact ? (
          <>
            <Text style={styles.copy}>Get in touch with the YoVibe team for help with events, venues, and tickets.</Text>
            <Pressable accessibilityRole="link" onPress={() => open(`mailto:${CONTACT_EMAIL}`)} style={styles.contactLink}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>{CONTACT_EMAIL}</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => open(`tel:${CONTACT_PHONE}`)} style={styles.contactLink}>
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>{CONTACT_PHONE}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.copy}>YoVibe helps people discover and buy tickets for events, concerts, parties, and nightlife across Uganda.</Text>
            <Text style={styles.copy}>Explore what is happening, find the places behind the vibe, and plan your next night out.</Text>
          </>
        )}
        <View style={styles.linkRow} accessibilityLabel="YoVibe public navigation">
          {publicLinks.map((link) => Platform.OS === 'web'
            ? React.createElement('a', { key: link.href, href: link.href, style: webLinkStyle }, link.label)
            : <Pressable key={link.href} accessibilityRole="link" onPress={() => open(`https://yovibe.net${link.href}`)}><Text style={styles.nativeLink}>{link.label}</Text></Pressable>)}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#121212', padding: 24, justifyContent: 'center' },
  card: { width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: '#1d1d1d', borderRadius: 16, padding: 28, borderWidth: 1, borderColor: 'rgba(33, 150, 243, 0.3)' },
  eyebrow: { color: '#00D4FF', fontWeight: '700', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  title: { color: '#fff', fontSize: 32, fontWeight: '700', marginBottom: 16 },
  copy: { color: '#d5d5d5', fontSize: 16, lineHeight: 24, marginBottom: 14 },
  contactLink: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  contactLabel: { color: '#a0a0a0', fontSize: 13, marginBottom: 4 },
  contactValue: { color: '#00D4FF', fontSize: 16, fontWeight: '600' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  nativeLink: { color: '#00D4FF', fontSize: 15, fontWeight: '600' },
});
