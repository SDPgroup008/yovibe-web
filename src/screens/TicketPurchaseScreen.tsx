import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { VenuesStackParamList } from '../navigation/types'
import firebaseService from '../services/FirebaseService'

type Props = NativeStackScreenProps<VenuesStackParamList, 'TicketPurchase'>

export default function TicketPurchaseScreen({ route, navigation }: Props) {
  const { event } = route.params
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)

  const handlePurchase = async () => {
    try {
      setLoading(true)
      
      // Get current user
      const currentUser = await firebaseService.getCurrentUser()
      if (!currentUser) {
        Alert.alert('Error', 'Please sign in to purchase tickets')
        return
      }

      const totalAmount = parseFloat(event.entryFee || '0') * quantity
      const appCommission = totalAmount * 0.1 // 10% commission
      const venueRevenue = totalAmount - appCommission

      // Create ticket object
      const ticket = {
        id: `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventId: event.id,
        eventName: event.name,
        buyerId: currentUser.id,
        buyerName: currentUser.displayName || currentUser.email,
        buyerEmail: currentUser.email,
        quantity,
        totalAmount,
        venueRevenue,
        appCommission,
        purchaseDate: new Date(),
        qrCode: `QR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        biometricHash: '', // Will be set during validation
        status: 'active' as const,
        validationHistory: [],
      }

      // Save ticket to Firebase
      await firebaseService.saveTicket(ticket)

      Alert.alert(
        'Success!', 
        `Your ticket has been purchased successfully!\nTicket ID: ${ticket.id}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      )
    } catch (error) {
      console.error('Error purchasing ticket:', error)
      Alert.alert('Error', 'Failed to purchase ticket. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const totalPrice = parseFloat(event.entryFee || '0') * quantity

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Purchase Ticket</Text>
      </View>

      <View style={styles.eventInfo}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.venueName}>{event.venueName}</Text>
        <Text style={styles.eventDate}>
          {new Date(event.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        <Text style={styles.location}>{event.location}</Text>
      </View>

      <View style={styles.ticketDetails}>
        <Text style={styles.sectionTitle}>Ticket Details</Text>
        
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Price per ticket:</Text>
          <Text style={styles.priceValue}>UGX {event.entryFee}</Text>
        </View>

        <View style={styles.quantitySection}>
          <Text style={styles.quantityLabel}>Quantity:</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(quantity + 1)}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total Amount:</Text>
          <Text style={styles.totalValue}>UGX {totalPrice.toLocaleString()}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.purchaseButton, loading && styles.purchaseButtonDisabled]}
        onPress={handlePurchase}
        disabled={loading}
      >
        <Text style={styles.purchaseButtonText}>
          {loading ? 'Processing...' : 'Purchase Ticket'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  eventInfo: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  eventName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  venueName: {
    fontSize: 16,
    color: '#ccc',
    marginBottom: 5,
  },
  eventDate: {
    fontSize: 14,
    color: '#999',
    marginBottom: 5,
  },
  location: {
    fontSize: 14,
    color: '#999',
  },
  ticketDetails: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  priceLabel: {
    fontSize: 16,
    color: '#ccc',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  quantitySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  quantityLabel: {
    fontSize: 16,
    color: '#ccc',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 40,
    height: 40,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  quantityButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  quantityText: {
    fontSize: 18,
    color: '#fff',
    marginHorizontal: 20,
    fontWeight: 'bold',
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  purchaseButton: {
    backgroundColor: '#4CAF50',
    margin: 20,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  purchaseButtonDisabled: {
    backgroundColor: '#666',
  },
  purchaseButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
})
