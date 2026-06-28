-- =====================================================================
-- restrict_signup_domain.sql
-- =====================================================================
-- Lets the professor self-register on the public site while blocking random
-- internet users (who would otherwise spend the FAU LLM budget).
--
-- A BEFORE INSERT trigger on auth.users rejects any sign-up whose email
-- domain isn't on the allow-list. Enforced server-side, so it can't be
-- bypassed from the browser. Existing accounts are unaffected (the trigger
-- only fires on NEW registrations).
--
-- ▸ EDIT the allow-list below if the professor's domain isn't fau.edu.
-- Run in: Supabase -> SQL Editor -> New query -> paste -> Run.
-- After running, enable sign-ups in the dashboard (see README steps).
-- =====================================================================

create or replace function public.enforce_signup_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    -- ▼▼▼ allowed registration domains — edit here ▼▼▼
    allowed_domains text[] := array['fau.edu'];
    -- ▲▲▲ subdomains like my.fau.edu are also accepted automatically ▲▲▲
    email_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
    ok boolean := false;
    d text;
begin
    foreach d in array allowed_domains loop
        if email_domain = d or email_domain like ('%.' || d) then
            ok := true;
            exit;
        end if;
    end loop;

    if not ok then
        raise exception
            'Registration is restricted to approved email domains (%). Please use your institutional email.',
            array_to_string(allowed_domains, ', ')
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

drop trigger if exists enforce_signup_domain on auth.users;
create trigger enforce_signup_domain
    before insert on auth.users
    for each row execute function public.enforce_signup_domain();

-- Verify the trigger is installed:
select tgname, tgenabled from pg_trigger where tgname = 'enforce_signup_domain';

-- =====================================================================
-- To REMOVE this restriction later:
--   drop trigger if exists enforce_signup_domain on auth.users;
--   drop function if exists public.enforce_signup_domain();
-- =====================================================================
