"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const{selectBotTaxRateDate}=require('../src/taxFxPolicy');
const at=s=>Date.parse(s)/1000;
test('reference date is not confused with receipt date, holidays/weekends use published announcement day',()=>{assert.equal(selectBotTaxRateDate(at('2026-10-29T13:00:00+07:00')).rateDate,'2026-10-28');assert.equal(selectBotTaxRateDate(at('2026-04-16T13:00:00+07:00')).rateDate,'2026-04-10');assert.equal(selectBotTaxRateDate(at('2026-10-25T13:00:00+07:00')).rateDate,'2026-10-21');});
test('unreviewed years, special closures, early morning and month-end never silently fall back',()=>{for(const s of ['2027-01-05T13:00:00+07:00','2026-10-19T13:00:00+07:00','2026-10-29T01:00:00+07:00','2026-10-30T13:00:00+07:00'])assert.throws(()=>selectBotTaxRateDate(at(s)),/review_required/);});
