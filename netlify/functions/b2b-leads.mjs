import { createHmac } from 'node:crypto';
// Only platform-signed form events reach this handler; no public fetch endpoint.
export async function forwardLead(data, env, fetcher = fetch) {
  if (data.source !== 'Website B2B' || data['privacy-version'] !== '2026-10-12') return;
  const endpoint = env.get('B2B_CRM_ENDPOINT');
  const secret = env.get('B2B_CRM_SECRET');
  if (!endpoint || !secret) throw new Error('B2B CRM connection is not configured; recover the submission from Netlify Forms.');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) throw new Error('Invalid CRM endpoint');
  const payload = JSON.stringify(data);
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret).update(timestamp + '.' + payload).digest('hex');
  const response = await fetcher(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp, signature, payload }), signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('CRM delivery failed; recover from Netlify Forms.');
  const result = await response.json();
  if (!result.ok) throw new Error('CRM did not accept the submission; recover from Netlify Forms.');
}
export default { async formSubmitted(event) { await forwardLead(event.data, Netlify.env); } };
