-- Guest Tickets: complimentary and sponsored allocation ledger.
-- This is additive. Paid checkout continues to use create_tickets_batch;
-- guest issuance uses the allocation RPC below so reservations and issuance
-- counters are changed in the same transaction as ticket creation.

CREATE TABLE IF NOT EXISTS public.ticket_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text NOT NULL REFERENCES public.events(slug) ON DELETE CASCADE,
  organiser_id text NOT NULL,
  allocation_name text NOT NULL,
  funding_type text NOT NULL CHECK (funding_type IN ('complimentary', 'sponsored')),
  distribution_method text NOT NULL CHECK (distribution_method IN ('direct', 'bulk', 'claim_link', 'redemption_code')),
  entry_fee_type text NOT NULL,
  beneficiary_organisation text,
  issuance_reason text,
  internal_notes text,
  total_quantity integer NOT NULL CHECK (total_quantity > 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  issued_quantity integer NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  released_quantity integer NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  cancelled_quantity integer NOT NULL DEFAULT 0 CHECK (cancelled_quantity >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'paused', 'fully_claimed', 'expired', 'cancelled', 'awaiting_funding', 'ready_for_distribution', 'completed')),
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_quantity + issued_quantity + released_quantity + cancelled_quantity <= total_quantity)
);

CREATE TABLE IF NOT EXISTS public.ticket_allocation_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.ticket_allocations(id) ON DELETE CASCADE,
  row_number integer,
  full_name text,
  email text,
  phone text,
  organisation text,
  notes text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ticket_ids text[] NOT NULL DEFAULT '{}'::text[],
  delivery_status text NOT NULL DEFAULT 'not_requested' CHECK (delivery_status IN ('not_requested', 'queued', 'sent', 'failed')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'cancelled', 'invalid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_allocation_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL UNIQUE REFERENCES public.ticket_allocations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  password_hash text,
  max_per_claim integer NOT NULL DEFAULT 1 CHECK (max_per_claim > 0),
  max_per_email integer,
  allowed_email_domains text[] NOT NULL DEFAULT '{}'::text[],
  approved_email_hashes text[] NOT NULL DEFAULT '{}'::text[],
  recipient_requirements jsonb NOT NULL DEFAULT '{"name":true,"email":true,"phone":false}'::jsonb,
  show_remaining boolean NOT NULL DEFAULT true,
  custom_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_allocation_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.ticket_allocations(id) ON DELETE CASCADE,
  claim_token_id uuid REFERENCES public.ticket_allocation_claim_tokens(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  recipient_name text NOT NULL,
  recipient_email text,
  recipient_phone text,
  quantity integer NOT NULL CHECK (quantity > 0),
  verified_email_at timestamptz,
  ticket_ids text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'issued', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.ticket_allocations(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  masked_code text NOT NULL,
  recipient_email_hash text,
  recipient_phone_hash text,
  tickets_per_redemption integer NOT NULL DEFAULT 1 CHECK (tickets_per_redemption > 0),
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('scheduled', 'available', 'partially_redeemed', 'redeemed', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (redemption_count <= max_redemptions)
);

CREATE TABLE IF NOT EXISTS public.ticket_sponsorship_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL UNIQUE REFERENCES public.ticket_allocations(id) ON DELETE CASCADE,
  sponsor_name text NOT NULL,
  sponsor_organisation text,
  sponsor_email text NOT NULL,
  sponsor_phone text,
  sponsor_message text,
  sponsor_logo_url text,
  payment_token_hash text NOT NULL UNIQUE,
  payment_token_expires_at timestamptz,
  payment_reference text UNIQUE,
  provider_tracking_id text,
  provider_deposit_id text,
  payment_method text CHECK (payment_method IN ('credit_card', 'mobile_money')),
  currency text NOT NULL DEFAULT 'UGX',
  face_value numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  gateway_fee numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  organiser_net numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending_payment' CHECK (payment_status IN ('pending_payment', 'processing', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded')),
  payout_eligible boolean NOT NULL DEFAULT false,
  payout_status text NOT NULL DEFAULT 'pending',
  payment_deadline timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_issuance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid REFERENCES public.ticket_allocations(id) ON DELETE SET NULL,
  event_slug text NOT NULL,
  actor_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_claim_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.ticket_allocations(id) ON DELETE CASCADE,
  email_hash text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_public_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope, subject_hash)
);

CREATE TABLE IF NOT EXISTS public.ticket_allocation_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.ticket_allocations(id) ON DELETE CASCADE,
  requested_by text NOT NULL,
  format text NOT NULL CHECK (format IN ('csv', 'pdf', 'zip')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'expired')),
  asset_key text,
  error_message text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_allocations_event_idx ON public.ticket_allocations(event_slug, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_allocations_capacity_idx ON public.ticket_allocations(event_slug, entry_fee_type, status);
CREATE INDEX IF NOT EXISTS ticket_recipients_allocation_idx ON public.ticket_allocation_recipients(allocation_id, status);
CREATE INDEX IF NOT EXISTS ticket_claims_allocation_idx ON public.ticket_allocation_claims(allocation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_redemption_codes_allocation_idx ON public.ticket_redemption_codes(allocation_id, status);
CREATE INDEX IF NOT EXISTS ticket_audit_event_idx ON public.ticket_issuance_audits(event_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_claim_otps_lookup_idx ON public.ticket_claim_otps(allocation_id, email_hash, expires_at DESC);

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticket_capacity integer;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_ticket_capacity_check;
ALTER TABLE public.events ADD CONSTRAINT events_ticket_capacity_check CHECK (ticket_capacity IS NULL OR ticket_capacity > 0);

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS allocation_id uuid REFERENCES public.ticket_allocations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_id uuid REFERENCES public.ticket_allocation_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sponsorship_order_id uuid REFERENCES public.ticket_sponsorship_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funding_type text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS distribution_method text,
  ADD COLUMN IF NOT EXISTS original_face_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS beneficiary_amount_paid numeric(12,2),
  ADD COLUMN IF NOT EXISTS issuance_reason text,
  ADD COLUMN IF NOT EXISTS issued_by text,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_funding_type_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_funding_type_check CHECK (funding_type IN ('paid', 'complimentary', 'sponsored'));
-- Existing installations restrict these values to paid-checkout states. Guest
-- tickets are intentionally zero-value and must not masquerade as paid sales,
-- so extend the existing constraints rather than bypassing them.
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_payment_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_payment_status_check
  CHECK (payment_status IN ('pending', 'completed', 'failed', 'not_required'));
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_payment_method_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_payment_method_check
  CHECK (payment_method IN ('mobile_money', 'credit_card', 'bank_transfer', 'complimentary'));
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_payout_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_payout_status_check
  CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed', 'pending_review', 'not_eligible'));
CREATE INDEX IF NOT EXISTS tickets_allocation_idx ON public.tickets(allocation_id, status);
CREATE INDEX IF NOT EXISTS tickets_claim_idx ON public.tickets(claim_id);
CREATE INDEX IF NOT EXISTS tickets_sponsorship_idx ON public.tickets(sponsorship_order_id);

ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS sponsorship_order_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.is_ticket_allocation_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.uid = auth.uid()::text AND u.user_type = 'admin' AND coalesce(u.is_deleted, false) = false);
$$;

CREATE OR REPLACE FUNCTION public.owns_ticket_allocation_event(p_event_slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.slug = p_event_slug AND (e.created_by_auth = auth.uid() OR e.created_by::text = auth.uid()::text)
  );
$$;

CREATE OR REPLACE FUNCTION public.create_ticket_allocation(
  p_event_slug text, p_organiser_id text, p_name text, p_funding_type text,
  p_distribution_method text, p_entry_fee_type text, p_total_quantity integer,
  p_reserve_quantity integer, p_beneficiary_organisation text DEFAULT NULL,
  p_issuance_reason text DEFAULT NULL, p_internal_notes text DEFAULT NULL,
  p_eligibility jsonb DEFAULT '{}'::jsonb, p_starts_at timestamptz DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL, p_initial_status text DEFAULT 'active'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_max integer; v_event_capacity integer; v_issued integer; v_reserved integer;
BEGIN
  IF p_total_quantity IS NULL OR p_total_quantity < 1 OR p_reserve_quantity < 0 OR p_reserve_quantity > p_total_quantity THEN RAISE EXCEPTION 'INVALID_ALLOCATION_QUANTITY'; END IF;
  IF p_funding_type NOT IN ('complimentary','sponsored') OR p_distribution_method NOT IN ('direct','bulk','claim_link','redemption_code') THEN RAISE EXCEPTION 'INVALID_ALLOCATION_TYPE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_event_slug || ':' || p_entry_fee_type));
  SELECT e.ticket_capacity INTO v_event_capacity FROM public.events e WHERE e.slug = p_event_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;
  SELECT (f.value->>'maxTickets')::integer INTO v_max
  FROM public.events e CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.entry_fees, '[]'::jsonb)) f
  WHERE e.slug = p_event_slug AND f.value->>'name' = p_entry_fee_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND'; END IF;
  SELECT count(*) INTO v_issued FROM public.tickets WHERE event_slug = p_event_slug AND entry_fee_type = p_entry_fee_type AND status IN ('active','used','pending');
  SELECT coalesce(sum(reserved_quantity), 0) INTO v_reserved FROM public.ticket_allocations WHERE event_slug = p_event_slug AND entry_fee_type = p_entry_fee_type AND status IN ('scheduled','active','paused','awaiting_funding','ready_for_distribution');
  IF v_max IS NOT NULL AND v_issued + v_reserved + p_reserve_quantity > v_max THEN RAISE EXCEPTION 'SOLD_OUT'; END IF;
  IF v_event_capacity IS NOT NULL AND (SELECT count(*) FROM public.tickets WHERE event_slug = p_event_slug AND status IN ('active','used','pending')) + (SELECT coalesce(sum(reserved_quantity),0) FROM public.ticket_allocations WHERE event_slug = p_event_slug AND status IN ('scheduled','active','paused','awaiting_funding','ready_for_distribution')) + p_reserve_quantity > v_event_capacity THEN RAISE EXCEPTION 'EVENT_SOLD_OUT'; END IF;
  INSERT INTO public.ticket_allocations(event_slug, organiser_id, allocation_name, funding_type, distribution_method, entry_fee_type, beneficiary_organisation, issuance_reason, internal_notes, total_quantity, reserved_quantity, eligibility, starts_at, expires_at, status, created_by)
  VALUES (p_event_slug, p_organiser_id, p_name, p_funding_type, p_distribution_method, p_entry_fee_type, p_beneficiary_organisation, p_issuance_reason, p_internal_notes, p_total_quantity, p_reserve_quantity, coalesce(p_eligibility,'{}'::jsonb), p_starts_at, p_expires_at, p_initial_status, p_organiser_id)
  RETURNING id INTO v_id;
  INSERT INTO public.ticket_issuance_audits(allocation_id,event_slug,actor_id,action,entity_type,entity_id,metadata) VALUES(v_id,p_event_slug,p_organiser_id,'allocation_created','ticket_allocation',v_id::text,jsonb_build_object('reservedQuantity',p_reserve_quantity));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.release_ticket_allocation_reservation(p_allocation_id uuid, p_actor_id text, p_reason text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ticket_allocations; v_release integer;
BEGIN
  SELECT * INTO a FROM public.ticket_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND'; END IF;
  IF a.status = 'completed' THEN RAISE EXCEPTION 'ALLOCATION_COMPLETED'; END IF;
  v_release := a.reserved_quantity;
  UPDATE public.ticket_allocations SET reserved_quantity = 0, released_quantity = released_quantity + v_release, status = CASE WHEN issued_quantity > 0 THEN 'completed' ELSE 'cancelled' END, updated_at = now() WHERE id = a.id;
  INSERT INTO public.ticket_issuance_audits(allocation_id,event_slug,actor_id,action,entity_type,entity_id,metadata) VALUES(a.id,a.event_slug,p_actor_id,'reservation_released','ticket_allocation',a.id::text,jsonb_build_object('quantity',v_release,'reason',p_reason));
  RETURN v_release;
END; $$;

-- Guest rows are produced only by trusted Netlify functions. They already include
-- signed QR data and all normal ticket fields. This RPC makes their allocation
-- accounting and capacity check atomic with the ticket inserts.
CREATE OR REPLACE FUNCTION public.issue_ticket_allocation_batch(p_allocation_id uuid, p_rows jsonb, p_actor_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ticket_allocations; v_count integer; v_max integer; v_event_max integer; v_sold integer; v_other_reserved integer; v_event_sold integer; v_event_reserved integer; v_ids text[];
BEGIN
  SELECT * INTO a FROM public.ticket_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND'; END IF;
  IF a.status NOT IN ('active','ready_for_distribution') OR (a.starts_at IS NOT NULL AND a.starts_at > now()) OR (a.expires_at IS NOT NULL AND a.expires_at <= now()) THEN RAISE EXCEPTION 'ALLOCATION_NOT_ACTIVE'; END IF;
  v_count := jsonb_array_length(coalesce(p_rows,'[]'::jsonb));
  IF v_count < 1 THEN RAISE EXCEPTION 'NO_TICKETS'; END IF;
  IF a.distribution_method <> 'direct' AND a.reserved_quantity < v_count THEN RAISE EXCEPTION 'ALLOCATION_EXHAUSTED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(a.event_slug || ':' || a.entry_fee_type));
  SELECT e.ticket_capacity INTO v_event_max FROM public.events e WHERE e.slug = a.event_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;
  SELECT (f.value->>'maxTickets')::integer INTO v_max FROM public.events e CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.entry_fees,'[]'::jsonb)) f WHERE e.slug = a.event_slug AND f.value->>'name' = a.entry_fee_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND'; END IF;
  SELECT count(*) INTO v_sold FROM public.tickets WHERE event_slug = a.event_slug AND entry_fee_type = a.entry_fee_type AND status IN ('active','used','pending');
  SELECT coalesce(sum(reserved_quantity),0) INTO v_other_reserved FROM public.ticket_allocations WHERE event_slug = a.event_slug AND entry_fee_type = a.entry_fee_type AND id <> a.id AND status IN ('scheduled','active','paused','awaiting_funding','ready_for_distribution');
  IF v_max IS NOT NULL AND v_sold + v_other_reserved + v_count > v_max THEN RAISE EXCEPTION 'SOLD_OUT'; END IF;
  IF v_event_max IS NOT NULL THEN
    SELECT count(*) INTO v_event_sold FROM public.tickets WHERE event_slug = a.event_slug AND status IN ('active','used','pending');
    SELECT coalesce(sum(reserved_quantity),0) INTO v_event_reserved FROM public.ticket_allocations WHERE event_slug = a.event_slug AND id <> a.id AND status IN ('scheduled','active','paused','awaiting_funding','ready_for_distribution');
    IF v_event_sold + v_event_reserved + v_count > v_event_max THEN RAISE EXCEPTION 'EVENT_SOLD_OUT'; END IF;
  END IF;
  INSERT INTO public.tickets (id,event_id,event_slug,event_name,venue_name,buyer_id,buyer_name,buyer_email,delivery_email,ticket_ref,buyer_phone,quantity,total_amount,table_total_amount,table_size,seat_number,table_number,table_group_id,base_price,late_fee,venue_revenue,app_commission,purchase_date,purchase_deadline,event_start_time,qr_code,qr_code_data_url,buyer_photo_url,photo_upload_token,photo_upload_token_expires_at,status,validation_history,entry_fee_type,is_late_purchase,is_scanned,expires_at,payout_eligible,payout_status,payment_id,payment_status,payment_reference,pesapal_transaction_id,pesapal_confirmation_code,pawapay_deposit_id,gateway_fee,payment_method,payment_provider,payment_number,payment_name,qr_signature,reentry_pass,refunded_amount,refund_status,allocation_id,claim_id,sponsorship_order_id,funding_type,distribution_method,original_face_value,beneficiary_amount_paid,issuance_reason,issued_by,issued_at,created_at)
  SELECT r->>'id',r->>'event_id',r->>'event_slug',r->>'event_name',r->>'venue_name',r->>'buyer_id',r->>'buyer_name',r->>'buyer_email',r->>'delivery_email',r->>'ticket_ref',r->>'buyer_phone',coalesce((r->>'quantity')::integer,1),(r->>'total_amount')::double precision,(r->>'table_total_amount')::double precision,(r->>'table_size')::integer,r->>'seat_number',(r->>'table_number')::integer,r->>'table_group_id',(r->>'base_price')::double precision,coalesce((r->>'late_fee')::double precision,0),0,0,(r->>'purchase_date')::timestamptz,(r->>'purchase_deadline')::timestamptz,(r->>'event_start_time')::timestamptz,r->>'qr_code',r->>'qr_code_data_url',r->>'buyer_photo_url',r->>'photo_upload_token',(r->>'photo_upload_token_expires_at')::timestamptz,coalesce(r->>'status','active'),coalesce(r->'validation_history','[]'::jsonb),a.entry_fee_type,coalesce((r->>'is_late_purchase')::boolean,false),false,(r->>'expires_at')::timestamptz,false,'not_eligible',r->>'payment_id','not_required',r->>'payment_reference',NULL,NULL,NULL,0,'complimentary',NULL,NULL,NULL,r->>'qr_signature',coalesce(r->'reentry_pass','null'::jsonb),0,'none',a.id,(r->>'claim_id')::uuid,(r->>'sponsorship_order_id')::uuid,a.funding_type,a.distribution_method,coalesce((r->>'original_face_value')::numeric,0),0,a.issuance_reason,p_actor_id,now(),now()
  FROM jsonb_array_elements(p_rows) r;
  SELECT coalesce(array_agg(r->>'id'),'{}'::text[]) INTO v_ids FROM jsonb_array_elements(p_rows) r;
  UPDATE public.ticket_allocations SET reserved_quantity = CASE WHEN distribution_method = 'direct' THEN reserved_quantity ELSE reserved_quantity - v_count END, issued_quantity = issued_quantity + v_count, status = CASE WHEN distribution_method <> 'direct' AND reserved_quantity = v_count THEN 'fully_claimed' ELSE status END, updated_at = now() WHERE id = a.id;
  INSERT INTO public.ticket_issuance_audits(allocation_id,event_slug,actor_id,action,entity_type,entity_id,metadata) VALUES(a.id,a.event_slug,p_actor_id,'tickets_issued','ticket_batch',a.id::text,jsonb_build_object('quantity',v_count));
  RETURN to_jsonb(v_ids);
END; $$;

CREATE OR REPLACE FUNCTION public.expire_ticket_allocations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.ticket_allocations SET released_quantity = released_quantity + reserved_quantity, reserved_quantity = 0, status = 'expired', updated_at = now()
  WHERE status IN ('scheduled','active','paused','awaiting_funding','ready_for_distribution') AND expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.ticket_redemption_codes c SET status = 'expired', updated_at = now() FROM public.ticket_allocations a WHERE c.allocation_id = a.id AND a.status = 'expired' AND c.status IN ('scheduled','available','partially_redeemed');
  RETURN v_count;
END; $$;

-- Atomically consumes a redemption slot before the trusted worker issues its
-- ticket. A failed issuance is reconciled by the caller and audited; this
-- prevents two concurrent requests from ever using a single-use code twice.
CREATE OR REPLACE FUNCTION public.consume_ticket_redemption_code(p_code_hash text, p_event_slug text, p_email_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.ticket_redemption_codes; a public.ticket_allocations;
BEGIN
  SELECT * INTO c FROM public.ticket_redemption_codes WHERE code_hash = p_code_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CODE_NOT_FOUND'; END IF;
  SELECT * INTO a FROM public.ticket_allocations WHERE id = c.allocation_id FOR UPDATE;
  IF NOT FOUND OR a.event_slug <> p_event_slug THEN RAISE EXCEPTION 'CODE_NOT_FOUND'; END IF;
  IF c.status IN ('revoked','redeemed','expired') OR (c.starts_at IS NOT NULL AND c.starts_at > now()) OR (c.expires_at IS NOT NULL AND c.expires_at <= now()) OR c.redemption_count >= c.max_redemptions THEN RAISE EXCEPTION 'CODE_UNAVAILABLE'; END IF;
  IF c.recipient_email_hash IS NOT NULL AND c.recipient_email_hash IS DISTINCT FROM p_email_hash THEN RAISE EXCEPTION 'CODE_RECIPIENT_MISMATCH'; END IF;
  UPDATE public.ticket_redemption_codes
  SET redemption_count = redemption_count + 1,
      status = CASE WHEN redemption_count + 1 >= max_redemptions THEN 'redeemed' ELSE 'partially_redeemed' END,
      updated_at = now()
  WHERE id = c.id;
  RETURN jsonb_build_object('codeId', c.id, 'allocationId', c.allocation_id, 'ticketsPerRedemption', c.tickets_per_redemption);
END; $$;

ALTER TABLE public.ticket_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_allocation_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_allocation_claim_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_allocation_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sponsorship_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_issuance_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_allocation_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allocation owners read allocations" ON public.ticket_allocations FOR SELECT USING (public.is_ticket_allocation_admin() OR public.owns_ticket_allocation_event(event_slug));
CREATE POLICY "allocation owners read recipients" ON public.ticket_allocation_recipients FOR SELECT USING (EXISTS (SELECT 1 FROM public.ticket_allocations a WHERE a.id = allocation_id AND (public.is_ticket_allocation_admin() OR public.owns_ticket_allocation_event(a.event_slug))));
CREATE POLICY "allocation owners read claims" ON public.ticket_allocation_claims FOR SELECT USING (EXISTS (SELECT 1 FROM public.ticket_allocations a WHERE a.id = allocation_id AND (public.is_ticket_allocation_admin() OR public.owns_ticket_allocation_event(a.event_slug))));
CREATE POLICY "allocation owners read codes" ON public.ticket_redemption_codes FOR SELECT USING (EXISTS (SELECT 1 FROM public.ticket_allocations a WHERE a.id = allocation_id AND (public.is_ticket_allocation_admin() OR public.owns_ticket_allocation_event(a.event_slug))));
CREATE POLICY "allocation owners read sponsorships" ON public.ticket_sponsorship_orders FOR SELECT USING (EXISTS (SELECT 1 FROM public.ticket_allocations a WHERE a.id = allocation_id AND (public.is_ticket_allocation_admin() OR public.owns_ticket_allocation_event(a.event_slug))));
CREATE POLICY "allocation owners read audits" ON public.ticket_issuance_audits FOR SELECT USING (public.is_ticket_allocation_admin() OR public.owns_ticket_allocation_event(event_slug));
CREATE POLICY "allocation owners read exports" ON public.ticket_allocation_exports FOR SELECT USING (EXISTS (SELECT 1 FROM public.ticket_allocations a WHERE a.id = allocation_id AND (public.is_ticket_allocation_admin() OR public.owns_ticket_allocation_event(a.event_slug))));

-- The existing tickets_select_authorized policy already allows a signed-in
-- recipient to read a ticket through buyer_email. No extra tickets policy is
-- needed for Guest Tickets, avoiding an overlapping access rule.

REVOKE ALL ON FUNCTION public.create_ticket_allocation(text,text,text,text,text,text,integer,integer,text,text,text,jsonb,timestamptz,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_ticket_allocation_batch(uuid,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_ticket_allocation_reservation(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_ticket_allocations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_ticket_redemption_code(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_allocation(text,text,text,text,text,text,integer,integer,text,text,text,jsonb,timestamptz,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_ticket_allocation_batch(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ticket_allocation_reservation(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_ticket_allocations() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ticket_redemption_code(text,text,text) TO service_role;
