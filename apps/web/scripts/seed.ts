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

const AGENTS = [
  {
    name: "Infra Manager",
    displayName: "Infra Manager",
    role: "Virtual Infrastructure Team Lead",
    description:
      "Agent koordinator tim infrastruktur yang memahami insiden, mendelegasikan kerja, dan melaporkan hasil ke human lead.",
    objective:
      "Koordinasi tim infrastruktur, konsolidasi hasil investigasi, dan eskalasi keputusan ke manusia.",
  },
  {
    name: "SysAdmin",
    displayName: "SysAdmin Agent",
    role: "System Administrator",
    description:
      "Agent spesialis operasi sistem: Linux, Windows Server, Docker, Kubernetes, VM, storage, dan backup.",
    objective: "Menjaga kesehatan dan ketersediaan sistem serta layanan.",
  },
  {
    name: "Network",
    displayName: "Network Agent",
    role: "Network Infrastructure Engineer",
    description:
      "Agent spesialis analisis, desain, monitoring, dan troubleshooting jaringan.",
    objective: "Menjaga operasi jaringan yang andal, aman, dan teroptimasi.",
  },
  {
    name: "Security",
    displayName: "Security Agent",
    role: "Security Engineer",
    description:
      "Agent spesialis keamanan: Wazuh, WAF, firewall, IDS/IPS, hardening, dan incident response.",
    objective: "Melindungi infrastruktur dan menangani insiden keamanan.",
  },
  {
    name: "NOC",
    displayName: "NOC / Monitoring Agent",
    role: "Monitoring & NOC Engineer",
    description:
      "Agent pemantau: Prometheus, Grafana, SNMP, Node Exporter, VictoriaMetrics, dan analisis anomali.",
    objective: "Deteksi dini anomali dan alert infrastruktur.",
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
  const { eq } = await import("drizzle-orm");

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

  // --- Builtin agents ---
  for (const a of AGENTS) {
    const existing = await db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.name, a.name))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(schema.agents).values({
      id: newId("agt"),
      companyId: company.id,
      name: a.name,
      displayName: a.displayName,
      role: a.role,
      description: a.description,
      objective: a.objective,
      isBuiltin: true,
    });
  }
  console.log(`✓ agents: ${AGENTS.length}`);

  console.log("\nSeed selesai. Login dengan lead@orvexa.dev / orvexa12345");

  await pgClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed gagal:", err);
  process.exit(1);
});
