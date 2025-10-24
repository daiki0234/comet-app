// src/lib/attendance/extension.ts
export type Usage = '放課後' | '休校日' | '欠席';

export type ExtensionInfo = {
  minutes: number;            // 延長分（例: 45, 120）
  class: 1 | 2 | 3;           // 1=30–59分, 2=60–119分, 3=120分以上
  display: string;            // "45分（1）" / "2時間（3）" など（UI表示用）
};

const BASE_MINUTES: Record<Exclude<Usage, '欠席'>, number> = {
  '放課後': 3 * 60,
  '休校日': 5 * 60,
};

function parseHHMM(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function fmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

function classify(mins: number): 1 | 2 | 3 {
  if (mins >= 120) return 3;
  if (mins >= 60)  return 2;
  return 1; // 30–59分
}

/** 延長があれば ExtensionInfo、なければ null */
export function computeExtension(
  usageStatus: Usage,
  arrivalTime?: string | null,
  departureTime?: string | null
): ExtensionInfo | null {
  if (usageStatus === '欠席') return null;
  const start = parseHHMM(arrivalTime);
  const end   = parseHHMM(departureTime);
  if (start == null || end == null) return null;

  const used = end - start;
  if (used <= 0) return null;

  const base = BASE_MINUTES[usageStatus];
  const over = used - base;
  if (over < 30) return null; // 30分未満は記録しない

  const cls = classify(over);
  return { minutes: over, class: cls, display: `${fmt(over)}（${cls}）` };
}

/** notes 末尾にある延長表記（"…（1|2|3）"）を除去 */
export function stripExtensionNote(notes?: string | null): string {
  const base = (notes ?? '').trim();
  if (!base) return '';
  return base.replace(/\s*[\d時間分]+（[123]）\s*$/u, '').trim();
}