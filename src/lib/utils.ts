import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSats(sats: number | bigint): string {
  const n = Number(sats);
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)} BTC`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M sats`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K sats`;
  return `${n} sats`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getReputationTier(score: number): {
  label: string;
  color: string;
} {
  if (score >= 800) return { label: "Verified Elite", color: "text-amber-400" };
  if (score >= 600) return { label: "Trusted", color: "text-green-400" };
  if (score >= 400) return { label: "Standard", color: "text-gray-400" };
  if (score >= 200) return { label: "Probationary", color: "text-orange-400" };
  return { label: "Flagged", color: "text-red-400" };
}
