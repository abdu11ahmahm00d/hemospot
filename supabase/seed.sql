-- =============================================================================
-- Hemospot - demo seed (T-018).
--
-- WHAT THIS IS
--   Creates one account per demo persona so the product can be demonstrated
--   from a database built by the migrations alone. No business data: the demo
--   creates its own case, evidence and custody chain, which is the point of
--   showing it.
--
-- THE ACCOUNTS
--   arman_admin@hemospot.local        admin              creates cases, assigns analysts, approves
--   nahin_lead@hemospot.local         lead_investigator  creates cases, requests analysis
--   firman@hemospot.local             analyst            runs the queue worker (see sidecar/.env)
--   mosaddika_reviewer@hemospot.local reviewer           approves or rejects finished work
--   dipto_supervisor@hemospot.local   reviewer           the case supervisor
--   mowmita_viewer@hemospot.local     viewer             sees nothing; proves the NFR1.1 denial
--
--   Every account it creates gets the one password you set below. An account
--   that already exists keeps its own password, so a worker or a person
--   already signed in with it is not locked out; only its role is set.
--
-- BEFORE YOU RUN IT
--   Set seed_password. The block refuses to run while the placeholder is there,
--   and refuses anything shorter than 12 characters, because this file is
--   public: a password that shipped in the repository would be a published
--   login for whatever database you pointed it at.
--
-- WHERE TO RUN IT
--   Fresh or local   supabase db reset    (config.toml already points here)
--   Hosted           supabase db query --linked -f supabase/seed.sql
--                    (from the repository root; or paste the whole block into
--                    the SQL editor)
--   Running it twice is safe: accounts whose email already exists are kept and
--   only their role is set.
--
-- WHY IT INSERTS INTO auth.users DIRECTLY
--   There is no service_role key anywhere in this project, by design, so there
--   is no admin API to create accounts with. Seeding is provisioning, the same
--   category as a migration, and it runs as the database owner. The insert is
--   deliberately minimal, and it fires on_auth_user_created, which creates each
--   public.profiles row. That also proves the trigger works on a database built
--   from the migrations alone, with nothing hand-edited.
--
--   One GoTrue detail is load bearing: the token columns (confirmation_token,
--   recovery_token, email_change*, phone_change*, reauthentication_token) must
--   be '' rather than NULL, because GoTrue scans them as plain strings and
--   answers a NULL with a 500 "Database error querying schema" at sign-in. The
--   insert writes '' for all of them, exactly as GoTrue itself would.
--
--   crypt() and gen_salt() come from pgcrypto, which every Supabase project has.
-- =============================================================================

do $$
declare
  -- ---------------------------------------------------------------------------
  -- THE ONE LINE TO CHANGE. Twelve characters or more.
  seed_password constant text := 'CHANGE-ME-BEFORE-RUNNING';
  -- ---------------------------------------------------------------------------

  rec record;
  account_id uuid;
  created int := 0;
  kept int := 0;
begin
  if seed_password = 'CHANGE-ME-BEFORE-RUNNING' then
    raise exception 'seed.sql: set seed_password at the top of this block first.';
  end if;
  if length(seed_password) < 12 then
    raise exception 'seed.sql: seed_password must be at least 12 characters.';
  end if;

  for rec in
    select * from (values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'arman_admin@hemospot.local',        'Arman',     'admin'),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'nahin_lead@hemospot.local',         'Nahin',     'lead_investigator'),
      ('33333333-3333-4333-8333-333333333333'::uuid, 'firman@hemospot.local',             'Firman',    'analyst'),
      ('44444444-4444-4444-8444-444444444444'::uuid, 'mosaddika_reviewer@hemospot.local', 'Mosaddika', 'reviewer'),
      ('55555555-5555-4555-8555-555555555555'::uuid, 'mowmita_viewer@hemospot.local',     'Mowmita',   'viewer'),
      ('66666666-6666-4666-8666-666666666666'::uuid, 'dipto_supervisor@hemospot.local',   'Dipto',     'reviewer')
    ) as t(id, email, full_name, role)
  loop
    if exists (select 1 from auth.users u where lower(u.email) = lower(rec.email)) then
      account_id := (select u.id from auth.users u where lower(u.email) = lower(rec.email));
      kept := kept + 1;
      raise notice 'kept existing account %', rec.email;
    else
      account_id := rec.id;

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', rec.id, 'authenticated', 'authenticated',
        rec.email, crypt(seed_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', rec.full_name), now(), now(),
        -- GoTrue scans these as plain strings; NULL here means HTTP 500
        -- "Database error querying schema" on every sign-in attempt.
        '', '', '', '', '', '', '', ''
      );

      -- GoTrue keeps one identities row per account alongside auth.users. The
      -- provider_id column is text on current Supabase and was uuid on older
      -- builds, so if this line is ever rejected as a type mismatch, cast
      -- rec.id to uuid instead. auth.identities.email is a generated column,
      -- which is why it is not in the list.
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), rec.id, rec.id::text,
        jsonb_build_object('sub', rec.id::text, 'email', rec.email, 'email_verified', true),
        'email', now(), now(), now()
      );

      created := created + 1;
      raise notice 'created account %', rec.email;
    end if;

    -- The insert above fired on_auth_user_created, which made the profile with
    -- role 'viewer'. This is the promotion the product has no screen for yet.
    update public.profiles
      set role = rec.role, full_name = rec.full_name
      where id = account_id;
  end loop;

  raise notice 'seed done: % created, % already present, one account per persona', created, kept;
end
$$;
