-- Service-only outbox. Image bytes never enter a public bucket or public URL.
create table public.gig_followups (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('followup','material_update')),
  subject text not null check (length(subject) between 1 and 120),
  message text not null check (length(message) between 1 and 10000),
  payload_hash text not null check (length(payload_hash) = 64),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 3 and octet_length(attachments::text) <= 2200000),
  attachment_names text[] not null default '{}',
  project_name text not null,
  organization_name text not null,
  details_send_id uuid unique references public.gig_detail_sends(id),
  status text not null default 'pending' check (status in ('pending','sending','complete')),
  started_at timestamptz,
  completed_at timestamptz,
  check ((mode = 'material_update') = (details_send_id is not null))
);
create index gig_followups_project_history on public.gig_followups(organization_id,project_id,created_at desc);
create table public.gig_followup_recipients (
  followup_id uuid not null references public.gig_followups(id) on delete cascade,
  musician_id uuid not null references public.musicians(id),
  recipient_name text not null,
  recipient_email text not null,
  confirmation_token text,
  status text not null default 'pending' check (status in ('pending','sending','sent','suppressed','uncertain')),
  provider_id text,
  primary key(followup_id,musician_id)
);
alter table public.gig_followups enable row level security;
alter table public.gig_followup_recipients enable row level security;
create policy gig_followups_backend_only on public.gig_followups for all to service_role using (true) with check (true);
create policy gig_followup_recipients_backend_only on public.gig_followup_recipients for all to service_role using (true) with check (true);
revoke all on public.gig_followups, public.gig_followup_recipients from public, anon, authenticated;
grant all on public.gig_followups, public.gig_followup_recipients to service_role;

-- Atomic creation, roster validation, duplicate suppression and confirmation versioning.
-- SECURITY INVOKER: only the existing backend service role can execute this.
create function public.prepare_gig_followup(
  p_id uuid, p_org uuid, p_project uuid, p_actor uuid, p_mode text,
  p_subject text, p_message text, p_hash text, p_attachments jsonb, p_recipient_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.gig_followups%rowtype;
  v_project_name text;
  v_org_name text;
  v_ids uuid[];
  v_send uuid;
  v_previous_notes text;
begin
  if not exists(select 1 from public.organization_members where user_id=p_actor and organization_id=p_org and role in ('owner','admin')) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select p.name,o.name into v_project_name,v_org_name from public.projects p join public.organizations o on o.id=p.organization_id where p.id=p_project and p.organization_id=p_org;
  if not found then raise exception 'Project not found' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project::text, 0));
  select * into v_existing from public.gig_followups where id=p_id;
  if found then
    if v_existing.organization_id<>p_org or v_existing.project_id<>p_project or v_existing.created_by<>p_actor or v_existing.payload_hash<>p_hash then
      raise exception 'Request identifier already used' using errcode='22023';
    end if;
    return v_existing.id;
  end if;
  -- A new browser tab/reload must not accidentally send the same content twice.
  select * into v_existing from public.gig_followups f where organization_id=p_org and project_id=p_project and payload_hash=p_hash and (created_at > now()-interval '10 minutes' or exists(select 1 from public.gig_followup_recipients r where r.followup_id=f.id and r.status in ('pending','sending','uncertain'))) order by created_at desc limit 1;
  if found then return v_existing.id; end if;
  if exists(select 1 from public.gig_followups where project_id=p_project and status in ('pending','sending')) then
    raise exception 'A previous message is still processing. Check its delivery status before sending again.' using errcode='22023';
  end if;
  select notes into v_previous_notes from public.gig_detail_sends where project_id=p_project and organization_id=p_org order by sent_at desc limit 1;
  if not found then raise exception 'Send the initial gig details first' using errcode='22023'; end if;
  if p_mode not in ('followup','material_update') then raise exception 'Invalid mode' using errcode='22023'; end if;
  if exists(select 1 from public.project_positions pp join public.musicians m on m.id=pp.musician_id where pp.project_id=p_project and pp.status='confirmed' and (m.organization_id<>p_org or nullif(trim(m.email),'') is null)) then
    raise exception 'Every confirmed musician must have an email address in this organization' using errcode='22023';
  end if;
  select array_agg(x.id order by x.id) into v_ids from (select distinct m.id from public.project_positions pp join public.musicians m on m.id=pp.musician_id where pp.project_id=p_project and pp.status='confirmed' and m.organization_id=p_org) x;
  if coalesce(cardinality(v_ids),0)=0 or cardinality(v_ids)>50 or v_ids is distinct from (select array_agg(id order by id) from unnest(p_recipient_ids) id) then
    raise exception 'The roster changed. Review the recipients again.' using errcode='22023';
  end if;
  if p_mode='material_update' then
    v_send := gen_random_uuid();
    insert into public.gig_detail_sends(id,project_id,organization_id,sent_by,musician_count,notes)
      values(v_send,p_project,p_org,p_actor,cardinality(v_ids),concat_ws(E'\n\n',v_previous_notes,'UPDATE: '||p_message));
    insert into public.gig_detail_confirmations(send_id,musician_id) select v_send,unnest(v_ids);
  end if;
  insert into public.gig_followups(id,organization_id,project_id,created_by,mode,subject,message,payload_hash,attachments,attachment_names,project_name,organization_name,details_send_id)
    values(p_id,p_org,p_project,p_actor,p_mode,p_subject,p_message,p_hash,p_attachments,array(select a->>'filename' from jsonb_array_elements(p_attachments) a),v_project_name,v_org_name,v_send);
  insert into public.gig_followup_recipients(followup_id,musician_id,recipient_name,recipient_email,confirmation_token)
    select p_id,m.id,trim(m.first_name||' '||m.last_name),m.email,c.token from public.musicians m
      left join public.gig_detail_confirmations c on c.send_id=v_send and c.musician_id=m.id where m.id=any(v_ids);
  return p_id;
end;
$$;
revoke all on function public.prepare_gig_followup(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.prepare_gig_followup(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,uuid[]) to service_role;
