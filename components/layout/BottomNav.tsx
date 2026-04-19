"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, User, Users } from "lucide-react";

const links = [
  { href: "/",          label: "Home",    icon: Home },
  { href: "/leagues",   label: "Leagues", icon: Users },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/profile",   label: "Profile", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-[rgba(214,235,253,0.19)] safe-bottom">
      <div className="mx-auto max-w-md flex items-center justify-around h-16">
        {links.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-4 py-2 min-w-[44px] min-h-[44px] justify-center rounded-xl transition-colors ${
                isActive
                  ? "text-[#11ff99]"
                  : "text-[#a1a4a5] hover:text-[#f0f0f0]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.5}
                className="shrink-0"
              />
              <span className="text-[10px] font-medium tracking-wider uppercase">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
