// Nawin Resort Khaokho — staff-app config (พนักงานคีย์จองผ่าน LINE)
// LIFF_ID เป็น placeholder — บอสตองต้องสร้าง LIFF app "ตัวที่ 2" แยกจากของแขก
// ภายใต้ LINE Login channel เดียวกัน แล้วแทนที่ด้วยค่าจริง (ดู HANDOFF.md)
export const CONFIG = {
  SUPABASE_URL: "https://espxwmnaoauhsdgckwpr.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcHh3bW5hb2F1aHNkZ2Nrd3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNTU4NDUsImV4cCI6MjEwMTczMTg0NX0.4121GrLInVS3TpcUyTc5rryw7BQNSYB5VWMAAt09JaY",
  LIFF_ID: "REPLACE_ME_STAFF_LIFF_ID",
  STAFF_API_BASE: "https://espxwmnaoauhsdgckwpr.supabase.co/functions/v1/staff-api",
};
