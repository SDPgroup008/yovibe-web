"use client"

import type React from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from "react-native"
import { useCompatNavigation } from "../../utils/compatNavigation"
import { Ionicons } from "@expo/vector-icons"

const TermsAndConditionsScreen: React.FC = () => {
  const navigation = useCompatNavigation()

  const handleLink = (url: string) => {
    Linking.openURL(url).catch(() => {})
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>YoVibe Terms and Conditions</Text>
          <Text style={styles.lastUpdated}>Last Updated: July 6, 2026</Text>

          <Text style={styles.sectionTitle}>1. INTRODUCTION AND ACCEPTANCE OF TERMS</Text>
          <Text style={styles.paragraph}>
            1.1 These Terms and Conditions ("Terms") constitute a legally binding agreement between you
            ("User," "you," or "your") and YoVibe ("Company," "we," "us," or "our"), governing your access to
            and use of the YoVibe web application, mobile application, and all associated services, features,
            content, and functionalities (collectively, the "Platform").
          </Text>
          <Text style={styles.paragraph}>
            1.2 BY ACCESSING OR USING THE PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND
            AGREE TO BE BOUND BY THESE TERMS AND OUR PRIVACY POLICY. IF YOU DO NOT AGREE TO THESE TERMS,
            YOU MUST NOT ACCESS OR USE THE PLATFORM.
          </Text>
          <Text style={styles.paragraph}>
            1.3 These Terms may be modified by the Company at any time without prior notice. Material changes
            will be communicated via the Platform or email. Your continued use of the Platform after any
            modifications constitutes acceptance of the revised Terms. It is your responsibility to review
            these Terms periodically.
          </Text>
          <Text style={styles.paragraph}>
            1.4 The Platform is operated from the Republic of Uganda. Access to the Platform from
            jurisdictions where its contents or functionality are illegal is prohibited. Users who access
            the Platform from outside Uganda do so on their own initiative and are responsible for compliance
            with local laws.
          </Text>

          <Text style={styles.sectionTitle}>2. DEFINITIONS AND INTERPRETATION</Text>
          <Text style={styles.paragraph}>
            2.1 In these Terms, unless the context otherwise requires:
          </Text>
          <Text style={styles.paragraph}>
            "Account" means the registered user profile created by a User on the Platform.
          </Text>
          <Text style={styles.paragraph}>
            "Administrator" or "Admin" means a User authorized by the Company to manage and oversee
            Platform operations, including user management, content moderation, and dispute resolution.
          </Text>
          <Text style={styles.paragraph}>
            "Club Owner," "Organizer," or "Promoter" means a User registered to create, manage, and promote
            Events and Venues on the Platform.
          </Text>
          <Text style={styles.paragraph}>
            "Event" means any gathering, performance, show, party, festival, or activity listed on the
            Platform by an Organizer for which tickets may be sold.
          </Text>
          <Text style={styles.paragraph}>
            "Platform Commission" means the fee charged by the Company for processing ticket sales,
            calculated as a percentage of the total transaction amount as specified in Section 9.
          </Text>
          <Text style={styles.paragraph}>
            "Regular User," "User," or "Attendee" means an individual who registers on the Platform to
            browse events, purchase tickets, and attend events.
          </Text>
          <Text style={styles.paragraph}>
            "Ticket" means a digital access credential, including a unique QR code, issued to a User
            upon successful payment, granting entry to a specific Event.
          </Text>
          <Text style={styles.paragraph}>
            "Venue" means a physical location or establishment listed on the Platform where Events take place.
          </Text>
          <Text style={styles.paragraph}>
            "Viber" means a user who interacts with the Platform without completing full registration,
            subject to limited functionality as determined by the Company.
          </Text>

          <Text style={styles.sectionTitle}>3. ELIGIBILITY AND ACCOUNT REGISTRATION</Text>
          <Text style={styles.paragraph}>
            3.1 By registering for an Account, you represent and warrant that:
          </Text>
          <Text style={styles.paragraph}>
            (a) You are at least 18 years of age or the age of majority in your jurisdiction, whichever
            is higher;
          </Text>
          <Text style={styles.paragraph}>
            (b) You have the legal capacity to enter into binding contracts;
          </Text>
          <Text style={styles.paragraph}>
            (c) All registration information you provide is accurate, current, and complete;
          </Text>
          <Text style={styles.paragraph}>
            (d) You will maintain and promptly update your Account information to keep it accurate;
          </Text>
          <Text style={styles.paragraph}>
            (e) Your use of the Platform does not violate any applicable law or regulation.
          </Text>
          <Text style={styles.paragraph}>
            3.2 Minors between the ages of 13 and 17 may use the Platform only with the supervision and
            express consent of a parent or legal guardian who agrees to be bound by these Terms.
          </Text>
          <Text style={styles.paragraph}>
            3.3 You are solely responsible for maintaining the confidentiality of your Account credentials,
            including your password, and for all activities that occur under your Account. You agree to
            notify the Company immediately of any unauthorized use of your Account or any other breach of
            security.
          </Text>
          <Text style={styles.paragraph}>
            3.4 The Company reserves the right to suspend, deactivate, or terminate any Account at any
            time, without prior notice or liability, for any reason including but not limited to violation
            of these Terms, fraudulent activity, or conduct that the Company deems harmful to other Users,
            third parties, or the Platform.
          </Text>
          <Text style={styles.paragraph}>
            3.5 Each User may maintain only one Account. Creation of multiple accounts, fictitious accounts,
            or accounts using false identity information is strictly prohibited.
          </Text>

          <Text style={styles.sectionTitle}>4. USER TYPES, ROLES, AND RESPONSIBILITIES</Text>
          <Text style={styles.paragraph}>
            4.1 The Platform recognizes the following User types, each with distinct rights and obligations:
          </Text>
          <Text style={styles.paragraph}>
            (a) Viber (Vibe Master): A user registered primarily to browse and purchase Tickets. Vibe
            Masters may browse public Events and Venues, purchase Tickets, view purchase history, manage
            profile settings, and receive notifications. Vibe Masters may not create Events, manage Venues,
            or access organizer-specific features.
          </Text>
          <Text style={styles.paragraph}>
            (b) Event Organizer (Club Owner / Regular User): Has all Viber privileges plus the ability to
            create and manage Events, manage Venues, view ticket sales analytics, receive payouts, and
            configure Event-specific settings. Both Regular Users and Club Owners may operate as Event
            Organizers. Organizers must provide valid payment details for payout processing.
          </Text>
          <Text style={styles.paragraph}>
            (c) Administrator: Has full access to Platform management functions including user management,
            content moderation, ticket fulfillment oversight, commission configuration, payout approval,
            and system-wide analytics.
          </Text>
          <Text style={styles.paragraph}>
            (d) Unregistered Visitor: May view public Event and Venue listings but cannot purchase Tickets,
            create content, or access User-specific features.
          </Text>
          <Text style={styles.paragraph}>
            4.2 Upgrading from Viber (Regular User) to Club Owner requires approval from the Company or
            an Administrator. Upgrade requests are subject to additional verification, background checks,
            and acceptance of supplementary terms at the Company's sole discretion.
          </Text>
          <Text style={styles.paragraph}>
            4.3 Each User type is bound by these Terms irrespective of their classification. Violation of
            these Terms may result in downgrade or termination of User privileges.
          </Text>

          <Text style={styles.sectionTitle}>5. EVENTS AND VENUE LISTINGS</Text>
          <Text style={styles.paragraph}>
            5.1 Club Owners may create Event listings subject to the following conditions:
          </Text>
          <Text style={styles.paragraph}>
            (a) All Event information, including date, time, location, description, pricing, artists, and
            images, must be accurate and not misleading;
          </Text>
          <Text style={styles.paragraph}>
            (b) Event listings must not infringe upon the intellectual property rights of any third party;
          </Text>
          <Text style={styles.paragraph}>
            (c) Events involving illegal activities, hate speech, discrimination, or violence are strictly
            prohibited;
          </Text>
          <Text style={styles.paragraph}>
            (d) The Organizer must have all necessary licenses, permits, and authorizations required by
            applicable law to host the Event;
          </Text>
          <Text style={styles.paragraph}>
            (e) Entry fees, table prices, and ticket types must be clearly stated and inclusive of all
            applicable taxes and charges.
          </Text>
          <Text style={styles.paragraph}>
            5.2 The Company reserves the right to review, edit, delay, or remove any Event or Venue listing
            that violates these Terms or applicable law, without liability to the Organizer or any User.
          </Text>
          <Text style={styles.paragraph}>
            5.3 Organizers are solely responsible for the accuracy, legality, and appropriateness of their
            listings and for fulfilling all obligations to Ticket purchasers, including Event delivery as
            described.
          </Text>
          <Text style={styles.paragraph}>
            5.4 Venue listings must include accurate location information, categories, and contact details.
            Venue owners are responsible for maintaining the safety, security, and legality of their
            premises.
          </Text>

          <Text style={styles.sectionTitle}>6. TICKET PURCHASE TERMS</Text>
          <Text style={styles.paragraph}>
            6.1 By purchasing a Ticket through the Platform, you agree to the following:
          </Text>
          <Text style={styles.paragraph}>
            (a) All Ticket purchases are final and binding once payment is confirmed;
          </Text>
          <Text style={styles.paragraph}>
            (b) Each Ticket is a revocable license to attend the specific Event for which it was purchased
            and does not constitute a transfer of any ownership rights;
          </Text>
          <Text style={styles.paragraph}>
            (c) Tickets are valid from the time of purchase until 24 hours after the Event start time,
            after which they expire automatically;
          </Text>
          <Text style={styles.paragraph}>
            (d) Each Ticket includes a unique QR code for validation purposes. QR codes are encrypted and
            digitally signed using HMAC-SHA256 for security;
          </Text>
          <Text style={styles.paragraph}>
            (e) Ticket purchases made on the event date from 7am onwards may be subject to a late fee
            set by the Organizer, displayed at the time of purchase. The default late fee is 0% unless
            otherwise configured by the Organizer;
          </Text>
          <Text style={styles.paragraph}>
            (f) Bulk purchases, table reservations, and group bookings may be subject to additional terms
            specified at the time of purchase;
          </Text>
          <Text style={styles.paragraph}>
            (g) The Company acts solely as a ticketing platform and is not the organizer, promoter, or
            host of any Event listed on the Platform.
          </Text>
          <Text style={styles.paragraph}>
            6.2 Ticket Pricing and Fees:
          </Text>
          <Text style={styles.paragraph}>
            (a) Ticket prices are set by the Organizer and displayed in Ugandan Shillings (UGX) unless
            otherwise specified;
          </Text>
          <Text style={styles.paragraph}>
            (b) A Platform commission of 15% of the total ticket price is applied to each transaction.
            This commission is included in the price displayed to the purchaser;
          </Text>
          <Text style={styles.paragraph}>
            (c) The late fee is applied to purchases made on the event date from 7am onwards
            and is calculated on the base ticket price before commission;
          </Text>
          <Text style={styles.paragraph}>
            (d) All prices displayed are inclusive of applicable taxes unless otherwise stated. The Company
            does not collect or remit value-added tax (VAT) or similar taxes on behalf of Organizers;
          </Text>
          <Text style={styles.paragraph}>
            (e) The Company reserves the right to change pricing structures, commission rates, and fee
            schedules upon 30 days' notice to Users.
          </Text>
          <Text style={styles.paragraph}>
            6.3 Ticket Delivery:
          </Text>
          <Text style={styles.paragraph}>
            (a) Upon successful payment, Tickets are delivered electronically via email to the email
            address provided during purchase;
          </Text>
          <Text style={styles.paragraph}>
            (b) It is the purchaser's responsibility to provide a valid email address and to ensure the
            deliverability of Ticket emails;
          </Text>
          <Text style={styles.paragraph}>
            (c) The Company is not responsible for Tickets that are not received due to incorrect email
            addresses, spam filtering, or other delivery issues outside its reasonable control;
          </Text>
          <Text style={styles.paragraph}>
            (d) Ticket re-delivery may be requested either:
              (i) Through the self-service "Resend Ticket" feature on the Platform, which will re-send
              Ticket emails to the original email address on file without additional verification; or
              (ii) By contacting support, subject to identity verification and a reasonable administrative fee.
            </Text>
            <Text style={styles.paragraph}>
              (e) The Company reserves the right to limit the frequency of re-delivery requests to prevent abuse.
            </Text>
            <Text style={styles.paragraph}>
              6.4 Ticket Formats and Presentation:
            </Text>
            <Text style={styles.paragraph}>
              (a) Tickets are presented in digital format within the Platform and may include:
                (i) A QR code for validation scanning at the Event entrance;
                (ii) A canonical ticket view rendered within the Platform;
                (iii) A downloadable PDF version provided for convenience.
            </Text>
            <Text style={styles.paragraph}>
              (b) The QR code is the authoritative validation credential. SVG and PDF representations are
              provided for informational purposes only and do not replace the QR code for entry validation.
            </Text>
            <Text style={styles.paragraph}>
              (c) Duplicating, copying, or screenshotting a Ticket does not create a valid additional entry
              credential. Only the original digital Ticket as authenticated by the Platform shall be valid.
            </Text>
            <Text style={styles.paragraph}>
              (d) PDF downloads are provided "as is" and may not reflect real-time status updates, including
              refunds, cancellations, or re-issuance.
            </Text>
            <Text style={styles.paragraph}>
              6.5 Table Bookings and Group Seating:
            </Text>
            <Text style={styles.paragraph}>
              (a) Where offered by the Organizer, Tickets may be purchased as table bookings rather than
              individual entry. Table bookings are indicated at the time of purchase.
            </Text>
            <Text style={styles.paragraph}>
              (b) Table prices are displayed as a total price for the table based on the stated table
              capacity. The purchaser pays for the entire table regardless of how many individuals actually attend.
            </Text>
            <Text style={styles.paragraph}>
              (c) Attendees associated with a table booking must not exceed the stated table capacity.
              Event staff may refuse entry to individuals exceeding the table capacity.
            </Text>
            <Text style={styles.paragraph}>
              (d) Table location or specific table assignment is at the sole discretion of the Organizer
              and Venue. The Platform does not guarantee specific table locations.
            </Text>
            <Text style={styles.paragraph}>
              (e) Cancellation and refund terms for table bookings follow the general refund policies in
              Section 11, unless otherwise stated at the time of purchase.
          </Text>

          <Text style={styles.sectionTitle}>7. SECURITY PHOTO AND IDENTITY VERIFICATION</Text>
          <Text style={styles.paragraph}>
            7.1 The Platform offers a security photo feature designed to enhance Event entry security:
          </Text>
          <Text style={styles.paragraph}>
            (a) Purchasers may optionally upload a security photo at the time of purchase or within a
            specified upload window;
          </Text>
          <Text style={styles.paragraph}>
            (b) Security photos are linked to the Ticket via a unique upload token that expires at the
            Event start time;
          </Text>
          <Text style={styles.paragraph}>
            (c) Event staff may request photo verification at the point of entry to confirm the Ticket
            holder's identity;
          </Text>
          <Text style={styles.paragraph}>
            (d) Failure to undergo photo verification when requested may result in denial of entry at
            the discretion of the Organizer or security personnel.
          </Text>
          <Text style={styles.paragraph}>
            7.2 By uploading a security photo, you consent to:
          </Text>
          <Text style={styles.paragraph}>
            (a) The display of your photo to Event staff for verification purposes;
          </Text>
          <Text style={styles.paragraph}>
            (b) The storage of your photo in accordance with our Privacy Policy;
          </Text>
          <Text style={styles.paragraph}>
            (c) The use of your photo for security and fraud prevention purposes.
          </Text>
           <Text style={styles.paragraph}>
             7.3 Security photos are not a guarantee of entry. Organizers retain the right to deny entry
             based on their own venue policies and applicable law.
           </Text>
           <Text style={styles.paragraph}>
             7.4 If the individual presenting the Ticket does not match the security photo associated with
             that Ticket, Event staff may deny entry. Any attempted use of a Ticket by an individual who
             does not match the associated security photo may result in:
           </Text>
           <Text style={styles.paragraph}>
             (a) Immediate denial of entry or removal from the Event without refund;
           </Text>
           <Text style={styles.paragraph}>
             (b) Confiscation of the Ticket and revocation of any associated Tickets held by the same
             purchaser;
           </Text>
           <Text style={styles.paragraph}>
             (c) Notification to applicable law enforcement authorities; and
           </Text>
           <Text style={styles.paragraph}>
             (d) Legal action including potential criminal charges for fraud, identity misrepresentation,
             or unauthorized Ticket transfer where applicable under Ugandan law.
           </Text>

          <Text style={styles.sectionTitle}>8. PAYMENT TERMS AND PROCESSING</Text>
          <Text style={styles.paragraph}>
            8.1 Accepted Payment Methods:
          </Text>
          <Text style={styles.paragraph}>
            (a) Mobile Money: MTN Mobile Money, Airtel Money, and other mobile money providers as
            displayed on the Platform, processed through PawaPay;
          </Text>
          <Text style={styles.paragraph}>
            (b) Credit and Debit Cards: Visa, Mastercard, and other card networks accepted via PesaPal;
          </Text>
          <Text style={styles.paragraph}>
            (c) Bank Transfers: Direct bank transfers to Organizer-designated accounts where offered.
          </Text>
          <Text style={styles.paragraph}>
            8.2 Payment Processing:
          </Text>
          <Text style={styles.paragraph}>
            (a) Card payments are processed through PesaPal and are subject to PesaPal's terms of service
            and privacy policy;
          </Text>
          <Text style={styles.paragraph}>
            (b) Mobile money payments are processed through PawaPay and are subject to PawaPay's terms of
            service and privacy policy;
          </Text>
          <Text style={styles.paragraph}>
            (c) Payment confirmation for mobile money transactions may be subject to delay pending
            callback verification from the payment processor;
          </Text>
          <Text style={styles.paragraph}>
            (d) The Company does not store full payment card numbers or sensitive financial credentials.
            Payment data is handled by PCI-compliant third-party processors;
          </Text>
          <Text style={styles.paragraph}>
            (e) The Company may retain payment transaction identifiers, references, and masked financial
            details for record-keeping and dispute resolution purposes.
          </Text>
          <Text style={styles.paragraph}>
            8.3 Pending Fulfillment and Recovery:
          </Text>
          <Text style={styles.paragraph}>
            (a) In the event of a payment confirmation without successful ticket issuance, the Company
            maintains a pending fulfillment system that automatically attempts ticket creation;
          </Text>
          <Text style={styles.paragraph}>
            (b) Manual recovery of pending fulfillments may be performed by Administrators to ensure
            Ticket delivery;
          </Text>
          <Text style={styles.paragraph}>
            (c) Users experiencing payment confirmation without ticket receipt should contact support
            within 48 hours of purchase.
          </Text>
          <Text style={styles.paragraph}>
            8.4 Installment Payment Plans:
          </Text>
          <Text style={styles.paragraph}>
            (a) For eligible Events, purchasers may elect to pay for Tickets through an installment plan
            instead of paying in full at the time of purchase.
          </Text>
          <Text style={styles.paragraph}>
            (b) Available installment plan types include 2-pay, 3-pay, 4-pay, and 5-pay options, as
            displayed at the time of purchase. The number of installments is selected by the purchaser
            before payment.
          </Text>
          <Text style={styles.paragraph}>
            (c) The first installment is due at the time of purchase and must be paid to reserve the
            Ticket(s). The first installment is 40% to 50% of the total base Ticket price, depending on
            the plan type selected.
          </Text>
          <Text style={styles.paragraph}>
            (d) A service fee of 8% of each installment amount is applied to each installment payment.
            This fee covers the cost of processing and administering the installment plan and is
            non-refundable.
          </Text>
          <Text style={styles.paragraph}>
            (e) Subsequent installments are due on the dates specified in the installment schedule
            provided at the time of purchase. All installments must be paid before the Event start time.
          </Text>
          <Text style={styles.paragraph}>
            (f) The QR code for the Ticket is issued only after all installments have been paid in full.
            Until the final installment is paid, the Ticket remains pending and cannot be used for Event entry.
          </Text>
          <Text style={styles.paragraph}>
            (g) If an installment payment is missed, the purchaser may still complete payment of any
            outstanding installment at any time before the Event start time. The Company reserves the
            right to cancel the installment plan and void the Ticket(s) if payments are not completed
            by the Event start time.
          </Text>
          <Text style={styles.paragraph}>
            (h) Refunds for installment plans are governed by Section 11.1(e)-(f) of these Terms.
          </Text>
          <Text style={styles.paragraph}>
            (i) The installment plan option may not be available for all Events, Ticket types, or payment
            methods. The Company reserves the right to limit or withdraw the installment plan option at
            its sole discretion.
          </Text>

          <Text style={styles.sectionTitle}>9. COMMISSION, REVENUE SPLIT, AND PAYOUTS</Text>
          <Text style={styles.paragraph}>
            9.1 Platform Commission:
          </Text>
          <Text style={styles.paragraph}>
            (a) The Company charges a Platform commission of 15% on all Ticket sales processed through
            the Platform;
          </Text>
          <Text style={styles.paragraph}>
            (b) The commission is calculated as 15% of the total Ticket price paid by the purchaser,
            including any late fees, before gateway transaction fees;
          </Text>
          <Text style={styles.paragraph}>
            (c) The remaining 85% of the Ticket price, less gateway transaction fees charged by the
            payment processor, constitutes the venue revenue payable to the Organizer;
          </Text>
          <Text style={styles.paragraph}>
            (d) The Company reserves the right to modify the commission rate upon 30 days' written notice
            to Organizers.
          </Text>
          <Text style={styles.paragraph}>
            9.2 Payouts to Organizers:
          </Text>
          <Text style={styles.paragraph}>
            (a) Payouts are available to Organizers for Tickets that have been scanned, validated, and
            marked as "payout-eligible" with a payout status of "pending" in the Platform;
          </Text>
          <Text style={styles.paragraph}>
            (b) Organizers may request payouts for eligible Tickets through the Platform dashboard by
            selecting eligible Ticket types and quantities via the payout interface;
          </Text>
          <Text style={styles.paragraph}>
            (c) A payout processing fee is applied to each withdrawal, calculated as 1% of the payout
            amount plus a tiered flat fee (up to 1,200 UGX) depending on the payout bracket;
          </Text>
          <Text style={styles.paragraph}>
            (d) Payouts are processed via PawaPay mobile money to the Organizer's registered MTN or
            Airtel mobile money number in Uganda. Payouts to bank accounts are not currently supported;
          </Text>
          <Text style={styles.paragraph}>
            (e) Before a payout is executed, the Organizer must verify their identity by entering a
            one-time password (OTP) sent to their registered email address. The OTP expires 90 seconds
            after issuance;
          </Text>
          <Text style={styles.paragraph}>
            (f) The net payout amount received by the Organizer is calculated as:
              Total Venue Revenue (85% of gross sales after commission)
              - Gateway Transaction Fees
              - Payout Processing Fee (1% + tiered flat fee)
              = Net Payout Amount;
          </Text>
          <Text style={styles.paragraph}>
            (g) The Company reserves the right to withhold payouts pending investigation of suspected
            fraud, chargebacks, or violations of these Terms;
          </Text>
          <Text style={styles.paragraph}>
            (h) Payout statuses include: pending, processing, paid, and failed. Organizers will be
            notified of any failures and may re-request payouts through the dashboard.
          </Text>
          <Text style={styles.paragraph}>
            9.3 Revenue Reconciliation:
          </Text>
          <Text style={styles.paragraph}>
            (a) Organizers may view detailed revenue reports, including per-Ticket breakdowns of base
            price, late fees, venue revenue, and Platform commission;
          </Text>
          <Text style={styles.paragraph}>
            (b) It is the Organizer's responsibility to reconcile payouts against their own records.
            Discrepancies must be reported within 30 days;
          </Text>
          <Text style={styles.paragraph}>
            (c) Unclaimed payouts that remain unrequested for more than 12 months may be forfeited at
            the Company's discretion.
          </Text>

          <Text style={styles.sectionTitle}>10. TICKET VALIDATION AND ENTRY</Text>
          <Text style={styles.paragraph}>
            10.1 Validation Process:
          </Text>
          <Text style={styles.paragraph}>
            (a) Tickets are validated by scanning the QR code at the Event entrance using the Platform's
            scanner application;
          </Text>
          <Text style={styles.paragraph}>
            (b) The scanner verifies the QR code against the Company's database, checking for validity,
            expiration, and event-matching;
          </Text>
          <Text style={styles.paragraph}>
            (c) All validation attempts are logged with timestamp, validator identity, location, and
            outcome (granted or denied);
          </Text>
          <Text style={styles.paragraph}>
            (d) Tickets that are already used, expired, cancelled, refunded, or issued for a different
            Event will be denied;
          </Text>
          <Text style={styles.paragraph}>
            (e) Validation that requires photo verification will prompt the validator to compare the
            Ticket's security photo with the attendee before granting entry.
          </Text>
          <Text style={styles.paragraph}>
            10.2 Entry Conditions:
          </Text>
          <Text style={styles.paragraph}>
            (a) A valid, non-expired Ticket with a "used" or "active" status is required for entry;
          </Text>
          <Text style={styles.paragraph}>
            (b) The Company is not responsible for entry decisions made by Event staff, security
            personnel, or venue management;
          </Text>
          <Text style={styles.paragraph}>
            (c) Organizers retain the right to refuse entry or eject any person for conduct violations,
            safety concerns, or venue policy infractions;
          </Text>
          <Text style={styles.paragraph}>
            (d) Re-entry policies are at the discretion of the Organizer and venue management.
          </Text>
          <Text style={styles.paragraph}>
            10.3 Seat Allocation:
          </Text>
          <Text style={styles.paragraph}>
            (a) Where an Event offers seat selection or assigned seating, seat numbers will be indicated
            on the Ticket.
          </Text>
          <Text style={styles.paragraph}>
            (b) Seat selection availability and seating charts are determined by the Organizer and
            displayed at the time of purchase.
          </Text>
          <Text style={styles.paragraph}>
            (c) The Company does not guarantee specific seat locations. The Organizer reserves the right
            to modify seating arrangements due to operational requirements, safety considerations, or
            Event configuration changes.
          </Text>
          <Text style={styles.paragraph}>
            (d) Ticket holders must occupy only the seat indicated on their Ticket. Event staff may
            relocate ticket holders as necessary for safety or operational purposes.
          </Text>
          <Text style={styles.paragraph}>
            10.4 Staff Scanning and Access Tokens:
          </Text>
          <Text style={styles.paragraph}>
            (a) Authorized Event staff and Organizers may be issued unique access tokens that permit
            use of the Platform's scanning functionality without requiring a full registered Account.
          </Text>
          <Text style={styles.paragraph}>
            (b) Access tokens are generated by the Organizer or Administrator and are intended solely
            for authorized personnel for the purpose of validating Tickets at the Event.
          </Text>
          <Text style={styles.paragraph}>
            (c) Token holders are responsible for maintaining the confidentiality of their access tokens.
            The Organizer is responsible for all scanning activity performed using tokens issued under
            their Account.
          </Text>
          <Text style={styles.paragraph}>
            (d) Access tokens may be revoked or expired at any time by the Company, Organizer, or
            Administrator without prior notice.
          </Text>

           <Text style={styles.sectionTitle}>11. REFUNDS, CANCELLATIONS, AND CHARGEBACKS</Text>
          <Text style={styles.paragraph}>
            11.1 Event Cancellations by Organizer:
          </Text>
          <Text style={styles.paragraph}>
            (a) If an Event is cancelled by the Organizer, all Ticket purchasers are entitled to a
            refund of the Ticket price paid, net of payment gateway fees;
          </Text>
          <Text style={styles.paragraph}>
            (b) The Company will process refunds within 14 business days of receiving confirmation of
            cancellation from the Organizer;
          </Text>
          <Text style={styles.paragraph}>
            (c) The Company's 15% Platform commission will also be refunded in the event of Organizer-initiated
            cancellations;
          </Text>
          <Text style={styles.paragraph}>
            (d) The Company may charge Organizers an administrative cancellation fee of up to 5% of total
            Ticket sales for cancellations made within 7 days of the Event date.
          </Text>
          <Text style={styles.paragraph}>
            (e) For Tickets purchased via an installment plan where the event is cancelled or postponed
            after partial payment, the refund amount is calculated as 100% of the total paid installment
            amounts, less payment gateway fees. Service fees (8% per installment) applied to each
            installment payment are non-refundable.
          </Text>
          <Text style={styles.paragraph}>
            (f) For installment plans with incomplete payments after the event has taken place,
            purchasers may request a refund of 40% of the base installment amounts paid (excluding
            service fees and payment gateway fees), subject to admin review and approval.
          </Text>
          <Text style={styles.paragraph}>
            11.2 Event Postponement or Rescheduling:
          </Text>
          <Text style={styles.paragraph}>
            (a) If an Event is postponed or rescheduled, existing Tickets will remain valid for the new
            date unless otherwise specified;
          </Text>
          <Text style={styles.paragraph}>
            (b) If a purchaser cannot attend the rescheduled date, they may request a refund within 7 days
            of the rescheduling announcement;
          </Text>
          <Text style={styles.paragraph}>
            (c) The Company is not responsible for any incidental expenses incurred by the purchaser
            arising from postponement or rescheduling.
          </Text>
          <Text style={styles.paragraph}>
            11.3 User-Requested Refunds:
          </Text>
          <Text style={styles.paragraph}>
            (a) Refunds for change of mind, scheduling conflicts, or other personal reasons are generally
            not provided;
          </Text>
          <Text style={styles.paragraph}>
            11.4 Chargebacks and Disputed Transactions:
          </Text>
          <Text style={styles.paragraph}>
            (a) Users who file chargebacks with their bank or payment provider without first contacting
            the Company may have their Account immediately suspended;
          </Text>
          <Text style={styles.paragraph}>
            (b) The Company will contest chargebacks where valid Ticket delivery and service have been
            provided;
          </Text>
          <Text style={styles.paragraph}>
            (c) Users who are found to have filed fraudulent chargebacks may be permanently banned from
            the Platform and pursued for recovery of amounts owed plus administrative costs;
          </Text>
          <Text style={styles.paragraph}>
            (d) Organizers whose Events incur excessive chargebacks (more than 2% of total sales) may
            have their payout privileges suspended pending review.
          </Text>
          <Text style={styles.paragraph}>
            (e) The Company reserves the right to dispute chargebacks on behalf of Organizers where
            valid Ticket delivery and service can be demonstrated. Chargeback disputes are handled
            through the manual admin refund workflow.
          </Text>
          <Text style={styles.paragraph}>
            11.5 Refund Processing:
          </Text>
          <Text style={styles.paragraph}>
            (a) All refunds will be processed using the original payment method where technically possible;
          </Text>
          <Text style={styles.paragraph}>
            (b) Refund processing times depend on the payment method and provider, ranging from 1-15
            business days;
          </Text>
          <Text style={styles.paragraph}>
            (c) The Company is not liable for delays in refund processing caused by third-party payment
            processors.
          </Text>
          <Text style={styles.paragraph}>
            (d) Refund requests submitted by Users are subject to administrative review. The review
            workflow includes:
              (i) Submission of refund request with supporting reason;
              (ii) Review by an Administrator who may approve, reject, or request additional information;
              (iii) If approved, manual execution of the refund through the payment provider by an
              Administrator;
              (iv) If the refund processing fails, the Administrator may retry the refund;
              (v) If a refund request is rejected, the User will be notified with the reason.
          </Text>
          <Text style={styles.paragraph}>
            (e) Refund processing is not fully automated. Administrator review and manual execution may
            result in additional processing time beyond the timeframes stated in Section 11.5(b).
          </Text>

          <Text style={styles.sectionTitle}>12. DATA PRIVACY, COLLECTION, AND PROTECTION</Text>
          <Text style={styles.paragraph}>
            12.1 Information Collected:
          </Text>
          <Text style={styles.paragraph}>
            (a) Account information: name, email address, phone number, user type, profile photo;
          </Text>
          <Text style={styles.paragraph}>
            (b) Payment information: transaction amounts, payment method types, masked account details
            (the Company does not store full payment credentials);
          </Text>
          <Text style={styles.paragraph}>
            (c) Event and venue interaction data: events viewed, tickets purchased, venues visited,
            search queries, preferences;
          </Text>
          <Text style={styles.paragraph}>
            (d) Technical data: IP address, device type, browser information, operating system, network
            information;
          </Text>
          <Text style={styles.paragraph}>
            (e) Security data: security photos uploaded for ticket verification, QR code scan logs,
            validation history;
          </Text>
          <Text style={styles.paragraph}>
            (f) Analytics data: session duration, page views, feature usage, navigation patterns.
          </Text>
          <Text style={styles.paragraph}>
            12.2 Use of Information:
          </Text>
          <Text style={styles.paragraph}>
            (a) To provide, maintain, and improve the Platform and its features;
          </Text>
          <Text style={styles.paragraph}>
            (b) To process transactions, issue Tickets, and facilitate payouts;
          </Text>
          <Text style={styles.paragraph}>
            (c) To verify identity, prevent fraud, and enhance security;
          </Text>
          <Text style={styles.paragraph}>
            (d) To send transactional communications, notifications, and service-related messages;
          </Text>
          <Text style={styles.paragraph}>
            (e) To analyze usage patterns and improve user experience;
          </Text>
          <Text style={styles.paragraph}>
            (f) To comply with legal obligations and enforce these Terms.
          </Text>
          <Text style={styles.paragraph}>
            12.3 Data Security:
          </Text>
          <Text style={styles.paragraph}>
            (a) The Company implements industry-standard security measures including encryption in transit
            (TLS) and at rest, access controls, and regular security audits;
          </Text>
          <Text style={styles.paragraph}>
            (b) Data is stored on secured servers located in multiple jurisdictions, including through
            third-party cloud service providers compliant with international security standards;
          </Text>
          <Text style={styles.paragraph}>
            (c) Despite these measures, no method of electronic storage or transmission is 100% secure.
            The Company cannot guarantee absolute security;
          </Text>
          <Text style={styles.paragraph}>
            (d) Users are responsible for maintaining the security of their own devices and Account credentials.
          </Text>
          <Text style={styles.paragraph}>
            12.4 Data Retention:
          </Text>
          <Text style={styles.paragraph}>
            (a) Account information is retained for the duration of the Account's existence and for a
            reasonable period after Account closure as required by law;
          </Text>
          <Text style={styles.paragraph}>
            (b) Transaction records are retained for a minimum of 7 years to comply with tax and financial
            regulations;
          </Text>
          <Text style={styles.paragraph}>
            (c) Security photos are retained for the duration necessary for ticket validation purposes
            and then securely deleted;
          </Text>
          <Text style={styles.paragraph}>
            (d) Analytics data may be retained in aggregated, anonymized form indefinitely.
          </Text>
          <Text style={styles.paragraph}>
            12.5 Third-Party Services:
          </Text>
          <Text style={styles.paragraph}>
            (a) The Platform integrates with third-party services including but not limited to: Supabase
            (primary database, authentication, and real-time data synchronization), Firebase and Firestore
            (real-time event and venue data queries, and push notifications), Cloudflare R2 (image and
            file storage), PesaPal (card payment processing), PawaPay (mobile money processing),
            Google Maps (location services), and Google Analytics (analytics);
          </Text>
          <Text style={styles.paragraph}>
            (b) Each third-party service has its own terms of service and privacy policy governing the
            use of data shared with them;
          </Text>
          <Text style={styles.paragraph}>
            (c) The Company is not responsible for the privacy practices of third-party services.
          </Text>
          <Text style={styles.paragraph}>
            12.6 Cross-Border Data Transfer:
          </Text>
          <Text style={styles.paragraph}>
            (a) Your data may be transferred to and processed in countries other than Uganda, including
            the United States and other jurisdictions where our service providers operate;
          </Text>
          <Text style={styles.paragraph}>
            (b) By using the Platform, you consent to the cross-border transfer of your data as described
            in this Section.
          </Text>
          <Text style={styles.paragraph}>
            12.7 Your Rights:
          </Text>
          <Text style={styles.paragraph}>
            (a) You have the right to access, correct, or delete your personal data, subject to legal
            retention requirements;
          </Text>
          <Text style={styles.paragraph}>
            (b) You may export your data by contacting support;
          </Text>
          <Text style={styles.paragraph}>
            (c) You may withdraw consent for certain data processing activities where technically feasible;
          </Text>
          <Text style={styles.paragraph}>
            (d) The Company will respond to data rights requests within 30 days.
          </Text>
          <Text style={styles.paragraph}>
            12.8 Data Caching:
          </Text>
          <Text style={styles.paragraph}>
            (a) To improve performance and reduce data usage, the Platform may cache certain data locally
            on your device, including Event listings, Ticket information, venue details, and user preferences.
          </Text>
          <Text style={styles.paragraph}>
            (b) Cached data is stored in your browser's sessionStorage, localStorage, or equivalent
            application storage mechanisms.
          </Text>
          <Text style={styles.paragraph}>
            (c) Cached data may become stale or out of date. The Platform makes reasonable efforts to
            refresh cached data, but you should not rely solely on cached data for time-sensitive
            information such as Ticket validity or Event changes.
          </Text>
          <Text style={styles.paragraph}>
            (d) You may clear cached data through your device or browser settings. Clearing cached data
            may affect Platform performance and require re-downloading of data.
          </Text>
          <Text style={styles.paragraph}>
            (e) The Company is not responsible for discrepancies between cached data and live data that
            result from caching delays.
          </Text>

          <Text style={styles.sectionTitle}>13. INTELLECTUAL PROPERTY RIGHTS</Text>
          <Text style={styles.paragraph}>
            13.1 Platform Ownership:
          </Text>
          <Text style={styles.paragraph}>
            (a) The Platform, including its code, design, layout, graphics, logos, trademarks, service
            marks, trade names, and all content not uploaded by Users, is the exclusive property of the
            Company and is protected by Ugandan and international intellectual property laws;
          </Text>
          <Text style={styles.paragraph}>
            (b) You are granted a limited, non-exclusive, non-transferable, revocable license to access
            and use the Platform for its intended purposes. This license does not include any right to
            copy, modify, distribute, sell, or create derivative works of the Platform or its content;
          </Text>
          <Text style={styles.paragraph}>
            (c) You may not: (i) reverse engineer, decompile, or disassemble any part of the Platform;
            (ii) scrape, crawl, or otherwise extract data from the Platform through automated means;
            (iii) use the Platform for any commercial purpose not expressly authorized.
          </Text>
          <Text style={styles.paragraph}>
            13.2 User-Generated Content:
          </Text>
          <Text style={styles.paragraph}>
            (a) By submitting content to the Platform (including Event listings, Venue descriptions,
            images, and reviews), you grant the Company a worldwide, royalty-free, non-exclusive license
            to use, reproduce, modify, adapt, publish, and display such content solely for purposes of
            operating and promoting the Platform;
          </Text>
          <Text style={styles.paragraph}>
            (b) You represent and warrant that you own or have all necessary licenses, rights, consents,
            and permissions to publish the content you submit;
          </Text>
          <Text style={styles.paragraph}>
            (c) The Company reserves the right to remove any user-generated content that violates these
            Terms or applicable law.
          </Text>

          <Text style={styles.sectionTitle}>14. PROHIBITED CONDUCT AND CONTENT STANDARDS</Text>
          <Text style={styles.paragraph}>
            14.1 You agree not to engage in any of the following prohibited activities:
          </Text>
          <Text style={styles.paragraph}>
            (a) Violating any applicable law, regulation, or these Terms;
          </Text>
          <Text style={styles.paragraph}>
            (b) Impersonating any person or entity, or misrepresenting your affiliation with any person
            or entity;
          </Text>
          <Text style={styles.paragraph}>
            (c) Using the Platform for any fraudulent, deceptive, or unlawful purpose, including ticket
            scalping, resale of Tickets outside the Platform, or money laundering;
          </Text>
          <Text style={styles.paragraph}>
            (d) Manipulating, bypassing, or tampering with any security feature, payment system, or
            validation mechanism of the Platform;
          </Text>
          <Text style={styles.paragraph}>
            (e) Attempting to gain unauthorized access to any part of the Platform, other Users' accounts,
            or the Company's systems;
          </Text>
          <Text style={styles.paragraph}>
            (f) Transmitting any viruses, malware, worms, Trojan horses, or other malicious code;
          </Text>
          <Text style={styles.paragraph}>
            (g) Harassing, threatening, intimidating, or abusing any User, Organizer, or Company staff;
          </Text>
          <Text style={styles.paragraph}>
            (h) Posting or transmitting content that is defamatory, discriminatory, obscene, pornographic,
            or incites violence;
          </Text>
          <Text style={styles.paragraph}>
            (i) Using automated bots, scripts, or scrapers to interact with the Platform without express
            written permission;
          </Text>
          <Text style={styles.paragraph}>
            (j) Interfering with or disrupting the Platform's servers, networks, or infrastructure.
          </Text>
          <Text style={styles.paragraph}>
            14.2 Content Standards:
          </Text>
          <Text style={styles.paragraph}>
            All User-generated content must: (a) be accurate and not misleading; (b) not infringe any
            third-party rights; (c) comply with all applicable laws; (d) not contain unauthorized
            advertising or promotional material; (e) not contain hate speech, harassment, or discriminatory
            language.
          </Text>

          <Text style={styles.sectionTitle}>15. LIMITATION OF LIABILITY AND DISCLAIMERS</Text>
          <Text style={styles.paragraph}>
            15.1 THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY
            KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. THE COMPANY SPECIFICALLY DISCLAIMS ALL
            IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
            NON-INFRINGEMENT.
          </Text>
          <Text style={styles.paragraph}>
            15.2 Without limiting the foregoing, the Company does not warrant that:
          </Text>
          <Text style={styles.paragraph}>
            (a) The Platform will meet your specific requirements or expectations;
          </Text>
          <Text style={styles.paragraph}>
            (b) The Platform will be uninterrupted, timely, secure, or error-free;
          </Text>
          <Text style={styles.paragraph}>
            (c) The quality of any Events, Venues, or services obtained through the Platform will meet
            expectations;
          </Text>
          <Text style={styles.paragraph}>
            (d) Any errors or defects in the Platform will be corrected.
          </Text>
          <Text style={styles.paragraph}>
            15.3 TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS
            OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR AFFILIATES BE LIABLE FOR:
          </Text>
          <Text style={styles.paragraph}>
            (a) ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR
            RELATED TO YOUR USE OF THE PLATFORM, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING
            NEGLIGENCE), OR ANY OTHER LEGAL THEORY;
          </Text>
          <Text style={styles.paragraph}>
            (b) ANY DAMAGES ARISING FROM EVENT CANCELLATIONS, POSTPONEMENTS, OR CHANGES MADE BY ORGANIZERS;
          </Text>
          <Text style={styles.paragraph}>
            (c) ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITIES;
          </Text>
          <Text style={styles.paragraph}>
            (d) ANY DAMAGES RELATED TO PERSONAL INJURY, PROPERTY DAMAGE, OR LOSS SUSTAINED AT EVENTS OR
            VENUES;
          </Text>
          <Text style={styles.paragraph}>
            (e) ANY CLAIMS ARISING FROM THIRD-PARTY CONDUCT, PAYMENT PROCESSING FAILURES, OR SERVICE
            OUTAGES.
          </Text>
          <Text style={styles.paragraph}>
            15.4 THE COMPANY'S TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM THESE TERMS
            SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY YOU TO THE COMPANY THROUGH THE PLATFORM IN THE 12
            MONTHS PRECEDING THE DATE OF THE CLAIM, OR 1,000,000 UGX (ONE MILLION UGANDAN SHILLINGS),
            WHICHEVER IS LESS.
          </Text>
          <Text style={styles.paragraph}>
            15.5 Some jurisdictions do not allow the exclusion of certain warranties or the limitation of
            certain liabilities. In such jurisdictions, the Company's liability is limited to the greatest
            extent permitted by law.
          </Text>
          <Text style={styles.paragraph}>
            15.6 The Company acts solely as an intermediary platform connecting Organizers and attendees.
            The Company is not a party to, and disclaims all liability arising from, any transaction or
            relationship between Organizers and Ticket purchasers.
          </Text>

          <Text style={styles.sectionTitle}>16. INDEMNIFICATION</Text>
          <Text style={styles.paragraph}>
            16.1 You agree to indemnify, defend, and hold harmless the Company, its officers, directors,
            employees, agents, and affiliates from and against any and all claims, demands, liabilities,
            damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or
            related to:
          </Text>
          <Text style={styles.paragraph}>
            (a) Your use or misuse of the Platform;
          </Text>
          <Text style={styles.paragraph}>
            (b) Your violation of these Terms or any applicable law;
          </Text>
          <Text style={styles.paragraph}>
            (c) Your violation of any third-party rights, including intellectual property or privacy rights;
          </Text>
          <Text style={styles.paragraph}>
            (d) Any content you submit to the Platform;
          </Text>
          <Text style={styles.paragraph}>
            (e) Any Event or Venue you organize, promote, or manage;
          </Text>
          <Text style={styles.paragraph}>
            (f) Any disputes between you and other Users, Organizers, or attendees.
          </Text>
          <Text style={styles.paragraph}>
            16.2 The Company reserves the right, at its own expense, to assume the exclusive defense and
            control of any matter subject to indemnification by you, in which case you will cooperate with
            the Company in asserting any available defenses.
          </Text>

          <Text style={styles.sectionTitle}>17. DISPUTE RESOLUTION AND ARBITRATION</Text>
          <Text style={styles.paragraph}>
            17.1 Informal Resolution:
          </Text>
          <Text style={styles.paragraph}>
            Before initiating any formal proceedings, you agree to first contact the Company's support team
            to attempt to resolve the dispute informally. The Company will respond within 14 business days.
          </Text>
          <Text style={styles.paragraph}>
            17.2 Governing Law:
          </Text>
          <Text style={styles.paragraph}>
            These Terms and any dispute arising out of or relating to them shall be governed by and
            construed in accordance with the laws of the Republic of Uganda, without regard to its conflict
            of laws principles.
          </Text>
          <Text style={styles.paragraph}>
            17.3 Arbitration:
          </Text>
          <Text style={styles.paragraph}>
            (a) Any dispute, controversy, or claim arising out of or relating to these Terms, including
            the validity, interpretation, breach, or termination thereof, shall be resolved by binding
            arbitration in accordance with the Arbitration and Conciliation Act, Cap. 4 of the Laws of
            Uganda;
          </Text>
          <Text style={styles.paragraph}>
            (b) The arbitration shall be conducted in Kampala, Uganda, by a single arbitrator appointed
            by mutual agreement of the parties, or failing such agreement, by the Center for Arbitration
            and Dispute Resolution (CADER) in Kampala;
          </Text>
          <Text style={styles.paragraph}>
            (c) The language of the arbitration shall be English;
          </Text>
          <Text style={styles.paragraph}>
            (d) Each party shall bear its own costs and legal fees, and the arbitrator's fees shall be
            borne equally by the parties, unless otherwise determined by the arbitrator based on the
            outcome of the proceedings.
          </Text>
          <Text style={styles.paragraph}>
            17.4 Exceptions to Arbitration:
          </Text>
          <Text style={styles.paragraph}>
            Nothing in this Section shall prevent either party from seeking injunctive or other equitable
            relief from a court of competent jurisdiction to protect its intellectual property rights or
            to address claims of fraud, misappropriation, or unauthorized access.
          </Text>
          <Text style={styles.paragraph}>
            17.5 Class Action Waiver:
          </Text>
          <Text style={styles.paragraph}>
            All disputes shall be resolved on an individual basis. You waive any right to participate in
            any class action, class arbitration, or representative proceeding against the Company.
          </Text>
          <Text style={styles.paragraph}>
            17.6 Time Limitation:
          </Text>
          <Text style={styles.paragraph}>
            Any claim or cause of action arising out of or related to these Terms must be filed within
            one (1) year after such claim or cause of action arose, or be forever barred.
          </Text>

          <Text style={styles.sectionTitle}>18. TERMINATION AND ACCOUNT SUSPENSION</Text>
          <Text style={styles.paragraph}>
            18.1 Termination by User:
          </Text>
          <Text style={styles.paragraph}>
            You may terminate your Account at any time by deactivating it through your profile settings
            or by contacting support. Termination does not relieve you of obligations incurred prior to
            termination, including payment obligations.
          </Text>
          <Text style={styles.paragraph}>
            18.2 Termination by Company:
          </Text>
          <Text style={styles.paragraph}>
            The Company may terminate or suspend your Account immediately, without prior notice, for:
          </Text>
          <Text style={styles.paragraph}>
            (a) Breach of any provision of these Terms;
          </Text>
          <Text style={styles.paragraph}>
            (b) Conduct that the Company believes is fraudulent, illegal, or harmful to the Platform,
            its Users, or the public;
          </Text>
          <Text style={styles.paragraph}>
            (c) Extended inactivity (more than 12 months);
          </Text>
          <Text style={styles.paragraph}>
            (d) At the Company's sole discretion, for any reason or no reason.
          </Text>
          <Text style={styles.paragraph}>
            18.3 Effects of Termination:
          </Text>
          <Text style={styles.paragraph}>
            (a) Upon termination, your right to access and use the Platform immediately ceases;
          </Text>
          <Text style={styles.paragraph}>
            (b) Sections of these Terms that by their nature should survive termination shall survive,
            including but not limited to Sections 11, 12, 13, 15, 16, 17, and 19;
          </Text>
          <Text style={styles.paragraph}>
            (c) Outstanding payment obligations to Organizers or the Company shall remain payable;
          </Text>
          <Text style={styles.paragraph}>
            (d) The Company may retain your data as required by law and as described in Section 12.
          </Text>

          <Text style={styles.sectionTitle}>19. ELECTRONIC COMMUNICATIONS AND NOTICES</Text>
          <Text style={styles.paragraph}>
            19.1 By using the Platform, you consent to receive electronic communications from the Company,
            including emails, push notifications, and in-app messages, for transactional, informational,
            and promotional purposes.
          </Text>
          <Text style={styles.paragraph}>
            19.2 You may opt out of promotional communications at any time by adjusting your notification
            preferences. Transactional communications (purchase confirmations, payout notifications,
            account updates) are mandatory for Account functionality.
          </Text>
          <Text style={styles.paragraph}>
            19.3 Legal notices may be sent to the email address associated with your Account or posted
            publicly on the Platform. It is your responsibility to monitor these channels for important
            notices.
          </Text>

          <Text style={styles.sectionTitle}>20. FORCE MAJEURE</Text>
          <Text style={styles.paragraph}>
            20.1 The Company shall not be liable for any failure or delay in performing its obligations
            under these Terms if such failure or delay is caused by circumstances beyond its reasonable
            control, including but not limited to acts of God, war, terrorism, civil unrest, public health
            emergencies, government actions, natural disasters, fire, floods, earthquakes, strikes,
            telecommunications failures, power outages, or failures of third-party service providers.
          </Text>
          <Text style={styles.paragraph}>
            20.2 The Company will use reasonable efforts to mitigate the effects of any force majeure event
            and to resume performance as soon as practicable.
          </Text>

          <Text style={styles.sectionTitle}>21. SEVERABILITY</Text>
          <Text style={styles.paragraph}>
            21.1 If any provision of these Terms is found to be invalid, illegal, or unenforceable by a
            court of competent jurisdiction, such provision shall be severed, and the remaining provisions
            shall continue in full force and effect. The invalid provision shall be replaced by a valid
            provision that most closely reflects the original intent.
          </Text>

          <Text style={styles.sectionTitle}>22. WAIVER</Text>
          <Text style={styles.paragraph}>
            22.1 The failure of the Company to enforce any right or provision of these Terms shall not
            constitute a waiver of such right or provision. No waiver of any term shall be deemed a
            further or continuing waiver of such term or any other term.
          </Text>

          <Text style={styles.sectionTitle}>23. ENTIRE AGREEMENT</Text>
          <Text style={styles.paragraph}>
            23.1 These Terms, together with the Privacy Policy and any additional terms incorporated by
            reference, constitute the entire agreement between you and the Company regarding your use of
            the Platform and supersede all prior or contemporaneous agreements, communications, and
            proposals, whether oral or written.
          </Text>

          <Text style={styles.sectionTitle}>24. ASSIGNMENT</Text>
          <Text style={styles.paragraph}>
            24.1 You may not assign or transfer your rights or obligations under these Terms without the
            prior written consent of the Company. The Company may assign or transfer its rights and
            obligations freely, including in connection with a merger, acquisition, or sale of assets.
          </Text>

          <Text style={styles.sectionTitle}>25. CONTACT INFORMATION</Text>
          <Text style={styles.paragraph}>
            For questions, concerns, or complaints regarding these Terms or the Platform, please contact us at:
          </Text>
          <Text style={styles.paragraph}>
            YoVibe Support{'\n'}
            Email: support@yovibe.net{'\n'}
            Website: https://yovibe.net{'\n'}
            Jurisdiction: Republic of Uganda
          </Text>

          <TouchableOpacity
            style={styles.agreeButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.agreeButtonText}>I Agree to Terms</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  lastUpdated: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 20,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#00D4FF",
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: "#CCCCCC",
    lineHeight: 20,
    marginBottom: 8,
  },
  agreeButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  agreeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
})

export default TermsAndConditionsScreen