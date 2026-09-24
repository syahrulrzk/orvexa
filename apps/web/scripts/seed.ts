/**
 * Seed data awal (idempotent).
 * Menjalankan: npm run db:seed
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function loadEnv(): void {
  const root = resolve(import.meta.dirname, "../../..");
  for (const file of [".env", ".env.local"]) {
    const abs = join(root, file);
    if (existsSync(abs)) {
      try {
        process.loadEnvFile(abs);
      } catch {
        // abaikan
      }
    }
  }
}

const THEMES = [
  { key: "corporate_gray", name: "Corporate Gray" },
  { key: "light", name: "Light" },
  { key: "dark", name: "Dark" },
  { key: "midnight", name: "Midnight" },
  { key: "high_contrast", name: "High Contrast" },
];

const SKILLS: { name: string; category: string }[] = [
  { name: "Linux", category: "sysadmin" },
  { name: "Windows Server", category: "sysadmin" },
  { name: "Docker", category: "sysadmin" },
  { name: "Kubernetes", category: "sysadmin" },
  { name: "Backup", category: "sysadmin" },
  { name: "OS Troubleshooting", category: "sysadmin" },
  { name: "Routing", category: "network" },
  { name: "Switching", category: "network" },
  { name: "VLAN Analysis", category: "network" },
  { name: "VPN Troubleshooting", category: "network" },
  { name: "Firewall Analysis", category: "network" },
  { name: "Bandwidth Analysis", category: "network" },
  { name: "Wireless Troubleshooting", category: "network" },
  { name: "MikroTik", category: "network" },
  { name: "Fortigate", category: "network" },
  { name: "UniFi", category: "network" },
  { name: "Wazuh", category: "security" },
  { name: "WAF", category: "security" },
  { name: "IDS/IPS", category: "security" },
  { name: "Hardening", category: "security" },
  { name: "Incident Response", category: "security" },
  { name: "Prometheus", category: "monitoring" },
  { name: "Grafana", category: "monitoring" },
  { name: "SNMP", category: "monitoring" },
  { name: "VictoriaMetrics", category: "monitoring" },
  { name: "Uptime Kuma", category: "monitoring" },
];

type SeedAgent = {
  name: string;
  displayName: string;
  role: string;
  description: string;
  objective: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];
};

const AGENTS: SeedAgent[] = [
  {
    name: "Infra Manager",
    displayName: "Infra Manager",
    role: "Virtual Infrastructure Team Lead",
    description:
      "Agent koordinator tim infrastruktur yang memahami insiden, mendelegasikan kerja, dan melaporkan hasil ke human lead.",
    objective:
      "Koordinasi tim infrastruktur, konsolidasi hasil investigasi, dan eskalasi keputusan ke manusia.",
    systemPrompt: [
      "Kamu adalah **Infra Manager**, lead dari AI Infrastructure Department.",
      "Tugasmu memecah masalah besar menjadi langkah kecil, menentukan agent spesialis mana yang relevan, dan menyusun ringkasan keputusan untuk human lead.",
      "Selalu mulai dengan: (1) ringkasan situasi, (2) hipotesis utama, (3) langkah verifikasi, (4) rekomendasi.",
      "Bila informasi kurang, tuliskan asumsi dan data tambahan yang kamu butuhkan.",
      "Eskalasi ke manusia untuk apa pun yang menyentuh produksi atau berisiko tinggi.",
    ].join("\n"),
    skills: ["Incident Response", "Backup", "Hardening"],
    tools: ["room.post", "task.create", "doc.generate"],
  },
  {
    name: "SysAdmin",
    displayName: "SysAdmin Agent",
    role: "System Administrator",
    description:
      "Agent spesialis operasi sistem: Linux, Windows Server, Docker, Kubernetes, VM, storage, dan backup.",
    objective: "Menjaga kesehatan dan ketersediaan sistem serta layanan.",
    systemPrompt: [
      "Kamu adalah **SysAdmin Agent** untuk Linux/Windows Server, Docker, dan Kubernetes.",
      "Selalu sertakan perintah konkret (systemctl/journalctl/df/free/top/docker/kubectl) beserta cara membaca outputnya.",
      "Urutkan diagnosis dari yang paling murah: cek resource → cek log → cek konfigurasi → cek dependensi.",
      "Untuk perubahan yang berdampak ke produksi, tampilkan perintahnya dan minta approval.",
    ].join("\n"),
    skills: ["Linux", "Windows Server", "Docker", "Kubernetes", "Backup", "OS Troubleshooting"],
    tools: ["room.post", "task.create", "doc.generate"],
  },
  {
    name: "Network",
    displayName: "Network Agent",
    role: "Network Infrastructure Engineer",
    description:
      "Agent spesialis analisis, desain, monitoring, dan troubleshooting jaringan.",
    objective: "Menjaga operasi jaringan yang andal, aman, dan teroptimasi.",
    systemPrompt: [
      "Kamu adalah **Network Agent** untuk routing, switching, VLAN, VPN, firewall, dan wireless.",
      "Gunakan kerangka: lapisan OSI → perangkat terdampak → perintah verifikasi (show/ping/traceroute/tcpdump) → kandidat akar masalah.",
      "Sertakan contoh perintah untuk MikroTik, Fortigate, atau UniFi bila relevan.",
      "Selalu tanyakan/identifikasi topologi sebelum menyarankan perubahan konfigurasi.",
    ].join("\n"),
    skills: [
      "Routing",
      "Switching",
      "VLAN Analysis",
      "VPN Troubleshooting",
      "Firewall Analysis",
      "Bandwidth Analysis",
      "Wireless Troubleshooting",
      "MikroTik",
      "Fortigate",
      "UniFi",
    ],
    tools: ["room.post", "task.create", "doc.generate"],
  },
  {
    name: "Security",
    displayName: "Security Agent",
    role: "Security Engineer",
    description:
      "Agent spesialis keamanan: Wazuh, WAF, firewall, IDS/IPS, hardening, dan incident response.",
    objective: "Melindungi infrastruktur dan menangani insiden keamanan.",
    systemPrompt: [
      "Kamu adalah **Security Agent** untuk deteksi, analisis, dan respons insiden keamanan.",
      "Setiap temuan harus punya: severity, bukti (log/alert), dampak, dan langkah mitigasi.",
      "Jangan pernah menyuruh melakukan penghapusan log atau perubahan forensik tanpa prosedur chain-of-custody.",
      "Untuk tindakan seperti blokir IP atau isolasi host, ajukan approval terlebih dahulu.",
    ].join("\n"),
    skills: ["Wazuh", "WAF", "IDS/IPS", "Hardening", "Incident Response", "Firewall Analysis"],
    tools: ["room.post", "task.create", "doc.generate"],
  },
  {
    name: "NOC",
    displayName: "NOC / Monitoring Agent",
    role: "Monitoring & NOC Engineer",
    description:
      "Agent pemantau: Prometheus, Grafana, SNMP, Node Exporter, VictoriaMetrics, dan analisis anomali.",
    objective: "Deteksi dini anomali dan alert infrastruktur.",
    systemPrompt: [
      "Kamu adalah **NOC / Monitoring Agent** yang memantau metrik dan alert.",
      "Selalu kaitkan gejala dengan metrik konkret (CPU, memory, disk I/O, latency, packet loss, error rate) dan sebutkan query PromQL yang relevan.",
      "Bedakan dengan tegas antara *symptom* dan *root cause*.",
      "Bila anomali mengarah pada insiden, tandai sebagai prioritas dan sebutkan agent mana yang perlu dilibatkan.",
    ].join("\n"),
    skills: ["Prometheus", "Grafana", "SNMP", "VictoriaMetrics", "Uptime Kuma", "Bandwidth Analysis"],
    tools: ["room.post", "task.create", "doc.generate"],
  },
];

/** Provider yang dibootstrap dari environment (kalau API key tersedia). */
const PROVIDERS: {
  kind: string;
  label: string;
  envKey: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  defaultModel: string;
}[] = [
  { kind: "openai", label: "OpenAI", envKey: "OPENAI_API_KEY", defaultModel: "gpt-4o-mini" },
  {
    kind: "anthropic",
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-3-5-sonnet-latest",
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-1.5-flash",
  },
  {
    kind: "openai_compatible",
    label: "OpenAI-compatible",
    envKey: "OPENAI_COMPATIBLE_API_KEY",
    baseUrlEnv: "OPENAI_COMPATIBLE_BASE_URL",
    defaultModel: "gpt-4o-mini",
  },
  {
    kind: "local",
    label: "LLM Lokal",
    envKey: "LOCAL_LLM_API_KEY",
    baseUrlEnv: "LOCAL_LLM_BASE_URL",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
  },
];

async function main(): Promise<void> {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL belum diset. Copy .env.example ke .env dulu.");
    process.exit(1);
  }

  // Dynamic import setelah env di-load.
  const { db, pgClient } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { hashPassword } = await import("../src/lib/password");
  const { newId } = await import("../src/lib/ids");
  const { defaultEffect } = await import("../src/lib/permissions");
  const { and, eq } = await import("drizzle-orm");

  // --- Themes (builtin) ---
  for (const t of THEMES) {
    const existing = await db
      .select()
      .from(schema.themes)
      .where(eq(schema.themes.key, t.key))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(schema.themes).values({
        id: newId("thm"),
        key: t.key,
        name: t.name,
        tokens: {},
        isBuiltin: true,
      });
    }
  }
  console.log(`✓ themes: ${THEMES.length}`);

  // --- Skills (builtin) ---
  for (const s of SKILLS) {
    const existing = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.name, s.name))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(schema.skills).values({
        id: newId("skl"),
        name: s.name,
        category: s.category,
        isBuiltin: true,
      });
    }
  }
  console.log(`✓ skills: ${SKILLS.length}`);

  // --- Demo company ---
  const companySlug = "nusantara";
  let [company] = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.slug, companySlug))
    .limit(1);

  if (!company) {
    const [inserted] = await db
      .insert(schema.companies)
      .values({
        id: newId("cmp"),
        name: "Nusantara Corp",
        slug: companySlug,
        defaultTheme: "corporate_gray",
      })
      .returning();
    company = inserted;
  }
  console.log(`✓ company: ${company.slug}`);

  // --- Demo user (owner) ---
  const email = "lead@orvexa.dev";
  const password = "orvexa12345";
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  if (!user) {
    const [inserted] = await db
      .insert(schema.users)
      .values({
        id: newId("usr"),
        email,
        displayName: "IT Lead",
        passwordHash: await hashPassword(password),
      })
      .returning();
    user = inserted;
  }
  console.log(`✓ user: ${user.email} (password: ${password})`);

  // --- Membership ---
  const membership = await db
    .select()
    .from(schema.companyMembers)
    .where(eq(schema.companyMembers.userId, user.id))
    .limit(1);

  if (membership.length === 0) {
    await db.insert(schema.companyMembers).values({
      id: newId("cm"),
      companyId: company.id,
      userId: user.id,
      role: "owner",
    });
  }

  // --- Provider bootstrap (Fase 3) ---
  // Agent butuh provider + kredensial supaya bisa benar-benar menjawab.
  // Kredensial dari env dienkripsi AES-256-GCM ke tabel ai_credentials.
  const { encryptSecret, hasMasterKey, last4 } = await import("../src/lib/crypto");

  let activeProviderId: string | null = null;
  let activeCredentialId: string | null = null;
  let activeModelId: string | null = null;

  if (hasMasterKey()) {
    for (const p of PROVIDERS) {
      const apiKey = process.env[p.envKey]?.trim();
      if (!apiKey) continue;

      const baseUrl =
        (p.baseUrlEnv ? process.env[p.baseUrlEnv]?.trim() : undefined) ?? p.defaultBaseUrl ?? null;

      let [provider] = await db
        .select()
        .from(schema.aiProviders)
        .where(
          and(eq(schema.aiProviders.companyId, company.id), eq(schema.aiProviders.kind, p.kind as never)),
        )
        .limit(1);

      if (!provider) {
        const [inserted] = await db
          .insert(schema.aiProviders)
          .values({
            id: newId("prv"),
            companyId: company.id,
            kind: p.kind as never,
            label: p.label,
            baseUrl,
            config: { default_model: p.defaultModel },
          })
          .returning();
        provider = inserted;
      }

      const [credential] = await db
        .select()
        .from(schema.aiCredentials)
        .where(
          and(
            eq(schema.aiCredentials.companyId, company.id),
            eq(schema.aiCredentials.providerId, provider.id),
            eq(schema.aiCredentials.label, p.label),
          ),
        )
        .limit(1);

      let credentialId = credential?.id ?? null;
      if (!credential) {
        const encrypted = encryptSecret(apiKey);
        const [inserted] = await db
          .insert(schema.aiCredentials)
          .values({
            id: newId("crd"),
            companyId: company.id,
            providerId: provider.id,
            label: p.label,
            secretCipher: encrypted.cipher,
            secretIv: encrypted.iv,
            keyVersion: encrypted.keyVersion,
            last4: last4(apiKey),
          })
          .returning();
        credentialId = inserted.id;
      }

      // Model default + harga kosong (diisi admin lewat UI nanti).
      let [model] = await db
        .select()
        .from(schema.aiModels)
        .where(
          and(eq(schema.aiModels.providerId, provider.id), eq(schema.aiModels.modelKey, p.defaultModel)),
        )
        .limit(1);

      if (!model) {
        const [inserted] = await db
          .insert(schema.aiModels)
          .values({
            id: newId("mdl"),
            providerId: provider.id,
            modelKey: p.defaultModel,
            displayName: p.defaultModel,
            capabilities: ["chat"],
            isDefault: true,
          })
          .returning();
        model = inserted;
      }

      if (!activeProviderId) {
        activeProviderId = provider.id;
        activeCredentialId = credentialId;
        activeModelId = model.id;
        console.log(`✓ provider aktif: ${p.label} (${p.defaultModel})`);
      }
    }

    if (!activeProviderId) {
      console.log(
        "⚠ tidak ada API key provider di env — agent akan dibuat tanpa provider. " +
          "Isi OPENAI_API_KEY/ANTHROPIC_API_KEY/GEMINI_API_KEY lalu jalankan seed ulang.",
      );
    }
  } else {
    console.log("⚠ ORVEXA_MASTER_KEY belum diset — bootstrap provider dilewati.");
  }

  // --- Builtin agents (Fase 3: prompt + skill + tool) ---
  const agentIdByName = new Map<string, string>();

  for (const a of AGENTS) {
    const [existing] = await db
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.companyId, company.id), eq(schema.agents.name, a.name)))
      .limit(1);

    const values = {
      companyId: company.id,
      name: a.name,
      displayName: a.displayName,
      role: a.role,
      description: a.description,
      objective: a.objective,
      systemPrompt: a.systemPrompt,
      isBuiltin: true,
      updatedAt: new Date(),
      ...(activeProviderId
        ? {
            providerId: activeProviderId,
            credentialId: activeCredentialId,
            modelId: activeModelId,
          }
        : {}),
    };

    if (existing) {
      await db.update(schema.agents).set(values).where(eq(schema.agents.id, existing.id));
      agentIdByName.set(a.name, existing.id);
    } else {
      const [inserted] = await db
        .insert(schema.agents)
        .values({ id: newId("agt"), ...values })
        .returning({ id: schema.agents.id });
      agentIdByName.set(a.name, inserted.id);
    }
  }
  console.log(`✓ agents: ${AGENTS.length} (prompt + provider)`);

  // --- Assign skills & tools ke agent ---
  const skillRows = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills);
  const skillIdByName = new Map(skillRows.map((s) => [s.name, s.id]));

  let skillLinks = 0;
  let toolLinks = 0;

  for (const a of AGENTS) {
    const agentId = agentIdByName.get(a.name);
    if (!agentId) continue;

    for (const skillName of a.skills) {
      const skillId = skillIdByName.get(skillName);
      if (!skillId) continue;
      await db
        .insert(schema.agentSkills)
        .values({ agentId, skillId })
        .onConflictDoNothing();
      skillLinks += 1;
    }

    for (const toolKey of a.tools) {
      await db
        .insert(schema.agentTools)
        .values({ id: newId("atl"), agentId, toolKey, isEnabled: true })
        .onConflictDoNothing();
      toolLinks += 1;

      // F5-01: baris permission eksplisit per tool agar matrix terlihat &
      // bisa dioverride dari UI. Efek mengikuti matrix default (TOOL_DEFAULTS)
      // — tool sensitif dapat "approval_required", bukan "allow".
      await db
        .insert(schema.agentPermissions)
        .values({
          id: newId("apm"),
          companyId: company.id,
          agentId,
          scopeType: "agent",
          permission: toolKey,
          effect: defaultEffect(toolKey),
          conditions: {},
        })
        .onConflictDoNothing();
    }
  }
  console.log(`✓ agent skills: ${skillLinks} · agent tools: ${toolLinks}`);

  console.log("\nSeed selesai. Login dengan lead@orvexa.dev / orvexa12345");

  await pgClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed gagal:", err);
  process.exit(1);
});
