import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DISCOVERY_COUNTRIES, type CountrySelection, type CountryCode } from '../config/countries';
import { useCountry } from '../contexts/CountryContext';

type CountrySelectorProps = {
  value?: CountryCode;
  onSelect?: (country: CountryCode) => void;
  disabled?: boolean;
};

export default function CountrySelector(props: CountrySelectorProps = {}) {
  const discovery = useCountry();
  const country = props.value ?? discovery.country;
  const choices = props.onSelect ? DISCOVERY_COUNTRIES : [{ code: "ALL" as const, name: "All countries" }, ...DISCOVERY_COUNTRIES];
  const [open, setOpen] = useState(false);
  const choose = (code: CountrySelection) => { if (props.onSelect) { if (code !== "ALL") props.onSelect(code); } else discovery.selectCountry(code); setOpen(false); };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose country, currently ${country}`}
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        disabled={props.disabled}
        onPress={() => setOpen(true)}
        style={[styles.button, props.disabled && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{country === 'ALL' ? 'All' : country} ▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.title}>Choose a country</Text>
            <ScrollView>
              {choices.map((item) => (
                <Pressable key={item.code} accessibilityRole="button" accessibilityState={{ selected: country === item.code }} onPress={() => choose(item.code)} style={styles.option}>
                  <Text style={styles.optionText}>{item.code === 'ALL' ? item.name : `${item.code} — ${item.name}`}{country === item.code ? ' ✓' : ''}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.option}><Text style={styles.optionText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { borderColor: '#00D4FF', borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 6, marginRight: 7 },
  buttonDisabled: { opacity: 0.72 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#1A1A2E', borderRadius: 14, padding: 16, maxHeight: '80%', width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  option: { paddingVertical: 12, paddingHorizontal: 6 },
  optionText: { color: '#FFFFFF', fontSize: 16 },
});
