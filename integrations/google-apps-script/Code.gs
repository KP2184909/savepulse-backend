/** Activation requires owner authorisation. No automatic cold outreach. */
// Account identifiers are private Script Properties, not public repository content.
function output_(x) { return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON); }
function text_(x,n) { return String(x || '').trim().slice(0,n); }
function cell_(x) { const s=String(x || ''); return /^[=+\-@\t\r]/.test(s) ? "'"+s : s; }
function key_(s) { return text_(s,200).toLowerCase().replace(/\s+/g,' '); }
function doPost(e) {
  try {
    const envelope=JSON.parse(e.postData.contents);
    const props=PropertiesService.getScriptProperties();
    const secret=props.getProperty('B2B_CRM_SECRET');
    const SP_CRM_ID=props.getProperty('B2B_CRM_SPREADSHEET_ID');
    const SP_OWNER=props.getProperty('B2B_OWNER_EMAIL');
    if(!SP_CRM_ID || !SP_OWNER || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SP_OWNER)) return output_({ok:false});
    if (!secret || !/^\d{13}$/.test(envelope.timestamp) || Math.abs(Date.now()-Number(envelope.timestamp))>300000 || typeof envelope.payload!=='string' || envelope.payload.length>10000) return output_({ok:false});
    const sig=Utilities.computeHmacSha256Signature(envelope.timestamp+'.'+envelope.payload,secret).map(b=>(b&255).toString(16).padStart(2,'0')).join('');
    if(sig!==envelope.signature) return output_({ok:false});
    const d=JSON.parse(envelope.payload);
    if(d.source!=='Website B2B' || d.consent!=='yes' || d['bot-field'] || d['privacy-version']!=='2026-10-12') return output_({ok:false});
    const email=text_(d.email,254).toLowerCase(), company=text_(d.company,160), country=text_(d.country,80);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !company || !country || !text_(d.position,120) || !text_(d.problem,1500)) return output_({ok:false});
    const requestId=text_(d['request-id'],80);
    if(!/^[a-zA-Z0-9-]{10,80}$/.test(requestId)) return output_({ok:false});
    const lock=LockService.getScriptLock();lock.waitLock(20000);
    try {
      const ss=SpreadsheetApp.openById(SP_CRM_ID), leads=ss.getSheetByName('WebsiteLeads'), events=ss.getSheetByName('LeadEvents'), legacy=ss.getSheetByName('Leads');
      if(!leads || !events || !legacy) return output_({ok:false});
      const eventRows=events.getDataRange().getValues();
      if(eventRows.slice(1).some(r=>r[0]===requestId)) return output_({ok:true,duplicate:true});
      const rows=leads.getDataRange().getValues(), old=legacy.getDataRange().getValues().slice(1);
      const legacyMatches=old.filter(r=>key_(r[8])===email);
      const suppressed=legacyMatches.some(r=>r[21]==='YES');
      const existing=rows.slice(1).findIndex(r=>key_(r[3])===email);
      const companyKey=key_(company)+'|'+key_(country);
      const companyMatch=rows.slice(1).some(r=>r[20]===companyKey);
      const isTest=company.startsWith('SavePulse Internal QA') && email===SP_OWNER.toLowerCase();
      const now=new Date().toISOString(), isPilot=d.interest==='Paid pilot discussion (subject to agreement)';
      let leadId,rowNum,ack='Pending',owner='Pending';
      if(existing>=0) {
        rowNum=existing+2;leadId=rows[rowNum-1][0];ack=rows[rowNum-1][18];owner=rows[rowNum-1][19];
        leads.getRange(rowNum,13).setValue(now);
        // Do not overwrite stage, billing evidence, original consent or suppression.
        if(suppressed) leads.getRange(rowNum,18).setValue('YES');
      } else {
        leadId='WEB-'+Utilities.getUuid();rowNum=leads.getLastRow()+1;
        leads.appendRow([leadId,company,country,email,text_(d.position,120),text_(d.persona,80),text_(d.problem,1500),text_(d.interest,100),'Website B2B',(['LinkedIn','Partner','Email','YouTube'].includes(d.channel)?d.channel:'Website'),isTest?'Test':'New',now,now,'Review use case; reply in English by email','yes',d['privacy-version'],legacyMatches.map(r=>r[0]).join(', '),suppressed?'YES':'NO','Pending','Pending',companyKey,'','NO',isTest?'INTERNAL QA — exclude from growth metrics':companyMatch?'Company already represented; count once':''].map(cell_));
      }
      const eventRow=events.getLastRow()+1;
      events.appendRow([requestId,leadId,now,isPilot?'Paid pilot interest':'Demo request','Recorded',existing>=0?'Repeated email; stage preserved':companyMatch?'Company duplicate flagged':''].map(cell_));
      SpreadsheetApp.flush();
      // Sending is written BEFORE sending. Ambiguous Sending/Failed states need manual review, never blind resends.
      if(existing<0 && !suppressed && ack==='Pending') {
        leads.getRange(rowNum,19).setValue('Sending');SpreadsheetApp.flush();
        try {
          MailApp.sendEmail({to:email,subject:'Your SavePulse for Business request',name:'SavePulse',replyTo:SP_OWNER,body:'Thank you for your interest in SavePulse for Business.\n\nWe have received your request and will review your use case. The current tool is an early-stage scenario calculator that separates supplier-price and FX effects using manually entered assumptions, and offers a printable executive brief.\n\nIt does not provide live commodity or FX data, ERP integrations, hedging advice or verified cost savings. We can continue entirely in writing by email. Please do not send confidential documents or financial figures.\n\nAny pilot scope, availability, fees and agreement require separate approval. This message does not enrol you in marketing emails. To stop follow-up or ask about your data, reply to this email.\n\nKind regards,\nSavePulse\nhttps://savepulse.cloud/for-business/'});
          leads.getRange(rowNum,19).setValue('Sent');
        } catch(error) { leads.getRange(rowNum,19).setValue('Failed — review before retry'); }
      } else if(suppressed) leads.getRange(rowNum,19).setValue('Suppressed — owner review');
      // The owner receives the acknowledgement for an internal QA submission.
      // Avoid sending a second notification to the same inbox.
      if(isTest) {
        events.getRange(eventRow,5).setValue('Internal QA — owner notification skipped');
        leads.getRange(rowNum,20).setValue('Internal QA — skipped');
        return output_({ok:true});
      }
      // Notify on every NEW request ID; repeated delivery of the same request ID is ignored.
      events.getRange(eventRow,5).setValue('Owner notification sending');SpreadsheetApp.flush();
      try {
        MailApp.sendEmail({to:SP_OWNER,subject:'SavePulse: '+(isPilot?'Paid pilot interest':'Demo request')+' — '+company,body:'New inbound business enquiry.\nCompany: '+company+'\nCountry: '+country+'\nEmail: '+email+'\nPosition: '+text_(d.position,120)+'\nPersona: '+text_(d.persona,80)+'\nProblem: '+text_(d.problem,1500)+'\nSuppressed: '+suppressed+'\nCRM Lead ID: '+leadId+'\nNext action: Review and prepare an English written response. Do not agree to price or contract automatically.\nCRM: https://docs.google.com/spreadsheets/d/'+SP_CRM_ID+'/edit'});
        events.getRange(eventRow,5).setValue('Owner notified');leads.getRange(rowNum,20).setValue('Sent');
      } catch(error) { events.getRange(eventRow,5).setValue('Owner notification failed — review');leads.getRange(rowNum,20).setValue('Failed — review'); }
      return output_({ok:true});
    } finally { lock.releaseLock(); }
  } catch(error) { return output_({ok:false}); }
}
