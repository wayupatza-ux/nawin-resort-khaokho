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

## สิ่งที่ทำเสร็จแล้วทั้งหมด (ไม่ต้องทำอะไรเพิ่ม)

- ✅ **ยูนิตจริง 4 ห้อง** ใส่ราคา/ชื่อจริงแล้ว (N1, N2, N3 บ้านพัก 2,500 บาท/คืน + T1 เต็นท์ 1,500 บาท/คืน)
- ✅ **LINE OA + Messaging API channel + LINE Login channel + LIFF 2 ตัว** สร้างครบใต้ provider "Nawin Resort Khaokho" (แยกขาดจากโรงแรมดอนเมือง) — LINE OA: `@428gpjds`, secrets ทั้งหมดอยู่ใน Supabase Vault แล้ว, LIFF ID ใส่ใน config.js ทั้ง 2 แอปแล้ว
- ✅ **Custom domain** `khaokho.nawingroup.com` — DNS record เพิ่มที่ Squarespace (ผ่าน Google Workspace) แล้ว, GitHub Pages ตั้ง custom domain แล้ว — เหลือแค่รอ GitHub ออก SSL certificate เองอัตโนมัติ (มักไม่เกิน 1 ชม. หลัง DNS ตั้งเสร็จ)
- ✅ **Supabase Auth owner user** — บอสตอง (`wayupatza@gmail.com`) ผูก role `owner` แล้ว, login dashboard ได้เลย

## สิ่งที่บอสตองต้องทำเอง — ตั้งค่าให้ "ลืมรหัสผ่าน?" ใช้งานได้

หน้า login เพิ่มปุ่ม "ลืมรหัสผ่าน?" แล้ว (ให้พนักงานกู้รหัสผ่านเองได้ ไม่ต้องให้ใครแตะรหัสผ่านคนอื่น) แต่ Supabase บล็อกไม่ให้ redirect ไปโดเมนที่ไม่ได้อยู่ใน allow-list ต้องตั้งค่า 1 ครั้ง:

1. เข้า [Supabase Dashboard](https://supabase.com/dashboard/project/espxwmnaoauhsdgckwpr/auth/url-configuration) → Authentication → **URL Configuration**
2. **Site URL**: ใส่ `https://khaokho.nawingroup.com`
3. **Redirect URLs**: เพิ่ม `https://khaokho.nawingroup.com/dashboard/reset-password.html` (หรือใส่ `https://khaokho.nawingroup.com/**` แบบ wildcard ให้ครอบคลุมทุกหน้าในโดเมนนี้)
4. Save

**แก้ปัญหาบีม login ไม่ได้เฉพาะหน้าตอนนี้เลย** (เร็วกว่ารอ 4 ข้อบนเสร็จ): เข้า Supabase Dashboard → Authentication → Users → หา `awatsada.beam@gmail.com` → กด "..." → **Send password recovery** (ส่งอีเมลให้บีมตั้งรหัสใหม่เอง) — แต่ก็ยังต้องตั้งค่า URL Configuration ข้างบนก่อน ไม่งั้นลิงก์ในอีเมลจะ redirect ผิดที่

## สิ่งที่บอสตองต้องทำเอง (บล็อกไม่ได้ เพราะต้องเป็นเจ้าของบัญชี)

### ผูกบัญชี LINE ของพนักงานแต่ละคน (สำหรับ `staff-app`)
`staff-app` ไม่มีหน้า login แยก — ระบุตัวพนักงานจาก LINE account ที่ผูกไว้ในตาราง `profiles` โดยตรง ขั้นตอน:

1. ให้พนักงานเปิด `https://khaokho.nawingroup.com/staff-app/` ผ่าน LINE (ใน LINE app จริง ไม่ใช่เบราว์เซอร์ปกติ — ต้องเปิดจากลิงก์ที่ส่งผ่านแชท LINE หรือปุ่มเมนู richmenu ของ OA)
2. รอบแรกจะขึ้นข้อความ "บัญชี LINE นี้ยังไม่ได้ผูกกับพนักงาน" พร้อม **LINE User ID** ให้คัดลอก
3. ให้พนักงานส่ง LINE User ID นั้นมาให้บอสตอง (หรือแคปหน้าจอ)
4. เข้า Dashboard → **ยูนิต & รายงาน** → เลื่อนลงหา **"พนักงาน (ผูกบัญชี LINE)"** → วาง LINE User ID ลงช่องของพนักงานคนนั้น → กด Enter หรือคลิกออกจากช่อง (บันทึกอัตโนมัติ)
5. ให้พนักงานเปิด `staff-app` ใหม่อีกครั้ง — คราวนี้จะเข้าหน้ากรอกจองได้เลย ไม่ต้อง login ซ้ำอีก

ทุกการจองที่พนักงานคีย์ผ่าน `staff-app` จะถูกบันทึก "จองโดย" อัตโนมัติ (เห็นในหน้า "การจอง" + นับรวมในตาราง "สรุปตามพนักงาน (สำหรับคิดคอมมิชชั่น)" ที่หน้า "ยูนิต & รายงาน" เหมือนการจองที่คีย์ผ่าน Dashboard ทุกประการ)

**หมายเหตุเรื่อง internal_functions_secret**: สุ่มค่าไว้แล้วตอน setup (SECURITY DEFINER trigger ↔ `line-notify` function ใช้ยืนยันกัน) ไม่ต้องแก้อะไรเพิ่ม เว้นแต่ต้องการหมุนค่าใหม่ (rotate) — ทำผ่าน `vault.update_secret` เหมือน secret อื่นๆ แล้วอย่าลืมว่าไม่มีที่อื่นอ้างอิงค่านี้นอกจาก DB trigger เอง

### ตั้งค่า PromptPay สำหรับรับชำระเงิน
ตอนนี้ระบบสร้าง QR PromptPay ให้อัตโนมัติในแอปแขก แต่ต้องใส่เลข PromptPay จริงก่อน:

1. เข้า Dashboard → **ยูนิต & รายงาน** → หัวข้อ **"ตั้งค่าการชำระเงิน (PromptPay)"** (อยู่บนสุดของหน้า)
2. ใส่ **PromptPay ID** (เบอร์โทร 10 หลัก เช่น `0891234567` หรือเลขบัตรประชาชน 13 หลักของบัญชีที่จะรับเงิน) และ **ชื่อบัญชี** ที่จะโชว์ให้ลูกค้าเห็น
3. กดบันทึก — ลูกค้าที่จองใหม่จะเห็น QR จริงทันที (ก่อนตั้งค่าจะเห็นข้อความสำรองแทน)
4. **ทดสอบสแกน QR ด้วยแอปธนาคารจริงก่อนเปิดใช้งานจริง** เพื่อความชัวร์ว่าสแกนได้ถูกต้อง (ระบบ generate ตาม spec มาตรฐาน แต่ควรทดสอบยิงจริงสักครั้ง)

### ตรวจสอบสลิปที่ลูกค้าอัปโหลด
เข้า Dashboard → เมนู **"ชำระเงิน"** — จะเห็นรายการสลิปที่รอตรวจสอบทั้งหมด (พนักงานทุกคนเห็นได้ ไม่ใช่แค่ owner) คลิกรูปเพื่อดูขยาย กด **"ยืนยันการชำระเงิน"** จะเปลี่ยนสถานะการจองเป็น "ยืนยันแล้ว" ทันทีและส่ง LINE แจ้งเตือนลูกค้าอัตโนมัติ หรือกด **"ปฏิเสธสลิป"** ถ้าสลิปไม่ถูกต้อง (ลูกค้าจะอัปโหลดใหม่ได้)

### อัปโหลดรูปภาพยูนิต
เข้า Dashboard → **ยูนิต & รายงาน** → เลื่อนลงหัวข้อ **"รูปภาพยูนิต"** อัปโหลดรูปจริงของแต่ละห้อง/เต็นท์ได้เลย (ไม่จำกัดจำนวน) รูปจะโชว์ให้ลูกค้าดูตอนเลือกยูนิตในหน้าจองทันที — ตอนนี้ยังไม่มีรูปเลย แนะนำอัปโหลดก่อนเริ่มรับจองจริงจัง

### ระบบยกเลิกอัตโนมัติ 24 ชม. (ทำงานอยู่แล้ว ไม่ต้องทำอะไร)
มี cron job รันทุก 15 นาที ยกเลิกการจองที่ยังเป็น "รอยืนยัน" (ลูกค้าจองเองผ่านแอป ยังไม่จ่ายเงิน) เกิน 24 ชม. อัตโนมัติ — การจองที่พนักงานคีย์ผ่าน Dashboard/staff-app เป็น "ยืนยันแล้ว" ทันทีอยู่แล้วไม่โดนยกเลิก

### ป้องกันมิจฉาชีพ — สิ่งที่ควรทำเพิ่ม
ระบบตั้งค่าไว้ให้แล้วว่า "จะไม่มีการขอให้โอนเงินผ่านแชท" (ขึ้นแบนเนอร์เตือนในแอปทุกครั้งก่อนโชว์ QR) แต่แนะนำเพิ่ม:
- **สมัคร LINE Verified Official Account** (บัญชีติ๊กเขียว) ผ่าน [LINE OA Manager](https://manager.line.biz/) → Settings → Account settings → ดูตัวเลือกยื่นขอ verified — ต้องใช้เอกสารจดทะเบียนธุรกิจ ใช้เวลาพิจารณาหลายวัน แต่ช่วยให้ลูกค้ามั่นใจว่าเป็น OA ตัวจริง
- ย้ำกับพนักงาน/ตัวเองว่า **ห้ามส่งเลขบัญชี/QR ผ่านแชทเด็ดขาด** ให้ลูกค้าเปิดแอปดูเองเท่านั้น เพื่อรักษาความน่าเชื่อถือของระบบนี้ไว้

## หมายเหตุสถาปัตยกรรม

- ทุกตารางมี RLS default-deny; guest-app ไม่เข้าตาราง `bookings`/`guests` ตรงๆ เลย ทุกอย่างผ่าน `guest-api` edge function ด้วย service-role key + ยืนยัน LIFF ID token ทุก request
- Availability กันชนด้วย Postgres exclusion constraint (`btree_gist`) ระดับ DB เป็นด่านสุดท้าย — RPC `check_availability` เป็นแค่ด่านตรวจก่อนเพื่อ UX ที่ดีกว่า (error message ชัดเจน) ไม่ใช่จุดเดียวที่กันชน
- `line-notify` ยิงจาก DB trigger ผ่าน `pg_net` (async, ไม่บล็อก transaction การอัปเดตสถานะจอง)
