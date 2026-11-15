-- รายการค่าใช้จ่ายที่ตั้งไว้ (ครั้งเดียว / รายสัปดาห์ / รายเดือน / รายปี / ผ่อนเป็นงวด)
CREATE TABLE IF NOT EXISTS bills (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,                 -- เช่น ค่าไฟ, ประกันรถ
  category     TEXT NOT NULL DEFAULT 'other',
  amount       REAL,                          -- ยอดที่คาดไว้ (NULL = ไม่แน่นอน เช่น ค่าไฟ)
  unit         TEXT NOT NULL DEFAULT 'month', -- once / week / month / year
  every        INTEGER NOT NULL DEFAULT 1,    -- ทุก ๆ กี่ unit (เช่น 3 เดือน)
  start_due    TEXT NOT NULL,                 -- วันครบกำหนดงวดแรก YYYY-MM-DD (วันที่ใช้เป็นวันครบกำหนดของทุกงวด)
  end_date     TEXT,                          -- สิ้นสุด (ไม่บังคับ)
  count        INTEGER,                       -- จำนวนงวด (ผ่อน, ไม่บังคับ)
  remind_days  INTEGER NOT NULL DEFAULT 3,    -- เตือนก่อนครบกำหนดกี่วัน
  autopay      INTEGER NOT NULL DEFAULT 0,    -- หักบัญชีอัตโนมัติ
  method       TEXT NOT NULL DEFAULT '',      -- วิธีจ่ายปกติ
  details      TEXT NOT NULL DEFAULT '',      -- เลขผู้ใช้/เลขบัญชี/ช่องทางจ่าย
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- การจ่ายแต่ละครั้ง (ทั้งที่จ่ายตามรายการที่ตั้งไว้ และจ่ายครั้งเดียวที่บันทึกเอง)
CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,               -- UUID สร้างจากฝั่งเครื่อง (รองรับบันทึกตอนออฟไลน์)
  bill_id     TEXT,                           -- NULL = จ่ายครั้งเดียวที่ไม่ได้ตั้งไว้
  period      TEXT,                           -- งวด (วันครบกำหนด) ที่การจ่ายนี้ปิด
  paid_date   TEXT NOT NULL,                  -- วันที่จ่ายจริง YYYY-MM-DD (บันทึกย้อนหลังได้)
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'other',
  amount      REAL,
  method      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'paid',   -- paid / skipped (ข้ามงวด)
  deleted     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (deleted, paid_date);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments (bill_id, period);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip            TEXT PRIMARY KEY,
  count         INTEGER NOT NULL,
  window_start  INTEGER NOT NULL
);

-- เครื่องที่เปิดรับการแจ้งเตือน (Web Push)
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  ua          TEXT,
  created_at  INTEGER NOT NULL,
  last_ok     INTEGER,
  fails       INTEGER NOT NULL DEFAULT 0
);

-- กันส่งการแจ้งเตือนซ้ำ
CREATE TABLE IF NOT EXISTS reminders_sent (
  key      TEXT PRIMARY KEY,
  sent_at  INTEGER NOT NULL
);
