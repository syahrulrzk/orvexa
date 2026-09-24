-- ============================================================
-- 0004 — F5-02: Row Level Security (isolasi per company)
--
-- Strategi *staged rollout* (lihat docs/SECURITY.md §6.3):
--   1. Migrasi ini memasang RLS + policy fail-closed di SEMUA tabel tenant.
--   2. App saat ini konek sebagai superuser `orvexa` (BYPASSRLS) sehingga
--      perilaku runtime tidak berubah — BFF tetap memfilter company_id.
--   3. Aktivasi penuh kapan pun setelah semua path query di-wire:
--        ALTER ROLE orvexa NOSUPERUSER NOBYPASSRLS;
--      Setelah itu setiap statement tanpa `set_config('app.company_id', ...)`
--      akan melihat 0 baris (fail-closed), bukan seluruh data.
--
-- Key untuk GUC: app.company_id — di-set per-request oleh BFF/worker via
-- `set_config('app.company_id', $1, true)` (lokal transaksi).
--
-- Semua policy memakai `current_setting('app.company_id', true)`:
-- `true` = return NULL saat belum diset (bukan error) → policy NULL → 0 baris.
--
-- Tabel TANPA company_id dilindungi lewat join ke parent-nya (agent/room/
-- team/provider/dokumen) sehingga tidak ada jalur kebocoran lewat tabel anak.
-- ============================================================

-- ---------- Tabel ber-kolom company_id (langsung) ----------
-- users, sessions, accounts tidak ber-company_id: dikelola via company_members.
-- companies diproteksi terhadap id-nya sendiri.

do $$
declare
  t text;
  tenant_tables text[] := array[
    'company_members',
    'ai_providers', 'ai_credentials',
    'skills', 'agents',
    'teams',
    'rooms', 'messages',
    'activity_logs', 'notifications',
    'themes',
    'projects',
    'tasks',
    'agent_runs',
    'approvals', 'decisions',
    'documents', 'attachments',
    'knowledge_bases', 'knowledge_documents', 'knowledge_chunks',
    'agent_permissions', 'agent_events', 'agent_memories',
    'ai_usage',
    'mcp_servers'
  ];
begin
  -- companies: cocokkan id
  execute 'alter table public.companies enable row level security';
  execute 'drop policy if exists tenant_isolation on public.companies';
  execute $p$
    create policy tenant_isolation on public.companies
      for all
      using (id = nullif(current_setting('app.company_id', true), ''))
      with check (id = nullif(current_setting('app.company_id', true), ''))
  $p$;

  -- Semua tabel ber-company_id: pola seragam
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$
      create policy tenant_isolation on public.%I
        for all
        using (company_id = nullif(current_setting('app.company_id', true), ''))
        with check (company_id = nullif(current_setting('app.company_id', true), ''))
    $p$, t);
  end loop;
end
$$;

-- ---------- Tabel anak TANPA company_id (join ke parent) ----------

-- ai_models → provider
alter table public.ai_models enable row level security;
drop policy if exists tenant_isolation on public.ai_models;
create policy tenant_isolation on public.ai_models
  for all
  using (exists (select 1 from public.ai_providers p where p.id = provider_id))
  with check (exists (select 1 from public.ai_providers p where p.id = provider_id));

-- team_members → team
alter table public.team_members enable row level security;
drop policy if exists tenant_isolation on public.team_members;
create policy tenant_isolation on public.team_members
  for all
  using (exists (select 1 from public.teams tm where tm.id = team_id))
  with check (exists (select 1 from public.teams tm where tm.id = team_id));

-- room_members → room
alter table public.room_members enable row level security;
drop policy if exists tenant_isolation on public.room_members;
create policy tenant_isolation on public.room_members
  for all
  using (exists (select 1 from public.rooms r where r.id = room_id))
  with check (exists (select 1 from public.rooms r where r.id = room_id));

-- message_threads → room
alter table public.message_threads enable row level security;
drop policy if exists tenant_isolation on public.message_threads;
create policy tenant_isolation on public.message_threads
  for all
  using (exists (select 1 from public.rooms r where r.id = room_id))
  with check (exists (select 1 from public.rooms r where r.id = room_id));

-- message_reactions → message
alter table public.message_reactions enable row level security;
drop policy if exists tenant_isolation on public.message_reactions;
create policy tenant_isolation on public.message_reactions
  for all
  using (exists (select 1 from public.messages m where m.id = message_id))
  with check (exists (select 1 from public.messages m where m.id = message_id));

-- project_members → project
alter table public.project_members enable row level security;
drop policy if exists tenant_isolation on public.project_members;
create policy tenant_isolation on public.project_members
  for all
  using (exists (select 1 from public.projects pj where pj.id = project_id))
  with check (exists (select 1 from public.projects pj where pj.id = project_id));

-- task_dependencies → salah satu sisi task
alter table public.task_dependencies enable row level security;
drop policy if exists tenant_isolation on public.task_dependencies;
create policy tenant_isolation on public.task_dependencies
  for all
  using (
    exists (select 1 from public.tasks t where t.id = task_id)
    or exists (select 1 from public.tasks t where t.id = depends_on_id)
  )
  with check (
    exists (select 1 from public.tasks t where t.id = task_id)
    or exists (select 1 from public.tasks t where t.id = depends_on_id)
  );

-- agent_skills / agent_tools / agent_knowledge / agent_mcp_access → agent
alter table public.agent_skills enable row level security;
drop policy if exists tenant_isolation on public.agent_skills;
create policy tenant_isolation on public.agent_skills
  for all
  using (exists (select 1 from public.agents a where a.id = agent_id))
  with check (exists (select 1 from public.agents a where a.id = agent_id));

alter table public.agent_tools enable row level security;
drop policy if exists tenant_isolation on public.agent_tools;
create policy tenant_isolation on public.agent_tools
  for all
  using (exists (select 1 from public.agents a where a.id = agent_id))
  with check (exists (select 1 from public.agents a where a.id = agent_id));

alter table public.agent_knowledge enable row level security;
drop policy if exists tenant_isolation on public.agent_knowledge;
create policy tenant_isolation on public.agent_knowledge
  for all
  using (exists (select 1 from public.agents a where a.id = agent_id))
  with check (exists (select 1 from public.agents a where a.id = agent_id));

alter table public.agent_mcp_access enable row level security;
drop policy if exists tenant_isolation on public.agent_mcp_access;
create policy tenant_isolation on public.agent_mcp_access
  for all
  using (exists (select 1 from public.agents a where a.id = agent_id))
  with check (exists (select 1 from public.agents a where a.id = agent_id));

-- knowledge_acl → knowledge_documents
alter table public.knowledge_acl enable row level security;
drop policy if exists tenant_isolation on public.knowledge_acl;
create policy tenant_isolation on public.knowledge_acl
  for all
  using (exists (select 1 from public.knowledge_documents d where d.id = document_id))
  with check (exists (select 1 from public.knowledge_documents d where d.id = document_id));

-- mcp_tools → mcp_servers
alter table public.mcp_tools enable row level security;
drop policy if exists tenant_isolation on public.mcp_tools;
create policy tenant_isolation on public.mcp_tools
  for all
  using (exists (select 1 from public.mcp_servers s where s.id = mcp_server_id))
  with check (exists (select 1 from public.mcp_servers s where s.id = mcp_server_id));

-- agent_permissions: scopeType "company" punya company_id; scopeType "agent"
-- punya agent_id. Policy ber-kolom company_id di atas mencakup keduanya karena
-- kolom company_id wajib (not null) untuk kedua scope.

-- ---------- Verifikasi: wajib RLS aktif di semua tabel tenant ----------
do $$
declare
  r record;
  missing text := '';
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.relname
          and col.column_name = 'company_id'
      )
      and not c.relrowsecurity
  loop
    missing := missing || r.table_name || ', ';
  end loop;

  if missing <> '' then
    raise exception 'Tabel ber-company_id tanpa RLS: %', regexp_replace(missing, ', $', '');
  end if;

  raise notice 'RLS OK: semua tabel ber-company_id di schema public sudah enable row level security';
end
$$;
