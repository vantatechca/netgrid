import {
  Activity,
  CircleAlert,
  CircleCheck,
  CircleX,
  FileText,
  Globe,
  Mail,
  PauseCircle,
  PlayCircle,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";

type Tone = "blue" | "green" | "red" | "amber" | "purple" | "indigo" | "gray";

const TONE: Record<Tone, { iconBg: string; iconColor: string }> = {
  blue: { iconBg: "bg-blue-100", iconColor: "text-blue-700" },
  green: { iconBg: "bg-green-100", iconColor: "text-green-700" },
  red: { iconBg: "bg-red-100", iconColor: "text-red-700" },
  amber: { iconBg: "bg-amber-100", iconColor: "text-amber-700" },
  purple: { iconBg: "bg-purple-100", iconColor: "text-purple-700" },
  indigo: { iconBg: "bg-indigo-100", iconColor: "text-indigo-700" },
  gray: { iconBg: "bg-muted", iconColor: "text-muted-foreground" },
};

export interface ActionMeta {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
}

export function actionMeta(action: string): ActionMeta {
  const a = action.toLowerCase();
  let icon: LucideIcon = Activity;
  let tone: Tone = "gray";

  if (a.includes("blogs_paused") || a.includes("blog_paused")) {
    icon = PauseCircle;
    tone = "amber";
  } else if (a.includes("blogs_resumed") || a.includes("blog_resumed")) {
    icon = PlayCircle;
    tone = "green";
  } else if (a.includes("blog")) {
    icon = Globe;
    tone = a.includes("delete") || a.includes("remove") ? "red" : "purple";
  } else if (a.includes("post")) {
    icon = FileText;
    tone = a.includes("fail") ? "red" : "indigo";
  } else if (a.includes("seo")) {
    icon = Search;
    tone = a.includes("fail") ? "red" : "blue";
  } else if (a.includes("client.created") || a.includes("client_created")) {
    icon = Users;
    tone = "green";
  } else if (a.includes("client.deleted") || a.includes("client_deleted")) {
    icon = CircleX;
    tone = "red";
  } else if (a.includes("client")) {
    icon = Users;
    tone = "blue";
  } else if (a.includes("message") || a.includes("email")) {
    icon = Mail;
    tone = "blue";
  } else if (a.includes("fail") || a.includes("error")) {
    icon = CircleAlert;
    tone = "red";
  } else if (a.includes("complete") || a.includes("success")) {
    icon = CircleCheck;
    tone = "green";
  }

  return {
    icon,
    iconBg: TONE[tone].iconBg,
    iconColor: TONE[tone].iconColor,
    label: humanize(action),
  };
}

export function humanize(action: string): string {
  return action
    .replace(/[._]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function relativeTime(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function groupByDate<T extends { log: { createdAt: Date | string } }>(rows: T[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const buckets: { label: string; items: T[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier this week", items: [] },
    { label: "Older", items: [] },
  ];

  for (const r of rows) {
    const d = new Date(r.log.createdAt);
    if (d >= today) buckets[0].items.push(r);
    else if (d >= yesterday) buckets[1].items.push(r);
    else if (d >= sevenDaysAgo) buckets[2].items.push(r);
    else buckets[3].items.push(r);
  }

  return buckets.filter((b) => b.items.length > 0);
}

export function formatDetailVal(v: unknown, max = 60): string {
  let s: string;
  if (Array.isArray(v)) s = v.join(", ");
  else if (v && typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
