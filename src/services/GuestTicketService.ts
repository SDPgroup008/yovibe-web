import { supabase } from "../config/supabase";

export type GuestTicketFunding = "complimentary" | "sponsored";
export type GuestTicketDistribution = "direct" | "bulk" | "claim_link" | "redemption_code";

export type GuestRecipient = {
  name: string;
  email?: string;
  phone?: string;
  organisation?: string;
  notes?: string;
};

export type GuestAllocation = {
  id: string;
  allocation_name: string;
  funding_type: GuestTicketFunding;
  distribution_method: GuestTicketDistribution;
  entry_fee_type: string;
  total_quantity: number;
  reserved_quantity: number;
  issued_quantity: number;
  released_quantity: number;
  cancelled_quantity: number;
  status: string;
  expires_at?: string | null;
  created_at: string;
};

export type GuestTicketOverview = {
  allocations: GuestAllocation[];
  guests: Array<Record<string, any>>;
  sponsorships: Array<Record<string, any>>;
  summary: {
    complimentaryIssued: number;
    sponsoredDistributed: number;
    reserved: number;
    cancelled: number;
    checkedIn: number;
    faceValue: number;
    sponsorshipRevenue: number;
  };
};

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch("/.netlify/functions/guest-ticket-allocations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to process guest tickets");
  return payload as T;
}

const GuestTicketService = {
  overview(eventSlug: string) { return request<GuestTicketOverview>({ action: "overview", eventSlug }); },
  issueDirect(input: Record<string, unknown>) { return request<{ ids: string[] }>({ action: "issue_direct", ...input }); },
  bulkGenerate(input: Record<string, unknown>) { return request<{ allocationId: string; issued: number; unassigned: number }>({ action: "bulk_generate", ...input }); },
  createClaimLink(input: Record<string, unknown>) { return request<{ allocationId: string; claimUrl: string }>({ action: "create_claim_link", ...input }); },
  generateCodes(input: Record<string, unknown>) { return request<{ allocationId: string; codes: string[]; redeemUrl: string }>({ action: "generate_codes", ...input }); },
  createSponsorship(input: Record<string, unknown>) { return request<{ allocationId: string; paymentUrl: string; order: Record<string, any> }>({ action: "create_sponsorship", ...input }); },
  createSponsoredClaimLink(eventSlug: string, allocationId: string) { return request<{ claimUrl: string }>({ action: "create_sponsored_claim_link", eventSlug, allocationId }); },
  releaseAllocation(eventSlug: string, allocationId: string) { return request<{ released: number }>({ action: "release_allocation", eventSlug, allocationId }); },
  cancelTicket(eventSlug: string, ticketId: string) { return request<{ success: boolean }>({ action: "cancel_ticket", eventSlug, ticketId }); },
  resendTicket(eventSlug: string, ticketId: string) { return request<{ success: boolean }>({ action: "resend_ticket", eventSlug, ticketId }); },
};

export default GuestTicketService;
