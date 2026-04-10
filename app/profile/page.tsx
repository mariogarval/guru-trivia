"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Trophy,
  Target,
  Flame,
  Globe,
  LogOut,
  ChevronRight,
  Star,
  X,
  Check,
} from "lucide-react";
import Link from "next/link";
import BottomNav from "@/components/layout/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import type { Profile, Language } from "@/types";

interface ProfileStats {
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  globalRank: number | null;
  countryRank: number | null;
}

interface Badge {
  id: string;
  label: string;
  icon: string;
  earned: boolean;
  description: string;
}

const BADGES: Badge[] = [
  { id: "first_game", label: "First Match", icon: "⚽", earned: false, description: "Complete your first game" },
  { id: "streak_5", label: "On Fire", icon: "🔥", earned: false, description: "Get 5 correct in a row" },
  { id: "perfect_10", label: "Perfect 10", icon: "💯", earned: false, description: "Score 10/10 in a set" },
  { id: "speed_demon", label: "Speed Demon", icon: "⚡", earned: false, description: "Answer 5 questions in under 4 seconds" },
  { id: "centurion", label: "Centurion", icon: "💫", earned: false, description: "Answer 100 questions" },
  { id: "world_class", label: "World Class", icon: "🌟", earned: false, description: "Reach top 100 globally" },
];

const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
];

const COUNTRIES = [
  "Argentina", "Australia", "Belgium", "Brazil", "Canada", "Colombia",
  "Ecuador", "England", "France", "Germany", "Guatemala", "Japan",
  "Mexico", "Morocco", "Netherlands", "Portugal", "Senegal",
  "South Korea", "Spain", "Uruguay", "USA",
];

const COUNTRY_FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Australia: "🇦🇺", Belgium: "🇧🇪", Brazil: "🇧🇷",
  Canada: "🇨🇦", Colombia: "🇨🇴", Ecuador: "🇪🇨", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  France: "🇫🇷", Germany: "🇩🇪", Guatemala: "🇬🇹", Japan: "🇯🇵",
  Mexico: "🇲🇽", Morocco: "🇲🇦", Netherlands: "🇳🇱", Portugal: "🇵🇹",
  Senegal: "🇸🇳", "South Korea": "🇰🇷", Spain: "🇪🇸", Uruguay: "🇺🇾", USA: "🇺🇸",
};

export default function ProfilePage() {
  const { signOut, avatarUrl } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showModal, setShowModal] = useState<"language" | "country" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => {
        if (r.status === 401) {
          setIsLoggedIn(false);
          return null;
        }
        setIsLoggedIn(true);
        return r.json();
      })
      .then((data) => {
        if (data) {
          setProfile(data.profile);
          setStats(data.stats);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateProfile = async (field: string, value: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok && profile) {
        setProfile({ ...profile, [field]: value } as Profile);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
      setShowModal(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#11ff99]/20 border-t-[#11ff99] rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!isLoggedIn) {
    return (
      <div className="flex-1 flex flex-col pb-20">
        <div className="px-4 pt-8">
          <h1 className="text-2xl font-black text-[#f0f0f0] mb-2 tracking-tight">Profile</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-white/[0.03] border border-[rgba(214,235,253,0.19)] flex items-center justify-center mb-5">
            <User size={36} className="text-[#464a4d]" />
          </div>
          <h2 className="text-xl font-bold text-[#f0f0f0] mb-2">
            Join the Competition
          </h2>
          <p className="text-[#a1a4a5] text-sm mb-8 max-w-xs leading-relaxed">
            Sign in to save your progress, climb the leaderboard, and compete
            with friends worldwide.
          </p>
          <Link
            href="/auth/login"
            className="bg-[#11ff99] text-black font-bold py-4 px-8 rounded-full w-full max-w-xs text-center active:scale-[0.98] transition-transform"
          >
            Sign In with Google
          </Link>
          <p className="text-xs text-[#464a4d] mt-4">
            Free forever. No spam.
          </p>
        </div>
        <BottomNav />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Points",
      value: profile?.total_points?.toLocaleString() ?? "0",
      icon: Trophy,
      color: "text-[#ffc53d]",
    },
    {
      label: "Questions",
      value: stats?.totalAnswered?.toLocaleString() ?? "0",
      icon: Target,
      color: "text-[#11ff99]",
    },
    {
      label: "Accuracy",
      value: `${stats?.accuracy ?? 0}%`,
      icon: Flame,
      color: "text-[#ff801f]",
    },
    {
      label: "Global Rank",
      value: stats?.globalRank ? `#${stats.globalRank.toLocaleString()}` : "—",
      icon: Globe,
      color: "text-[#3b9eff]",
    },
  ];

  return (
    <div className="flex-1 flex flex-col pb-20">
      <div className="px-4 pt-8">
        <h1 className="text-2xl font-black text-[#f0f0f0] mb-6 tracking-tight">Profile</h1>

        {/* Avatar & name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-6"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-16 h-16 rounded-full object-cover border border-[rgba(214,235,253,0.19)]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#11ff99] to-[#0075ff] flex items-center justify-center text-2xl font-black text-black">
              {profile?.username?.[0]?.toUpperCase() ?? "G"}
            </div>
          )}
          <div>
            <p className="text-xl font-bold text-[#f0f0f0]">
              {profile?.username ?? "Guest Guru"}
            </p>
            {profile?.country && (
              <p className="text-sm text-[#a1a4a5]">{profile.country}</p>
            )}
            {stats?.countryRank && (
              <p className="text-xs text-[#11ff99]">
                #{stats.countryRank} in {profile?.country}
              </p>
            )}
          </div>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-4"
            >
              <stat.icon size={18} className={`mb-2 ${stat.color}`} />
              <p className="text-xl font-bold text-[#f0f0f0]">{stat.value}</p>
              <p className="text-[11px] text-[#464a4d] uppercase tracking-wider">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Badges */}
        <div className="mb-6">
          <h2 className="font-semibold text-[#f0f0f0] mb-3 flex items-center gap-2">
            <Star size={18} className="text-[#ffc53d]" />
            Badges
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {BADGES.map((badge) => (
              <div
                key={badge.id}
                title={badge.description}
                className={`bg-white/[0.03] border rounded-2xl p-3 text-center transition-all ${
                  badge.earned
                    ? "border-[#ffc53d]/40"
                    : "border-[rgba(214,235,253,0.10)] opacity-40"
                }`}
              >
                <div className="text-2xl mb-1">{badge.icon}</div>
                <p className="text-[10px] font-semibold text-[#a1a4a5] leading-tight">
                  {badge.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-2">
          <h2 className="font-semibold text-[#f0f0f0] mb-2">Settings</h2>
          <button
            onClick={() => setShowModal("language")}
            className="w-full flex items-center justify-between bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3 hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-sm text-[#f0f0f0]">Language</span>
            <div className="flex items-center gap-2 text-[#a1a4a5] text-sm">
              {LANGUAGES.find((l) => l.code === (profile?.preferred_language ?? "en"))?.label ?? "English"}
              <ChevronRight size={16} className="text-[#464a4d]" />
            </div>
          </button>
          <button
            onClick={() => setShowModal("country")}
            className="w-full flex items-center justify-between bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-xl px-4 py-3 hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-sm text-[#f0f0f0]">Country</span>
            <div className="flex items-center gap-2 text-[#a1a4a5] text-sm">
              {profile?.country ? `${COUNTRY_FLAGS[profile.country] ?? "🌍"} ${profile.country}` : "Not set"}
              <ChevronRight size={16} className="text-[#464a4d]" />
            </div>
          </button>

          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 bg-[#ff2047]/5 border border-[#ff2047]/15 rounded-xl px-4 py-3 text-[#ff2047] mt-4 hover:bg-[#ff2047]/10 transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Language / Country modal */}
      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end"
            onClick={() => setShowModal(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md mx-auto bg-black border-t border-[rgba(214,235,253,0.19)] rounded-t-3xl p-6 pb-24 max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#f0f0f0]">
                  {showModal === "language" ? "Select Language" : "Select Country"}
                </h3>
                <button
                  onClick={() => setShowModal(null)}
                  className="p-1 text-[#464a4d] hover:text-[#f0f0f0] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-1 overflow-y-auto flex-1 -mx-2 px-2">
                {showModal === "language"
                  ? LANGUAGES.map((lang) => {
                      const isActive = (profile?.preferred_language ?? "en") === lang.code;
                      return (
                        <button
                          key={lang.code}
                          disabled={saving}
                          onClick={() => updateProfile("preferred_language", lang.code)}
                          className={`w-full flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors ${
                            isActive
                              ? "bg-[#11ff99]/5 border border-[#11ff99]/25"
                              : "hover:bg-white/[0.04] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{lang.flag}</span>
                            <span className={`text-sm font-medium ${isActive ? "text-[#11ff99]" : "text-[#f0f0f0]"}`}>
                              {lang.label}
                            </span>
                          </div>
                          {isActive && <Check size={18} className="text-[#11ff99]" />}
                        </button>
                      );
                    })
                  : COUNTRIES.map((country) => {
                      const isActive = profile?.country === country;
                      return (
                        <button
                          key={country}
                          disabled={saving}
                          onClick={() => updateProfile("country", country)}
                          className={`w-full flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors ${
                            isActive
                              ? "bg-[#11ff99]/5 border border-[#11ff99]/25"
                              : "hover:bg-white/[0.04] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{COUNTRY_FLAGS[country] ?? "🌍"}</span>
                            <span className={`text-sm font-medium ${isActive ? "text-[#11ff99]" : "text-[#f0f0f0]"}`}>
                              {country}
                            </span>
                          </div>
                          {isActive && <Check size={18} className="text-[#11ff99]" />}
                        </button>
                      );
                    })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
