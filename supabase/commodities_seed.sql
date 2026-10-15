-- Optional placeholders only. The backend upserts rows on the first valid feed,
-- so this is not required for ingestion. Assumes the existing signals schema
-- used by src/persistence.js; inspect that schema before running in production.
-- Does not alter tables, grants, RLS or existing rows. No fabricated market data.
begin;
insert into public.signals (symbol, action, timeframe, price, received_at, payload)
select symbol, 'WAIT_ZONE', '1D', null, null,
       jsonb_build_object('id', symbol || '-default', 'symbol', symbol,
         'action', 'WAIT_ZONE', 'timeframe', '1D', 'price', null,
         'source', 'default', 'receivedAt', null)
from (values ('BRENTUSD'), ('WTIUSD'), ('NGUSD'), ('COPPERUSD'),
             ('ALUMINUMUSD'), ('SUGARUSD'), ('FCPO')) as assets(symbol)
on conflict (symbol) do nothing;
commit;
