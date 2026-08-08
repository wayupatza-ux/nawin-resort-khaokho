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
- ✅ `staff-app/` ใหม่ — `index.html` (LIFF login + เช็คว่าผูกบัญชีหรือยัง), `booking.html` (พนักงานคีย์จองแทนลูกค้า พร้อมราคาอัตโนมัติ+ปรับได้) — ใช้ edge function `staff-api` แยกจาก `guest-api`
- ✅ `dashboard/` ครบ 4 หน้า: `index.html` (login), `bookings.html` (ปฏิทินรายเดือน + รายการจอง + ค้นหา + filter "จองโดย"), `new-booking.html` (walk-in, ราคาปรับได้), `units.html` (owner เท่านั้น — แก้ไขยูนิต, KPI รายได้/occupancy, สรุปคอมมิชชั่นรายพนักงาน, ผูกบัญชี LINE พนักงาน)
- ✅ Role 3 ระดับ: `owner` (เห็นทุกอย่าง) / `manager` / `staff` (เห็นแค่การจอง+เพิ่มการจอง ไม่เห็นยูนิต/รายงาน)
- ✅ ทุกการจอง (walk-in จาก Dashboard หรือ staff-app) บันทึก `created_by` อัตโนมัติ ใช้คิดคอมมิชชั่นได้
- ✅ Custom domain `khaokho.nawingroup.com` ตั้งค่าแล้ว (DNS ชี้แล้ว รอ GitHub ออก SSL cert)
- ✅ Push ขึ้น GitHub แล้ว, deploy ผ่าน GitHub Pages

## สิ่งที่บอสตองต้องทำเอง (บล็อกไม่ได้ เพราะต้องเป็นเจ้าของบัญชี)

### 1. แก้ข้อมูลยูนิตให้ตรงจริง
เข้า dashboard → หน้า "ยูนิต & รายงาน" แก้ชื่อ/ราคา/ความจุยูนิตทั้ง 3 (ตอนนี้เป็น placeholder: บ้านพัก 1500 บาท, เต็นท์ 500 บาท) ถ้ามียูนิตมากกว่านี้ เพิ่มแถวใหม่ผ่าน SQL editor ใน Supabase dashboard ก่อน (`insert into units (...)`) แล้วจะโผล่ในหน้าจัดการอัตโนมัติ

### 2. สร้าง LINE Official Account + LINE Login channel + LIFF app **2 ตัว** (แขก + พนักงาน)
ทำแยกจากของโรงแรมดอนเมืองโดยสิ้นเชิง (คนละ OA คนละ LIFF ID) — ตอนนี้มี frontend 2 เว็บที่ต้องใช้ LIFF: `guest-app/` (แขกจองเอง) และ `staff-app/` (พนักงานคีย์จองแทนลูกค้า) **ทั้งคู่ใช้ LINE Login channel เดียวกันได้** (แค่สร้าง LIFF entry เพิ่มอันที่ 2 ในแท็บ LIFF) เพราะ token verification เช็คแค่ channel ID ตรงกัน:

1. เข้า [LINE Developers Console](https://developers.line.biz/console/) → สร้าง Provider ใหม่หรือใช้ของเดิม → สร้าง **Messaging API channel** ใหม่ ตั้งชื่อ "Nawin Resort Khaokho"
   - ไปที่แท็บ "Messaging API" → คัดลอก **Channel secret** และออก **Channel access token (long-lived)**
2. ในเดียวกัน (provider เดียวกัน) สร้าง **LINE Login channel** ใหม่ 1 ตัว
   - เปิดใช้ LIFF: ไปแท็บ "LIFF" → Add **2 รายการ**:
     - **"จองที่พัก"** (สำหรับแขก) — Size: Full, Endpoint URL: `https://khaokho.nawingroup.com/guest-app/index.html`
     - **"จองแทนลูกค้า"** (สำหรับพนักงาน) — Size: Full, Endpoint URL: `https://khaokho.nawingroup.com/staff-app/index.html`
   - คัดลอก **LIFF ID ทั้ง 2 ตัว** ที่ได้ (คนละค่ากัน)
   - คัดลอก **Channel ID** ของ LINE Login channel นี้ด้วย (ใช้ verify ID token — ใช้ค่าเดียวกันทั้ง 2 แอป)
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
4. แก้ 2 ไฟล์ (คนละ LIFF ID กัน) แล้ว push/deploy ใหม่:
   - `guest-app/assets/config.js` → `LIFF_ID: "REPLACE_ME_LIFF_ID"` → ใส่ LIFF ID ของ "จองที่พัก"
   - `staff-app/assets/config.js` → `LIFF_ID: "REPLACE_ME_STAFF_LIFF_ID"` → ใส่ LIFF ID ของ "จองแทนลูกค้า"
5. ตั้ง Webhook URL ใน Messaging API channel: `https://espxwmnaoauhsdgckwpr.supabase.co/functions/v1/line-webhook` และเปิด "Use webhook"

### 2c. ผูกบัญชี LINE ของพนักงานแต่ละคน (สำหรับ `staff-app`)
`staff-app` ไม่มีหน้า login แยก — ระบุตัวพนักงานจาก LINE account ที่ผูกไว้ในตาราง `profiles` โดยตรง ขั้นตอน:

1. ให้พนักงานเปิด `https://khaokho.nawingroup.com/staff-app/` ผ่าน LINE (ใน LINE app จริง ไม่ใช่เบราว์เซอร์ปกติ — ต้องเปิดจากลิงก์ที่ส่งผ่านแชท LINE หรือปุ่มเมนู richmenu ของ OA)
2. รอบแรกจะขึ้นข้อความ "บัญชี LINE นี้ยังไม่ได้ผูกกับพนักงาน" พร้อม **LINE User ID** ให้คัดลอก
3. ให้พนักงานส่ง LINE User ID นั้นมาให้บอสตอง (หรือแคปหน้าจอ)
4. เข้า Dashboard → **ยูนิต & รายงาน** → เลื่อนลงหา **"พนักงาน (ผูกบัญชี LINE)"** → วาง LINE User ID ลงช่องของพนักงานคนนั้น → กด Enter หรือคลิกออกจากช่อง (บันทึกอัตโนมัติ)
5. ให้พนักงานเปิด `staff-app` ใหม่อีกครั้ง — คราวนี้จะเข้าหน้ากรอกจองได้เลย ไม่ต้อง login ซ้ำอีก

ทุกการจองที่พนักงานคีย์ผ่าน `staff-app` จะถูกบันทึก "จองโดย" อัตโนมัติ (เห็นในหน้า "การจอง" + นับรวมในตาราง "สรุปตามพนักงาน (สำหรับคิดคอมมิชชั่น)" ที่หน้า "ยูนิต & รายงาน" เหมือนการจองที่คีย์ผ่าน Dashboard ทุกประการ)

### 2b. ตรวจสอบ internal_functions_secret
มีการสุ่มค่าไว้แล้วตอน setup (SECURITY DEFINER trigger ↔ `line-notify` function ใช้ยืนยันกัน) — เป็นค่าที่ตั้งไว้ใน Vault ของ project แล้ว ไม่ต้องแก้อะไรเพิ่ม เว้นแต่ต้องการหมุนค่าใหม่ (rotate) ก็ทำผ่าน `vault.update_secret` เหมือนข้างบน แล้วอย่าลืมว่าไม่มีที่อื่นอ้างอิงค่านี้นอกจาก DB trigger เอง

### 3. Hosting — GitHub Pages + custom domain (เสร็จแล้ว ยกเว้นขั้นตอน DNS)
เปิด GitHub Pages ให้แล้ว (Settings → Pages → Deploy from branch `main` / root) และตั้ง custom domain เป็น `khaokho.nawingroup.com` ในฝั่ง GitHub แล้ว (มีไฟล์ `CNAME` ที่ root ของ repo) — URL เดิม `https://wayupatza-ux.github.io/nawin-resort-khaokho/...` ยังใช้งานได้อยู่จนกว่า DNS จะชี้มาที่นี่

**เหลือขั้นตอนเดียวที่บอสตองต้องทำเอง — ตั้งค่า DNS ที่ registrar ของโดเมน `nawingroup.com`:**

เพิ่ม CNAME record:
| Type  | Name (Host) | Value |
|---|---|---|
| CNAME | `khaokho` | `wayupatza-ux.github.io` |

(ถ้า registrar ไม่รองรับ CNAME สำหรับ subdomain ที่มี root domain apex อื่นอยู่ด้วย ให้เช็คว่าใช้ประเภท "CNAME" ธรรมดาได้เลยเพราะ `khaokho` เป็น subdomain ไม่ใช่ apex/root — ไม่ต้องใช้ A record แบบ apex)

หลัง DNS propagate (ปกติ 10 นาที–24 ชม.) GitHub จะออก SSL certificate ให้อัตโนมัติ แล้วเว็บจะใช้งานได้ที่:
- Guest app: `https://khaokho.nawingroup.com/guest-app/`
- Dashboard: `https://khaokho.nawingroup.com/dashboard/`

**หมายเหตุ**: ทำไมไม่ใช้ `nawingroup.com/khaokho` (path บน root domain) — GitHub Pages ผูก 1 โดเมนต่อ 1 repo เท่านั้น ไม่รองรับแบ่ง path ไปคนละเว็บ ถ้าต้องการแบบนั้นจริงๆ ต้องเพิ่ม Cloudflare Worker (หรือ reverse proxy อื่น) มาทำ path routing เพิ่ม ซึ่งซับซ้อนกว่ามากและต้องดูแลเพิ่ม — ใช้ subdomain แทนจะเก็บ `nawingroup.com` root ไว้ว่างสำหรับเว็บบริษัทหลักในอนาคตได้ด้วย

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
