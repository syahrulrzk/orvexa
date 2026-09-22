"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Workspace",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/rooms", label: "Rooms" },
      { href: "/projects", label: "Projects" },
      { href: "/tasks", label: "Tasks" },
      { href: "/approvals", label: "Approvals" },
    ],
  },
  {
    section: "AI Workforce",
    items: [
      { href: "/teams", label: "Teams" },
      { href: "/agents", label: "Agents" },
      { href: "/skills", label: "Skills" },
      { href: "/knowledge", label: "Knowledge Base" },
      { href: "/activity", label: "Activity" },
    ],
  },
  {
    section: "Company",
    items: [
      { href: "/decisions", label: "Decisions" },
      { href: "/documents", label: "Documents" },
      { href: "/members", label: "Members" },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/providers", label: "AI Providers" },
      { href: "/mcp", label: "MCP Integrations" },
      { href: "/themes", label: "Themes" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-sidebar shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-topbar items-center gap-2 border-b border-line px-4">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-semibold text-brand-fg">
          O
        </span>
        <span className="text-sm font-semibold tracking-wide">ORVEXA</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((group) => (
          <div key={group.section} className="mb-4">
            <p className="px-2 pb-1 text-overline uppercase text-fg-faint">{group.section}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "block rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-canvas-subtle font-medium text-fg"
                          : "text-fg-muted hover:bg-canvas-subtle hover:text-fg",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
