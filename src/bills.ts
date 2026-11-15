/**
 * รายการค่าใช้จ่าย (bills) และการจ่าย (payments)
 *
 *   GET    /api/data?since=YYYY-MM-DD   → {bills, payments, categories}  (payments ตั้งแต่ since; ค่าเริ่มต้น ~26 เดือน)
 *   GET    /api/payments?from=&to=      → การจ่ายตามช่วงวันที่จ่าย (ใช้ดูประวัติเก่า)
 *   POST   /api/payments                {name, amount, category?, paid_date?, method?, note?}  → บันทึกจ่ายครั้งเดียว (Shortcuts/สคริปต์)
 *   POST   /api/sync                    {ops:[{type:'put',payment} | {type:'del',id,updated_at}]}
 *   PUT    /api/bills/:id               {bill}
 *   DELETE /api/bills/:id
 *   GET/PUT /api/categories, POST /api/categories/reset
 */
import { Env, json, readJson, ID_RE, MIN_TS, getSetting, putSetting, clip } from './util';
import { localParts, getTz, sendToAll } from './notify';
// ตรรกะคำนวณงวดใช้ไฟล์เดียวกับหน้าเว็บ
import { pendingFor, addDays, diffDays } from '../public/schedule.js';

export type Category = { key: string; label: string; emoji: string; hidden?: boolean };
export type Bill = {
  id: string;
  name: string;
  category: string;
  amount: number | null;
  unit: 'once' | 'week' | 'month' | 'year';
  every: number;
  start_due: string;
  end_date: string | null;
  count: number | null;
  remind_days: number;
  autopay: boolean;
  method: string;
  details: string;
  active: boolean;
  created_at?: number;
  updated_at: number;
};
export type Payment = {
  id: string;
  bill_id: string | null;
  period: string | null;
  paid_date: string;
  name: string;
  category: string;
  amount: number | null;
  method: string;
  note: string;
  status: 'paid' | 'skipped';
  updated_at: number;
};

export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'home', label: 'บ้าน/ที่พัก', emoji: '🏠' },
  { key: 'utility', label: 'น้ำ-ไฟ', emoji: '💡' },
  { key: 'phone', label: 'โทรศัพท์/เน็ต', emoji: '📶' },
  { key: 'card', label: 'บัตรเครดิต/ผ่อน', emoji: '💳' },
  { key: 'insurance', label: 'ประกัน', emoji: '🛡️' },
  { key: 'tax', label: 'ภาษี/ค่าธรรมเนียม', emoji: '🧾' },
  { key: 'car', label: 'รถ/เดินทาง', emoji: '🚗' },
  { key: 'subscription', label: 'สมาชิก/บริการ', emoji: '📺' },
  { key: 'education', label: 'การศึกษา', emoji: '🎓' },
  { key: 'health', label: 'สุขภาพ', emoji: '🩺' },
  { key: 'family', label: 'ครอบครัว/ทำบุญ', emoji: '🎁' },
  { key: 'other', label: 'อื่น ๆ', emoji: '📦' },
];

const CAT_KEY_RE = /^[A-Za-z0-9_]{1,40}$/;
const DATE_RE = /^(20\d\d|21\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UNITS = new Set(['once', 'week', 'month', 'year']);
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v);

const money = (v: unknown): number | null | string => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) return 'bad_amount';
  return Math.round(n * 100) / 100;
};

// ---------- หมวด ----------

function validateCategories(input: any): Category[] | string {
  if (!Array.isArray(input) || input.length < 1 || input.length > 40) return 'bad_categories';
  const seen = new Set<string>();
  const out: Category[] = [];
  for (const c of input) {
    const key = String(c?.key ?? '');
    if (!CAT_KEY_RE.test(key) || seen.has(key)) return 'bad_category_key';
    seen.add(key);
    const label = clip(c.label, 30);
    if (!label) return 'bad_category_label';
    out.push({ key, label, emoji: clip(c.emoji, 16), hidden: !!c.hidden });
  }
  return out;
}

async function getCategories(env: Env): Promise<Category[]> {
  const v = validateCategories(await getSetting<unknown>(env, 'categories', null));
  return typeof v === 'string' ? DEFAULT_CATEGORIES : v;
}

// ---------- รายการ (bill) ----------

function rowBill(r: any): Bill {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    amount: r.amount ?? null,
    unit: r.unit,
    every: r.every,
    start_due: r.start_due,
    end_date: r.end_date ?? null,
    count: r.count ?? null,
    remind_days: r.remind_days,
    autopay: !!r.autopay,
    method: r.method,
    details: r.details,
    active: !!r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function validateBill(id: string, b: any, now: number): Bill | string {
  if (!b || typeof b !== 'object') return 'bad_bill';
  const name = clip(b.name, 120);
  if (!name) return 'name_required';
  const amount = money(b.amount);
  if (typeof amount === 'string') return amount;
  if (!UNITS.has(b.unit)) return 'bad_unit';
  const every = Number(b.every ?? 1);
  if (!Number.isInteger(every) || every < 1 || every > 60) return 'bad_every';
  if (!isDate(b.start_due)) return 'bad_start_due';
  const end = b.end_date == null || b.end_date === '' ? null : b.end_date;
  if (end !== null && (!isDate(end) || end < b.start_due)) return 'bad_end_date';
  const count = b.count == null || b.count === '' ? null : Number(b.count);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 600)) return 'bad_count';
  const remind = Number(b.remind_days ?? 3);
  if (!Number.isInteger(remind) || remind < 0 || remind > 60) return 'bad_remind_days';
  const category = CAT_KEY_RE.test(String(b.category ?? '')) ? String(b.category) : 'other';
  return {
    id,
    name,
    category,
    amount,
    unit: b.unit,
    every: b.unit === 'once' ? 1 : every,
    start_due: b.start_due,
    end_date: b.unit === 'once' ? null : end,
    count: b.unit === 'once' ? null : count,
    remind_days: remind,
    autopay: !!b.autopay,
    method: clip(b.method, 30),
    details: clip(b.details, 1000),
    active: b.active !== false,
    updated_at: now,
  };
}

async function listBills(env: Env): Promise<Bill[]> {
  const { results } = await env.DB.prepare('SELECT * FROM bills ORDER BY active DESC, name').all();
  return results.map(rowBill);
}

// ---------- การจ่าย (payment) ----------

function rowPayment(r: any): Payment {
  return {
    id: r.id,
    bill_id: r.bill_id ?? null,
    period: r.period ?? null,
    paid_date: r.paid_date,
    name: r.name,
    category: r.category,
    amount: r.amount ?? null,
    method: r.method,
    note: r.note,
    status: r.status === 'skipped' ? 'skipped' : 'paid',
    updated_at: r.updated_at,
  };
}

function validatePayment(p: any, now: number): Payment | string {
  if (!p || typeof p !== 'object') return 'bad_payment';
  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return 'bad_id';
  const bill_id = p.bill_id == null ? null : String(p.bill_id);
  if (bill_id !== null && !ID_RE.test(bill_id)) return 'bad_bill_id';
  const period = p.period == null ? null : p.period;
  if (period !== null && !isDate(period)) return 'bad_period';
  if (!isDate(p.paid_date)) return 'bad_paid_date';
  const name = clip(p.name, 120);
  if (!name) return 'name_required';
  const amount = money(p.amount);
  if (typeof amount === 'string') return amount;
  let updated = Number(p.updated_at);
  if (!Number.isFinite(updated) || updated < MIN_TS || updated > now + 60000) updated = now;
  return {
    id: p.id,
    bill_id,
    period,
    paid_date: p.paid_date,
    name,
    category: CAT_KEY_RE.test(String(p.category ?? '')) ? String(p.category) : 'other',
    amount,
    method: clip(p.method, 30),
    note: clip(p.note, 1000),
    status: p.status === 'skipped' ? 'skipped' : 'paid',
    updated_at: Math.round(updated),
  };
}

function upsertPayment(env: Env, p: Payment, now: number): D1PreparedStatement {
  // last-write-wins ตาม updated_at — ข้อมูลที่ค้างส่งตอนออฟไลน์จะไม่ทับของที่ใหม่กว่า
  return env.DB.prepare(
    `INSERT INTO payments (id, bill_id, period, paid_date, name, category, amount, method, note, status, deleted, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?12, ?11)
     ON CONFLICT(id) DO UPDATE SET bill_id = excluded.bill_id, period = excluded.period, paid_date = excluded.paid_date,
       name = excluded.name, category = excluded.category, amount = excluded.amount, method = excluded.method,
       note = excluded.note, status = excluded.status, deleted = 0, updated_at = excluded.updated_at
     WHERE excluded.updated_at >= payments.updated_at`
  ).bind(p.id, p.bill_id, p.period, p.paid_date, p.name, p.category, p.amount, p.method, p.note, p.status, p.updated_at, now);
}

// ---------- routes ----------

export async function handleBills(req: Request, env: Env, url: URL, now: number): Promise<Response | null> {
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/data' && method === 'GET') {
    const sinceQ = url.searchParams.get('since');
    const since = isDate(sinceQ) ? sinceQ : addDays(new Date(now).toISOString().slice(0, 10), -800);
    const [bills, categories, pays] = await Promise.all([
      listBills(env),
      getCategories(env),
      env.DB.prepare(
        `SELECT * FROM payments WHERE deleted = 0 AND (paid_date >= ?1 OR period >= ?1) ORDER BY paid_date DESC LIMIT 20000`
      )
        .bind(since)
        .all(),
    ]);
    return json({ bills, categories, payments: pays.results.map(rowPayment), since });
  }

  if (path === '/api/payments' && method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const { results } = await env.DB.prepare(
      'SELECT * FROM payments WHERE deleted = 0 AND paid_date >= ?1 AND paid_date <= ?2 ORDER BY paid_date DESC LIMIT 20000'
    )
      .bind(isDate(from) ? from : '2000-01-01', isDate(to) ? to : '2199-12-31')
      .all();
    return json({ payments: results.map(rowPayment) });
  }

  if (path === '/api/payments' && method === 'POST') {
    const body = await readJson(req);
    const tz = await getTz(env);
    const cats = await getCategories(env);
    const rawCat = clip(body?.category, 40);
    const cat = cats.find((c) => c.key === rawCat || c.label === rawCat)?.key ?? 'other';
    const v = validatePayment(
      {
        id: crypto.randomUUID(),
        bill_id: null,
        period: null,
        paid_date: body?.paid_date ?? localParts(now, tz).date,
        name: body?.name,
        category: cat,
        amount: body?.amount,
        method: body?.method,
        note: body?.note,
        status: 'paid',
        updated_at: now,
      },
      now
    );
    if (typeof v === 'string') return json({ error: v }, 400);
    await upsertPayment(env, v, now).run();
    return json({ ok: true, payment: v }, 201);
  }

  if (path === '/api/sync' && method === 'POST') {
    const body = await readJson(req);
    const ops = body?.ops;
    if (!Array.isArray(ops) || ops.length > 500) return json({ error: 'bad_ops' }, 400);
    const stmts: D1PreparedStatement[] = [];
    const rejected: { index: number; error: string }[] = [];
    ops.forEach((op: any, index: number) => {
      if (op?.type === 'put') {
        const v = validatePayment(op.payment, now);
        if (typeof v === 'string') rejected.push({ index, error: v });
        else stmts.push(upsertPayment(env, v, now));
      } else if (op?.type === 'del') {
        if (typeof op.id !== 'string' || !ID_RE.test(op.id)) return void rejected.push({ index, error: 'bad_id' });
        let u = Number(op.updated_at);
        if (!Number.isFinite(u) || u > now + 60000) u = now;
        stmts.push(env.DB.prepare('UPDATE payments SET deleted = 1, updated_at = ?2 WHERE id = ?1 AND updated_at <= ?2').bind(op.id, u));
      } else rejected.push({ index, error: 'bad_op' });
    });
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, applied: stmts.length, rejected });
  }

  const m = path.match(/^\/api\/bills\/([A-Za-z0-9_-]{8,64})$/);
  if (m && method === 'PUT') {
    const body = await readJson(req);
    const v = validateBill(m[1], body?.bill, now);
    if (typeof v === 'string') return json({ error: v }, 400);
    await env.DB.prepare(
      `INSERT INTO bills (id, name, category, amount, unit, every, start_due, end_date, count, remind_days, autopay, method, details, active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, amount = excluded.amount, unit = excluded.unit,
         every = excluded.every, start_due = excluded.start_due, end_date = excluded.end_date, count = excluded.count,
         remind_days = excluded.remind_days, autopay = excluded.autopay, method = excluded.method, details = excluded.details,
         active = excluded.active, updated_at = excluded.updated_at`
    )
      .bind(v.id, v.name, v.category, v.amount, v.unit, v.every, v.start_due, v.end_date, v.count, v.remind_days, v.autopay ? 1 : 0, v.method, v.details, v.active ? 1 : 0, now)
      .run();
    const saved = await env.DB.prepare('SELECT * FROM bills WHERE id = ?').bind(v.id).first();
    return json({ ok: true, bill: rowBill(saved) });
  }
  if (m && method === 'DELETE') {
    // ลบเฉพาะรายการตั้งไว้ ประวัติการจ่ายยังอยู่ (มีชื่อ/หมวดเก็บไว้ในตัวเอง)
    await env.DB.prepare('DELETE FROM bills WHERE id = ?').bind(m[1]).run();
    return json({ ok: true });
  }

  if (path === '/api/categories' && method === 'GET') return json({ categories: await getCategories(env) });
  if (path === '/api/categories' && method === 'PUT') {
    const body = await readJson(req);
    const v = validateCategories(body?.categories);
    if (typeof v === 'string') return json({ error: v }, 400);
    await putSetting(env, 'categories', v);
    return json({ ok: true, categories: v });
  }
  if (path === '/api/categories/reset' && method === 'POST') {
    await env.DB.prepare("DELETE FROM settings WHERE key = 'categories'").run();
    return json({ ok: true, categories: DEFAULT_CATEGORIES });
  }

  return null;
}

// ---------- เตือนประจำวัน (cron รายชั่วโมง) ----------

const baht = (n: number | null) => {
  if (n == null) return '';
  const frac = Math.round(n * 100) % 100 ? 2 : 0;
  return ` ฿${n.toLocaleString('th-TH', { minimumFractionDigits: frac, maximumFractionDigits: 2 })}`;
};

function dueLabel(days: number): string {
  if (days < 0) return `เลยกำหนด ${-days} วัน`;
  if (days === 0) return 'ครบกำหนดวันนี้';
  if (days === 1) return 'พรุ่งนี้';
  return `อีก ${days} วัน`;
}

/** รายการที่ควรเตือนวันนี้: เลยกำหนด + ใกล้ครบตามจำนวนวันที่ตั้งไว้ของแต่ละรายการ */
export function itemsToRemind(bills: Bill[], payments: Payment[], today: string) {
  const items: { bill: Bill; date: string; days: number }[] = [];
  for (const b of bills) {
    if (!b.active) continue;
    const { overdue, next } = pendingFor(b, payments, today, 61);
    for (const o of overdue) items.push({ bill: b, date: o.date, days: o.days });
    if (next && next.days <= b.remind_days) items.push({ bill: b, date: next.date, days: next.days });
  }
  return items.sort((a, b) => a.days - b.days || a.bill.name.localeCompare(b.bill.name));
}

export async function runDaily(env: Env, now = Date.now(), force = false): Promise<{ items: number; sent: number }> {
  const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first<{ n: number }>();
  if (!subs?.n) return { items: 0, sent: 0 };
  const [tz, hour] = await Promise.all([getTz(env), getSetting<number>(env, 'remind_hour', 8)]);
  const { date, minutes } = localParts(now, tz);
  const h = Math.floor(minutes / 60);
  // ส่งตั้งแต่ชั่วโมงที่ตั้งไว้ (ถ้าส่งไม่สำเร็จจะลองใหม่อีก 2 ชั่วโมงถัดไป)
  if (!force && (h < hour || h > hour + 2)) return { items: 0, sent: 0 };

  const key = `daily:${date}`;
  if (!force) {
    const r = await env.DB.prepare('INSERT INTO reminders_sent (key, sent_at) VALUES (?1, ?2) ON CONFLICT(key) DO NOTHING').bind(key, now).run();
    if (!r.meta.changes) return { items: 0, sent: 0 };
  }

  const bills = await listBills(env);
  const { results } = await env.DB.prepare('SELECT * FROM payments WHERE deleted = 0 AND bill_id IS NOT NULL AND period >= ?')
    .bind(addDays(date, -800))
    .all();
  const items = itemsToRemind(bills, results.map(rowPayment), date);
  if (!items.length) return { items: 0, sent: 0 };

  const overdue = items.filter((i) => i.days < 0).length;
  const lines = items.slice(0, 12).map((i) => `• ${dueLabel(i.days)}: ${i.bill.name}${baht(i.bill.amount)}${i.bill.autopay ? ' (หักอัตโนมัติ)' : ''}`);
  if (items.length > 12) lines.push(`และอีก ${items.length - 12} รายการ`);
  const res = await sendToAll(env, {
    tag: `daily-${date}`,
    title: overdue ? `มีค่าใช้จ่ายเลยกำหนด ${overdue} รายการ` : `ค่าใช้จ่ายใกล้ครบกำหนด ${items.length} รายการ`,
    body: lines.join('\n'),
    url: '/',
  });
  if (!force && res.total > 0 && res.sent === 0) {
    await env.DB.prepare('DELETE FROM reminders_sent WHERE key = ?').bind(key).run(); // ลองใหม่ชั่วโมงถัดไป
  }
  if (minutes < 60) await env.DB.prepare('DELETE FROM reminders_sent WHERE sent_at < ?').bind(now - 60 * 86400000).run();
  return { items: items.length, sent: res.sent };
}

export { diffDays };
