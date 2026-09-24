-- ============================================================
-- 0005 — F5-05: Audit log append-only
--
-- activity_logs adalah audit trail: baris tidak boleh diubah/dihapus
-- dari aplikasi. Trigger mencegah UPDATE & DELETE pada table ini.
--
-- Kebijakan retensi (export lalu truncate oleh admin DB) di luar scope
-- aplikasi; lihat SECURITY.md §8.
--
-- Redaksi secret dilakukan di level aplikasi (lib/redact.ts, dipanggil
-- logActivity) — trigger ini murni menjaga immutability.
-- ============================================================

create or replace function public.forbid_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'activity_logs bersifat append-only: % tidak diizinkan (id=%)',
    TG_OP, coalesce(OLD.id, 'n/a')
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists activity_logs_no_update on public.activity_logs;
create trigger activity_logs_no_update
  before update on public.activity_logs
  for each row execute function public.forbid_audit_mutation();

drop trigger if exists activity_logs_no_delete on public.activity_logs;
create trigger activity_logs_no_delete
  before delete on public.activity_logs
  for each row execute function public.forbid_audit_mutation();

-- ---------- Verifikasi ----------
do $$
declare
  n int;
begin
  select count(*) into n
  from information_schema.triggers
  where event_object_schema = 'public'
    and event_object_table = 'activity_logs'
    and trigger_name in ('activity_logs_no_update', 'activity_logs_no_delete');

  if n < 2 then
    raise exception 'Trigger append-only activity_logs tidak lengkap (ditemukan %)', n;
  end if;

  raise notice 'audit append-only OK: UPDATE & DELETE pada activity_logs diblokir';
end
$$;
