/**
 * คำนวณงวดครบกำหนดของรายการค่าใช้จ่าย — ใช้ร่วมกันทั้งหน้าเว็บและ Worker (cron เตือน)
 * วันที่ทั้งหมดเป็นสตริง 'YYYY-MM-DD' ตามเวลาท้องถิ่น (ไม่ผูกกับโซนเวลา)
 *
 * รายการ (bill): { unit: 'once'|'week'|'month'|'year', every: number, start_due: 'YYYY-MM-DD',
 *                  end_date?: string|null, count?: number|null }
 */

const pad = (n) => String(n).padStart(2, '0');

/** @param {string} s */
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** @param {number} y @param {number} m @param {number} d */
export function fmtDate(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** จำนวนวันในเดือน (m = 1–12) */
const daysInMonth = (/** @type {number} */ y, /** @type {number} */ m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** บวกเดือน โดยยึดวันที่เดิม (ถ้าเดือนนั้นไม่มีวันที่นั้น ใช้วันสุดท้ายของเดือน เช่น 31 → 30/28) */
export function addMonths(/** @type {string} */ date, /** @type {number} */ n, /** @type {number=} */ day) {
  const { y, m, d } = parseDate(date);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return fmtDate(ny, nm, Math.min(day ?? d, daysInMonth(ny, nm)));
}

export function addDays(/** @type {string} */ date, /** @type {number} */ n) {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmtDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** จำนวนวันจาก a ไป b (b − a) */
export function diffDays(/** @type {string} */ a, /** @type {string} */ b) {
  const A = parseDate(a);
  const B = parseDate(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86400000);
}

/** วันครบกำหนดงวดที่ k (เริ่มที่ 0) หรือ null ถ้าไม่มี */
export function nthDue(/** @type {any} */ bill, /** @type {number} */ k) {
  const every = Math.max(1, Number(bill.every) || 1);
  const day = parseDate(bill.start_due).d;
  switch (bill.unit) {
    case 'once':
      return k === 0 ? bill.start_due : null;
    case 'week':
      return addDays(bill.start_due, 7 * every * k);
    case 'month':
      return addMonths(bill.start_due, every * k, day);
    case 'year':
      return addMonths(bill.start_due, 12 * every * k, day);
    default:
      return null;
  }
}

const MAX_SPAN = { week: 7, month: 31, year: 366 };

/**
 * งวดทั้งหมดที่อยู่ในช่วง [from, to] (รวมปลายทั้งสองข้าง)
 * @returns {{date: string, n: number}[]}  n = งวดที่ (เริ่มที่ 1)
 */
export function dueDates(/** @type {any} */ bill, /** @type {string} */ from, /** @type {string} */ to, max = 1000) {
  const out = [];
  if (!bill || !bill.start_due) return out;
  let k = 0;
  // กระโดดไปใกล้ from ก่อน (ไม่ให้วนนานกับรายการที่เริ่มนานแล้ว)
  const span = /** @type {Record<string, number>} */ (MAX_SPAN)[bill.unit];
  if (span) {
    const gap = diffDays(bill.start_due, from);
    if (gap > 0) k = Math.max(0, Math.floor(gap / (span * Math.max(1, Number(bill.every) || 1))) - 1);
  }
  for (; out.length < max; k++) {
    if (bill.count && k >= bill.count) break;
    const d = nthDue(bill, k);
    if (!d || d > to) break;
    if (bill.end_date && d > bill.end_date) break;
    if (d >= from) out.push({ date: d, n: k + 1 });
  }
  return out;
}

/**
 * คีย์ของงวด ใช้จับคู่การจ่ายกับงวด (ทนต่อการแก้วันที่ในรายการภายหลัง):
 * รายเดือน → YYYY-MM, รายปี → YYYY, รายสัปดาห์ → วันที่, ครั้งเดียว → 'once'
 */
export function periodKey(/** @type {any} */ bill, /** @type {string} */ date) {
  if (bill.unit === 'month') return date.slice(0, 7);
  if (bill.unit === 'year') return date.slice(0, 4);
  if (bill.unit === 'once') return 'once';
  return date;
}

/**
 * งวดของรายการในช่วง พร้อมสถานะการจ่าย
 * @param {any} bill
 * @param {any[]} payments  การจ่ายทั้งหมด (จะกรองเฉพาะของรายการนี้)
 * @param {string} today
 * @param {{back?: number, ahead?: number}} [opt]
 */
export function occurrences(bill, payments, today, opt = {}) {
  const back = opt.back ?? 730;
  const ahead = opt.ahead ?? 60;
  const earliest = addDays(today, -back);
  const from = bill.start_due > earliest ? bill.start_due : earliest;
  const paid = new Map();
  for (const p of payments) {
    if (p.bill_id !== bill.id || !p.period || p.deleted) continue;
    const key = periodKey(bill, p.period);
    // ถ้ามีหลายรายการในงวดเดียว ใช้รายการที่จ่ายจริง (ไม่ใช่ข้าม) ก่อน
    const cur = paid.get(key);
    if (!cur || (cur.status === 'skipped' && p.status !== 'skipped')) paid.set(key, p);
  }
  return dueDates(bill, from, addDays(today, ahead)).map((o) => ({
    date: o.date,
    n: o.n,
    days: diffDays(today, o.date),
    payment: paid.get(periodKey(bill, o.date)) || null,
  }));
}

/**
 * รายการที่ต้องสนใจตอนนี้ของรายการหนึ่ง: งวดที่เลยกำหนดและยังไม่จ่ายทั้งหมด + งวดถัดไปที่ยังไม่จ่าย 1 งวด
 */
export function pendingFor(/** @type {any} */ bill, /** @type {any[]} */ payments, /** @type {string} */ today, ahead = 400) {
  const occ = occurrences(bill, payments, today, { ahead });
  const overdue = occ.filter((o) => !o.payment && o.days < 0);
  const next = occ.find((o) => !o.payment && o.days >= 0) || null;
  return { overdue, next };
}

/** ข้อความรอบการจ่าย เช่น "ทุกเดือน วันที่ 20" */
export function scheduleText(/** @type {any} */ bill, /** @type {(d: string) => string} */ fmtDayMonth, /** @type {(d: string) => string} */ fmtFull) {
  const every = Math.max(1, Number(bill.every) || 1);
  const { d } = parseDate(bill.start_due);
  let s;
  if (bill.unit === 'once') return `ครั้งเดียว ${fmtFull(bill.start_due)}`;
  if (bill.unit === 'week') s = every === 1 ? 'ทุกสัปดาห์' : `ทุก ${every} สัปดาห์`;
  else if (bill.unit === 'month') s = `${every === 1 ? 'ทุกเดือน' : `ทุก ${every} เดือน`} วันที่ ${d}`;
  else s = `${every === 1 ? 'ทุกปี' : `ทุก ${every} ปี`} ${fmtDayMonth(bill.start_due)}`;
  if (bill.count) s += ` · ${bill.count} งวด`;
  else if (bill.end_date) s += ` · ถึง ${fmtFull(bill.end_date)}`;
  return s;
}

/** ยอดเฉลี่ยต่อเดือนของรายการประจำ (ใช้ประมาณภาระต่อเดือน) */
export function monthlyEquivalent(/** @type {any} */ bill) {
  if (bill.amount == null || bill.unit === 'once') return 0;
  const every = Math.max(1, Number(bill.every) || 1);
  if (bill.unit === 'month') return bill.amount / every;
  if (bill.unit === 'year') return bill.amount / (12 * every);
  if (bill.unit === 'week') return (bill.amount * 52) / 12 / every;
  return 0;
}
