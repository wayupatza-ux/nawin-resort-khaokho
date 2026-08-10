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

### ตั้งค่า PromptPay สำหรับรับชำระเงิน — กรอกครบแล้ว เหลือแค่ทดสอบสแกนจริง
ตั้งค่าไว้ใน `resort_settings` แล้ว: PromptPay ID `088985000565236` (เลข 15 หลักจาก CLICX, รูปแบบ e-Wallet/merchant — ระบบรองรับแล้ว), ชื่อบัญชี "นายนาวิน อินทเสือ", และ note "โอนแล้วแนบสลิปในแอปได้เลย" — ลูกค้าจองใหม่เห็น QR จริง+note ทันที ไม่ต้องทำอะไรเพิ่มในหน้า Dashboard

**ค้างอยู่ — บอสตองต้องทดสอบสแกน QR ด้วยแอปธนาคารจริงก่อนเปิดใช้งานจริง** (Claude ไม่มีมือถือ/แอปธนาคารให้ทดสอบเอง) — payload ตรวจสอบโครงสร้าง TLV/CRC ถูกต้องตาม spec แล้ว แต่ควรสแกนจริงยืนยันว่าขึ้นชื่อ "นายนาวิน อินทเสือ" ถูกต้องก่อนรับเงินจริง

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

### Rich Menu + ข้อความต้อนรับ LINE OA

**ข้อความต้อนรับ — ทำงานแล้วทันที ไม่ต้องทำอะไรเพิ่ม**
`line-webhook` ตอบข้อความต้อนรับอัตโนมัติทันทีที่มีคนกดเพิ่มเพื่อน OA (2 ข้อความ: แนะนำรีสอร์ท+ลิงก์จอง และเตือนเรื่องความปลอดภัย "ไม่ขอโอนเงินผ่านแชท")

**Rich Menu — ใช้งานจริงแล้ว ตั้งเป็นเมนูหลักแล้ว ทดสอบกดจริงในแอป LINE ผ่านหมดทุกปุ่มแล้ว (2026-08-10)**
ริชเมนู 6 ปุ่ม (จองห้องพัก, การจองของฉัน, รูปห้องพัก, แผนที่/เส้นทาง, โทรติดต่อเรา, ติดต่อแอดมิน) — richMenuId ปัจจุบัน: `richmenu-1a168c283bd3edb114b9c2ee07649d3a` (ชื่อ "Nawin Resort Khaokho - main v2") ตั้งเป็นเมนูหลักแล้ว ลูกค้าเห็นทันทีที่เปิดแชท OA — ปุ่ม "แผนที่" ชี้ไปพิกัดหมุด `https://www.google.com/maps?q=16.628785,101.002473` (หมุดลอย ไม่ผ่าน verify เพราะยังไม่ได้ไปเขาค้อยืนยันตัวธุรกิจ) — บอสตองทดสอบกดทุกปุ่มจากแอป LINE จริงแล้ว ทำงานปกติทั้งหมด ไม่ต้องทำอะไรเพิ่ม

**ค้างอยู่ — ชื่อสถานที่บน Google Maps (submission แรก) ยังรอ Google รีวิว**
ส่งคำแนะนำเพิ่มสถานที่ "Nawin Resort Khaokho" (พิกัดเดียวกับปุ่มแผนที่ด้านบน) เข้า Google Maps แบบ "Add a missing place" แล้ว แต่ยังไม่ถูกอนุมัติ/ยังค้นหาไม่เจอในระบบ (รอ Google รีวิว จะมีอีเมลแจ้งบอสตองเมื่อรีวิวเสร็จ) — พอสถานที่นี้ขึ้นบน Maps แล้ว (ค้นหาเจอ) ต้องส่ง "แนะนำการแก้ไข" เปลี่ยนชื่อเป็น "Nawin Resort เขาค้อ" (ดูหัวข้อด้านล่าง จริงๆ ได้ Google Business Profile แยกไปแล้วซึ่งใช้ชื่อนี้ถูกต้อง — submission นี้อาจไม่จำเป็นแล้วถ้า Business Profile ด้านล่างขึ้นก่อน)

**ค้างอยู่ — Google Business Profile "nawin resort เขาค้อ" สร้างแล้ว รอบอสตองยืนยันตัวตนด้วยวิดีโอ**
สร้าง Business Profile ผ่านบัญชี `nawinresort.khaokho@gmail.com` เรียบร้อยแล้ว (ชื่อ "nawin resort เขาค้อ", หมวด Resort hotel, ที่อยู่ 365/1 ต.เขาค้อ อ.เขาค้อ จ.เพชรบูรณ์ 67270, โทร 080-691-8190, เว็บไซต์ https://khaokho.nawingroup.com/guest-app/, พิกัดตรงกับปุ่มแผนที่) — สถานะปัจจุบัน **"Verification required"** ยังไม่ขึ้นค้นหาให้ลูกค้าเห็นจนกว่าจะยืนยันตัวตน

**สิ่งที่บอสตองต้องทำเอง:** Google เสนอวิธียืนยันตัวตนวิธีเดียวคือ **อัดวิดีโอธุรกิจ** (ถ่ายให้เห็นสถานที่ อุปกรณ์ และหลักฐานว่าเป็นผู้ดูแล) — ต้องไปที่รีสอร์ทจริงแล้วอัดคลิปส่ง ทำแทนไม่ได้ ไปที่ [Google Business Profile Manager](https://business.google.com/locations) (ล็อกอินด้วย nawinresort.khaokho@gmail.com) → กด "Get verified" ที่แถวของ nawin resort เขาค้อ

### Agoda listing — publish ส่งแล้ว รอ Agoda รีวิว (1-3 วัน)

สมัคร Agoda Partner ผ่านบัญชี `nawinresort.khaokho@gmail.com` แล้วสร้าง listing เต็มรูปแบบเสร็จ:
- **ชื่อ:** Nawin Resort เขาค้อ — **Ref ID: 92425385** — สถานะ "Publishing in progress" (Agoda จะอีเมลแจ้งเมื่อ live, ปกติ 1-3 วัน)
- **ประเภท:** Hotel-type → Resort, ที่อยู่/พิกัดตรงกับปุ่มแผนที่ใน LINE rich menu
- **ห้อง:** Room 1 = "Deluxe Bungalow" (occupancy 3 คน = นอน 2 + เสริม 1, ห้องน้ำ 1, ขนาด 20 ตร.ม. รวมระเบียง — ประมาณการ, ราคาขั้นต่ำ 2,500 บาท/คืน) แทนบ้านพัก 3 หลัง — **ยังไม่ได้ตั้งจำนวนห้องจริง (3 ห้อง) เพราะ Agoda ให้ตั้งทีหลังใน Availability Center/Calendar หลัง publish** ต้องเข้าไปตั้งเอง; Room 2 = "Standard Room" (ไม่มีหมวด Tent/Glamping ให้เลือกใน Agoda เลยใช้ตัวนี้แทน, occupancy 2, ห้องน้ำ 1, ขนาด 12 ตร.ม. ประมาณการ, ราคาขั้นต่ำ 1,500 บาท/คืน) แทนเต็นท์กระโจม T1
- **เช็คอิน/เอาท์:** 14:00-22:00 / เช็คเอาท์ 11:00
- **นโยบายยกเลิก:** Refundable up to 1 day before check-in
- **โปรโมชั่น:** First 3 Bookings เปิดอยู่ (ลด 33% ให้ลูกค้า 3 คนแรก)
- **รับเงิน:** เลือก Bank transfer เป็นวิธี (ยังไม่ได้กรอกเลขบัญชีจริง — Agoda จะขอทีหลัง ต้องกรอกเองเพราะเป็นข้อมูลการเงิน)
- **Star rating:** 3 ดาว (self-declared ไม่ใช่การรับรองทางการ)

**ที่บอสตองต้องทำเอง (หลัง Agoda อนุมัติ listing):**
1. **ตั้งจำนวนห้องจริงในแต่ละ Room type** (Deluxe Bungalow = 3 ห้อง, Standard Room = 1 ห้อง) ผ่าน Availability Center/Calendar ใน Agoda YCS
2. **กรอกเลขบัญชีธนาคารจริง** สำหรับรับเงินจาก Agoda (payout setup) — ผมกรอกให้ไม่ได้เพราะเป็นข้อมูลการเงิน
3. **ตรวจ/แก้ไขขนาดห้อง (ตร.ม.)** ที่เป็นตัวเลขประมาณการไว้ ถ้าต้องการความแม่นยำกว่านี้
4. **ตั้งชื่อห้องให้ตรงกับ Agoda** — เข้า Dashboard → ยูนิต & รายงาน → กรอกช่อง **"ชื่อห้องใน Agoda"** ของแต่ละห้อง ให้ตรงกับชื่อ room type ที่ตั้งไว้ใน Agoda YCS เป๊ะๆ (เช่น "Deluxe Bungalow" สำหรับ N1/N2/N3, "Standard Room" สำหรับ T1) ไม่งั้นระบบ agoda-intake จับคู่ไม่ถูกห้อง

### เชื่อม Agoda เข้าระบบ (ไม่ผ่าน channel manager) — เตรียมไว้แล้ว รอต่อฝั่งรับอีเมล

สร้าง edge function `agoda-intake` ไว้แล้ว รับข้อมูลการจองที่แกะมาจากอีเมลแจ้งจองของ Agoda (หรือจากทางอื่นในอนาคต เช่น channel manager) แล้วสร้าง/อัปเดต/ยกเลิกแถวใน `bookings` อัตโนมัติ (source = `agoda`) — กันชนกับการจองตรงด้วย exclusion constraint เดิม (ถ้าชนวันที่จะได้ error กลับมาทันทีให้ไปตรวจมือ ไม่ทับข้อมูลมั่ว)
2. **ต่อฝั่งอ่านอีเมล** — เลือกอย่างใดอย่างหนึ่ง:
   - ให้ Hermes เพิ่ม cron job อ่านอีเมลแจ้งจองจาก Agoda (ที่ inbox ที่ Agoda YCS ส่งแจ้งเข้า) แกะข้อมูล แล้วยิง POST ไปที่ endpoint ด้านล่าง
   - หรือใช้ Zapier/Make (free tier) ตั้ง Gmail trigger → webhook ไปที่ endpoint เดียวกัน
3. **Endpoint ที่ต้องยิง:**
   ```
   POST https://espxwmnaoauhsdgckwpr.supabase.co/functions/v1/agoda-intake/booking
   Header: x-internal-secret: <ขอค่าจริงจาก Claude ในแชท ไม่เก็บไว้ในไฟล์นี้>
   Body (JSON):
   {
     "externalRef": "เลขที่จอง Agoda (ใช้กันจองซ้ำ/ใช้ยกเลิก)",
     "roomTypeName": "ชื่อ room type ตามที่ Agoda ส่งมา",
     "guestName": "ชื่อแขก",
     "guestPhone": "เบอร์โทร (ถ้ามี)",
     "checkIn": "YYYY-MM-DD",
     "checkOut": "YYYY-MM-DD",
     "numGuests": 2,
     "totalAmount": 1800
   }
   ```
   ยิงซ้ำด้วย `externalRef` เดิมได้ (จะ update ไม่สร้างซ้ำ) — ยกเลิกให้ส่ง `{"externalRef": "...", "action": "cancel"}` แทน
4. ทดสอบผ่านแล้วด้วย curl จริง (สร้าง/แก้ไข/ยกเลิก/ชนวันที่/ห้องไม่ตรง) — ครบทุกกรณี ก่อน apply กับข้อมูลจริง

## หมายเหตุสถาปัตยกรรม

- ทุกตารางมี RLS default-deny; guest-app ไม่เข้าตาราง `bookings`/`guests` ตรงๆ เลย ทุกอย่างผ่าน `guest-api` edge function ด้วย service-role key + ยืนยัน LIFF ID token ทุก request
- Availability กันชนด้วย Postgres exclusion constraint (`btree_gist`) ระดับ DB เป็นด่านสุดท้าย — RPC `check_availability` เป็นแค่ด่านตรวจก่อนเพื่อ UX ที่ดีกว่า (error message ชัดเจน) ไม่ใช่จุดเดียวที่กันชน
- `line-notify` ยิงจาก DB trigger ผ่าน `pg_net` (async, ไม่บล็อก transaction การอัปเดตสถานะจอง)
