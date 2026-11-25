-- Discovery-scraper provenance and multi-day event support.
-- Run this in Supabase only after the preflight query below returns no duplicate URLs.

-- Preflight: this must return zero rows before creating the unique index.
select source_url, count(*) as duplicate_count
from public.events
where source_url is not null and btrim(source_url) <> ''
group by source_url
having count(*) > 1
order by duplicate_count desc, source_url;

begin;

alter table public.events
  add column if not exists ends_at timestamptz,
  add column if not exists scrape_source text,
  add column if not exists scrape_first_seen_at timestamptz,
  add column if not exists scrape_last_seen_at timestamptz;

create index if not exists events_scrape_source_last_seen_idx
  on public.events (scrape_source, scrape_last_seen_at desc)
  where scrape_source is not null;

commit;

-- Run this statement only after the preflight query above returns zero rows.
-- The guard makes an accidental one-shot execution fail before it can build
-- an invalid index. It is outside the additive transaction so a duplicate
-- failure cannot roll back the safe new nullable columns.
do $$
begin
  if exists (
    select 1
    from public.events
    where source_url is not null and btrim(source_url) <> ''
    group by source_url
    having count(*) > 1
  ) then
    raise exception 'Duplicate non-empty events.source_url values must be resolved before creating events_source_url_unique_idx';
  end if;
end $$;

create unique index if not exists events_source_url_unique_idx
  on public.events (source_url)
  where source_url is not null and btrim(source_url) <> '';
