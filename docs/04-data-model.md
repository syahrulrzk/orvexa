# Model data dan akses

Ini model logis awal, belum DDL final. Gunakan UUID sebagai identifier, waktu UTC, dan timezone pengguna saat rendering. Nilai uang memakai decimal dengan currency, tidak memakai floating point JavaScript untuk akumulasi finansial.

## Entitas MVP

| Entitas | Field/relasi utama |
|---|---|
| users | id, email, display_name; detail identity/session mengikuti library auth |
| workspaces | id, name, slug, timezone |
| memberships | workspace_id, user_id, role, status; unik per pasangan |
| invitations | workspace_id, email, role, token_hash, expires_at, accepted_at |
| projects | id, workspace_id, name, status, owner_id, archived_at |
| tasks | id, workspace_id, project_id, title, description, status, priority, due_at, assigned_agent_id, created_by |
| provider_connections | id, workspace_id, provider, credential_ciphertext, key_version, status |
| agents | id, workspace_id, name, instructions, provider_connection_id, model, tool_policy, limits, version, archived_at |
| agent_runs | id, workspace_id, task_id, agent_id, status, config_snapshot, graph_version, thread_id, limits, cancel_requested_at, started_at, finished_at, error_code |
| run_events | id, workspace_id, run_id, sequence, type, safe_payload, created_at |
| tool_executions | id, workspace_id, run_id, action_key, tool_version, input_hash, status, external_reference, safe_result |
| approvals | id, workspace_id, run_id, action_key, action_hash, status, expires_at, decided_by, decided_at, reason |
| model_usage | id, workspace_id, run_id, provider_request_id, model, input_tokens, output_tokens, other_usage, cost, currency, price_snapshot, cost_status |
| audit_logs | id, workspace_id, actor_type, actor_id, action, resource_type, resource_id, safe_metadata, created_at |
| outbox_events | id, workspace_id, aggregate_id, event_type, payload, published_at, attempts |

Session/auth tables dan tabel checkpoint LangGraph dikelola sesuai library yang dipilih. Tetap dokumentasikan migrasi, backup, dan aturan aksesnya. Checkpoint dapat mengandung data sensitif sehingga tidak dapat diakses langsung oleh browser.

## Status domain

- Project: `planning`, `active`, `on_hold`, `completed`, `archived`.
- Task: `todo`, `in_progress`, `on_hold`, `completed`, `cancelled`.
- Run: `queued`, `running`, `waiting_approval`, `succeeded`, `failed`, `cancelled`, `expired`.
- Approval: `pending`, `approved`, `rejected`, `expired`, `invalidated`.

Task tidak otomatis menjadi completed hanya karena run berhasil; kebijakan MVP meminta pengguna menandai selesai setelah meninjau hasil. Run yang menunggu approval tidak dihitung sebagai running.

## Isolasi dan constraint

- Tabel tenant memiliki `workspace_id NOT NULL`. Query server selalu memakai workspace yang membership-nya sudah diverifikasi.
- Foreign key antartabel tenant harus menjaga kesamaan workspace, misalnya referensi `(workspace_id, project_id)` ke project dengan unique constraint yang sesuai.
- Identifier dari client bukan bukti kepemilikan. Verifikasi izin untuk membaca run, stream SSE, approval, dan hasil tool.
- Pertimbangkan RLS sebagai defense tambahan. Jika dipakai dengan connection pool, gunakan konteks tenant per transaksi dan role aplikasi yang tidak mem-bypass RLS. Uji kebocoran konteks antarkoneksi.
- Unique `(run_id, sequence)` untuk event; unique `(run_id, action_key)` untuk tindakan logis; idempotency request di-scope oleh workspace, aktor, dan operasi.
- Satu run aktif per task pada MVP, ditegakkan secara atomik, termasuk status waiting_approval.
- Index utama: `(workspace_id, status, created_at)`, `(workspace_id, project_id)`, dan `(run_id, sequence)` sesuai kebutuhan query.
- Tolak penghapusan owner terakhir. Arsipkan konfigurasi yang sudah direferensikan run; hindari cascade yang menghapus audit/history tanpa kebijakan eksplisit.

## Data sensitif

API tidak pernah mengembalikan credential plaintext atau ciphertext. Kunci enkripsi terpisah dari database dan memiliki versi untuk rotasi. Log, event, dan error melalui redaction. Simpan payload/output hanya sesuai kebutuhan dan kebijakan retensi; masa retensi final masih terbuka.

Entitas tambahan MVP autonomous: divisions, agent_assignments, objectives, conversations/messages, delegations, autonomy_policies, triggers, dan budget_reservations. Tasks/runs memiliki relasi parent/root; lihat [model tambahan](09-autonomous-company.md).

Entitas tahap berikutnya: teams lanjutan, skills, documents, knowledge_sources, chunks/embeddings, decisions, mcp_connections.
