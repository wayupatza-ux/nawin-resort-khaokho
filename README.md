# Nawin Resort Khaokho — ระบบจองที่พัก

เว็บแอปสำหรับให้แขกจองที่พัก Nawin Resort Khaokho (เขาค้อ เพชรบูรณ์) ผ่าน LINE (LIFF)
พร้อม dashboard สำหรับเจ้าของ/พนักงานจัดการการจอง

แยกขาดจากระบบ `nawin-hotel-management` (โรงแรมนาวิน ดอนเมือง) โดยสมบูรณ์ —
repo คนละตัว, Supabase project คนละตัว, LINE OA/LIFF คนละตัว

## โครงสร้าง

```
supabase/
  migrations/        DB schema, RLS, functions (SQL)
  functions/
    guest-api/        booking / my-bookings / cancel — เรียกจาก guest-app
    line-webhook/      รับ webhook จาก LINE Messaging API
    line-notify/        ส่ง LINE push แจ้งเตือนเมื่อจองยืนยันแล้ว
guest-app/            หน้าเว็บสำหรับแขก (เปิดผ่าน LIFF ใน LINE)
dashboard/             หน้าเว็บสำหรับเจ้าของ/พนักงาน (login ด้วย Supabase Auth)
```

ทั้ง `guest-app/` และ `dashboard/` เป็น static HTML/JS ล้วน ไม่มี build step —
เปิดไฟล์ตรงๆ ผ่าน web server ใดก็ได้ (GitHub Pages, Netlify, ฯลฯ)

## Supabase project

- Project: `nawin-resort-khaokho` (ref: `espxwmnaoauhsdgckwpr`, region: ap-southeast-1)
- Migrations อยู่ใน `supabase/migrations/` เรียงตามลำดับ `NNNN_description.sql`

## สถานะ

ดู [HANDOFF.md](./HANDOFF.md) สำหรับสถานะปัจจุบัน + สิ่งที่ต้องทำต่อ
