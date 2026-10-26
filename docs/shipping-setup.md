# Setting up couriers

The shop can ship in three ways. You can start with the first one today.

1. **By hand.** Book the parcel on any courier's website or at their counter,
   then on the order page in Admin choose "Another courier", and type the
   courier's name, the tracking (AWB) number and the tracking link. You mark it
   "handed to courier" and "delivered" yourself.
2. **iThink Logistics** (main courier). The shop books the parcel, gets the AWB,
   prints the label and checks tracking every hour by itself.
3. **Shiprocket** (second courier). The shop books the parcel and gets the AWB.
   Tracking is through Shiprocket's own tracking link.

The shop never sends the same order to both couriers, and never books a second
parcel while one is active. To switch courier, cancel the first booking (only
possible before pickup), then book again.

## iThink Logistics

1. Ask your iThink account manager for **API access**: an access token and a
   secret key. Ask for **staging** keys first, for testing.
2. In the iThink panel, add your pickup warehouse and return address. Note the
   **id** of each.
3. In your hosting dashboard (Vercel → Project → Settings → Environment
   Variables), add:
   - `ITHINK_ACCESS_TOKEN`, `ITHINK_SECRET_KEY` (secret, never share them in chat)
   - `ITHINK_PICKUP_ADDRESS_ID`, `ITHINK_RETURN_ADDRESS_ID`
   - For staging only: `ITHINK_BASE_URL` and `ITHINK_TRACK_BASE_URL` both set to
     `https://pre-alpha.ithinklogistics.com/api_v3`
4. Redeploy. "iThink Logistics" now appears on each order's Shipping panel.
5. Book one test order on staging and check in the iThink panel that the
   order, address, weight and COD amount are right.

Points to confirm with iThink while testing, because their documentation is
not clear on them:
- Weight is sent in **kilograms** (as their field table says), for example
  0.35 for 350 g.
- Order cancellation is sent to `…/api_v3/order/cancel.json` on the same host
  as order creation. Their page shows this path only on the staging host.
- iThink has no documented webhook, so tracking is checked every hour.

## Shiprocket

1. In Shiprocket, go to Settings → API → Configure and create an **API user**
   (a different email from your own login). Shiprocket only lets API users use
   the API.
2. Note the exact name of your pickup location (Settings → Pickup Addresses).
3. In the hosting dashboard add `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`
   (secret) and `SHIPROCKET_PICKUP_LOCATION`.
4. Redeploy and book one test order.

## Cash on delivery

For a COD order, the money goes: customer → courier → your bank (a few days
later, in a batch). So the shop shows three steps:

- **Awaiting delivery**: nothing collected yet.
- **Collected by courier, payout pending**: the courier reports the parcel
  delivered. The order is still **not paid** in the shop's books.
- **Paid out to us**: you enter the bank reference (UTR) and date from the
  courier's remittance statement. Only now is the order marked paid.

If the payout amount differs from the order amount (courier deductions), the
shop refuses to mark it paid. Settle the difference with the courier first.

## Tracking

Tracking updates are stored exactly as the courier sends them and shown to
the customer on their order page. The shop never writes tracking updates of
its own. Parcels sent "by hand" show only the courier's tracking link, plus
the steps you mark yourself.
