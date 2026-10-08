"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardCopy,
  FileText,
  Inbox,
  LayoutDashboard,
  Settings,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/agencies", label: "Agencies", icon: Building2 },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/cv", label: "CV", icon: FileText },
  { href: "/tailor", label: "Tailor CV", icon: WandSparkles },
  { href: "/copy", label: "Quick copy", icon: ClipboardCopy },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav({
  reviewCount,
  orientation = "vertical",
}: {
  reviewCount: number;
  orientation?: "vertical" | "horizontal";
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "flex-row overflow-x-auto")}>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {href === "/inbox" && reviewCount > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
