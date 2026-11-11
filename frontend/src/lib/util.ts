import type { Color, Group } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const today = () => ymd(new Date());
export const parseD = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseD(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const diffDays = (a: string, b: string) => Math.round((parseD(a).getTime() - parseD(b).getTime()) / 864e5);

export const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
export const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function fmtDate(v: string) {
  if (!v) return "";
  const d = v.slice(0, 10),
    t = v.slice(11, 16),
    dd = diffDays(d, today());
  const date = parseD(d);
  let s =
    dd === 0 ? "Hoje" : dd === 1 ? "Amanhã" : dd === -1 ? "Ontem" : date.getDate() + " " + MONTHS[date.getMonth()].slice(0, 3);
  if (Math.abs(dd) > 1 && date.getFullYear() !== new Date().getFullYear()) s += " " + date.getFullYear();
  return t ? s + ", " + t : s;
}

export const COLORS: Color[] = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
export const GROUPS: Record<Group, string> = { todo: "A fazer", doing: "Em andamento", done: "Concluído", review: "Revisar" };
export const INTERVALS = [1, 7, 30];
/** Icons to choose from for lists, folders and habits, grouped so the picker is easy to scan. */
export const EMOJI_GROUPS: { name: string; list: string[] }[] = [
  { name: "Pastas", list: "📁 📂 🗂️ 🗃️ 🗄️ 📦 🧰 📋 📌 📍 🏷️ 🔖 📎 🗒️ 📝 ✅ ☑️ ⭐ 🌟 ✨ 💫 🔥 ⚡ 💎".split(" ") },
  { name: "Estudos", list: "📚 📖 📕 📗 📘 📙 ✏️ 🖊️ 🖍️ 📐 📏 🧮 🧪 🔬 🔭 🧬 🌍 🗺️ 🗣️ 🎓 🏫 🧠 💡 🧩".split(" ") },
  { name: "Trabalho", list: "💼 💻 🖥️ ⌨️ 🖨️ 📱 ☎️ 📧 📨 📊 📈 📉 🗓️ 📅 ⏰ ⏳ 🧾 💰 💳 🏦 🤝 🚀 🎯 🏆".split(" ") },
  { name: "Casa", list: "🏠 🏡 🛋️ 🛏️ 🧹 🧺 🧼 🪴 🌱 🌻 🐶 🐱 🍳 🛒 🧑‍🍳 🔧 🔨 🪛 💡 🚗 🚲 ✈️ 🧳 🎁".split(" ") },
  { name: "Saúde", list: "❤️ 🫀 🏥 💊 🩺 🦷 🏃 🚴 🏊 🧘 🏋️ ⚽ 🏀 🎾 🥗 🍎 🥑 🥦 💧 🍵 ☕ 😴 🌙 ☀️".split(" ") },
  { name: "Lazer", list: "🎵 🎸 🎹 🎧 🎬 📺 🎮 🎲 ♟️ 🎨 🖌️ 📷 🎭 🎤 📚 🧶 🌊 ⛰️ 🏖️ 🏕️ 🎉 🎂 🍕 🍿".split(" ") },
  { name: "Cores", list: "🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ 💜 💙 💚 💛 🧡 🤍".split(" ") },
];

/** A phone number in international format (+5511987654321), or "" when it can't be one. Numbers without a country code are taken as Brazilian. */
export function normalizePhone(input: string) {
  const plus = input.trim().startsWith("+");
  let d = input.replace(/\D/g, "");
  if (!plus && d.startsWith("00")) d = d.slice(2);
  else if (!plus && (d.length === 10 || d.length === 11)) d = "55" + d;
  return d.length >= 10 && d.length <= 15 ? "+" + d : "";
}
/** +5511987654321 → +55 11 98765-4321 (other countries: just grouped). */
export function formatPhone(p: string) {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(p);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : p;
}

/** Icons given to new lists and habits (drawn icons; see src/components/icons.tsx). */
export const DEFAULT_LIST_ICON = "lucide:list-checks";
export const DEFAULT_HABIT_ICON = "lucide:star:yellow";
/** For plain text (toasts, Markdown): the emoji the person chose, or `fallback` for a drawn icon. */
export const emojiOf = (icon: string | undefined, fallback = "") => (!icon || icon.startsWith("lucide:") ? fallback : icon);
