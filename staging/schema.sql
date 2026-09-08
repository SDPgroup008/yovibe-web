-- Generated from yovibe-schema-catalog.csv. Do not edit by hand.

-- Run: npm run staging:schema

begin;

set local check_function_bodies = off;

create schema if not exists public;

create schema if not exists extensions;

create schema if not exists vault;

create extension if not exists "pg_stat_statements" with schema "extensions";

create extension if not exists "pgcrypto" with schema "extensions";

create extension if not exists "supabase_vault" with schema "vault";

create extension if not exists "uuid-ossp" with schema "extensions";

do $ddl$ begin create type "public"."user_type_enum" as enum ('regular_user', 'club_owner', 'admin'); exception when duplicate_object then null; end $ddl$;

create table if not exists "public"."admins" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now()
);

create table if not exists "public"."analytics_sessions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "unique_visitor_id" text not null,
  "is_authenticated" boolean default false,
  "start_time" timestamp with time zone default now(),
  "end_time" timestamp with time zone,
  "duration" integer,
  "platform" text,
  "user_agent" text,
  "visit_number" integer
);

create table if not exists "public"."daily_notification_stats" (
  "id" uuid default gen_random_uuid() not null,
  "date" date not null,
  "notifications_sent" integer default 0,
  "users_received" integer default 0,
  "notifications_opened" integer default 0,
  "new_subscriptions" integer default 0,
  "created_at" timestamp with time zone default now()
);

create table if not exists "public"."event_staff_tokens" (
  "id" uuid default gen_random_uuid() not null,
  "event_id" text not null,
  "token" text default gen_random_uuid()::text not null,
  "label" text,
  "created_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone not null,
  "created_by" uuid
);

create table if not exists "public"."events" (
  "slug" text not null,
  "name" text not null,
  "venue_slug" text not null,
  "venue_name" text not null,
  "description" text,
  "date" timestamp with time zone not null,
  "time" text,
  "poster_image_url" text,
  "artists" text[],
  "is_featured" boolean default false,
  "location" text,
  "price_indicator" integer default 1,
  "is_free_entry" boolean default false,
  "entry_fees" jsonb,
  "ticket_contacts" jsonb,
  "attendees" text[],
  "created_by" uuid,
  "created_by_type" text,
  "payment_methods" jsonb,
  "is_deleted" boolean default false,
  "created_at" timestamp with time zone default now(),
  "deleted_at" timestamp with time zone,
  "source_url" text,
  "created_by_auth" uuid,
  "ticket_design" jsonb,
  "event_status" text default 'scheduled'::text not null,
  "postponed_to" timestamp with time zone,
  "late_fee_percent" numeric(4,2) default 0 not null,
  "payout_config" jsonb default '{}'::jsonb not null
);

create table if not exists "public"."notification_analytics" (
  "id" uuid default gen_random_uuid() not null,
  "notification_id" uuid,
  "total_sent" integer default 0,
  "total_opened" integer default 0,
  "total_read" integer default 0,
  "unique_users_received" integer default 0,
  "unique_users_opened" integer default 0,
  "created_at" timestamp with time zone default now()
);

create table if not exists "public"."notification_tokens" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "token" text not null,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "device_info" jsonb default '{}'::jsonb,
  "subscribed_at" timestamp with time zone default now(),
  "last_active_at" timestamp with time zone default now(),
  "is_authenticated" boolean default false,
  "user_email" text,
  "user_name" text
);

create table if not exists "public"."notification_user_interactions" (
  "id" uuid default gen_random_uuid() not null,
  "notification_id" uuid not null,
  "user_id" text not null,
  "received_at" timestamp with time zone default now(),
  "opened_at" timestamp with time zone,
  "read_at" timestamp with time zone
);

create table if not exists "public"."notifications" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "title" text not null,
  "body" text not null,
  "type" text not null,
  "data" jsonb,
  "image_url" text,
  "deep_link" text,
  "is_read" boolean default false,
  "created_at" timestamp with time zone default now(),
  "read_at" timestamp with time zone,
  "opened_at" timestamp with time zone
);

create table if not exists "public"."organizer_wallets" (
  "id" uuid default gen_random_uuid() not null,
  "organizer_id" text not null,
  "available_balance" double precision default 0,
  "pending_balance" double precision default 0,
  "total_earnings" double precision default 0,
  "total_payouts" double precision default 0,
  "last_payout_date" timestamp with time zone,
  "last_updated" timestamp with time zone default now()
);

create table if not exists "public"."payout_otps" (
  "id" uuid default uuid_generate_v4() not null,
  "user_id" uuid not null,
  "email" text not null,
  "otp" text not null,
  "expires_at" timestamp with time zone not null,
  "used" boolean default false,
  "created_at" timestamp with time zone default now()
);

create table if not exists "public"."payouts" (
  "id" uuid default gen_random_uuid() not null,
  "organizer_id" text not null,
  "ticket_ids" text[],
  "amount" double precision not null,
  "status" text not null,
  "request_date" timestamp with time zone default now(),
  "processed_date" timestamp with time zone,
  "failure_reason" text,
  "transaction_reference" text,
  "payout_method" text not null,
  "recipient_name" text not null,
  "recipient_account_number" text,
  "recipient_phone_number" text,
  "recipient_bank_name" text,
  "metadata" jsonb default '{}'::jsonb,
  "admin_id" text,
  "admin_note" text,
  "approved_amount" double precision,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "email_sent_at" timestamp with time zone,
  "email_to" text,
  "event_id" text
);

create table if not exists "public"."pending_ticket_fulfillments" (
  "id" uuid default gen_random_uuid() not null,
  "payment_id" text not null,
  "pawapay_deposit_id" text,
  "buyer_email" text not null,
  "buyer_name" text,
  "buyer_id" uuid,
  "event_id" text not null,
  "event_name" text,
  "quantity" integer default 1 not null,
  "amount" double precision not null,
  "status" text default 'payment_confirmed'::text not null,
  "ticket_ids" text[],
  "last_error" text,
  "attempt_count" integer default 0 not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "admin_resolved_by" text,
  "admin_resolved_at" timestamp with time zone,
  "attendee_names" text[],
  "ticket_type" text,
  "payload" jsonb,
  "processing_started_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "next_retry_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

create table if not exists "public"."refund_requests" (
  "id" uuid default gen_random_uuid() not null,
  "request_reference" text not null,
  "buyer_id" uuid,
  "buyer_email" text not null,
  "event_id" text not null,
  "ticket_id" text,
  "ticket_ids" text[] default '{}'::text[] not null,
  "installment_plan_id" uuid,
  "payment_provider" text not null,
  "payment_reference" text,
  "processor_reference" text,
  "processor_confirmation_code" text,
  "reason_code" text not null,
  "requested_amount" numeric(12,2) not null,
  "approved_amount" numeric(12,2),
  "refunded_amount" numeric(12,2) default 0 not null,
  "currency" text default 'UGX'::text not null,
  "status" text default 'pending_admin_review'::text not null,
  "buyer_note" text,
  "admin_note" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "external_refund_id" text,
  "idempotency_key" text not null,
  "processor_payload" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "retry_count" integer default 0 not null,
  "chargeback_dispute_id" text,
  "chargeback_reason" text,
  "chargeback_filed_at" timestamp with time zone,
  "notification_sent" boolean default false not null,
  "clawback_amount" numeric(12,2)
);

create table if not exists "public"."refund_status_history" (
  "id" uuid default gen_random_uuid() not null,
  "refund_request_id" uuid not null,
  "from_status" text,
  "to_status" text not null,
  "actor_id" uuid,
  "actor_type" text not null,
  "note" text,
  "processor_payload" jsonb,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."seat_holds" (
  "id" uuid default gen_random_uuid() not null,
  "event_slug" text not null,
  "fee_type" text not null,
  "seat_number" integer not null,
  "session_id" text not null,
  "expires_at" timestamp with time zone default now() + '00:10:00'::interval not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."ticket_email_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "ticket_id" text not null,
  "fulfillment_id" uuid,
  "idempotency_key" text not null,
  "recipient_email" text not null,
  "payload" jsonb not null,
  "status" text default 'pending'::text not null,
  "attempt_count" integer default 0 not null,
  "next_retry_at" timestamp with time zone default now() not null,
  "processing_started_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "provider" text,
  "provider_message_id" text,
  "last_error" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."ticket_installment_plans" (
  "id" uuid default gen_random_uuid() not null,
  "buyer_id" text,
  "buyer_email" text not null,
  "buyer_name" text,
  "event_id" text not null,
  "event_name" text,
  "event_date" timestamp with time zone,
  "ticket_type" text,
  "quantity" integer default 1 not null,
  "buyer_names" jsonb default '[]'::jsonb not null,
  "buyer_emails" jsonb default '[]'::jsonb not null,
  "delivery_emails" jsonb default '[]'::jsonb not null,
  "payer_email" text default ''::text not null,
  "is_table_entry" boolean default false not null,
  "table_size" integer default 1 not null,
  "buyer_photo_url" text,
  "payment_provider" text,
  "payment_number" text,
  "base_total" integer not null,
  "late_fee" integer default 0 not null,
  "total_amount" integer not null,
  "installments" jsonb default '[]'::jsonb not null,
  "installments_paid" integer default 0 not null,
  "amount_paid" integer default 0 not null,
  "status" text default 'active'::text not null,
  "ticket_ids" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "refund_status" text default 'none'::text not null,
  "refund_closed_at" timestamp with time zone,
  "seat_number" integer,
  "table_number" integer,
  "reservation_id" uuid,
  "checkout_hold_id" uuid,
  "reservation_status" text default 'none'::text not null,
  "reservation_expires_at" timestamp with time zone
);

create table if not exists "public"."ticket_inventory_holds" (
  "id" uuid default gen_random_uuid() not null,
  "event_slug" text not null,
  "fee_type" text not null,
  "resource_type" text not null,
  "resource_number" integer not null,
  "hold_kind" text default 'checkout'::text not null,
  "session_id" text,
  "installment_plan_id" uuid,
  "status" text default 'active'::text not null,
  "expires_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."ticket_validations" (
  "id" text default gen_random_uuid() not null,
  "location" text,
  "status" text not null,
  "reason" text,
  "event_slug" text,
  "eventId" text,
  "ticketId" text,
  "validatedAt" timestamp with time zone,
  "validatedBy" text
);

create table if not exists "public"."tickets" (
  "id" text default gen_random_uuid() not null,
  "event_id" text not null,
  "event_name" text not null,
  "buyer_id" text,
  "buyer_name" text not null,
  "buyer_email" text,
  "buyer_phone" text,
  "quantity" integer not null,
  "total_amount" double precision not null,
  "base_price" double precision not null,
  "late_fee" double precision default 0,
  "venue_revenue" double precision not null,
  "app_commission" double precision not null,
  "qr_code" text not null,
  "qr_code_data_url" text,
  "buyer_photo_url" text,
  "status" text not null,
  "entry_fee_type" text,
  "payment_id" text,
  "payment_status" text,
  "payment_reference" text,
  "pesapal_transaction_id" text,
  "is_late_purchase" boolean default false,
  "is_scanned" boolean default false,
  "purchase_deadline" timestamp with time zone not null,
  "expires_at" timestamp with time zone not null,
  "payout_eligible" boolean default false,
  "payout_status" text default 'pending'::text,
  "scanned_at" timestamp with time zone,
  "payout_date" timestamp with time zone,
  "payment_method" text,
  "payment_provider" text,
  "payment_number" text,
  "payment_name" text,
  "qr_signature" text,
  "purchase_date" timestamp with time zone default now(),
  "event_start_time" timestamp with time zone not null,
  "validation_history" jsonb default '[]'::jsonb,
  "pawapay_deposit_id" text,
  "event_slug" text,
  "created_at" timestamp with time zone default now(),
  "table_total_amount" double precision,
  "table_size" integer,
  "photo_upload_token" text,
  "photo_upload_token_expires_at" timestamp with time zone,
  "table_group_id" text,
  "delivery_email" text,
  "ticket_ref" text,
  "reentry_pass" jsonb,
  "seat_number" text,
  "venue_name" text,
  "pesapal_confirmation_code" text,
  "gateway_fee" numeric(12,2) default 0 not null,
  "installment_plan_id" uuid,
  "refunded_amount" numeric(12,2) default 0 not null,
  "refund_status" text default 'none'::text not null,
  "table_number" integer
);

create table if not exists "public"."users" (
  "id" uuid default gen_random_uuid() not null,
  "uid" text not null,
  "email" text not null,
  "user_type" text not null,
  "display_name" text,
  "photo_url" text,
  "is_frozen" boolean default false,
  "is_deleted" boolean default false,
  "payment_details" jsonb,
  "created_at" timestamp with time zone default now(),
  "last_login_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "frozen_at" timestamp with time zone,
  "venue_id" text
);

create table if not exists "public"."venue_ownership_requests" (
  "id" uuid default gen_random_uuid() not null,
  "venue_id" text not null,
  "venue_name" text not null,
  "user_id" uuid not null,
  "user_name" text not null,
  "user_email" text not null,
  "user_phone" text,
  "reason" text,
  "experience" text,
  "status" text not null,
  "requested_at" timestamp with time zone default now(),
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "review_note" text
);

create table if not exists "public"."venues" (
  "slug" text not null,
  "name" text not null,
  "location" text not null,
  "description" text,
  "background_image_url" text,
  "categories" text[],
  "vibe_rating" double precision default 0,
  "latitude" double precision,
  "longitude" double precision,
  "weekly_programs" jsonb,
  "owner_id" uuid,
  "venue_type" text,
  "is_deleted" boolean default false,
  "created_at" timestamp with time zone default now(),
  "deleted_at" timestamp with time zone,
  "today_images" text[],
  "created_by" text default 'scraped'::text,
  "geocode_failed" boolean default false not null
);

create table if not exists "public"."vibe_images" (
  "id" uuid default gen_random_uuid() not null,
  "venue_slug" text not null,
  "image_url" text not null,
  "vibe_rating" double precision default 0,
  "uploaded_by" uuid not null,
  "uploaded_at" timestamp with time zone default now()
);

create table if not exists "public"."vibe_ratings" (
  "id" uuid default gen_random_uuid() not null,
  "venue_slug" text not null,
  "rating" double precision not null,
  "created_at" timestamp with time zone default now()
);

alter table "public"."admins" add constraint "admins_pkey" PRIMARY KEY (id);

alter table "public"."admins" add constraint "admins_user_id_key" UNIQUE (user_id);

alter table "public"."analytics_sessions" add constraint "analytics_sessions_pkey" PRIMARY KEY (id);

alter table "public"."analytics_sessions" add constraint "analytics_sessions_platform_check" CHECK (platform = ANY (ARRAY['web'::text, 'mobile'::text]));

alter table "public"."daily_notification_stats" add constraint "daily_notification_stats_date_key" UNIQUE (date);

alter table "public"."daily_notification_stats" add constraint "daily_notification_stats_pkey" PRIMARY KEY (id);

alter table "public"."event_staff_tokens" add constraint "event_staff_tokens_pkey" PRIMARY KEY (id);

alter table "public"."event_staff_tokens" add constraint "event_staff_tokens_token_key" UNIQUE (token);

alter table "public"."events" add constraint "events_created_by_type_check" CHECK (created_by_type = ANY (ARRAY['user'::text, 'club_owner'::text, 'admin'::text]));

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY (slug);

alter table "public"."notification_analytics" add constraint "notification_analytics_pkey" PRIMARY KEY (id);

alter table "public"."notification_tokens" add constraint "notification_tokens_fcm_token_key" UNIQUE (token);

alter table "public"."notification_tokens" add constraint "notification_tokens_pkey" PRIMARY KEY (id);

alter table "public"."notification_user_interactions" add constraint "notification_user_interactions_pkey" PRIMARY KEY (id);

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);

alter table "public"."notifications" add constraint "notifications_type_check" CHECK (type = ANY (ARRAY['general'::text, 'ticket_update'::text, 'event_update'::text, 'payout_request'::text, 'payout_update'::text, 'refund_update'::text, 'event_status_change'::text, 'promotion'::text]));

alter table "public"."organizer_wallets" add constraint "organizer_wallets_organizer_id_key" UNIQUE (organizer_id);

alter table "public"."organizer_wallets" add constraint "organizer_wallets_pkey" PRIMARY KEY (id);

alter table "public"."payout_otps" add constraint "payout_otps_pkey" PRIMARY KEY (id);

alter table "public"."payouts" add constraint "payouts_payout_method_check" CHECK (payout_method = ANY (ARRAY['mobile_money'::text, 'bank_transfer'::text]));

alter table "public"."payouts" add constraint "payouts_pkey" PRIMARY KEY (id);

alter table "public"."payouts" add constraint "payouts_status_check" CHECK (status = ANY (ARRAY['pending_admin_review'::text, 'approved'::text, 'rejected'::text, 'pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

alter table "public"."pending_ticket_fulfillments" add constraint "pending_ticket_fulfillments_pkey" PRIMARY KEY (id);

alter table "public"."pending_ticket_fulfillments" add constraint "pending_ticket_fulfillments_status_check" CHECK (status = ANY (ARRAY['payment_confirmed'::text, 'fulfilling'::text, 'fulfilled'::text, 'failed'::text]));

alter table "public"."refund_requests" add constraint "refund_requests_idempotency_key_key" UNIQUE (idempotency_key);

alter table "public"."refund_requests" add constraint "refund_requests_pkey" PRIMARY KEY (id);

alter table "public"."refund_requests" add constraint "refund_requests_reason_code_check" CHECK (reason_code = ANY (ARRAY['event_cancelled'::text, 'event_postponed'::text, 'installments_incomplete'::text, 'chargeback'::text]));

alter table "public"."refund_requests" add constraint "refund_requests_request_reference_key" UNIQUE (request_reference);

alter table "public"."refund_requests" add constraint "refund_requests_requested_amount_check" CHECK (requested_amount > 0::numeric);

alter table "public"."refund_requests" add constraint "refund_requests_status_check" CHECK (status = ANY (ARRAY['pending_admin_review'::text, 'approved'::text, 'rejected'::text, 'submitted'::text, 'processing'::text, 'completed'::text, 'partially_refunded'::text, 'failed'::text, 'needs_attention'::text]));

alter table "public"."refund_status_history" add constraint "refund_status_history_pkey" PRIMARY KEY (id);

alter table "public"."seat_holds" add constraint "seat_holds_pkey" PRIMARY KEY (id);

alter table "public"."ticket_email_jobs" add constraint "ticket_email_jobs_idempotency_key_key" UNIQUE (idempotency_key);

alter table "public"."ticket_email_jobs" add constraint "ticket_email_jobs_pkey" PRIMARY KEY (id);

alter table "public"."ticket_email_jobs" add constraint "ticket_email_jobs_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text]));

alter table "public"."ticket_installment_plans" add constraint "ticket_installment_plans_pkey" PRIMARY KEY (id);

alter table "public"."ticket_installment_plans" add constraint "ticket_installment_plans_reservation_status_check" CHECK (reservation_status = ANY (ARRAY['none'::text, 'active'::text, 'converted'::text, 'released'::text, 'needs_review'::text]));

alter table "public"."ticket_installment_plans" add constraint "ticket_installment_plans_status_check" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text, 'expired'::text]));

alter table "public"."ticket_inventory_holds" add constraint "ticket_inventory_holds_kind_check" CHECK (hold_kind = ANY (ARRAY['checkout'::text, 'installment'::text]));

alter table "public"."ticket_inventory_holds" add constraint "ticket_inventory_holds_pkey" PRIMARY KEY (id);

alter table "public"."ticket_inventory_holds" add constraint "ticket_inventory_holds_resource_check" CHECK (resource_type = ANY (ARRAY['seat'::text, 'table'::text]));

alter table "public"."ticket_inventory_holds" add constraint "ticket_inventory_holds_resource_number_check" CHECK (resource_number > 0);

alter table "public"."ticket_inventory_holds" add constraint "ticket_inventory_holds_status_check" CHECK (status = ANY (ARRAY['active'::text, 'consumed'::text, 'released'::text, 'expired'::text]));

alter table "public"."ticket_validations" add constraint "ticket_validations_pkey" PRIMARY KEY (id);

alter table "public"."ticket_validations" add constraint "ticket_validations_status_check" CHECK (status = ANY (ARRAY['granted'::text, 'denied'::text]));

alter table "public"."tickets" add constraint "tickets_payment_method_check" CHECK (payment_method = ANY (ARRAY['mobile_money'::text, 'credit_card'::text, 'bank_transfer'::text]));

alter table "public"."tickets" add constraint "tickets_payment_status_check" CHECK (payment_status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]));

alter table "public"."tickets" add constraint "tickets_payout_status_check" CHECK (payout_status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'pending_review'::text]));

alter table "public"."tickets" add constraint "tickets_pkey" PRIMARY KEY (id);

alter table "public"."tickets" add constraint "tickets_qr_code_key" UNIQUE (qr_code);

alter table "public"."tickets" add constraint "tickets_status_check" CHECK (status = ANY (ARRAY['active'::text, 'used'::text, 'cancelled'::text, 'refunded'::text, 'expired'::text, 'pending'::text]));

alter table "public"."users" add constraint "users_email_key" UNIQUE (email);

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY (id);

alter table "public"."users" add constraint "users_uid_key" UNIQUE (uid);

alter table "public"."users" add constraint "valid_user_type" CHECK (user_type = ANY (ARRAY['regular_user'::text, 'club_owner'::text, 'admin'::text, 'viber'::text]));

alter table "public"."venue_ownership_requests" add constraint "venue_ownership_requests_pkey" PRIMARY KEY (id);

alter table "public"."venue_ownership_requests" add constraint "venue_ownership_requests_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));

alter table "public"."venues" add constraint "venues_pkey" PRIMARY KEY (slug);

alter table "public"."venues" add constraint "venues_venue_type_check" CHECK (venue_type = ANY (ARRAY['nightlife'::text, 'recreation'::text]));

alter table "public"."vibe_images" add constraint "vibe_images_pkey" PRIMARY KEY (id);

alter table "public"."vibe_ratings" add constraint "vibe_ratings_pkey" PRIMARY KEY (id);

alter table "public"."admins" add constraint "admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

alter table "public"."event_staff_tokens" add constraint "event_staff_tokens_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table "public"."event_staff_tokens" add constraint "event_staff_tokens_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(slug);

alter table "public"."events" add constraint "events_created_by_auth_fkey" FOREIGN KEY (created_by_auth) REFERENCES auth.users(id);

alter table "public"."events" add constraint "events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);

alter table "public"."events" add constraint "events_venue_slug_fkey" FOREIGN KEY (venue_slug) REFERENCES venues(slug);

alter table "public"."notification_analytics" add constraint "notification_analytics_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table "public"."notification_user_interactions" add constraint "notification_user_interactions_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table "public"."payout_otps" add constraint "payout_otps_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table "public"."pending_ticket_fulfillments" add constraint "pending_ticket_fulfillments_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES users(id);

alter table "public"."refund_status_history" add constraint "refund_status_history_refund_request_id_fkey" FOREIGN KEY (refund_request_id) REFERENCES refund_requests(id) ON DELETE CASCADE;

alter table "public"."ticket_email_jobs" add constraint "ticket_email_jobs_fulfillment_id_fkey" FOREIGN KEY (fulfillment_id) REFERENCES pending_ticket_fulfillments(id) ON DELETE SET NULL;

alter table "public"."ticket_inventory_holds" add constraint "ticket_inventory_holds_installment_plan_id_fkey" FOREIGN KEY (installment_plan_id) REFERENCES ticket_installment_plans(id) ON DELETE SET NULL;

alter table "public"."tickets" add constraint "tickets_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(slug);

alter table "public"."users" add constraint "users_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(slug);

alter table "public"."venue_ownership_requests" add constraint "venue_ownership_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);

alter table "public"."venue_ownership_requests" add constraint "venue_ownership_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

alter table "public"."venue_ownership_requests" add constraint "venue_ownership_requests_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(slug);

alter table "public"."venues" add constraint "venues_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES users(id);

alter table "public"."vibe_images" add constraint "vibe_images_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);

alter table "public"."vibe_images" add constraint "vibe_images_venue_id_fkey" FOREIGN KEY (venue_slug) REFERENCES venues(slug);

alter table "public"."vibe_ratings" add constraint "vibe_ratings_venue_id_fkey" FOREIGN KEY (venue_slug) REFERENCES venues(slug);

CREATE OR REPLACE FUNCTION public.acquire_inventory_hold(p_event_slug text, p_fee_type text, p_resource_type text, p_resource_number integer, p_session_id text, p_ttl_minutes integer DEFAULT 5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_ttl integer := greatest(1, least(coalesce(p_ttl_minutes, 5), 30));
  v_key text;
BEGIN
  IF p_event_slug IS NULL OR p_fee_type IS NULL OR p_resource_type NOT IN ('seat', 'table')
     OR p_resource_number IS NULL OR p_resource_number <= 0 OR p_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := p_event_slug || ':' || p_fee_type || ':' || p_resource_type || ':' || p_resource_number;
  PERFORM pg_advisory_xact_lock(hashtext(v_key));

  UPDATE public.ticket_inventory_holds
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.event_slug = p_event_slug
      AND t.entry_fee_type = p_fee_type
      AND t.status IN ('active', 'used', 'pending')
      AND ((p_resource_type = 'seat' AND CASE WHEN t.seat_number ~ '^[0-9]+$' THEN t.seat_number::integer END = p_resource_number AND t.table_number IS NULL)
        OR (p_resource_type = 'table' AND t.table_number = p_resource_number))
  ) THEN
    RETURN NULL;
  END IF;

  SELECT h.id INTO v_id
  FROM public.ticket_inventory_holds h
  WHERE h.event_slug = p_event_slug AND h.fee_type = p_fee_type
    AND h.resource_type = p_resource_type AND h.resource_number = p_resource_number
    AND h.status = 'active'
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.ticket_inventory_holds WHERE id = v_id AND session_id = p_session_id) THEN
      UPDATE public.ticket_inventory_holds
      SET expires_at = now() + make_interval(mins => v_ttl), updated_at = now()
      WHERE id = v_id;
      RETURN v_id;
    END IF;
    RETURN NULL;
  END IF;

  INSERT INTO public.ticket_inventory_holds (
    event_slug, fee_type, resource_type, resource_number,
    hold_kind, session_id, status, expires_at
  ) VALUES (
    p_event_slug, p_fee_type, p_resource_type, p_resource_number,
    'checkout', p_session_id, 'active', now() + make_interval(mins => v_ttl)
  ) RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.acquire_seat_hold(p_event_slug text, p_fee_type text, p_seat_number integer, p_session_id text, p_ttl_minutes integer DEFAULT 5)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.acquire_inventory_hold(p_event_slug, p_fee_type, 'seat', p_seat_number, p_session_id, p_ttl_minutes) IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_ticket_security_photo(p_ticket_id text, p_token text, p_photo_url text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_valid boolean;
begin
  select (photo_upload_token = p_token and photo_upload_token_expires_at > now())
  into v_valid
  from tickets
  where id = p_ticket_id;

  if not v_valid then
    return false;
  end if;

  update tickets
  set buyer_photo_url = p_photo_url
  where id = p_ticket_id;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_ticket_fulfillment(p_id uuid, p_lease_seconds integer DEFAULT 600)
 RETURNS SETOF pending_ticket_fulfillments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.pending_ticket_fulfillments
  SET status = 'fulfilling',
      processing_started_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 1800))),
      attempt_count = attempt_count + 1,
      updated_at = now()
  WHERE id = p_id
    AND status <> 'fulfilled'
    AND (lease_expires_at IS NULL OR lease_expires_at <= now())
  RETURNING *;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_tickets_batch(p_event_slug text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.create_tickets_batch(p_event_slug, p_rows, NULL::uuid[], NULL::text, NULL::uuid);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_tickets_batch(p_event_slug text, p_rows jsonb, p_hold_ids uuid[], p_session_id text, p_installment_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fee text;
  v_sold integer;
  v_max numeric;
  v_batch_count integer;
  v_table_number integer;
  v_table_group text;
  v_conflict boolean;
  v_ids text[];
  v_row jsonb;
  v_idx integer;
  v_resource_type text;
  v_resource_number integer;
  v_hold_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_event_slug));

  FOR v_row, v_idx IN SELECT r, ordinality::integer FROM jsonb_array_elements(p_rows) WITH ORDINALITY x(r) LOOP
    v_resource_type := CASE WHEN (v_row->>'table_number') IS NOT NULL THEN 'table' ELSE 'seat' END;
    v_resource_number := CASE WHEN v_resource_type = 'table' THEN (v_row->>'table_number')::integer ELSE (v_row->>'seat_number')::integer END;
    IF v_resource_number IS NULL THEN CONTINUE; END IF;
    v_hold_id := CASE WHEN p_hold_ids IS NULL OR array_length(p_hold_ids, 1) < v_idx THEN NULL ELSE p_hold_ids[v_idx] END;

    IF EXISTS (
      SELECT 1 FROM public.ticket_inventory_holds h
      WHERE h.event_slug = p_event_slug AND h.fee_type = v_row->>'entry_fee_type'
        AND h.resource_type = v_resource_type AND h.resource_number = v_resource_number
        AND h.status = 'active'
        AND NOT (
          h.id = v_hold_id AND (
            (h.hold_kind = 'checkout' AND p_session_id IS NOT NULL AND h.session_id = p_session_id)
            OR (h.hold_kind = 'installment' AND p_installment_plan_id IS NOT NULL AND h.installment_plan_id = p_installment_plan_id)
          )
          OR (h.hold_kind = 'installment' AND p_installment_plan_id IS NOT NULL AND h.installment_plan_id = p_installment_plan_id)
        )
    ) THEN
      RAISE EXCEPTION 'HOLD_TAKEN';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.event_slug = p_event_slug AND t.entry_fee_type = v_row->>'entry_fee_type'
        AND t.status IN ('active', 'used', 'pending')
        AND ((v_resource_type = 'seat' AND CASE WHEN t.seat_number ~ '^[0-9]+$' THEN t.seat_number::integer END = v_resource_number AND t.table_number IS NULL)
          OR (v_resource_type = 'table' AND t.table_number = v_resource_number))
    ) THEN
      IF v_resource_type = 'table' THEN
        RAISE EXCEPTION 'TABLE_TAKEN';
      ELSE
        RAISE EXCEPTION 'SEAT_TAKEN';
      END IF;
    END IF;
  END LOOP;

  FOR v_table_group, v_table_number IN
    SELECT DISTINCT (r->>'table_group_id'), (r->>'table_number')::integer
    FROM jsonb_array_elements(p_rows) r WHERE (r->>'table_number') IS NOT NULL
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.event_slug = p_event_slug AND t.table_number = v_table_number
        AND t.table_group_id IS DISTINCT FROM v_table_group
        AND t.status IN ('active','used','pending')
    ) INTO v_conflict;
    IF v_conflict THEN RAISE EXCEPTION 'TABLE_TAKEN'; END IF;
  END LOOP;

  FOR v_fee IN SELECT DISTINCT (r->>'entry_fee_type') FROM jsonb_array_elements(p_rows) r LOOP
    SELECT (f.value->>'maxTickets')::numeric INTO v_max
    FROM public.events e CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.entry_fees, '[]'::jsonb)) f
    WHERE e.slug = p_event_slug AND f.value->>'name' = v_fee;
    IF v_max IS NOT NULL THEN
      SELECT count(*) INTO v_sold FROM public.tickets
      WHERE event_slug = p_event_slug AND entry_fee_type = v_fee AND status IN ('active','used','pending');
      SELECT count(*) INTO v_batch_count FROM jsonb_array_elements(p_rows) r WHERE r->>'entry_fee_type' = v_fee;
      IF v_sold + v_batch_count > v_max THEN RAISE EXCEPTION 'SOLD_OUT'; END IF;
    END IF;
  END LOOP;

  INSERT INTO public.tickets (
    id, event_id, event_slug, event_name, venue_name, buyer_id, buyer_name,
    buyer_email, delivery_email, ticket_ref, buyer_phone, quantity, total_amount,
    table_total_amount, table_size, seat_number, table_number, table_group_id,
    base_price, late_fee, venue_revenue, app_commission, purchase_date,
    purchase_deadline, event_start_time, qr_code, qr_code_data_url,
    buyer_photo_url, photo_upload_token, photo_upload_token_expires_at, status,
    validation_history, entry_fee_type, is_late_purchase, is_scanned, expires_at,
    payout_eligible, payout_status, payment_id, payment_status, payment_reference,
    pesapal_transaction_id, pesapal_confirmation_code, pawapay_deposit_id,
    gateway_fee, payment_method, payment_provider, payment_number, payment_name,
    qr_signature, reentry_pass, refunded_amount, refund_status, created_at
  )
  SELECT
    r->>'id', r->>'event_id', r->>'event_slug', r->>'event_name', r->>'venue_name',
    r->>'buyer_id', r->>'buyer_name', r->>'buyer_email', r->>'delivery_email',
    r->>'ticket_ref', r->>'buyer_phone', (r->>'quantity')::integer,
    (r->>'total_amount')::double precision, (r->>'table_total_amount')::double precision,
    (r->>'table_size')::integer, r->>'seat_number', (r->>'table_number')::integer,
    r->>'table_group_id', (r->>'base_price')::double precision, (r->>'late_fee')::double precision,
    (r->>'venue_revenue')::double precision, (r->>'app_commission')::double precision,
    (r->>'purchase_date')::timestamptz, (r->>'purchase_deadline')::timestamptz,
    (r->>'event_start_time')::timestamptz, r->>'qr_code', r->>'qr_code_data_url',
    r->>'buyer_photo_url', r->>'photo_upload_token', (r->>'photo_upload_token_expires_at')::timestamptz,
    r->>'status', coalesce(r->'validation_history', '[]'::jsonb), r->>'entry_fee_type',
    coalesce((r->>'is_late_purchase')::boolean, false), coalesce((r->>'is_scanned')::boolean, false),
    (r->>'expires_at')::timestamptz, coalesce((r->>'payout_eligible')::boolean, false), r->>'payout_status',
    r->>'payment_id', r->>'payment_status', r->>'payment_reference', r->>'pesapal_transaction_id',
    r->>'pesapal_confirmation_code', r->>'pawapay_deposit_id', (r->>'gateway_fee')::numeric,
    r->>'payment_method', r->>'payment_provider', r->>'payment_number', r->>'payment_name',
    r->>'qr_signature', coalesce(r->'reentry_pass', 'null'::jsonb), coalesce((r->>'refunded_amount')::numeric, 0),
    coalesce(r->>'refund_status', 'none'), now()
  FROM jsonb_array_elements(p_rows) r;

  SELECT coalesce(array_agg(r->>'id'), '{}'::text[]) INTO v_ids FROM jsonb_array_elements(p_rows) r;

  IF p_hold_ids IS NOT NULL THEN
    UPDATE public.ticket_inventory_holds SET status = 'consumed', updated_at = now()
    WHERE id = ANY(p_hold_ids) AND status = 'active';
  END IF;
  IF p_session_id IS NOT NULL THEN
    DELETE FROM public.seat_holds WHERE session_id = p_session_id AND event_slug = p_event_slug;
  END IF;
  IF p_installment_plan_id IS NOT NULL THEN
    UPDATE public.ticket_installment_plans
    SET reservation_status = 'converted', reservation_expires_at = NULL, updated_at = now()
    WHERE id = p_installment_plan_id;
  END IF;
  RETURN to_jsonb(v_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_held_inventory(p_event_slug text, p_fee_type text, p_resource_type text, p_exclude_session_id text DEFAULT NULL::text)
 RETURNS TABLE(resource_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT h.resource_number
  FROM public.ticket_inventory_holds h
  WHERE h.event_slug = p_event_slug AND h.fee_type = p_fee_type
    AND h.resource_type = p_resource_type AND h.status = 'active'
    AND h.expires_at > now()
    AND (p_exclude_session_id IS NULL OR h.session_id IS DISTINCT FROM p_exclude_session_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_held_seats(p_event_slug text, p_fee_type text, p_exclude_session_id text DEFAULT NULL::text)
 RETURNS TABLE(seat_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT x.resource_number FROM (
    SELECT h.resource_number FROM public.ticket_inventory_holds h
    WHERE h.event_slug = p_event_slug AND h.fee_type = p_fee_type
      AND h.resource_type = 'seat' AND h.status = 'active' AND h.expires_at > now()
      AND (p_exclude_session_id IS NULL OR h.session_id IS DISTINCT FROM p_exclude_session_id)
    UNION ALL
    SELECT sh.seat_number FROM public.seat_holds sh
    WHERE sh.event_slug = p_event_slug AND sh.fee_type = p_fee_type
      AND sh.expires_at > now() AND (p_exclude_session_id IS NULL OR sh.session_id IS DISTINCT FROM p_exclude_session_id)
  ) x;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_held_tables(p_event_slug text, p_fee_type text, p_exclude_session_id text DEFAULT NULL::text)
 RETURNS TABLE(table_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT h.resource_number
  FROM public.ticket_inventory_holds h
  WHERE h.event_slug = p_event_slug AND h.fee_type = p_fee_type
    AND h.resource_type = 'table' AND h.status = 'active' AND h.expires_at > now()
    AND (p_exclude_session_id IS NULL OR h.session_id IS DISTINCT FROM p_exclude_session_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.users
    (uid, email, user_type, display_name, photo_url, created_at, last_login_at, is_deleted)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'user_type', 'regular_user'),
    coalesce(new.raw_user_meta_data->>'display_name',
             new.raw_user_meta_data->>'name',
             coalesce(split_part(new.email, '@', 1), 'User')),
    coalesce(new.raw_user_meta_data->>'avatar_url',
             new.raw_user_meta_data->>'photo_url'),
    new.created_at,
    now(),
    false
  )
  on conflict (uid) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE uid = auth.uid()::text
    AND user_type = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_club_owner()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE uid = auth.uid()::text
    AND user_type = 'club_owner'
  );
$function$;

CREATE OR REPLACE FUNCTION public.record_installment_payment(p_plan_id uuid, p_installment_index integer, p_payment jsonb, p_checkout_hold_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  e record;
  v_inst jsonb;
  v_updated jsonb;
  v_paid integer;
  v_amount numeric;
  v_total integer;
  v_reservation jsonb := jsonb_build_object('reservationId', NULL, 'status', 'none');
BEGIN
  SELECT * INTO p FROM public.ticket_installment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF p.status <> 'active' THEN RAISE EXCEPTION 'PLAN_NOT_ACTIVE'; END IF;
  IF p_installment_index < 0 OR p_installment_index >= jsonb_array_length(coalesce(p.installments, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'INSTALLMENT_NOT_FOUND';
  END IF;

  SELECT date, time INTO e FROM public.events WHERE slug = p.event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;
  IF now() >= public.ticket_event_start_at(e.date, e.time) - interval '3 hours' THEN
    UPDATE public.ticket_installment_plans
    SET status = 'expired', reservation_status = 'released', updated_at = now()
    WHERE id = p_plan_id;
    RAISE EXCEPTION 'RESERVATION_CUTOFF';
  END IF;

  v_inst := p.installments -> p_installment_index;
  IF coalesce(v_inst->>'status', 'pending') = 'paid' THEN
    RAISE EXCEPTION 'INSTALLMENT_ALREADY_PAID';
  END IF;

  v_updated := jsonb_set(
    p.installments,
    ARRAY[p_installment_index::text],
    v_inst || coalesce(p_payment, '{}'::jsonb) || jsonb_build_object('status', 'paid', 'paidAt', now()),
    false
  );

  -- Count only paid installments. The previous count(*) counted every array
  -- element and marked a 3-part plan complete after its second payment.
  SELECT
    count(*) FILTER (WHERE x->>'status' = 'paid')::integer,
    coalesce(sum((x->>'amount')::numeric) FILTER (WHERE x->>'status' = 'paid'), 0),
    count(*)::integer
  INTO v_paid, v_amount, v_total
  FROM jsonb_array_elements(v_updated) x;

  UPDATE public.ticket_installment_plans
  SET installments = v_updated,
      installments_paid = v_paid,
      amount_paid = v_amount,
      status = CASE WHEN v_paid = v_total THEN 'completed' ELSE 'active' END,
      updated_at = now()
  WHERE id = p_plan_id;

  IF p_installment_index = 0 THEN
    BEGIN
      v_reservation := public.reserve_installment_inventory(p_plan_id, p_checkout_hold_id);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ticket_installment_plans
      SET reservation_status = 'needs_review', updated_at = now()
      WHERE id = p_plan_id;
      v_reservation := jsonb_build_object('reservationId', NULL, 'status', 'needs_review', 'error', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'planComplete', v_paid = v_total,
    'installmentsPaid', v_paid,
    'reservation', v_reservation
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_expired_inventory_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.ticket_inventory_holds
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.ticket_installment_plans p
  SET status = 'expired', reservation_status = 'released', updated_at = now()
  WHERE p.status = 'active' AND p.reservation_status = 'active'
    AND p.reservation_id IN (
      SELECT h.id FROM public.ticket_inventory_holds h WHERE h.status = 'expired'
    );
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_inventory_hold(p_hold_id uuid, p_session_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_changed boolean;
BEGIN
  UPDATE public.ticket_inventory_holds
  SET status = 'released', updated_at = now()
  WHERE id = p_hold_id AND status = 'active' AND session_id = p_session_id;
  v_changed := FOUND;
  RETURN v_changed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_inventory_holds(p_session_id text, p_event_slug text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.ticket_inventory_holds
  SET status = 'released', updated_at = now()
  WHERE session_id = p_session_id AND status = 'active'
    AND (p_event_slug IS NULL OR event_slug = p_event_slug);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_seat_holds(p_session_id text, p_event_slug text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.release_inventory_holds(p_session_id, p_event_slug);
  IF p_event_slug IS NULL THEN
    DELETE FROM public.seat_holds WHERE session_id = p_session_id;
  ELSE
    DELETE FROM public.seat_holds WHERE session_id = p_session_id AND event_slug = p_event_slug;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_installment_inventory(p_plan_id uuid, p_checkout_hold_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  e record;
  v_resource_type text;
  v_resource_number integer;
  v_cutoff timestamptz;
  v_id uuid;
  v_key text;
BEGIN
  SELECT * INTO p FROM public.ticket_installment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF coalesce(p.installments_paid, 0) < 1 THEN RAISE EXCEPTION 'FIRST_INSTALLMENT_REQUIRED'; END IF;

  SELECT slug, date, time INTO e FROM public.events WHERE slug = p.event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;
  v_cutoff := public.ticket_event_start_at(e.date, e.time) - interval '3 hours';
  IF now() >= v_cutoff THEN
    UPDATE public.ticket_installment_plans
    SET status = 'expired', reservation_status = 'released', reservation_expires_at = v_cutoff,
        updated_at = now()
    WHERE id = p_plan_id;
    RAISE EXCEPTION 'RESERVATION_CUTOFF';
  END IF;

  IF p.reservation_id IS NOT NULL AND p.reservation_status = 'active' THEN
    RETURN jsonb_build_object('reservationId', p.reservation_id, 'status', 'active', 'expiresAt', p.reservation_expires_at);
  END IF;

  v_resource_type := CASE WHEN coalesce(p.is_table_entry, false) THEN 'table' ELSE 'seat' END;
  v_resource_number := CASE WHEN coalesce(p.is_table_entry, false) THEN p.table_number ELSE p.seat_number END;
  IF v_resource_number IS NULL THEN
    UPDATE public.ticket_installment_plans SET reservation_status = 'none', updated_at = now() WHERE id = p_plan_id;
    RETURN jsonb_build_object('reservationId', NULL, 'status', 'none');
  END IF;

  v_key := p.event_id || ':' || p.ticket_type || ':' || v_resource_type || ':' || v_resource_number;
  PERFORM pg_advisory_xact_lock(hashtext(v_key));

  UPDATE public.ticket_inventory_holds
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.event_slug = p.event_id AND t.entry_fee_type = p.ticket_type
      AND t.status IN ('active', 'used', 'pending')
      AND ((v_resource_type = 'seat' AND CASE WHEN t.seat_number ~ '^[0-9]+$' THEN t.seat_number::integer END = v_resource_number AND t.table_number IS NULL)
        OR (v_resource_type = 'table' AND t.table_number = v_resource_number))
  ) THEN
    RAISE EXCEPTION 'INVENTORY_TAKEN';
  END IF;

  IF p_checkout_hold_id IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.ticket_inventory_holds
    WHERE id = p_checkout_hold_id AND status = 'active'
      AND event_slug = p.event_id AND fee_type = p.ticket_type
      AND resource_type = v_resource_type AND resource_number = v_resource_number
    FOR UPDATE;
    IF v_id IS NOT NULL THEN
      UPDATE public.ticket_inventory_holds
      SET hold_kind = 'installment', installment_plan_id = p_plan_id,
          session_id = 'installment:' || p_plan_id::text,
          expires_at = v_cutoff, updated_at = now()
      WHERE id = v_id;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.ticket_inventory_holds
    WHERE event_slug = p.event_id AND fee_type = p.ticket_type
      AND resource_type = v_resource_type AND resource_number = v_resource_number
      AND status = 'active'
    FOR UPDATE;
    IF v_id IS NOT NULL THEN RAISE EXCEPTION 'INVENTORY_TAKEN'; END IF;

    INSERT INTO public.ticket_inventory_holds (
      event_slug, fee_type, resource_type, resource_number, hold_kind,
      session_id, installment_plan_id, status, expires_at
    ) VALUES (
      p.event_id, p.ticket_type, v_resource_type, v_resource_number, 'installment',
      'installment:' || p_plan_id::text, p_plan_id, 'active', v_cutoff
    ) RETURNING id INTO v_id;
  END IF;

  UPDATE public.ticket_installment_plans
  SET reservation_id = v_id, reservation_status = 'active', reservation_expires_at = v_cutoff,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object('reservationId', v_id, 'status', 'active', 'expiresAt', v_cutoff);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ticket_event_start_at(p_event_date timestamp with time zone, p_event_time text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_match text[];
  v_hour integer;
  v_minute integer;
  v_meridiem text;
  v_day timestamptz;
BEGIN
  IF p_event_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_match := regexp_match(coalesce(p_event_time, ''), '(\\d{1,2}):(\\d{2})\\s*(AM|PM|am|pm)?');
  IF v_match IS NULL THEN
    RETURN p_event_date;
  END IF;

  v_hour := v_match[1]::integer;
  v_minute := v_match[2]::integer;
  v_meridiem := upper(coalesce(v_match[3], ''));
  IF v_meridiem = 'PM' AND v_hour < 12 THEN v_hour := v_hour + 12; END IF;
  IF v_meridiem = 'AM' AND v_hour = 12 THEN v_hour := 0; END IF;
  IF v_hour > 23 OR v_minute > 59 THEN RETURN p_event_date; END IF;

  v_day := date_trunc('day', p_event_date);
  RETURN v_day + make_interval(hours => v_hour, mins => v_minute);
END;
$function$;

create or replace view "public"."tickets_api" as
SELECT id,
    event_slug,
    event_id AS "eventId",
    event_name AS "eventName",
    buyer_id AS "buyerId",
    buyer_name AS "buyerName",
    buyer_email AS "buyerEmail",
    buyer_phone AS "buyerPhone",
    quantity,
    total_amount AS "totalAmount",
    base_price AS "basePrice",
    late_fee AS "lateFee",
    venue_revenue AS "venueRevenue",
    app_commission AS "appCommission",
    purchase_date AS "purchaseDate",
    event_start_time AS "eventStartTime",
    purchase_deadline AS "purchaseDeadline",
    qr_code AS "qrCode",
    qr_code_data_url AS "qrCodeDataUrl",
    qr_signature AS "qrSignature",
    buyer_photo_url AS "buyerPhotoUrl",
    status,
    validation_history AS "validationHistory",
    entry_fee_type AS "entryFeeType",
    is_late_purchase AS "isLatePurchase",
    is_scanned AS "isScanned",
    expires_at AS "expiresAt",
    payout_eligible AS "payoutEligible",
    payout_status AS "payoutStatus",
    payout_date AS "payoutDate",
    scanned_at AS "scannedAt",
    payment_id AS "paymentId",
    payment_status AS "paymentStatus",
    payment_reference AS "paymentReference",
    payment_method AS "paymentMethod",
    payment_provider AS "paymentProvider",
    payment_number AS "paymentNumber",
    payment_name AS "paymentName",
    pesapal_transaction_id AS "pesapalTransactionId",
    pawapay_deposit_id AS "pawapayDepositId",
    created_at AS "createdAt",
    photo_upload_token AS "photoUploadToken",
    photo_upload_token_expires_at AS "photoUploadTokenExpiresAt",
    delivery_email AS "deliveryEmail",
    ticket_ref AS "ticketRef",
    table_total_amount AS "tableTotalAmount",
    table_group_id AS "tableGroupId",
    table_size AS "tableSize",
    seat_number AS "seatNumber",
    reentry_pass AS "reentryPass",
    venue_name AS "venueName",
    gateway_fee AS "gatewayFee",
    installment_plan_id AS "installmentPlanId",
    pesapal_confirmation_code AS "pesapalConfirmationCode",
    refund_status AS "refundStatus",
    refunded_amount AS "refundedAmount",
    table_number AS "tableNumber"
   FROM tickets;

CREATE INDEX IF NOT EXISTS idx_admins_user_id ON public.admins USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_notification ON public.notification_analytics USING btree (notification_id);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start_time ON public.analytics_sessions USING btree (start_time);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_unique_visitor_id ON public.analytics_sessions USING btree (unique_visitor_id);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user_id ON public.analytics_sessions USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_daily_notification_stats_date ON public.daily_notification_stats USING btree (date);

CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events USING btree (created_by);

CREATE INDEX IF NOT EXISTS idx_events_date ON public.events USING btree (date);

CREATE INDEX IF NOT EXISTS idx_events_is_deleted ON public.events USING btree (is_deleted);

CREATE INDEX IF NOT EXISTS idx_events_is_featured ON public.events USING btree (is_featured);

CREATE INDEX IF NOT EXISTS idx_events_venue_id ON public.events USING btree (venue_slug);

CREATE INDEX IF NOT EXISTS idx_installment_plans_buyer_email ON public.ticket_installment_plans USING btree (buyer_email);

CREATE INDEX IF NOT EXISTS idx_installment_plans_buyer_id ON public.ticket_installment_plans USING btree (buyer_id);

CREATE INDEX IF NOT EXISTS idx_installment_plans_event_id ON public.ticket_installment_plans USING btree (event_id);

CREATE INDEX IF NOT EXISTS idx_installment_plans_status ON public.ticket_installment_plans USING btree (status);

CREATE INDEX IF NOT EXISTS idx_interactions_notification ON public.notification_user_interactions USING btree (notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_analytics_notification_id ON public.notification_analytics USING btree (notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_tokens_active ON public.notification_tokens USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_notification_tokens_fcm_token ON public.notification_tokens USING btree (token);

CREATE INDEX IF NOT EXISTS idx_notification_tokens_token ON public.notification_tokens USING btree (token);

CREATE INDEX IF NOT EXISTS idx_notification_tokens_user_id ON public.notification_tokens USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_notification_user_interactions_notification_id ON public.notification_user_interactions USING btree (notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_user_interactions_user_id ON public.notification_user_interactions USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_organizer_wallets_organizer_id ON public.organizer_wallets USING btree (organizer_id);

CREATE INDEX IF NOT EXISTS idx_payouts_event ON public.payouts USING btree (event_id);

CREATE INDEX IF NOT EXISTS idx_payouts_organizer ON public.payouts USING btree (organizer_id);

CREATE INDEX IF NOT EXISTS idx_payouts_organizer_id ON public.payouts USING btree (organizer_id);

CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts USING btree (status);

CREATE INDEX IF NOT EXISTS idx_pending_fulfillments_ready ON public.pending_ticket_fulfillments USING btree (status, next_retry_at, created_at) WHERE (status <> 'fulfilled'::text);

CREATE INDEX IF NOT EXISTS idx_pending_fulfillments_status ON public.pending_ticket_fulfillments USING btree (status);

CREATE INDEX IF NOT EXISTS idx_refund_requests_ticket ON public.refund_requests USING btree (ticket_id);

CREATE INDEX IF NOT EXISTS idx_seat_holds_lookup ON public.seat_holds USING btree (event_slug, fee_type, seat_number);

CREATE INDEX IF NOT EXISTS idx_ticket_email_jobs_ready ON public.ticket_email_jobs USING btree (status, next_retry_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS idx_ticket_email_jobs_ticket_id ON public.ticket_email_jobs USING btree (ticket_id);

CREATE INDEX IF NOT EXISTS idx_tickets_buyer_email ON public.tickets USING btree (buyer_email);

CREATE INDEX IF NOT EXISTS idx_tickets_buyer_id ON public.tickets USING btree (buyer_id);

CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON public.tickets USING btree (event_id);

CREATE INDEX IF NOT EXISTS idx_tickets_event_slug ON public.tickets USING btree (event_slug);

CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON public.tickets USING btree (qr_code);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets USING btree (status);

CREATE INDEX IF NOT EXISTS idx_tickets_table_group_id ON public.tickets USING btree (table_group_id);

CREATE INDEX IF NOT EXISTS idx_tickets_table_number ON public.tickets USING btree (event_slug, entry_fee_type, table_number) WHERE ((table_number IS NOT NULL) AND (status = ANY (ARRAY['active'::text, 'used'::text, 'pending'::text])));

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_ref ON public.tickets USING btree (ticket_ref);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_unique_seat ON public.tickets USING btree (event_slug, entry_fee_type, seat_number) WHERE ((seat_number IS NOT NULL) AND (table_number IS NULL) AND (status = ANY (ARRAY['active'::text, 'used'::text, 'pending'::text])));

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users USING btree (email);

CREATE INDEX IF NOT EXISTS idx_users_uid ON public.users USING btree (uid);

CREATE INDEX IF NOT EXISTS idx_users_user_type ON public.users USING btree (user_type);

CREATE INDEX IF NOT EXISTS idx_venue_ownership_requests_status ON public.venue_ownership_requests USING btree (status);

CREATE INDEX IF NOT EXISTS idx_venue_ownership_requests_user_id ON public.venue_ownership_requests USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_venue_ownership_requests_venue_id ON public.venue_ownership_requests USING btree (venue_id);

CREATE INDEX IF NOT EXISTS idx_venues_is_deleted ON public.venues USING btree (is_deleted);

CREATE INDEX IF NOT EXISTS idx_venues_owner_id ON public.venues USING btree (owner_id);

CREATE INDEX IF NOT EXISTS idx_vibe_images_venue_id ON public.vibe_images USING btree (venue_slug);

CREATE INDEX IF NOT EXISTS idx_vibe_ratings_venue_id ON public.vibe_ratings USING btree (venue_slug);

CREATE UNIQUE INDEX IF NOT EXISTS pending_ticket_fulfillments_payment_id_key ON public.pending_ticket_fulfillments USING btree (payment_id);

CREATE INDEX IF NOT EXISTS pending_ticket_fulfillments_ticket_type_idx ON public.pending_ticket_fulfillments USING btree (ticket_type);

CREATE INDEX IF NOT EXISTS refund_requests_buyer_idx ON public.refund_requests USING btree (buyer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS refund_requests_event_idx ON public.refund_requests USING btree (event_id);

CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON public.refund_requests USING btree (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS ticket_inventory_holds_active_plan_key ON public.ticket_inventory_holds USING btree (installment_plan_id) WHERE ((status = 'active'::text) AND (installment_plan_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS ticket_inventory_holds_active_resource_key ON public.ticket_inventory_holds USING btree (event_slug, fee_type, resource_type, resource_number) WHERE (status = 'active'::text);

CREATE INDEX IF NOT EXISTS ticket_inventory_holds_lookup ON public.ticket_inventory_holds USING btree (event_slug, fee_type, resource_type, status, expires_at);

CREATE INDEX IF NOT EXISTS ticket_inventory_holds_plan_lookup ON public.ticket_inventory_holds USING btree (installment_plan_id, status);

CREATE INDEX IF NOT EXISTS venues_geocode_failed_idx ON public.venues USING btree (geocode_failed) WHERE (geocode_failed = true);

alter table "public"."admins" enable row level security;

alter table "public"."analytics_sessions" enable row level security;

alter table "public"."daily_notification_stats" enable row level security;

alter table "public"."event_staff_tokens" enable row level security;

alter table "public"."events" enable row level security;

alter table "public"."notification_analytics" enable row level security;

alter table "public"."notification_tokens" enable row level security;

alter table "public"."notification_user_interactions" enable row level security;

alter table "public"."notifications" enable row level security;

alter table "public"."organizer_wallets" enable row level security;

alter table "public"."payout_otps" enable row level security;

alter table "public"."payouts" enable row level security;

alter table "public"."pending_ticket_fulfillments" enable row level security;

alter table "public"."refund_requests" enable row level security;

alter table "public"."refund_status_history" enable row level security;

alter table "public"."seat_holds" enable row level security;

alter table "public"."ticket_email_jobs" enable row level security;

alter table "public"."ticket_installment_plans" enable row level security;

alter table "public"."ticket_inventory_holds" enable row level security;

alter table "public"."ticket_validations" enable row level security;

alter table "public"."tickets" enable row level security;

alter table "public"."users" enable row level security;

alter table "public"."venue_ownership_requests" enable row level security;

alter table "public"."venues" enable row level security;

alter table "public"."vibe_images" enable row level security;

alter table "public"."vibe_ratings" enable row level security;

create policy "analytics_sessions_insert_all" on "public"."analytics_sessions" as permissive for insert to "anon", "authenticated" with check (true);

create policy "analytics_sessions_select_all" on "public"."analytics_sessions" as permissive for select to "anon", "authenticated" using (true);

create policy "analytics_sessions_update_all" on "public"."analytics_sessions" as permissive for update to "anon", "authenticated" using (true) with check (true);

create policy "Organisers can delete their staff tokens" on "public"."event_staff_tokens" as permissive for delete to "public" using ((EXISTS ( SELECT 1
   FROM events
  WHERE events.slug = event_staff_tokens.event_id AND events.created_by_auth = auth.uid())));

create policy "Organisers can insert staff tokens" on "public"."event_staff_tokens" as permissive for insert to "public" with check ((EXISTS ( SELECT 1
   FROM events
  WHERE events.slug = event_staff_tokens.event_id AND events.created_by_auth = auth.uid())));

create policy "Organisers can update their staff tokens" on "public"."event_staff_tokens" as permissive for update to "public" using ((EXISTS ( SELECT 1
   FROM events
  WHERE events.slug = event_staff_tokens.event_id AND events.created_by_auth = auth.uid()))) with check ((EXISTS ( SELECT 1
   FROM events
  WHERE events.slug = event_staff_tokens.event_id AND events.created_by_auth = auth.uid())));

create policy "Organisers can view their staff tokens" on "public"."event_staff_tokens" as permissive for select to "public" using ((EXISTS ( SELECT 1
   FROM events
  WHERE events.slug = event_staff_tokens.event_id AND events.created_by_auth = auth.uid())));

create policy "Public can validate unexpired tokens" on "public"."event_staff_tokens" as permissive for select to "public" using (expires_at > now());

create policy "Allow authenticated users to create events" on "public"."events" as permissive for insert to "public" with check (auth.role() = 'authenticated'::text);

create policy "Allow event creators to update events" on "public"."events" as permissive for update to "public" using ((auth.uid()::text IN ( SELECT users.uid
   FROM users
  WHERE users.id = events.created_by)));

create policy "Allow public read access to events" on "public"."events" as permissive for select to "public" using (true);

create policy "anyone can view events" on "public"."events" as permissive for select to "public" using (true);

create policy "event creator can update their event" on "public"."events" as permissive for update to "public" using (created_by_auth = auth.uid()) with check (created_by_auth = auth.uid());

create policy "event creator or admin can update their event" on "public"."events" as permissive for update to "public" using (created_by = auth.uid() OR created_by_auth = auth.uid() OR (EXISTS ( SELECT 1
   FROM users
  WHERE users.id = auth.uid() AND users.user_type = 'admin'::text))) with check (created_by = auth.uid() OR created_by_auth = auth.uid() OR (EXISTS ( SELECT 1
   FROM users
  WHERE users.id = auth.uid() AND users.user_type = 'admin'::text)));

create policy "Allow creation of notifications" on "public"."notifications" as permissive for insert to "public" with check (true);

create policy "Allow public read broadcast notifications" on "public"."notifications" as permissive for select to "public" using (user_id IS NULL);

create policy "Allow users to read own notifications" on "public"."notifications" as permissive for select to "public" using (auth.uid() = user_id OR (EXISTS ( SELECT 1
   FROM admins
  WHERE admins.user_id = auth.uid())));

create policy "Allow users to update own notifications" on "public"."notifications" as permissive for update to "public" using (auth.uid() = user_id OR user_id IS NULL);

create policy "Allow update for anyone" on "public"."organizer_wallets" as permissive for update to "public" using (true);

create policy "Anyone can read wallets" on "public"."organizer_wallets" as permissive for select to "public" using (true);

create policy "Authenticated users can insert wallets" on "public"."organizer_wallets" as permissive for insert to "public" with check (true);

create policy "Users can insert their own otps" on "public"."payout_otps" as permissive for insert to "public" with check (auth.uid() = user_id);

create policy "Users can update their own otps" on "public"."payout_otps" as permissive for update to "public" using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can view their own otps" on "public"."payout_otps" as permissive for select to "public" using (auth.uid() = user_id);

create policy "Anyone can read payouts" on "public"."payouts" as permissive for select to "public" using (true);

create policy "Authenticated users can insert payouts" on "public"."payouts" as permissive for insert to "public" with check (true);

create policy "Users can update their own payouts" on "public"."payouts" as permissive for update to "public" using (organizer_id = auth.uid()::text);

create policy "Allow insert from anyone" on "public"."pending_ticket_fulfillments" as permissive for insert to "anon", "authenticated" with check (true);

create policy "Allow select for anyone" on "public"."pending_ticket_fulfillments" as permissive for select to "anon", "authenticated" using (true);

create policy "Allow update for anyone" on "public"."pending_ticket_fulfillments" as permissive for update to "anon", "authenticated" using (true);

create policy "buyers can view their refunds" on "public"."refund_requests" as permissive for select to "public" using (buyer_id = auth.uid());

create policy "event creator can view refund requests for their events" on "public"."refund_requests" as permissive for select to "public" using ((EXISTS ( SELECT 1
   FROM events e
  WHERE e.slug = refund_requests.event_id AND e.created_by_auth = auth.uid())));

create policy "buyers can view their refund history" on "public"."refund_status_history" as permissive for select to "public" using ((EXISTS ( SELECT 1
   FROM refund_requests r
  WHERE r.id = refund_status_history.refund_request_id AND r.buyer_id = auth.uid())));

create policy "Buyers can view own plans" on "public"."ticket_installment_plans" as permissive for select to "public" using (buyer_id = auth.uid()::text OR buyer_email = auth.email());

create policy "Service role full access" on "public"."ticket_installment_plans" as permissive for all to "public" using (auth.role() = 'service_role'::text);

create policy "buyers_insert_own" on "public"."ticket_installment_plans" as permissive for insert to "authenticated" with check (buyer_id = (( SELECT users.id::text AS id
   FROM users
  WHERE users.uid = auth.uid()::text
 LIMIT 1)));

create policy "buyers_select_own" on "public"."ticket_installment_plans" as permissive for select to "authenticated" using (buyer_id = (( SELECT users.id::text AS id
   FROM users
  WHERE users.uid = auth.uid()::text
 LIMIT 1)));

create policy "buyers_update_own" on "public"."ticket_installment_plans" as permissive for update to "authenticated" using (buyer_id = (( SELECT users.id::text AS id
   FROM users
  WHERE users.uid = auth.uid()::text
 LIMIT 1))) with check (buyer_id = (( SELECT users.id::text AS id
   FROM users
  WHERE users.uid = auth.uid()::text
 LIMIT 1)));

create policy "service_role_all" on "public"."ticket_installment_plans" as permissive for all to "service_role" using (true) with check (true);

create policy "Anyone can read validations" on "public"."ticket_validations" as permissive for select to "public" using (true);

create policy "Authenticated users can insert validations" on "public"."ticket_validations" as permissive for insert to "public" with check (true);

create policy "Anyone can read tickets" on "public"."tickets" as permissive for select to "public" using (true);

create policy "Anyone can update tickets" on "public"."tickets" as permissive for update to "public" using (true) with check (true);

create policy "Authenticated users can insert tickets" on "public"."tickets" as permissive for insert to "public" with check (true);

create policy "Admins can delete users" on "public"."users" as permissive for delete to "public" using (user_type = 'admin'::text);

create policy "Admins can read all users" on "public"."users" as permissive for select to "public" using (user_type = 'admin'::text);

create policy "Admins can update any user" on "public"."users" as permissive for update to "public" using (user_type = 'admin'::text) with check (user_type = 'admin'::text);

create policy "Admins can view all users" on "public"."users" as permissive for select to "public" using (user_type = 'admin'::text);

create policy "Allow authenticated users to read users" on "public"."users" as permissive for select to "public" using (auth.role() = 'authenticated'::text);

create policy "Allow users to update own profile" on "public"."users" as permissive for update to "public" using (auth.uid()::text = uid) with check (auth.uid()::text = uid);

create policy "Only admins can change user_type" on "public"."users" as permissive for update to "public" using (user_type = 'admin'::text) with check (user_type = 'admin'::text);

create policy "Users can insert their own profile" on "public"."users" as permissive for insert to "public" with check (auth.uid()::text = uid);

create policy "Users can update own profile" on "public"."users" as permissive for update to "public" using (auth.uid()::text = uid) with check (auth.uid()::text = uid AND user_type = (( SELECT users_1.user_type
   FROM users users_1
  WHERE users_1.uid = auth.uid()::text)));

create policy "Users can view own profile" on "public"."users" as permissive for select to "public" using (auth.uid()::text = uid);

create policy "Allow authenticated users to create venues" on "public"."venues" as permissive for insert to "public" with check (auth.role() = 'authenticated'::text);

create policy "Allow public read access to venues" on "public"."venues" as permissive for select to "public" using (true);

create policy "Anyone can read vibe images" on "public"."vibe_images" as permissive for select to "public" using (true);

create policy "Authenticated users can insert vibe images" on "public"."vibe_images" as permissive for insert to "public" with check (true);

create policy "Anyone can read vibe ratings" on "public"."vibe_ratings" as permissive for select to "public" using (true);

create policy "Authenticated users can insert vibe ratings" on "public"."vibe_ratings" as permissive for insert to "public" with check (true);

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."admins" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."admins" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."admins" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."admins" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."analytics_sessions" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."analytics_sessions" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."analytics_sessions" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."analytics_sessions" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."daily_notification_stats" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."daily_notification_stats" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."daily_notification_stats" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."daily_notification_stats" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."event_staff_tokens" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."event_staff_tokens" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."event_staff_tokens" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."event_staff_tokens" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."events" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."events" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."events" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."events" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_analytics" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_analytics" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_analytics" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_analytics" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_tokens" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_tokens" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_tokens" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_tokens" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_user_interactions" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_user_interactions" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_user_interactions" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notification_user_interactions" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notifications" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notifications" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notifications" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."notifications" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."organizer_wallets" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."organizer_wallets" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."organizer_wallets" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."organizer_wallets" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."payout_otps" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."payout_otps" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."payout_otps" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."payout_otps" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."payouts" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."payouts" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."payouts" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."payouts" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."pending_ticket_fulfillments" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."pending_ticket_fulfillments" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."pending_ticket_fulfillments" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."pending_ticket_fulfillments" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."refund_requests" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."refund_requests" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."refund_requests" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."refund_requests" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."refund_status_history" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."refund_status_history" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."refund_status_history" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."refund_status_history" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."seat_holds" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."seat_holds" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."seat_holds" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."seat_holds" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_email_jobs" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_email_jobs" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ticket_email_jobs" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_email_jobs" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_installment_plans" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_installment_plans" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ticket_installment_plans" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_installment_plans" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_inventory_holds" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_inventory_holds" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ticket_inventory_holds" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."ticket_inventory_holds" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ticket_validations" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ticket_validations" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ticket_validations" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ticket_validations" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tickets" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tickets" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tickets" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tickets" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."tickets_api" to "anon";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."tickets_api" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tickets_api" to "postgres";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."tickets_api" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."users" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."users" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."users" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."users" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venue_ownership_requests" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venue_ownership_requests" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venue_ownership_requests" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venue_ownership_requests" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venues" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venues" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venues" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."venues" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_images" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_images" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_images" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_images" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_ratings" to "anon";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_ratings" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_ratings" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."vibe_ratings" to "service_role";

drop trigger if exists "on_auth_user_created" on "auth"."users";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Staging security hardening: remove legacy broad access from sensitive tables.

drop policy if exists "Anyone can read tickets" on public.tickets;

drop policy if exists "Anyone can update tickets" on public.tickets;

drop policy if exists "Authenticated users can insert tickets" on public.tickets;

drop policy if exists "Anyone can read payouts" on public.payouts;

drop policy if exists "Authenticated users can insert payouts" on public.payouts;

drop policy if exists "Users can update their own payouts" on public.payouts;

drop policy if exists "Anyone can read wallets" on public.organizer_wallets;

drop policy if exists "Allow update for anyone" on public.organizer_wallets;

drop policy if exists "Authenticated users can insert wallets" on public.organizer_wallets;

drop policy if exists "Allow insert from anyone" on public.pending_ticket_fulfillments;

drop policy if exists "Allow select for anyone" on public.pending_ticket_fulfillments;

drop policy if exists "Allow update for anyone" on public.pending_ticket_fulfillments;

drop policy if exists "Anyone can read validations" on public.ticket_validations;

drop policy if exists "Authenticated users can insert validations" on public.ticket_validations;

drop policy if exists "Public can validate unexpired tokens" on public.event_staff_tokens;

drop policy if exists "Allow authenticated users to read users" on public.users;

drop policy if exists "Admins can read all users" on public.users;

drop policy if exists "Admins can view all users" on public.users;

drop policy if exists "Admins can update any user" on public.users;

drop policy if exists "Admins can delete users" on public.users;

drop policy if exists "Only admins can change user_type" on public.users;



create or replace function public.current_profile_id() returns uuid language sql stable security definer set search_path = public as $fn$ select id from public.users where uid = auth.uid()::text limit 1 $fn$;

create or replace function public.current_user_is_admin() returns boolean language sql stable security definer set search_path = public as $fn$ select exists (select 1 from public.users where uid = auth.uid()::text and user_type = 'admin') $fn$;

revoke all on function public.current_profile_id() from public, anon;

revoke all on function public.current_user_is_admin() from public, anon;

grant execute on function public.current_profile_id() to authenticated, service_role;

grant execute on function public.current_user_is_admin() to authenticated, service_role;



create policy tickets_select_authorized on public.tickets for select to authenticated using (buyer_id in (auth.uid()::text, public.current_profile_id()::text) or lower(buyer_email) = lower(auth.email()) or public.current_user_is_admin() or exists (select 1 from public.events e where e.slug = tickets.event_slug and (e.created_by_auth = auth.uid() or e.created_by = public.current_profile_id())));

create policy payouts_select_authorized on public.payouts for select to authenticated using (organizer_id in (auth.uid()::text, public.current_profile_id()::text) or public.current_user_is_admin());

create policy wallets_select_authorized on public.organizer_wallets for select to authenticated using (organizer_id in (auth.uid()::text, public.current_profile_id()::text) or public.current_user_is_admin());

create policy validations_select_authorized on public.ticket_validations for select to authenticated using (public.current_user_is_admin() or exists (select 1 from public.events e where e.slug = ticket_validations.event_slug and (e.created_by_auth = auth.uid() or e.created_by = public.current_profile_id())));

create policy users_select_self_or_admin on public.users for select to authenticated using (uid = auth.uid()::text or public.current_user_is_admin());



revoke all privileges on table public.tickets, public.tickets_api, public.payouts, public.organizer_wallets, public.pending_ticket_fulfillments, public.ticket_email_jobs, public.notification_tokens, public.payout_otps, public.ticket_validations from anon, authenticated;

grant select on table public.tickets, public.payouts, public.organizer_wallets, public.ticket_validations to authenticated;

grant select on table public.tickets_api to authenticated;

revoke insert, update, delete on table public.users from authenticated;

grant update (display_name, photo_url, payment_details, last_login_at) on table public.users to authenticated;

alter view public.tickets_api set (security_invoker = true);



-- Guest photo upload token is consumed atomically; only opaque private references are accepted.

create or replace function public.add_ticket_security_photo(p_ticket_id text, p_token text, p_photo_url text) returns boolean language plpgsql security definer set search_path = public as $fn$ declare v_updated text; begin if p_photo_url !~ '^r2-private://buyer-photos/[A-Za-z0-9._-]+\.jpg$' then return false; end if; update public.tickets set buyer_photo_url = p_photo_url, photo_upload_token = null, photo_upload_token_expires_at = null where id = p_ticket_id and buyer_photo_url is null and photo_upload_token = p_token and photo_upload_token_expires_at > now() returning id into v_updated; return v_updated is not null; end $fn$;

revoke all on function public.add_ticket_security_photo(text, text, text) from public;

grant execute on function public.add_ticket_security_photo(text, text, text) to anon, authenticated, service_role;



-- Ticket creation, fulfillment claiming, and payment recording are server-only.

revoke all on function public.create_tickets_batch(text, jsonb) from public, anon, authenticated;

revoke all on function public.create_tickets_batch(text, jsonb, uuid[], text, uuid) from public, anon, authenticated;

revoke all on function public.claim_ticket_fulfillment(uuid, integer) from public, anon, authenticated;

revoke all on function public.record_installment_payment(uuid, integer, jsonb, uuid) from public, anon, authenticated;

revoke all on function public.reserve_installment_inventory(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_tickets_batch(text, jsonb) to service_role;

grant execute on function public.create_tickets_batch(text, jsonb, uuid[], text, uuid) to service_role;

grant execute on function public.claim_ticket_fulfillment(uuid, integer) to service_role;

grant execute on function public.record_installment_payment(uuid, integer, jsonb, uuid) to service_role;

grant execute on function public.reserve_installment_inventory(uuid, uuid) to service_role;

commit;
