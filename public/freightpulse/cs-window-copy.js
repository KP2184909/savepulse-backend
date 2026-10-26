"use strict";
function csWindowCopy(row) {
  if (
    ![
      "freightpulse.cs.rebound-next-4.v1",
      "freightpulse.cs.rebound-next-4.lower-close-stop.v1",
    ].includes(row.ruleVersion)
  )
    return null;
  if (row.windowState === "expired")
    return {
      th: "สิ้นสุดช่วงพิจารณาล็อกค่าระวาง",
      en: "Rate-Locking Window Ended",
      explanation: "การสิ้นสุดช่วงไม่ได้หมายความว่าราคาเริ่มลง",
    };
  if (
    row.windowState !== "active" ||
    !Number.isInteger(row.windowDay) ||
    row.windowDay < 1 ||
    row.windowDay > 4
  )
    return null;
  return {
    th: `ช่วงน่าพิจารณาล็อกค่าระวาง — วันที่ ${row.windowDay}/4`,
    en: `Favourable Rate-Locking Window — Day ${row.windowDay} of 4`,
    explanation:
      "ระบบพบสัญญาณเริ่มกลับขึ้นของค่าระวาง เป็นช่วงที่น่าพิจารณาขอราคาและล็อกเงื่อนไขการจอง โดยฝ่ายจัดซื้อควรประเมินร่วมกับใบเสนอราคาปัจจุบัน พื้นที่เรือ และกำหนดส่งสินค้า",
  };
}
if (typeof module !== "undefined") module.exports = { csWindowCopy };
