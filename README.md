# ค่าใช้จ่าย (bill-tracker)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/monthop-gmail/bill-tracker)

เว็บแอปบันทึกค่าใช้จ่ายที่ต้องจ่าย — **ครั้งเดียว รายเดือน ทุกกี่เดือน รายปี หรือผ่อนเป็นงวด**
เห็นชัดว่างวดไหนจ่ายแล้ว งวดไหนค้าง อะไรใกล้ครบกำหนด และเตือนบนมือถือทุกเช้า
รันบน **Cloudflare Workers + D1** (ใช้แผนฟรีได้) ไม่มีขั้นตอน build ฝั่งหน้าเว็บ

> A Thai-language bill & recurring-payment tracker for Cloudflare Workers + D1: one-off, monthly, yearly and installment bills,
> paid/unpaid status per period, backdated entries, daily push reminders. Click the button above to deploy your own private copy.

ใครจะเอาไปใช้ กดปุ่ม **Deploy to Cloudflare** ด้านบนได้เลย แต่ละคนจะได้แอปและฐานข้อมูลของตัวเองในบัญชี Cloudflare ของตัวเอง
ข้อมูลไม่ปนกันและไม่ผ่านเจ้าของ repo นี้ — หนึ่งการ deploy ใช้งานได้หนึ่งบัญชี (รหัสผ่านเดียว ใช้ร่วมกันในบ้านได้)

## ทำอะไรได้บ้าง

- **ต้องจ่าย** (หน้าแรก) — แยกเป็น *เลยกำหนด* / *ภายใน 7 วัน* / *ถัดไป (45 วัน)* แตะ **จ่ายแล้ว** ครั้งเดียวจบ
  พร้อมสรุปเดือนนี้: จ่ายแล้วเท่าไร ยังต้องจ่ายเท่าไร
- **ตั้งรายการล่วงหน้า** — ค่าไฟ ค่าเน็ต บัตรเครดิต ประกันรถ ภาษีรถ ค่าเทอม ฯลฯ
  - รอบ: ครั้งเดียว / ทุกเดือน / ทุก 3 หรือ 6 เดือน / ทุกปี / กำหนดเอง (ทุก n สัปดาห์-เดือน-ปี)
  - ผ่อนเป็นงวด (เช่น 10 งวด แสดง "งวด 3/10") หรือกำหนดวันสิ้นสุด
  - ยอดไม่แน่นอน (เช่น ค่าไฟ) เว้นว่างได้ แล้วใส่ยอดจริงตอนจ่าย
  - เก็บรายละเอียดสำหรับจ่าย เช่น เลขผู้ใช้ไฟฟ้า เลขกรมธรรม์ เลขบัญชี — ขึ้นให้ดูตอนกดจ่าย
  - วันที่ 31 ในเดือนที่ไม่มี 31 ใช้วันสุดท้ายของเดือน, 29 ก.พ. ในปีปกติใช้ 28 ก.พ.
- **จ่ายแล้วหรือยัง?** — แตะรายการเพื่อดูทุกงวด: ✓ จ่ายแล้ววันไหน เท่าไร จ่ายด้วยอะไร / ยังไม่จ่าย / ข้าม
- **บันทึกย้อนหลังได้** — ทั้งงวดที่จ่ายไปแล้ว และค่าใช้จ่ายครั้งเดียวที่ไม่ได้ตั้งไว้ จ่ายงวดหน้าล่วงหน้าก็ได้ หรือ "ข้ามงวดนี้"
- **ประวัติ** — ดูรายเดือน ยอดรวมแยกตามหมวด ค้นหา ("ค่าไฟ" เคยจ่ายเมื่อไร) และดาวน์โหลด CSV
- **ภาระประจำต่อเดือน/ต่อปี** โดยประมาณจากรายการที่ตั้งไว้
- **แจ้งเตือนบนมือถือ** (Web Push) ทุกวันตามเวลาที่เลือก: รายการที่เลยกำหนด + ที่ใกล้ครบกำหนด (ตั้งได้ต่อรายการว่าเตือนก่อนกี่วัน)
- **ใช้ได้ตอนเน็ตหลุด** — การจ่ายบันทึกลงเครื่องก่อน แล้วส่งขึ้นเซิร์ฟเวอร์เองเมื่อกลับมาออนไลน์
- สำรอง/นำเข้าข้อมูล (JSON), ติดตั้งเป็นแอปบนหน้าจอโฮม (PWA), โหมดมืด

## วิธี deploy

### แบบที่ 1: ปุ่ม Deploy to Cloudflare (ง่ายที่สุด)

1. กดปุ่มด้านบน แล้วล็อกอิน Cloudflare + GitHub
2. ตั้งรหัสผ่าน `APP_PASSWORD` (อย่างน้อย 8 ตัว) ตอนที่ระบบถาม
3. รอระบบสร้าง repo ในบัญชี GitHub ของคุณ สร้างฐานข้อมูล D1 สร้างตาราง และ deploy ให้

### แบบที่ 2: GitHub Actions (repo นี้หรือ fork)

ตั้ง secrets ใน repo (Settings → Secrets and variables → Actions) แล้ว push เข้า `main` หรือกด Run workflow ในแท็บ Actions

| Secret | | ค่า |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | จำเป็น | สร้างจาก template **Edit Cloudflare Workers** แล้วเพิ่มสิทธิ์ **Account → D1 → Edit** |
| `APP_PASSWORD` | แนะนำ | รหัสผ่านเข้าแอป (อย่างน้อย 8 ตัว) — workflow จะตั้งให้ Worker เอง |
| `CLOUDFLARE_ACCOUNT_ID` | ไม่บังคับ | ใส่เมื่อ token เข้าถึงได้หลาย account |
| `API_TOKEN` | ไม่บังคับ | token สำหรับบันทึกผ่าน API / Shortcuts |

ไม่ต้องสร้างฐานข้อมูลเอง — `scripts/ensure-d1.mjs` จะหาฐานข้อมูลชื่อ `bill-tracker` (หรือสร้างใหม่ถ้ายังไม่มี) แล้วใส่ `database_id` ให้ตอน deploy
ถ้าไม่ได้ตั้ง `CLOUDFLARE_API_TOKEN` workflow จะข้ามการ deploy (ไม่ error)

### แบบที่ 3: deploy เองด้วย Wrangler

```bash
npm ci
npx wrangler login
npx wrangler d1 create bill-tracker          # เอา database_id ไปใส่แทน 00000000-... ใน wrangler.jsonc
npx wrangler secret put APP_PASSWORD         # อย่างน้อย 8 ตัว
npm run deploy                               # สร้างตาราง + deploy
```

### รันในเครื่อง

```bash
cp .dev.vars.example .dev.vars      # แล้วใส่ APP_PASSWORD (อย่างน้อย 8 ตัว)
npm run db:migrate:local
npm run dev                          # http://localhost:8787
```

## ใช้บนมือถือ

- **iPhone**: เปิดใน Safari → แชร์ → "เพิ่มไปยังหน้าจอโฮม"
- **Android**: Chrome → เมนู ⋮ → "ติดตั้งแอป" (กดค้างที่ไอคอนมีทางลัด *บันทึกการจ่าย* / *ตั้งรายการ*)

### เปิดการแจ้งเตือน

แท็บ **ตั้งค่า → การแจ้งเตือน** เลือกเวลาที่จะให้เตือนทุกวัน → **เปิดการแจ้งเตือนบนเครื่องนี้** → กด "ส่งทดสอบ" หรือ "ส่งสรุปตอนนี้"

- iPhone/iPad (iOS 16.4+) ต้องเพิ่มแอปไปที่หน้าจอโฮมก่อน แล้วเปิดจากไอคอนนั้น
- ส่งจาก Cron Trigger ของ Worker (ทุกชั่วโมง) ใช้แผนฟรีได้ กุญแจ VAPID สร้างให้อัตโนมัติ

## บันทึกผ่าน API (iOS Shortcuts / สคริปต์)

ตั้ง token: `npx wrangler secret put API_TOKEN`

```bash
curl -X POST https://<your-worker>/api/payments \
  -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"ค่าซ่อมแอร์","amount":1200,"category":"บ้าน/ที่พัก","method":"เงินสด"}'
```

## ความปลอดภัยและข้อมูล

- ทุก API ต้องล็อกอิน (cookie HttpOnly ที่เซ็นด้วย HMAC) หรือ Bearer token; ผิดเกิน 10 ครั้งใน 15 นาทีจะถูกล็อกชั่วคราว
- แอปไม่ยอมให้ใช้งานถ้า `APP_PASSWORD` ว่าง สั้นกว่า 8 ตัว หรือเป็นค่าตัวอย่าง
- ถ้าต้องการชั้นป้องกันเพิ่ม เปิด **Cloudflare Access** ครอบโดเมนนี้ได้ ไม่ต้องแก้โค้ด
- ฟอนต์และไฟล์ทั้งหมดเสิร์ฟจาก Worker เอง ไม่เรียกบริการภายนอก
- D1 มี Time Travel กู้ฐานข้อมูลย้อนหลังได้ (แผนฟรี 7 วัน / Paid 30 วัน) และสำรองเป็น JSON ได้จากหน้าตั้งค่า
- ลบรายการที่ตั้งไว้แล้ว ประวัติการจ่ายยังอยู่ (เก็บชื่อและหมวดไว้ในแต่ละการจ่าย)

## โครงสร้าง

```
public/schedule.js        คำนวณงวดครบกำหนด — ใช้ไฟล์เดียวกันทั้งหน้าเว็บและ Worker
public/app.js             หน้าเว็บ (ES module ไม่ต้อง build)
src/index.ts              Worker: router + cron
src/bills.ts              รายการ/การจ่าย/หมวด + สรุปเตือนรายวัน
src/auth.ts               ล็อกอิน
src/notify.ts, push.ts    Web Push (VAPID + aes128gcm ด้วย WebCrypto)
migrations/0001_init.sql  bills, payments, settings, push_subs, ...
scripts/ensure-d1.mjs     CI: หา/สร้างฐานข้อมูล D1 อัตโนมัติ
```

### API

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| POST | `/api/login` · `/api/logout` | เข้า/ออกจากระบบ |
| GET | `/api/data?since=` | รายการ หมวด และการจ่ายตั้งแต่วันที่ (ค่าเริ่มต้น ~26 เดือน) |
| GET | `/api/payments?from=&to=` | การจ่ายตามช่วงวันที่จ่าย |
| POST | `/api/payments` | บันทึกจ่ายครั้งเดียว (Shortcuts) |
| POST | `/api/sync` | `{ops:[{type:'put',payment} \| {type:'del',id,updated_at}]}` (idempotent, last-write-wins) |
| PUT/DELETE | `/api/bills/:id` | ตั้ง/แก้/ลบรายการ |
| GET/PUT | `/api/categories`, POST `/api/categories/reset` | หมวด |
| GET/PUT | `/api/notify-settings` | เวลาเตือนรายวัน |
| GET/POST | `/api/push/key`, `/subscribe`, `/unsubscribe`, `/test`, `/daily-now` | การแจ้งเตือน |

## สัญญาอนุญาต

โค้ดใช้สัญญาอนุญาต MIT (ดู `LICENSE`) · ฟอนต์ IBM Plex Sans Thai ใช้ SIL Open Font License 1.1 (`public/fonts/OFL-LICENSE.txt`)

แอปนี้เป็นเครื่องมือจดบันทึกส่วนตัว ไม่ใช่บริการทางการเงิน ไม่ได้เชื่อมต่อหรือจ่ายเงินแทนผู้ใช้
