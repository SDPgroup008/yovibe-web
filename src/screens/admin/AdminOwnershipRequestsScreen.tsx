"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import FirebaseService from "../../services/FirebaseService"
import { useAuth } from "../../contexts/AuthContext"
import type { VenueOwnershipRequest } from "../../models/VenueOwnershipRequest"
import type { AdminOwnershipRequestsScreenProps } from "../../navigation/types"

const AdminOwnershipRequestsScreen: React.FC<AdminOwnershipRequestsScreenProps> = ({ navigation }) => {
  const { user: currentUser } = useAuth()
  const [requests, setRequests] = useState<VenueOwnershipRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<VenueOwnershipRequest | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [reviewNote, setReviewNote] = useState("")
  const [processing, setProcessing] = useState(false)
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all")

  useEffect(() => {
    if (currentUser?.userType !== "admin") {
      Alert.alert("Access Denied", "You don't have permission to access this page")
      navigation.goBack()
      return
    }

    loadRequests()
  }, [currentUser, navigation])

  const loadRequests = async () => {
    try {
      setLoading(true)
      const requestsList = await FirebaseService.getOwnershipRequests()
      setRequests(requestsList)
    } catch (error) {
      console.error("Error loading ownership requests:", error)
      Alert.alert("Error", "Failed to load ownership requests")
    } finally {
      setLoading(false)
    }
  }

  const filteredRequests = requests.filter(req => {
    if (filterStatus === "all") return true
    return req.status === filterStatus
  })

  const handleViewRequest = (request: VenueOwnershipRequest) => {
    setSelectedRequest(request)
    setShowDetailModal(true)
  }

  const handleApprove = () => {
    console.log("[AdminOwnershipRequestsScreen] handleApprove called")
    console.log("[AdminOwnershipRequestsScreen] selectedRequest:", selectedRequest)
    console.log("[AdminOwnershipRequestsScreen] currentUser:", currentUser)
    
    if (!selectedRequest || !currentUser) {
      console.log("[AdminOwnershipRequestsScreen] ERROR: Missing selectedRequest or currentUser")
      Alert.alert("Error", "Missing request or user data")
      return
    }

    // Skip confirmation, go directly to approval
    console.log("[AdminOwnershipRequestsScreen] Starting approval directly...")
    performApproval()
  }

  const performApproval = async () => {
    console.log("[AdminOwnershipRequestsScreen] performApproval started")
    if (!selectedRequest || !currentUser) {
      console.log("[AdminOwnershipRequestsScreen] ERROR: Missing data in performApproval")
      return
    }
    
    setProcessing(true)
    console.log("[AdminOwnershipRequestsScreen] Calling FirebaseService.approveOwnershipRequest...")
    try {
      await FirebaseService.approveOwnershipRequest(
        selectedRequest.id,
        currentUser.id,
        reviewNote
      )
      console.log("[AdminOwnershipRequestsScreen] approveOwnershipRequest completed")
      setShowDetailModal(false)
      setReviewNote("")
      Alert.alert("Success", `You have approved ${selectedRequest.userName}'s request. They are now the owner of ${selectedRequest.venueName}.`)
      loadRequests()
    } catch (error) {
      console.error("[AdminOwnershipRequestsScreen] Error approving request:", error)
      Alert.alert("Error", "Failed to approve request. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = () => {
    console.log("[AdminOwnershipRequestsScreen] handleReject called")
    
    if (!selectedRequest || !currentUser) {
      console.log("[AdminOwnershipRequestsScreen] ERROR: Missing selectedRequest or currentUser")
      Alert.alert("Error", "Missing request or user data")
      return
    }

    // Skip confirmation, go directly to rejection
    console.log("[AdminOwnershipRequestsScreen] Starting rejection directly...")
    performReject()
  }

  const performReject = async () => {
    console.log("[AdminOwnershipRequestsScreen] performReject started")
    if (!selectedRequest || !currentUser) {
      console.log("[AdminOwnershipRequestsScreen] ERROR: Missing data in performReject")
      return
    }

    setProcessing(true)
    console.log("[AdminOwnershipRequestsScreen] Calling FirebaseService.rejectOwnershipRequest...")
    try {
      await FirebaseService.rejectOwnershipRequest(
        selectedRequest.id,
        currentUser.id,
        reviewNote
      )
      console.log("[AdminOwnershipRequestsScreen] rejectOwnershipRequest completed")
      setShowDetailModal(false)
      setReviewNote("")
      Alert.alert("Success", "Ownership request rejected")
      loadRequests()
    } catch (error) {
      console.error("[AdminOwnershipRequestsScreen] Error rejecting request:", error)
      Alert.alert("Error", "Failed to reject request. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "#FFA500"
      case "approved":
        return "#4CAF50"
      case "rejected":
        return "#FF3B30"
      default:
        return "#BBBBBB"
    }
  }

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case "pending":
        return "rgba(255, 165, 0, 0.15)"
      case "approved":
        return "rgba(76, 175, 80, 0.15)"
      case "rejected":
        return "rgba(255, 59, 48, 0.15)"
      default:
        return "rgba(187, 187, 187, 0.15)"
    }
  }

  const renderRequestItem = ({ item }: { item: VenueOwnershipRequest }) => (
    <TouchableOpacity style={styles.requestCard} onPress={() => handleViewRequest(item)}>
      <View style={styles.requestHeader}>
        <View style={styles.venueInfo}>
          <Text style={styles.venueName}>{item.venueName}</Text>
          <Text style={styles.requestDate}>{formatDate(item.requestedAt)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusBgColor(item.status) }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.userInfo}>
        <Ionicons name="person-outline" size={16} color="#BBBBBB" />
        <Text style={styles.userName}>{item.userName}</Text>
      </View>

      <View style={styles.userInfo}>
        <Ionicons name="mail-outline" size={16} color="#BBBBBB" />
        <Text style={styles.userEmail}>{item.userEmail}</Text>
      </View>

      <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.viewButton} onPress={() => handleViewRequest(item)}>
          <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
          <Text style={styles.viewButtonText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading ownership requests...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Ownership Requests</Text>
      <Text style={styles.subHeaderText}>
        {filterStatus === "all" 
          ? `Total Requests: ${requests.length}`
          : `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}: ${filteredRequests.length}`
        }
      </Text>

      <View style={styles.filterContainer}>
        {(["all", "pending", "approved", "rejected"] as const).map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterButton, filterStatus === status && styles.filterButtonActive]}
            onPress={() => setFilterStatus(status)}
          >
            <Text style={[styles.filterButtonText, filterStatus === status && styles.filterButtonTextActive]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequestItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#666666" />
            <Text style={styles.emptyText}>No ownership requests found</Text>
          </View>
        }
      />

      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {selectedRequest && (
              <ScrollView style={styles.modalBody}>
                <View style={[styles.detailStatusBadge, { backgroundColor: getStatusBgColor(selectedRequest.status) }]}>
                  <Text style={[styles.detailStatusText, { color: getStatusColor(selectedRequest.status) }]}>
                    {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                  </Text>
                </View>

                <Text style={styles.detailLabel}>Venue</Text>
                <Text style={styles.detailValue}>{selectedRequest.venueName}</Text>

                <Text style={styles.detailLabel}>Requested By</Text>
                <Text style={styles.detailValue}>{selectedRequest.userName}</Text>

                <Text style={styles.detailLabel}>Email</Text>
                <Text style={styles.detailValue}>{selectedRequest.userEmail}</Text>

                <Text style={styles.detailLabel}>Phone</Text>
                <Text style={styles.detailValue}>{selectedRequest.userPhone}</Text>

                <Text style={styles.detailLabel}>Reason</Text>
                <Text style={styles.detailValue}>{selectedRequest.reason}</Text>

                <Text style={styles.detailLabel}>Experience</Text>
                <Text style={styles.detailValue}>{selectedRequest.experience}</Text>

                <Text style={styles.detailLabel}>Request Date</Text>
                <Text style={styles.detailValue}>{formatDate(selectedRequest.requestedAt)}</Text>

                {selectedRequest.reviewedAt && (
                  <>
                    <Text style={styles.detailLabel}>Review Date</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedRequest.reviewedAt)}</Text>
                  </>
                )}

                {selectedRequest.reviewNote && (
                  <>
                    <Text style={styles.detailLabel}>Review Note</Text>
                    <Text style={styles.detailValue}>{selectedRequest.reviewNote}</Text>
                  </>
                )}

                {selectedRequest.status === "pending" && (
                  <>
                    <Text style={styles.detailLabel}>Review Note (Optional)</Text>
                    <TextInput
                      style={styles.reviewInput}
                      value={reviewNote}
                      onChangeText={setReviewNote}
                      placeholder="Add a note for the user..."
                      placeholderTextColor="#666666"
                      multiline
                      numberOfLines={3}
                    />

                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={[styles.modalActionButton, styles.rejectButton, processing && styles.buttonDisabled]}
                        onPress={handleReject}
                        disabled={processing}
                      >
                        {processing ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="close" size={20} color="#FFFFFF" />
                            <Text style={styles.modalActionText}>Reject</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.modalActionButton, styles.approveButton, processing && styles.buttonDisabled]}
                        onPress={handleApprove}
                        disabled={processing}
                      >
                        {processing ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                            <Text style={styles.modalActionText}>Approve</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 16,
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  subHeaderText: {
    fontSize: 14,
    color: "#BBBBBB",
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
  },
  filterContainer: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#333333",
  },
  filterButtonActive: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  filterButtonText: {
    color: "#BBBBBB",
    fontSize: 13,
    fontWeight: "600",
  },
  filterButtonTextActive: {
    color: "#FFFFFF",
  },
  listContainer: {
    paddingBottom: 16,
  },
  requestCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333333",
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  requestDate: {
    fontSize: 12,
    color: "#888888",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  userName: {
    fontSize: 14,
    color: "#DDDDDD",
    marginLeft: 8,
  },
  userEmail: {
    fontSize: 14,
    color: "#DDDDDD",
    marginLeft: 8,
  },
  reasonText: {
    fontSize: 14,
    color: "#BBBBBB",
    marginTop: 8,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2196F3",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  viewButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    marginLeft: 6,
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
  },
  emptyText: {
    color: "#888888",
    fontSize: 16,
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  modalBody: {
    padding: 16,
  },
  detailStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 16,
  },
  detailStatusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  detailLabel: {
    fontSize: 13,
    color: "#888888",
    marginTop: 12,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  reviewInput: {
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 8,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#444444",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 24,
    gap: 12,
  },
  modalActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
  },
  approveButton: {
    backgroundColor: "#4CAF50",
  },
  rejectButton: {
    backgroundColor: "#FF3B30",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalActionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
    marginLeft: 8,
  },
})

export default AdminOwnershipRequestsScreen