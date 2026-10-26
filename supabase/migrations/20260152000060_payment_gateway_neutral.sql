-- 0060: payments are no longer tied to one gateway
-- Every new order now records the id of the gateway adapter that created it (the app sets `provider` explicitly), so the column
-- must not carry a default that names a particular company. Existing orders keep the value they were written with: it is a
-- record of what really happened.
alter table public.blue_tick_orders alter column provider drop default;

-- Release note for 2.5.1 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.5.1', 'Pay for the blue tick on your payment provider''s own page',
  'Buying the blue tick now takes you to the payment provider''s secure page and brings you back, instead of opening a payment window inside UniSphere.',
  '[{"kind":"improved","text":"When you buy the blue tick you are taken to the payment provider''s own secure page and brought back to UniSphere afterwards. UniSphere no longer loads any payment company''s code on its pages, and it still never sees your card, UPI or bank details."},
    {"kind":"improved","text":"If you close the page before coming back, your payment is still recorded and applied to your account automatically. If it is slow to appear, a Check again link on the blue tick page asks the payment provider again."},
    {"kind":"improved","text":"Administrators can connect any payment provider with a small adapter, and the Payments page shows which one is connected and whether it is ready."}]'::jsonb,
  null)
on conflict (version) do nothing;
