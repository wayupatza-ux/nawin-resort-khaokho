# HANDOFF — Nawin Resort Khaokho

อัปเดตล่าสุด: 2026-08-08

## สถานะปัจจุบัน (v1 — เสร็จแล้ว)

- ✅ Supabase project ใหม่: `nawin-resort-khaokho` (ref `espxwmnaoauhsdgckwpr`, ap-southeast-1) — แยกขาดจาก `nawin-hotel-management` สมบูรณ์
- ✅ DB schema apply แล้ว: `units`, `guests`, `guest_documents`, `bookings`, `booking_status_history`, `payments`, `notifications_log`, `profiles`, `audit_log`, `line_webhook_events`
- ✅ RLS default-deny ทุกตาราง + policy staff-only ผ่าน `profiles`, ตาราง `units` อ่านสาธารณะได้ (สำหรับ guest-app)
- ✅ Exclusion constraint กันจองซ้ำ (`btree_gist` บน `unit_id` + ช่วงวันที่) — ทดสอบผ่าน
- ✅ `check_availability(unit_id, checkin, checkout)` RPC — SECURITY DEFINER, grant ให้ anon/authenticated
- ✅ Trigger `notify_booking_confirmed` (ยิง LINE push อัตโนมัติเมื่อ booking confirmed) + `log_booking_status_change` (log ทุกการเปลี่ยนสถานะ)
- ✅ Vault secrets ตั้งไว้แล้ว (ค่า placeholder รอบอสตองใส่จริง — ดูหัวข้อด้านล่าง)
- ✅ Edge functions deploy แล้ว 3 ตัว: `guest-api`, `line-webhook`, `line-notify` (ทดสอบ auth guard ผ่าน: ไม่มี idToken → 400, signature ผิด → 401, internal secret ผิด → 401)
- ✅ Seed ยูนิตเริ่มต้น 3 รายการ (บ้านพัก 1, บ้านพัก 2, เต็นท์กระโจม) — **ราคา/ชื่อเป็น placeholder ต้องแก้**
- ✅ `guest-app/` ครบ 3 หน้า: `index.html` (LIFF login), `booking.html` (เลือกยูนิต+วันที่+จอง), `my-bookings.html` (ดู/ยกเลิกการจอง)
- ✅ `dashboard/` ครบ 4 หน้า: `index.html` (login), `bookings.html` (ดู/กรอง/เปลี่ยนสถานะ), `new-booking.html` (walk-in), `units.html` (แก้ไขยูนิต + KPI รายได้/occupancy เดือนปัจจุบัน)
- ⏳ ยังไม่ push ขึ้น GitHub (จะ push ทันทีหลังไฟล์นี้)

## สิ่งที่บอสตองต้องทำเอง (บล็อกไม่ได้ เพราะต้องเป็นเจ้าของบัญชี)

### 1. แก้ข้อมูลยูนิตให้ตรงจริง
เข้า dashboard → หน้า "ยูนิต & รายงาน" แก้ชื่อ/ราคา/ความจุยูนิตทั้ง 3 (ตอนนี้เป็น placeholder: บ้านพัก 1500 บาท, เต็นท์ 500 บาท) ถ้ามียูนิตมากกว่านี้ เพิ่มแถวใหม่ผ่าน SQL editor ใน Supabase dashboard ก่อน (`insert into units (...)`) แล้วจะโผล่ในหน้าจัดการอัตโนมัติ

### 2. สร้าง LINE Official Account + LINE Login channel + LIFF app ใหม่
ทำแยกจากของโรงแรมดอนเมืองโดยสิ้นเชิง (คนละ OA คนละ LIFF ID):

1. เข้า [LINE Developers Console](https://developers.line.biz/console/) → สร้าง Provider ใหม่หรือใช้ของเดิม → สร้าง **Messaging API channel** ใหม่ ตั้งชื่อ "Nawin Resort Khaokho"
   - ไปที่แท็บ "Messaging API" → คัดลอก **Channel secret** และออก **Channel access token (long-lived)**
2. ในเดียวกัน (provider เดียวกัน) สร้าง **LINE Login channel** ใหม่
   - เปิดใช้ LIFF: ไปแท็บ "LIFF" → Add → ตั้งชื่อ "จองที่พัก", Size: Full, Endpoint URL: `https://<โดเมนที่ deploy>/guest-app/index.html`
   - คัดลอก **LIFF ID** ที่ได้
   - คัดลอก **Channel ID** ของ LINE Login channel นี้ด้วย (ใช้ verify ID token)
3. อัปเดตค่าจริงลง Supabase Vault (รัน SQL ใน Supabase SQL editor ของ project `nawin-resort-khaokho`):
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'line_channel_secret'),
     '<CHANNEL_SECRET_จริง>'
   );
   select vault.update_secret(
     (select id from vault.secrets where name = 'line_channel_access_token'),
     '<CHANNEL_ACCESS_TOKEN_จริง>'
   );
   select vault.update_secret(
     (select id from vault.secrets where name = 'line_login_channel_id'),
     '<LOGIN_CHANNEL_ID_จริง>'
   );
   ```
4. แก้ `guest-app/assets/config.js` บรรทัด `LIFF_ID: "REPLACE_ME_LIFF_ID"` เป็น LIFF ID จริง แล้ว push/deploy ใหม่
5. ตั้ง Webhook URL ใน Messaging API channel: `https://espxwmnaoauhsdgckwpr.supabase.co/functions/v1/line-webhook` และเปิด "Use webhook"

### 2b. ตรวจสอบ internal_functions_secret
มีการสุ่มค่าไว้แล้วตอน setup (SECURITY DEFINER trigger ↔ `line-notify` function ใช้ยืนยันกัน) — เป็นค่าที่ตั้งไว้ใน Vault ของ project แล้ว ไม่ต้องแก้อะไรเพิ่ม เว้นแต่ต้องการหมุนค่าใหม่ (rotate) ก็ทำผ่าน `vault.update_secret` เหมือนข้างบน แล้วอย่าลืมว่าไม่มีที่อื่นอ้างอิงค่านี้นอกจาก DB trigger เอง

### 3. เลือกวิธี hosting
- **แนะนำ: GitHub Pages** — repo นี้ตั้งใจทำเป็น public ตั้งแต่แรก เปิด Pages ได้ทันทีไม่ติดปัญหาเหมือนโรงแรมดอนเมือง (Settings → Pages → Deploy from branch `main` / root) จะได้ URL แบบ `https://wayupatza-ux.github.io/nawin-resort-khaokho/guest-app/` และ `.../dashboard/`
- ทางเลือก: ต่อ Netlify เอง (ต้อง login Netlify เอง ผมทำแทนไม่ได้) — ถ้าอยากได้ custom domain สวยกว่า

### 4. สร้าง Supabase Auth user สำหรับตัวเอง (owner)
เข้า Supabase Dashboard → Authentication → Users → Add user (ใส่อีเมล+รหัสผ่านเอง) จากนั้นรัน SQL เพื่อผูก role owner:
```sql
insert into public.profiles (id, role, display_name)
values ('<user_id_ที่สร้าง>', 'owner', 'บอสตอง');
```
แล้ว login ที่ `dashboard/index.html` ด้วยอีเมล/รหัสผ่านนั้นได้เลย

## หมายเหตุสถาปัตยกรรม

- ทุกตารางมี RLS default-deny; guest-app ไม่เข้าตาราง `bookings`/`guests` ตรงๆ เลย ทุกอย่างผ่าน `guest-api` edge function ด้วย service-role key + ยืนยัน LIFF ID token ทุก request
- Availability กันชนด้วย Postgres exclusion constraint (`btree_gist`) ระดับ DB เป็นด่านสุดท้าย — RPC `check_availability` เป็นแค่ด่านตรวจก่อนเพื่อ UX ที่ดีกว่า (error message ชัดเจน) ไม่ใช่จุดเดียวที่กันชน
- `line-notify` ยิงจาก DB trigger ผ่าน `pg_net` (async, ไม่บล็อก transaction การอัปเดตสถานะจอง)
