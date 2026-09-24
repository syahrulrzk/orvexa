"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FolderKanban,
  CheckSquare,
  ShieldCheck,
  Users,
  Bot,
  Zap,
  Database,
  Activity,
  FileText,
  FileCheck,
  UserPlus,
  Cpu,
  DollarSign,
  Plug,
  Settings,
  Building2,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ready?: boolean;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Workspace",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        ready: true,
      },
      {
        href: "/rooms",
        label: "Rooms",
        icon: MessageSquare,
        ready: true,
      },
      {
        href: "/projects",
        label: "Projects",
        icon: FolderKanban,
        ready: true,
      },
      {
        href: "/tasks",
        label: "Tasks",
        icon: CheckSquare,
        ready: true,
      },
      {
        href: "/approvals",
        label: "Approvals",
        icon: ShieldCheck,
        ready: true,
      },
    ],
  },
  {
    section: "AI Workforce",
    items: [
      {
        href: "/teams",
        label: "Teams",
        icon: Users,
        ready: true,
      },
      {
        href: "/agents",
        label: "Agents",
        icon: Bot,
        ready: true,
      },
      {
        href: "/skills",
        label: "Skills",
        icon: Zap,
        ready: true,
      },
      {
        href: "/knowledge",
        label: "Knowledge",
        icon: Database,
        ready: true,
      },
      {
        href: "/activity",
        label: "Activity",
        icon: Activity,
        ready: true,
      },
      {
        href: "/virtual-office",
        label: "Virtual Office",
        icon: Building2,
        ready: true,
      },
    ],
  },
  {
    section: "Company",
    items: [
      {
        href: "/decisions",
        label: "Decisions",
        icon: FileCheck,
        ready: true,
      },
      {
        href: "/documents",
        label: "Documents",
        icon: FileText,
        ready: true,
      },
      {
        href: "/members",
        label: "Members",
        icon: UserPlus,
        ready: true,
      },
    ],
  },
  {
    section: "System",
    items: [
      {
        href: "/providers",
        label: "AI Providers",
        icon: Cpu,
        ready: true,
      },
      {
        href: "/costs",
        label: "AI Costs",
        icon: DollarSign,
        ready: true,
      },
      {
        href: "/mcp",
        label: "MCP",
        icon: Plug,
        ready: true,
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        ready: true,
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-sidebar shrink-0 flex-col border-r border-line bg-surface">
      {/* Brand */}
      <div className="flex h-topbar items-center gap-2 border-b border-line px-4">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-semibold text-brand-fg">
          O
        </span>

        <span className="text-sm font-semibold tracking-wide">
          ORVEXA
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pt-1 pb-3">
        {NAV.map((group) => (
          <div
            key={group.section}
            className="relative mb-3"
          >
            {/* Section title */}
            <p className="px-2 pb-1 text-overline uppercase text-fg-faint">
              {group.section}
            </p>

            {/* Tree navigation */}
            <div className="relative">
              {/* Main vertical line */}
              <div
                className="
                  absolute
                  left-2
                  top-0
                  bottom-4
                  w-px
                  bg-fg-faint/40
                "
                aria-hidden="true"
              />

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <li
                      key={item.href}
                      className="relative"
                    >
                      {/* Horizontal connector */}
                      <div
                        className="
                          absolute
                          left-2
                          top-1/2
                          h-px
                          w-4
                          -translate-y-1/2
                          bg-fg-faint/40
                        "
                        aria-hidden="true"
                      />

                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "relative z-10 ml-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-canvas-subtle font-medium text-fg"
                            : "text-fg-muted hover:bg-canvas-subtle hover:text-fg",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4 shrink-0" />

                        <span className="flex-1 truncate">
                          {item.label}
                        </span>

                        {item.ready && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                            aria-label="Ready"
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}