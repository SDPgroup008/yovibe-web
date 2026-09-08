const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const [header, ...data] = rows;
  return data.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(header.map((name, index) => [name, values[index] || ''])));
}

const qi = (value) => `"${String(value).replace(/"/g, '""')}"`;
const ql = (value) => `'${String(value).replace(/'/g, "''")}'`;
const fq = (schema, name) => `${qi(schema)}.${qi(name)}`;

function json(row) {
  try { return JSON.parse(row.definition); }
  catch (error) { throw new Error(`Invalid JSON for ${row.object_type} ${row.object_name}: ${error.message}`); }
}

function sqlDefinition(value, label) {
  const definition = String(value || '').trim().replace(/;$/, '');
  if (!definition) throw new Error(`Missing SQL definition for ${label}`);
  return definition;
}

function validateGeneratedSql(sql) {
  if (/\bas(?:select|with|values)\b/i.test(sql)) {
    throw new Error('Generated SQL contains a view AS clause without required whitespace.');
  }
  if (/&#x(?:20|0a|0d);|&nbsp;/i.test(sql)) {
    throw new Error('Generated SQL contains HTML-encoded whitespace.');
  }
}

function generate(rows) {
  const byType = (type) => rows.filter((row) => row.object_type === type);
  const out = [
    '-- Generated from yovibe-schema-catalog.csv. Do not edit by hand.',
    '-- Run: npm run staging:schema',
    'begin;',
    "set local check_function_bodies = off;",
    'create schema if not exists public;',
    'create schema if not exists extensions;',
    'create schema if not exists vault;',
  ];

  for (const row of byType('extension')) {
    const d = json(row);
    out.push(`create extension if not exists ${qi(d.name)} with schema ${qi(d.schema)};`);
  }
  for (const row of byType('enum')) {
    const d = json(row);
    const values = d.values.map(ql).join(', ');
    out.push(`do $ddl$ begin create type ${fq(d.schema, d.name)} as enum (${values}); exception when duplicate_object then null; end $ddl$;`);
  }

  const columnsByTable = new Map();
  for (const row of byType('column')) {
    const d = json(row);
    const key = `${d.schema}.${d.table}`;
    if (!columnsByTable.has(key)) columnsByTable.set(key, []);
    columnsByTable.get(key).push(d);
  }
  for (const row of byType('table')) {
    const d = json(row);
    const columns = (columnsByTable.get(`${d.schema}.${d.name}`) || []).sort((a, b) => a.position - b.position);
    if (!columns.length) throw new Error(`No columns found for ${d.schema}.${d.name}`);
    const definitions = columns.map((column) => {
      const parts = [qi(column.name), column.data_type];
      if (column.generated_mode) parts.push(`generated always as (${column.default_or_generation_expression}) stored`);
      else if (column.identity_mode) parts.push(`generated ${column.identity_mode} as identity`);
      else if (column.default_or_generation_expression !== null) parts.push(`default ${column.default_or_generation_expression}`);
      if (column.not_null) parts.push('not null');
      return `  ${parts.join(' ')}`;
    });
    out.push(`create table if not exists ${fq(d.schema, d.name)} (\n${definitions.join(',\n')}\n);`);
  }

  const constraints = byType('constraint').map((row) => json(row));
  for (const d of constraints.filter((item) => item.type !== 'f')) {
    out.push(`alter table ${fq(d.schema, d.table)} add constraint ${qi(d.name)} ${d.definition};`);
  }
  for (const d of constraints.filter((item) => item.type === 'f')) {
    out.push(`alter table ${fq(d.schema, d.table)} add constraint ${qi(d.name)} ${d.definition};`);
  }

  for (const row of byType('function')) out.push(`${row.definition.trim().replace(/;?$/, ';')}`);
  for (const row of byType('view')) {
    const d = json(row);
    out.push(`create or replace view ${fq(d.schema, d.name)} as\n${sqlDefinition(d.definition, `view ${d.schema}.${d.name}`)};`);
  }
  for (const row of byType('index')) {
    const d = json(row);
    if (!d.constraint_backed) {
      const statement = d.definition.trim().replace(/^CREATE (UNIQUE )?INDEX /i, 'CREATE $1INDEX IF NOT EXISTS ');
      out.push(statement.replace(/;?$/, ';'));
    }
  }

  for (const row of byType('table')) {
    const d = json(row);
    if (d.row_security_enabled) out.push(`alter table ${fq(d.schema, d.name)} enable row level security;`);
    if (d.row_security_forced) out.push(`alter table ${fq(d.schema, d.name)} force row level security;`);
  }
  for (const row of byType('rls_policy')) {
    const d = json(row);
    const mode = d.permissive ? 'permissive' : 'restrictive';
    const roles = d.roles.map(qi).join(', ');
    const using = d.using_expression === null ? '' : ` using (${d.using_expression})`;
    const check = d.check_expression === null ? '' : ` with check (${d.check_expression})`;
    out.push(`create policy ${qi(d.name)} on ${fq(d.schema, d.table)} as ${mode} for ${d.command.toLowerCase()} to ${roles}${using}${check};`);
  }

  const grants = new Map();
  for (const row of byType('table_grant')) {
    const d = json(row);
    const key = `${d.schema}\0${d.table}\0${d.grantee}`;
    if (!grants.has(key)) grants.set(key, { ...d, privileges: [] });
    grants.get(key).privileges.push(d.privilege);
  }
  for (const d of grants.values()) {
    out.push(`grant ${[...new Set(d.privileges)].sort().join(', ')} on table ${fq(d.schema, d.table)} to ${qi(d.grantee)};`);
  }
  for (const row of byType('trigger')) {
    const d = json(row);
    out.push(`drop trigger if exists ${qi(d.name)} on ${fq(d.schema, d.table)};`);
    out.push(`${d.definition.trim().replace(/;?$/, ';')}`);
  }

  out.push(
    '-- Staging security hardening: remove legacy broad access from sensitive tables.',
    'drop policy if exists "Anyone can read tickets" on public.tickets;',
    'drop policy if exists "Anyone can update tickets" on public.tickets;',
    'drop policy if exists "Authenticated users can insert tickets" on public.tickets;',
    'drop policy if exists "Anyone can read payouts" on public.payouts;',
    'drop policy if exists "Authenticated users can insert payouts" on public.payouts;',
    'drop policy if exists "Users can update their own payouts" on public.payouts;',
    'drop policy if exists "Anyone can read wallets" on public.organizer_wallets;',
    'drop policy if exists "Allow update for anyone" on public.organizer_wallets;',
    'drop policy if exists "Authenticated users can insert wallets" on public.organizer_wallets;',
    'drop policy if exists "Allow insert from anyone" on public.pending_ticket_fulfillments;',
    'drop policy if exists "Allow select for anyone" on public.pending_ticket_fulfillments;',
    'drop policy if exists "Allow update for anyone" on public.pending_ticket_fulfillments;',
    'drop policy if exists "Anyone can read validations" on public.ticket_validations;',
    'drop policy if exists "Authenticated users can insert validations" on public.ticket_validations;',
    'drop policy if exists "Public can validate unexpired tokens" on public.event_staff_tokens;',
    'drop policy if exists "Allow authenticated users to read users" on public.users;',
    'drop policy if exists "Admins can read all users" on public.users;',
    'drop policy if exists "Admins can view all users" on public.users;',
    'drop policy if exists "Admins can update any user" on public.users;',
    'drop policy if exists "Admins can delete users" on public.users;',
    'drop policy if exists "Only admins can change user_type" on public.users;',
    '',
    'create or replace function public.current_profile_id() returns uuid language sql stable security definer set search_path = public as $fn$ select id from public.users where uid = auth.uid()::text limit 1 $fn$;',
    'create or replace function public.current_user_is_admin() returns boolean language sql stable security definer set search_path = public as $fn$ select exists (select 1 from public.users where uid = auth.uid()::text and user_type = \'admin\') $fn$;',
    'revoke all on function public.current_profile_id() from public, anon;',
    'revoke all on function public.current_user_is_admin() from public, anon;',
    'grant execute on function public.current_profile_id() to authenticated, service_role;',
    'grant execute on function public.current_user_is_admin() to authenticated, service_role;',
    '',
    'create policy tickets_select_authorized on public.tickets for select to authenticated using (buyer_id in (auth.uid()::text, public.current_profile_id()::text) or lower(buyer_email) = lower(auth.email()) or public.current_user_is_admin() or exists (select 1 from public.events e where e.slug = tickets.event_slug and (e.created_by_auth = auth.uid() or e.created_by = public.current_profile_id())));',
    'create policy payouts_select_authorized on public.payouts for select to authenticated using (organizer_id in (auth.uid()::text, public.current_profile_id()::text) or public.current_user_is_admin());',
    'create policy wallets_select_authorized on public.organizer_wallets for select to authenticated using (organizer_id in (auth.uid()::text, public.current_profile_id()::text) or public.current_user_is_admin());',
    'create policy validations_select_authorized on public.ticket_validations for select to authenticated using (public.current_user_is_admin() or exists (select 1 from public.events e where e.slug = ticket_validations.event_slug and (e.created_by_auth = auth.uid() or e.created_by = public.current_profile_id())));',
    'create policy users_select_self_or_admin on public.users for select to authenticated using (uid = auth.uid()::text or public.current_user_is_admin());',
    '',
    'revoke all privileges on table public.tickets, public.tickets_api, public.payouts, public.organizer_wallets, public.pending_ticket_fulfillments, public.ticket_email_jobs, public.notification_tokens, public.payout_otps, public.ticket_validations from anon, authenticated;',
    'grant select on table public.tickets, public.payouts, public.organizer_wallets, public.ticket_validations to authenticated;',
    'grant select on table public.tickets_api to authenticated;',
    'revoke insert, update, delete on table public.users from authenticated;',
    'grant update (display_name, photo_url, payment_details, last_login_at) on table public.users to authenticated;',
    'alter view public.tickets_api set (security_invoker = true);',
    '',
    '-- Guest photo upload token is consumed atomically; only opaque private references are accepted.',
    'create or replace function public.add_ticket_security_photo(p_ticket_id text, p_token text, p_photo_url text) returns boolean language plpgsql security definer set search_path = public as $fn$ declare v_updated text; begin if p_photo_url !~ \'^r2-private://buyer-photos/[A-Za-z0-9._-]+\\.jpg$\' then return false; end if; update public.tickets set buyer_photo_url = p_photo_url, photo_upload_token = null, photo_upload_token_expires_at = null where id = p_ticket_id and buyer_photo_url is null and photo_upload_token = p_token and photo_upload_token_expires_at > now() returning id into v_updated; return v_updated is not null; end $fn$;',
    'revoke all on function public.add_ticket_security_photo(text, text, text) from public;',
    'grant execute on function public.add_ticket_security_photo(text, text, text) to anon, authenticated, service_role;',
    '',
    '-- Ticket creation, fulfillment claiming, and payment recording are server-only.',
    'revoke all on function public.create_tickets_batch(text, jsonb) from public, anon, authenticated;',
    'revoke all on function public.create_tickets_batch(text, jsonb, uuid[], text, uuid) from public, anon, authenticated;',
    'revoke all on function public.claim_ticket_fulfillment(uuid, integer) from public, anon, authenticated;',
    'revoke all on function public.record_installment_payment(uuid, integer, jsonb, uuid) from public, anon, authenticated;',
    'revoke all on function public.reserve_installment_inventory(uuid, uuid) from public, anon, authenticated;',
    'grant execute on function public.create_tickets_batch(text, jsonb) to service_role;',
    'grant execute on function public.create_tickets_batch(text, jsonb, uuid[], text, uuid) to service_role;',
    'grant execute on function public.claim_ticket_fulfillment(uuid, integer) to service_role;',
    'grant execute on function public.record_installment_payment(uuid, integer, jsonb, uuid) to service_role;',
    'grant execute on function public.reserve_installment_inventory(uuid, uuid) to service_role;',
    'commit;',
    ''
  );
  return `${out.join('\n\n').replace(/[ \t]+$/gm, '').trimEnd()}\n`;
}

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'yovibe-schema-catalog.csv');
const output = path.join(root, 'staging', 'schema.sql');
const rows = parseCsv(fs.readFileSync(input, 'utf8'));
const sql = generate(rows);
validateGeneratedSql(sql);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, sql, 'utf8');
console.log(`Generated ${path.relative(root, output)} from ${rows.length} catalog rows.`);
