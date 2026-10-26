"use strict";
const ROUTES = require("../public/freightpulse/routes");
const { contextCopy } = require("../public/freightpulse/context-copy");
const { csWindowCopy } = require("../public/freightpulse/cs-window-copy");
const SYMBOLS = [...Object.keys(ROUTES), "BDI", "ZIM"];
const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date = (s) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("th-TH", {timeZone:"Asia/Bangkok"}) : "ยังไม่ทราบ";
function freightDigestEmail({ rows = [], generatedAt, mode = "test" } = {}) {
  if (!["demo", "test"].includes(mode)) throw Error("freight_live_email_not_enabled");
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const sections = SYMBOLS.map((symbol) => {
    const r = bySymbol.get(symbol) || {symbol, current:false, dataStatus:"missing"};
    const context = contextCopy(r);
    const title = ROUTES[symbol]?.name || context?.title || symbol;
    const status = !r.current ? ({stale:"ข้อมูลเก่า — ยังใช้ประเมินปัจจุบันไม่ได้",source_freshness_unknown:"ยังยืนยันความสดของข้อมูลไม่ได้",missing:"ยังไม่มีข้อมูล"}[r.dataStatus] || "ยังไม่มีข้อมูลที่ยืนยันสำหรับประเมินปัจจุบัน") : context ? context.statusTh || "ยังไม่เปิดใช้การประเมิน" : ({pressure_up:"แรงกดดันราคาสูงขึ้น",easing:"แรงกดดันราคาผ่อนคลาย",unclear:"ทิศทางยังไม่ชัดเจน"}[r.signalStatus] || "ทิศทางยังไม่ชัดเจน");
    const window = ROUTES[symbol] && r.current ? csWindowCopy(r) : null;
    const lines = [title, status, ...(window ? [window.th,window.explanation] : []), `ข้อมูลต้นทาง: ${date(r.sourceUpdatedAt)}`, `แหล่งข้อมูล: ${r.source || "ยังไม่เชื่อมข้อมูล"}`, ...(context ? [context.explanation] : [])];
    return {symbol, lines};
  });
  const label = mode === "demo" ? "DEMO — ข้อมูลจำลอง ไม่ใช่รายงานตลาดจริง" : "TEST — รายงานทดสอบ ยังไม่เปิดบริการจริง";
  const intro = [label,"FreightPulse · ภาพรวมค่าระวางทุกเส้นทางในฉบับเดียว",`จัดทำ: ${date(generatedAt)}`,"6 เส้นทางขนส่งตู้คอนเทนเนอร์ พร้อม BDI และ ZIM เป็นข้อมูลประกอบแยกส่วน"];
  const footer = ["ก่อนตัดสินใจ ตรวจใบเสนอราคาปัจจุบัน วันหมดอายุราคา พื้นที่เรือ วันเรือออก ค่าใช้จ่ายเพิ่มเติม และเงื่อนไขการจอง", "ข้อมูลฟิวเจอร์สเป็นแนวโน้ม ไม่ใช่ราคาจองจริง สัญญาต่อเนื่องอาจได้รับผลจากการเปลี่ยนเดือนสัญญา ไม่รับประกันราคาที่ดีที่สุดหรือผลประหยัด", "สมาชิก FreightPulse ได้รายงานรวมชุดเดียวกัน ไม่ต้องเลือกเส้นทางเพื่อรับรายงาน สามารถปิดอีเมลได้ในบัญชีเมื่อระบบสมาชิกเปิดใช้"];
  return {
    subject: `[${mode === "demo" ? "DEMO" : "TEST"}] FreightPulse — สรุปค่าระวางครบทุกเส้นทาง`,
    text:[...intro,"",...sections.flatMap((s)=>[...s.lines,""]),...footer].join("\n"),
    html:require("./freightDigestDesign")({sections,label,generatedAt,footer,escape,date}),
  };
}
module.exports = {freightDigestEmail, SYMBOLS};
