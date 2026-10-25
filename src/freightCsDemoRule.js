"use strict";
const RULE_VERSION = "freightpulse.cs.rebound-next-4.v1";
// Reference evaluator for ONE cycle only, for sandbox fixtures/Pine agreement.
// After the first window ends it never invents a restart/cancellation/rollover rule.
function firstCsWindow(bars) {
  let waiting = false,
    confirmationBarTime = null,
    windowStart = null,
    day = 0;
  let previous = null;
  return bars.map((bar) => {
    const time = Date.parse(bar.time);
    if (
      !Number.isFinite(time) ||
      !Number.isFinite(bar.close) ||
      bar.closed !== true ||
      (previous && time <= Date.parse(previous.time))
    )
      throw Error("ordered_closed_daily_data_required");
    let windowState = "inactive",
      windowDay = null;
    if (confirmationBarTime !== null) {
      day++;
      if (day <= 4) {
        windowStart ||= new Date(time).toISOString();
        windowState = "active";
        windowDay = day;
      } else windowState = "expired";
    } else if (previous) {
      if (waiting && bar.close > previous.close)
        confirmationBarTime = new Date(time).toISOString();
      else if (bar.close < previous.close) waiting = true;
    }
    previous = bar;
    return {
      ruleVersion: RULE_VERSION,
      confirmationBarTime,
      windowState,
      windowDay,
      windowStart: windowState === "active" ? windowStart : null,
    };
  });
}
module.exports = { RULE_VERSION, firstCsWindow };
