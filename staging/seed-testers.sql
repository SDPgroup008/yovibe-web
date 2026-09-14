-- Run only after the three tester accounts exist in Supabase Authentication.
-- This does not create passwords or send invites.
begin;

do $seed$
declare
  missing_emails text;
begin
  select string_agg(expected.email, ', ')
    into missing_emails
  from (values
    ('reinolmartin01@gmail.com'),
    ('reinolmartin001@gmail.com'),
    ('reinolmartin0001@gmail.com')
  ) as expected(email)
  where not exists (select 1 from auth.users au where lower(au.email) = expected.email);

  if missing_emails is not null then
    raise exception 'Create these Authentication users first: %', missing_emails;
  end if;

  update public.users u
  set user_type = mapping.user_type,
      display_name = mapping.display_name,
      is_deleted = false,
      is_frozen = false
  from (values
    ('reinolmartin01@gmail.com', 'regular_user', 'Staging Buyer'),
    ('reinolmartin001@gmail.com', 'club_owner', 'Staging Organiser'),
    ('reinolmartin0001@gmail.com', 'admin', 'Staging Administrator')
  ) as mapping(email, user_type, display_name)
  where lower(u.email) = mapping.email;
end
$seed$;

commit;

select email, display_name, user_type
from public.users
where lower(email) in (
  'reinolmartin01@gmail.com',
  'reinolmartin001@gmail.com',
  'reinolmartin0001@gmail.com'
)
order by email;
