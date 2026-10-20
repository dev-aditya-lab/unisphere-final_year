-- Daily Challenge automation (all times are Asia/Kolkata, like the rest of Orbits).
--   16:00  the worker asks the AI for tomorrow's question and stores it as a DRAFT (source = 'ai_draft') when that day has no question yet.
--   02:00  on the challenge day itself, an AI draft that no administrator approved is published when nothing else is live for the day.
-- Approving means scheduling or publishing the draft (Admin -> Orbits -> Daily Challenge), which takes it out of the automatic path.
-- Both steps can be switched off with the reward settings `auto_question_draft` and `auto_question_publish` (1 = on, 0 = off).
-- Only AI drafts are ever published automatically; a draft an administrator wrote is left alone.

insert into public.orbit_config(key, value, description) values
  ('auto_question_draft', '1', 'Draft tomorrow''s Daily Challenge with AI at 16:00 IST (1 = on, 0 = off)'),
  ('auto_question_publish', '1', 'Publish an unapproved AI draft at 02:00 IST on its day when nothing else is live (1 = on, 0 = off)')
on conflict (key) do nothing;

-- One row per challenge day being prepared: it throttles retries when the AI is down and says what happened.
create table public.orbit_question_automation (
  day date primary key,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  drafted_id uuid references public.orbit_questions(id) on delete set null,
  published_at timestamptz
);
alter table public.orbit_question_automation enable row level security;
revoke all on public.orbit_question_automation from anon, authenticated;

-- Which day should be drafted right now, if any, claiming one attempt (at most 8 attempts per day, 30 minutes apart).
--   16:00 to 23:59 -> tomorrow;  00:00 to 01:59 -> today (last chance before the 02:00 publish);  otherwise nothing.
-- `p_now` exists so the schedule can be tested; the worker always uses the real time.
create or replace function public.orbit_auto_draft_claim(p_now timestamptz default now()) returns date language plpgsql security definer set search_path = '' as $$
declare v_now timestamp := p_now at time zone 'Asia/Kolkata'; v_hour int := extract(hour from v_now); v_day date; v_claimed date;
begin
  if public._orbit_num('auto_question_draft') <> 1 then return null; end if;
  v_day := case when v_hour >= 16 then v_now::date + 1 when v_hour < 2 then v_now::date end;
  if v_day is null then return null; end if;
  -- any question for the day (even an archived one: the administrators decided) means there is nothing to draft
  if exists (select 1 from public.orbit_questions where publish_date = v_day) then return null; end if;
  insert into public.orbit_question_automation(day) values (v_day) on conflict do nothing;
  update public.orbit_question_automation set attempts = attempts + 1, last_attempt_at = p_now
    where day = v_day and attempts < 8 and (last_attempt_at is null or last_attempt_at <= p_now - interval '30 minutes')
    returning day into v_claimed;
  return v_claimed;
end $$;

create or replace function public.orbit_auto_draft_note_error(p_day date, p_error text) returns void language sql security definer set search_path = '' as $$
  update public.orbit_question_automation set last_error = left(p_error, 300) where day = p_day $$;

-- Stores the AI's question as a draft. The same checks as an administrator's save; nobody is recorded as author or reviewer.
create or replace function public.orbit_auto_draft_save(
  p_day date, p_question text, p_options jsonb, p_correct integer, p_explanation text, p_category text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_opts jsonb := '[]'::jsonb; i int;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then raise exception 'invalid_options' using errcode = '22023'; end if;
  for i in 0..3 loop
    if char_length(btrim(p_options ->> i)) not between 1 and 200 then raise exception 'invalid_options' using errcode = '22023'; end if;
    v_opts := v_opts || to_jsonb(btrim(p_options ->> i));
  end loop;
  if (select count(distinct lower(x)) from jsonb_array_elements_text(v_opts) x) <> 4 then raise exception 'duplicate_options' using errcode = '22023'; end if;
  if p_correct is null or p_correct not between 0 and 3 then raise exception 'invalid_correct' using errcode = '22023'; end if;
  if p_category not in ('programming', 'technology', 'science', 'aptitude', 'general', 'campus') then raise exception 'invalid_category' using errcode = '22023'; end if;
  -- an administrator may have written something for the day while the AI was thinking
  if exists (select 1 from public.orbit_questions where publish_date = p_day) then return null; end if;
  insert into public.orbit_questions(question, options, correct_index, explanation, category, publish_date, status, source)
    values (btrim(p_question), v_opts, p_correct, btrim(p_explanation), p_category, p_day, 'draft', 'ai_draft')
    returning id into v_id;
  update public.orbit_question_automation set drafted_id = v_id, last_error = null where day = p_day;
  perform public.write_audit_log(null, 'orbits.question_auto_drafted', 'orbit_question', v_id::text, null, jsonb_build_object('publish_date', p_day));
  return v_id;
end $$;

-- From 02:00 on a day: publish that day's newest unapproved AI draft when nothing is scheduled or published for it. Returns how many.
create or replace function public.orbit_auto_publish_due(p_now timestamptz default now()) returns integer language plpgsql security definer set search_path = '' as $$
declare v_now timestamp := p_now at time zone 'Asia/Kolkata'; v_day date := v_now::date; v_id uuid;
begin
  if public._orbit_num('auto_question_publish') <> 1 or extract(hour from v_now) < 2 then return 0; end if;
  if exists (select 1 from public.orbit_questions where publish_date = v_day and status in ('scheduled', 'published')) then return 0; end if;
  select id into v_id from public.orbit_questions
    where publish_date = v_day and status = 'draft' and source = 'ai_draft'
    order by created_at desc limit 1 for update skip locked;
  if v_id is null then return 0; end if;
  update public.orbit_questions set status = 'published', updated_at = now() where id = v_id;
  update public.orbit_question_automation set published_at = now() where day = v_day;
  perform public.write_audit_log(null, 'orbits.question_auto_published', 'orbit_question', v_id::text, null, jsonb_build_object('publish_date', v_day, 'reviewed', false));
  return 1;
exception when unique_violation then
  return 0; -- an administrator scheduled another question at the same moment
end $$;

revoke execute on function public.orbit_auto_draft_claim(timestamptz), public.orbit_auto_draft_note_error(date, text),
  public.orbit_auto_draft_save(date, text, jsonb, integer, text, text), public.orbit_auto_publish_due(timestamptz) from public, anon, authenticated;
grant execute on function public.orbit_auto_draft_claim(timestamptz), public.orbit_auto_draft_note_error(date, text),
  public.orbit_auto_draft_save(date, text, jsonb, integer, text, text), public.orbit_auto_publish_due(timestamptz) to service_role;
