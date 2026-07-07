export const ROLE_LABELS = {
  student: 'Student',
  supervisor: 'Supervisor',
  observer: 'Guest',
  admin: 'Admin',
};

// Avatar color classes (must match the .av-* rules in app.css).
export const AVATAR_COLORS = ['av-amber', 'av-blue', 'av-green', 'av-red', 'av-purple'];

// Each account type has its own dedicated login/registration URL with a unique,
// non-guessable suffix, so one role's URL can't be derived from another's. The
// bare role paths (/admin, /student, …) are NOT valid — only these slugs work.
// `role` is the backend enum value ('observer' is shown to users as "Guest").
export const ROLE_GATEWAYS = {
  guest: {
    slug: 'guest-9q2x',
    role: 'observer',
    label: 'Guest',
    icon: '👀',
    blurb: 'Browse and comment on public projects. No department needed.',
    demo: 'guest@view.edu',
  },
  student: {
    slug: 'student-3b1d',
    role: 'student',
    label: 'Student',
    icon: '🎓',
    blurb: 'Create projects, collaborate and rate. Pick your department & set.',
    demo: 'c.adeyemi@stu.edu',
  },
  supervisor: {
    slug: 'supervisor-2r6t',
    role: 'supervisor',
    label: 'Supervisor',
    icon: '🧑‍🏫',
    blurb: 'Oversee a department. Requires email verification.',
    demo: 's.okonkwo@uni.edu',
  },
  admin: {
    slug: 'admin-4h8c',
    role: 'admin',
    label: 'Admin',
    icon: '🛡️',
    blurb: 'Platform super-user with full management access.',
    demo: 'admin@prostech.edu',
  },
};
export const GATEWAY_SLUGS = Object.values(ROLE_GATEWAYS).map((g) => g.slug);
// Lookup a gateway by its (unique) URL slug.
export const GATEWAY_BY_SLUG = Object.fromEntries(
  Object.values(ROLE_GATEWAYS).map((g) => [g.slug, g])
);
// Reverse lookup: backend role -> unique gateway URL slug.
export const SLUG_BY_ROLE = Object.fromEntries(
  Object.values(ROLE_GATEWAYS).map((g) => [g.role, g.slug])
);

export const DEPTS = [
  'Computer Science',
  'Engineering',
  'Business',
  'Medicine',
  'Law',
  'Education',
  'Sciences',
];

// Department list shown specifically on the Student registration page.
export const STUDENT_DEPTS = [
  'Civil Engineering',
  'Electrical/Electronics Engineering',
  'Mechanical Engineering',
  'Physics',
  'Mathematics',
  'Chemical Engineering',
  'Petroleum Engineering',
  'Nursing',
  'Statistics',
  'Geology',
  'Geophysics',
  'Agriculture',
  'Public Health',
  'Computer Science',
  'Zoology',
  'Food Science and Technology',
  'Fisheries and Aquaculture Technology',
  'Accounting',
  'Business Management',
  'Economics',
  'Public Administration',
  'Project Management',
  'Cyber security',
  'Biochemistry',
  'Industrial Chemistry',
  'Botany',
  'Microbiology',
  'Applied Geology',
];

export const SETS = ['2020/2021', '2021/2022', '2022/2023', '2023/2024', '2024/2025'];

// Academic levels (students).
export const LEVELS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level'];

// Title options shown on the Supervisor registration page.
export const TITLES = ['Dr.', 'Mr.', 'Ms.', 'Professor'];

// Standard email format check (the W3C/HTML5 email validation pattern).
// Like the W3C/HTML5 pattern, but the domain must include at least one dot
// (a TLD), so "foo@bar" is rejected while "foo@bar.com" is accepted.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const isValidEmail = (email = '') => EMAIL_RE.test(String(email).trim());

// Supervisor tag: an exclusive handle a supervisor creates — letters + numbers
// only (no spaces), at least 6 characters, and a genuine combination (must
// contain at least one letter AND one digit). Mirrors TAG_RE on the server.
const SUPERVISOR_TAG_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{6,}$/;
export const isValidSupervisorTag = (t = '') => SUPERVISOR_TAG_RE.test(String(t).trim());
export const SUPERVISOR_TAG_HELP =
  'At least 6 characters, letters and numbers only (no spaces), and must include both a letter and a number.';

// Matric number format, e.g. "ETC/22/001": a 2–4 letter department code,
// a 2-digit year, and a 3-digit serial, separated by slashes.
const MATRIC_RE = /^[A-Z]{2,4}\/\d{2}\/\d{3}$/;
export const isValidMatric = (m = '') => MATRIC_RE.test(String(m).trim().toUpperCase());

// Password strength (1–4) from length + character variety, for the registration
// strength meter. Returns { level, label }; level 0 for an empty password.
export function passwordStrength(pw = '') {
  if (!pw) return { level: 0, label: '' };
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const level = Math.min(4, Math.max(1, Math.round((s / 5) * 4)));
  return { level, label: ['Weak', 'Fair', 'Good', 'Strong'][level - 1] };
}

// --- Email typo suggestion (mailcheck-style) ---------------------------------
// Spots likely typos in the domain/TLD and proposes a correction, e.g.
// "user@gmail.cum" → "user@gmail.com". It only ever returns a *suggestion*;
// the actual domain existence check happens on the server.
const POPULAR_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com',
  'protonmail.com', 'proton.me', 'mail.com', 'zoho.com', 'gmx.com',
];
const POPULAR_TLDS = [
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'co', 'io', 'info', 'biz',
  'me', 'app', 'dev', 'edu.ng', 'com.ng', 'ac.uk', 'co.uk', 'org.uk',
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

const closest = (value, list, maxDist) => {
  let best = null, bestD = Infinity;
  for (const candidate of list) {
    const dist = levenshtein(value, candidate);
    if (dist < bestD) { bestD = dist; best = candidate; }
  }
  return bestD > 0 && bestD <= maxDist ? best : null;
};

export function suggestEmail(email = '') {
  const [local, domain] = String(email).trim().toLowerCase().split('@');
  if (!local || !domain) return null;
  if (POPULAR_DOMAINS.includes(domain)) return null; // already a known-good domain

  // 1) Whole-domain typo (covers both name + TLD), e.g. "gmial.com", "gmail.cum".
  const domHit = closest(domain, POPULAR_DOMAINS, 2);
  if (domHit) return `${local}@${domHit}`;

  // 2) Just the TLD looks wrong, e.g. "mycompany.con" → "mycompany.com".
  const dot = domain.lastIndexOf('.');
  if (dot > 0) {
    const name = domain.slice(0, dot);
    const tld = domain.slice(dot + 1);
    if (!POPULAR_TLDS.includes(tld)) {
      const tldHit = closest(tld, POPULAR_TLDS, 1);
      if (tldHit) return `${local}@${name}.${tldHit}`;
    }
  }
  return null;
}

// A user's name with their honorific title prefixed — but only when the name
// doesn't already begin with that title, so a supervisor who typed the title
// into their name (e.g. "Dr. Sarah") never shows it twice ("Dr. Dr. Sarah").
export function displayName(user) {
  if (!user) return '';
  const name = (user.name || '').trim();
  const title = (user.title || '').trim();
  let full = name;
  if (title) {
    const lower = name.toLowerCase();
    const t = title.toLowerCase();
    // Keep the name as-is when it's already prefixed with the title.
    full = lower === t || lower.startsWith(`${t} `) ? name : `${title} ${name}`;
  }
  // An anonymized (admin-deleted) account keeps its name on the projects it
  // authored, marked so it's clear the person is no longer an active member.
  return user.deleted ? `${full} (inactive)` : full;
}

export const initials = (name = '') =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export function timeAgo(t) {
  const d = Date.now() - new Date(t).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  if (d < 604800000) return Math.floor(d / 86400000) + 'd ago';
  return new Date(t).toLocaleDateString();
}

export const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#fbbf24', '#6366f1'];

// --- Recognition tiers -------------------------------------------------------
// A project earns a recognition tier as its gold (total supervisor stars) climbs:
// Silver (20), Gold (40), Diamond (60, the highest). Each tier has its own skin
// (see the .reco-badge.tier-* / .reco-skin-* rules in app.css). Thresholds MUST
// mirror RECOGNITION_TIERS on the server (models/Project.js).
export const TIER_META = {
  silver:  { key: 'silver',  label: 'Silver',  emoji: '🥈', min: 20 },
  gold:    { key: 'gold',    label: 'Gold',    emoji: '🥇', min: 40 },
  diamond: { key: 'diamond', label: 'Diamond', emoji: '💎', min: 60 },
};
export const tierFromGold = (gold = 0) =>
  gold >= 60 ? 'diamond' : gold >= 40 ? 'gold' : gold >= 20 ? 'silver' : '';
// Resolve a project's recognition tier meta, or null if it isn't recognised.
// Prefers the server-provided `tier`, falling back to deriving it from gold.
// 'star' is a legacy alias for the Silver tier.
export function recoMeta(p) {
  let tier = p?.tier || (p?.recognized ? tierFromGold(p.gold) : '');
  if (tier === 'star') tier = 'silver';
  return TIER_META[tier] || null;
}
// Just the tier emoji (or '' if none) — handy inline next to a project title.
export const tierEmoji = (p) => recoMeta(p)?.emoji || '';

// --- Colour model conversions (shared by the full-spectrum ColorPicker) ------
// Everything round-trips through 8-bit sRGB. Hue is 0–360; S/L/V/C/M/Y/K are
// 0–100. These are pure functions with no dependencies, safe to use anywhere.
export const isHexColor = (v) =>
  typeof v === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v.trim());

const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));
const hex2 = (v) => clamp255(v).toString(16).padStart(2, '0');

export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const rgbToHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
export function hslToRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}
export function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round((max === 0 ? 0 : d / max) * 100), v: Math.round(max * 100) };
}
export function hsvToRgb({ h, s, v }) {
  h = ((h % 360) + 360) % 360; s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}
export function rgbToCmyk({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}
export function cmykToRgb({ c, m, y, k }) {
  c /= 100; m /= 100; y /= 100; k /= 100;
  return {
    r: clamp255(255 * (1 - c) * (1 - k)),
    g: clamp255(255 * (1 - m) * (1 - k)),
    b: clamp255(255 * (1 - y) * (1 - k)),
  };
}
// A readable text colour (dark or white) to lay over a given background hex.
export function readableText(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1a2440' : '#ffffff';
}

// The five legacy avatar palette classes mapped to hex, so an account still on a
// class still resolves to a real colour for the full-spectrum picker & preview.
export const AVATAR_CLASS_HEX = {
  'av-amber': '#f59e0b',
  'av-blue': '#3b82f6',
  'av-green': '#10b981',
  'av-red': '#ef4444',
  'av-purple': '#8b5cf6',
};
// Resolve any stored avatar colour (legacy class or hex) to a hex value.
export const avatarHex = (color) =>
  isHexColor(color) ? color : AVATAR_CLASS_HEX[color] || AVATAR_CLASS_HEX['av-amber'];

// Group colour themes (20 options). Each is a flat pastel {bg, fg} pair (matching
// the other feed tags' look) plus `dot`, the saturated colour used for the admin
// swatch and the accent on a group's projects/posts. Keys MUST mirror
// GROUP_THEMES on the server (groupController.js).
export const GROUP_THEMES = {
  indigo:  { label: 'Indigo',  bg: '#e0e7ff', fg: '#3730a3', dot: '#4f46e5' },
  blue:    { label: 'Blue',    bg: '#dbeafe', fg: '#1e40af', dot: '#2563eb' },
  sky:     { label: 'Sky',     bg: '#e0f2fe', fg: '#075985', dot: '#0284c7' },
  cyan:    { label: 'Cyan',    bg: '#cffafe', fg: '#155e63', dot: '#0891b2' },
  teal:    { label: 'Teal',    bg: '#ccfbf1', fg: '#115e59', dot: '#0d9488' },
  emerald: { label: 'Emerald', bg: '#d1fae5', fg: '#065f46', dot: '#059669' },
  green:   { label: 'Green',   bg: '#dcfce7', fg: '#166534', dot: '#16a34a' },
  lime:    { label: 'Lime',    bg: '#ecfccb', fg: '#3f6212', dot: '#65a30d' },
  yellow:  { label: 'Yellow',  bg: '#fef9c3', fg: '#854d0e', dot: '#ca8a04' },
  amber:   { label: 'Amber',   bg: '#fef3c7', fg: '#92400e', dot: '#d97706' },
  orange:  { label: 'Orange',  bg: '#ffedd5', fg: '#9a3412', dot: '#ea580c' },
  red:     { label: 'Red',     bg: '#fee2e2', fg: '#991b1b', dot: '#dc2626' },
  rose:    { label: 'Rose',    bg: '#ffe4e6', fg: '#9f1239', dot: '#e11d48' },
  pink:    { label: 'Pink',    bg: '#fce7f3', fg: '#9d174d', dot: '#db2777' },
  fuchsia: { label: 'Fuchsia', bg: '#fae8ff', fg: '#86198f', dot: '#c026d3' },
  purple:  { label: 'Purple',  bg: '#f3e8ff', fg: '#6b21a8', dot: '#9333ea' },
  violet:  { label: 'Violet',  bg: '#ede9fe', fg: '#5b21b6', dot: '#7c3aed' },
  slate:    { label: 'Slate',    bg: '#e2e8f0', fg: '#334155', dot: '#475569' },
  stone:    { label: 'Stone',    bg: '#e7e5e4', fg: '#44403c', dot: '#57534e' },
  zinc:     { label: 'Zinc',     bg: '#e4e4e7', fg: '#3f3f46', dot: '#52525b' },
  brown:    { label: 'Brown',    bg: '#efe5db', fg: '#713f12', dot: '#92400e' },
  gold:     { label: 'Gold',     bg: '#fdf6d0', fg: '#854d0e', dot: '#eab308' },
  mint:     { label: 'Mint',     bg: '#dcfce7', fg: '#047857', dot: '#10b981' },
  lavender: { label: 'Lavender', bg: '#eef0ff', fg: '#4338ca', dot: '#8b5cf6' },
};
export const DEFAULT_GROUP_THEME = 'indigo';
// Derive a full {bg, fg, dot} theme from any hex colour, matching the flat-pastel
// look of the presets: a pale tint background and a dark, readable foreground,
// both sharing the chosen hue. `dot` is the colour itself (the accent).
export function themeFromHex(hex) {
  const { h, s } = rgbToHsl(hexToRgb(hex));
  return {
    label: hex,
    dot: hex,
    bg: rgbToHex(hslToRgb({ h, s: Math.min(s, 65), l: 91 })),
    fg: rgbToHex(hslToRgb({ h, s: Math.min(Math.max(s, 45), 90), l: 30 })),
  };
}
// A group's theme can be a preset key OR an arbitrary hex (full-spectrum picker).
export const groupTheme = (key) =>
  isHexColor(key) ? themeFromHex(key) : GROUP_THEMES[key] || GROUP_THEMES[DEFAULT_GROUP_THEME];

// Read an image File and return a downscaled JPEG data URL. Keeps payloads small
// enough to send inline (used for snippet progress photos). `maxDim` caps the
// longest edge; aspect ratio is preserved.
export function fileToResizedDataURL(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Only image files are allowed.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Group avatar helpers (WhatsApp-style coloured circles) ------------------
const GROUP_COLORS = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#6366f1', '#ec4899'];
// Deterministic colour from the group name, so each group keeps a stable hue.
export function groupColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}
// Up to two initials from the group name (words, else first two letters).
export function groupInitials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (name.trim().slice(0, 2) || '?').toUpperCase();
}
