"use strict";
const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("savepulse_session") || "",
  verifiedEmail = "",
  company = null,
  busy = false,
  sandboxReady = false;
const labels = {
  pressure_up: "แรงกดดันราคาสูงขึ้น",
  easing: "ผ่อนคลาย",
  unclear: "ยังไม่ชัดเจน",
};
const statusLabels = {
  source_freshness_unknown: "ไม่ทราบเวลาอัปเดตต้นทาง · ไม่แสดงสัญญาณปัจจุบัน",
  stale: "ข้อมูลเก่า · ไม่แสดงสัญญาณปัจจุบัน",
  missing: "ยังไม่มีข้อมูล",
  freshness_policy_pending: "ยังไม่ยืนยันเกณฑ์ความสด",
};
const date = (value) =>
  value
    ? new Date(value).toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const message = (value) => {
  $("message").textContent = value;
};
async function loadDemo() {
  const r = await fetch("/freightpulse/demo.json", { cache: "no-store" });
  if (!r.ok) throw Error("ยังโหลด Demo ไม่ได้");
  const data = await r.json();
  if (data.mode !== "demo") throw Error("ข้อมูลนี้ไม่ใช่ Demo");
  return data;
}
async function api(path, body, auth = true) {
  const r = await fetch(`/api/v1/freightpulse/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data;
  try {
    data = await r.json();
  } catch (_) {
    throw Error("ยังไม่เชื่อมระบบสมาชิกทดสอบใน Preview นี้");
  }
  if (!r.ok)
    throw Error(
      {
        freight_sandbox_disabled: "ระบบสมาชิกทดสอบยังไม่เปิดบน environment นี้",
        sandbox_test_mailbox_required:
          "การทดสอบอีเมลจำกัดเฉพาะ savepulse.cloud@gmail.com",
        authentication_required: "กรุณายืนยันอีเมลก่อน",
        freight_membership_required:
          "ยังไม่มีสิทธิ์ FreightPulse ที่ตรวจยืนยันแล้ว สิทธิ์ SavePulse ไม่เปิด FreightPulse ให้อัตโนมัติ",
        stripe_sandbox_not_configured: "ยังไม่ได้เชื่อมและตรวจ Stripe sandbox",
        company_setup_required: "กรุณาสร้าง workspace บริษัทก่อน",
        use_billing_portal: "มี subscription อยู่แล้ว กรุณาใช้ Billing Portal",
      }[data.error] || "เซิร์ฟเวอร์ยังยืนยันรายการนี้ไม่ได้ กรุณาลองใหม่",
    );
  return data;
}
async function act(fn) {
  if (busy) return;
  busy = true;
  message("กำลังตรวจสอบกับเซิร์ฟเวอร์…");
  try {
    await fn();
  } catch (e) {
    message(e.message);
  } finally {
    busy = false;
  }
}
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function card(row) {
  const node = el("article", undefined, "card");
  node.append(
    el("span", row.dataMode === "demo" ? "DEMO" : "TEST DATA", "badge demo"),
    el("h3", FREIGHT_ROUTES[row.symbol]?.name || row.symbol),
  );
  if (row.family === "container")
    node.append(
      el(
        "small",
        `${row.symbol} · ${FREIGHT_ROUTES[row.symbol]?.benchmark || "Unknown route"} · USD/FEU (40-foot container)`,
      ),
    );
  node.append(
    el(
      "p",
      row.current
        ? labels[row.signalStatus] || "ยังไม่ชัดเจน"
        : statusLabels[row.dataStatus] || "ยังไม่มีข้อมูล",
      "status " + (row.current ? row.signalStatus : row.dataStatus),
    ),
  );
  if (row.current && row.windowDay) {
    node.append(
      el(
        "div",
        `ช่วงพิจารณา · วันที่ ${row.windowDay}/5 แท่งที่มีข้อมูล\nเริ่ม ${date(row.windowStart)} · แท่งล่าสุด ${date(row.barTime)}`,
        "window",
      ),
    );
  }
  if (row.current && row.windowState === "expired")
    node.append(
      el(
        "small",
        "ช่วงพิจารณาเดิมหมดอายุแล้ว — ไม่ได้หมายความว่าค่าระวางเริ่มลดลง",
      ),
    );
  if (row.current && row.windowState === "invalidated")
    node.append(el("small", "ช่วงพิจารณาเดิมถูกยกเลิกแล้ว"));
  node.append(
    el("small", `ต้นทางอัปเดต: ${date(row.sourceUpdatedAt)}`),
    el("small", `รับ webhook: ${date(row.receivedAt)}`),
    el("small", `แหล่งข้อมูล: ${row.source || "ยังไม่เชื่อมแหล่งข้อมูล"}`),
  );
  if (!row.current)
    node.append(
      el("small", "รอข้อมูลที่ผ่านการตรวจความสดก่อนใช้ประเมินจังหวะ"),
    );
  return node;
}
function render(data) {
  $("modeLabel").textContent =
    data.mode === "demo"
      ? "DEMO — ข้อมูลจำลอง ไม่ใช่ตลาดจริง"
      : "SANDBOX — ข้อมูลทดสอบ ไม่ใช่บริการที่เปิดขาย";
  $("updated").textContent =
    `ประมวลผลรายงาน: ${date(data.generatedAt)} · ตรวจความสดจากเวลาต้นทาง แยกจากเวลารับ webhook`;
  $("routes").replaceChildren(...data.routes.map(card));
  $("context").replaceChildren(...data.context.map(card));
  $("history").replaceChildren(
    ...(data.history || []).map((h) =>
      el(
        "li",
        `${h.dataMode === "demo" ? "DEMO · ไม่ได้ส่งอีเมลจริง" : "TEST"} · ${h.symbol} · ${h.status} · ${date(h.at)}`,
      ),
    ),
  );
  if (!(data.history || []).length)
    $("history").append(el("li", "ยังไม่มีประวัติการส่ง"));
}
function drawAccount(value) {
  company = value;
  $("companyForm").hidden = Boolean(value);
  $("emailForm").hidden = Boolean(value);
  $("codeForm").hidden = true;
  $("accountStatus").textContent = value
    ? `${value.name} · ${value.access ? "มีสิทธิ์ทดสอบที่ยืนยันจากเซิร์ฟเวอร์" : "ยังไม่มีสิทธิ์รายงานสมาชิก"} · ${value.billing?.status || "ยังไม่สมัคร"}${value.billing?.periodEnd ? ` · สิ้นรอบ ${date(value.billing.periodEnd)}` : ""}${value.billing?.cancelAtPeriodEnd ? " · ยกเลิกต่ออายุแล้ว" : ""}`
    : "อีเมลยืนยันแล้ว กรุณาสร้าง workspace บริษัท";
  for (const id of [
    "checkoutButton",
    "portalButton",
    "savePreferences",
    "routePreferences",
    "emailEnabled",
  ])
    $(id).disabled = !value;
  if (value) {
    $("emailEnabled").checked = value.preferences.email;
    document.querySelectorAll("#routePreferences input").forEach((i) => {
      i.checked = value.preferences.routes.includes(i.value);
    });
  }
}
for (const symbol of ["CS11!", "CS21!", "CS31!", "CS41!", "CS51!", "CS61!"]) {
  const label = el("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = symbol;
  label.append(
    input,
    document.createTextNode(
      " " + (FREIGHT_ROUTES[symbol]?.name || symbol) + " · " + symbol,
    ),
  );
  $("routePreferences").append(label);
}
$("demoButton").onclick = () =>
  act(async () => {
    render(await loadDemo());
    message("กำลังแสดง Demo เท่านั้น ข้อมูลจำลองไม่ใช้เปิดสิทธิ์สมาชิก");
  });
$("reportButton").onclick = () =>
  act(async () => {
    render(await api("report"));
    message("รายงานสมาชิกทดสอบยืนยันจากหลังบ้านแล้ว");
  });
$("emailForm").onsubmit = (e) => {
  e.preventDefault();
  act(async () => {
    verifiedEmail = $("email").value.trim().toLowerCase();
    if (!sandboxReady) throw Error("ยังไม่เชื่อมระบบสมาชิกทดสอบใน Preview นี้");
    await api("auth/code", { email: verifiedEmail }, false);
    $("codeForm").hidden = false;
    message(
      "ตรวจอีเมลและกรอกรหัสในหน้านี้ การยืนยันอีเมลไม่เริ่ม trial ของบริการใด",
    );
  });
};
$("codeForm").onsubmit = (e) => {
  e.preventDefault();
  act(async () => {
    if (!sandboxReady) throw Error("ยังไม่เชื่อมระบบสมาชิกทดสอบใน Preview นี้");
    const d = await api(
      "auth/verify",
      { email: verifiedEmail, code: $("code").value },
      false,
    );
    $("code").value = "";
    if (!d.token) throw Error("รหัสไม่ถูกต้องหรือหมดอายุ");
    token = d.token;
    localStorage.setItem("savepulse_session", token);
    drawAccount((await api("account")).company);
    message("ยืนยันอีเมลแล้ว ยังไม่มีการชำระเงินหรือเริ่ม trial");
  });
};
$("companyForm").onsubmit = (e) => {
  e.preventDefault();
  act(async () => {
    drawAccount(
      (await api("company", { name: $("companyName").value })).company,
    );
    message("สร้าง workspace ทดสอบแล้ว ยังไม่ได้เปิดสิทธิ์เสียเงิน");
  });
};
$("preferencesForm").onsubmit = (e) => {
  e.preventDefault();
  act(async () => {
    drawAccount(
      (
        await api("preferences", {
          routes: [
            ...document.querySelectorAll("#routePreferences input:checked"),
          ].map((i) => i.value),
          email: $("emailEnabled").checked,
        })
      ).company,
    );
    message("บันทึกการตั้งค่าจากเซิร์ฟเวอร์แล้ว");
  });
};
for (const action of ["checkout", "portal"])
  $(action + "Button").onclick = () =>
    act(async () => {
      const d = await api(action, {});
      const target = new URL(d.url);
      if (
        d.mode !== "test" ||
        target.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(target.hostname)
      )
        throw Error("ยังยืนยันลิงก์ Stripe sandbox ไม่ได้");
      window.location.assign(target.href);
    });
act(async () => {
  render(await loadDemo());
  try {
    sandboxReady =
      (await api("catalog", undefined, false)).sandboxEnabled === true;
  } catch (_) {
    sandboxReady = false;
  }
  document
    .querySelectorAll("#emailForm input,#emailForm button")
    .forEach((n) => {
      n.disabled = !sandboxReady;
    });
  if (!sandboxReady) {
    message("Demo เท่านั้น ระบบสมาชิก sandbox ยังไม่เชื่อมใน Preview นี้");
    return;
  }
  if (token) {
    try {
      drawAccount((await api("account")).company);
    } catch (e) {
      message(e.message);
      return;
    }
  }
  message("Demo เท่านั้น ยังไม่เชื่อม Pine Script หรือเปิดขายจริง");
});
