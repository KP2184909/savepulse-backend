"use strict";
const FREIGHT_CONTEXT = {
  BDI: {
    title: "ภาวะตลาดเรือเทกอง",
    en: "Dry Bulk Market Conditions",
    statuses: {
      pressure_up: [
        "ตลาดเรือเทกองมีแนวโน้มแข็งขึ้น",
        "Dry Bulk Market Strengthening",
      ],
      easing: ["ตลาดเรือเทกองมีแนวโน้มอ่อนลง", "Dry Bulk Market Softening"],
      unclear: [
        "แนวโน้มตลาดเรือเทกองยังไม่ชัดเจน",
        "Dry Bulk Market Direction Unclear",
      ],
    },
    explanation:
      "ใช้ประกอบการประเมินภาวะตลาดขนส่งสินค้าเทกอง ไม่ใช่ราคาจองตู้คอนเทนเนอร์ และไม่ยืนยันว่าค่าระวางในเส้นทางของบริษัทจะเปลี่ยนไปในทิศทางเดียวกัน",
    pending: "ยังไม่เปิดใช้การประเมิน — กติกา BDI ยังรอตกลง",
  },
  ZIM: {
    title: "สัญญาณจากหุ้นสายเรือ",
    en: "Shipping Equity Context",
    statuses: {
      pressure_up: [
        "หุ้นสายเรือส่งสัญญาณเชิงบวก",
        "Positive Shipping Equity Signal",
      ],
      easing: [
        "หุ้นสายเรือส่งสัญญาณอ่อนตัว",
        "Weakening Shipping Equity Signal",
      ],
      unclear: [
        "สัญญาณจากหุ้นสายเรือยังไม่ชัดเจน",
        "Shipping Equity Signal Unclear",
      ],
    },
    explanation:
      "ใช้การเคลื่อนไหวของหุ้น ZIM เป็นข้อมูลประกอบ หุ้นอาจได้รับผลจากปัจจัยเฉพาะบริษัท จึงต้องประเมินร่วมกับข้อมูลค่าระวางรายเส้นทางและใบเสนอราคาจริง",
    pending:
      "ยังไม่เปิดใช้การประเมิน — รอตรวจความหมายสถานะจากสคริปต์ SavePulse ของ ZIM",
  },
};
// The status dictionary is a DEMO copy palette, not a BUY/SELL adapter.
// No real/test source is approved for assessment until separate rule/mapping review.
function contextView(row) {
  if (!FREIGHT_CONTEXT[row.symbol]) return row;
  const result = {
    ...row,
    windowState: null,
    windowDay: null,
    windowStart: null,
    confirmationBarTime: null,
  };
  if (row.dataMode !== "demo") {
    result.assessmentStatus = "not_enabled";
    result.current = false;
    result.signalStatus = null;
    if (row.dataStatus === "current") result.dataStatus = "assessment_pending";
  } else {
    result.assessmentStatus = "demo_only";
    if (
      row.current &&
      !FREIGHT_CONTEXT[row.symbol].statuses[row.signalStatus]
    ) {
      result.current = false;
      result.signalStatus = null;
      result.dataStatus = "context_mapping_pending";
    }
  }
  return result;
}
function contextCopy(row) {
  const meta = FREIGHT_CONTEXT[row.symbol];
  if (!meta) return null;
  const view = contextView(row);
  const status =
    view.current && view.dataMode === "demo"
      ? meta.statuses[view.signalStatus]
      : null;
  return {
    ...meta,
    statusTh: status?.[0] || null,
    statusEn: status?.[1] || null,
  };
}
if (typeof module !== "undefined")
  module.exports = { FREIGHT_CONTEXT, contextView, contextCopy };
