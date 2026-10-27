# Setting up Razorpay

Online payment stays switched off until these steps are done. Start in
**Test Mode**; nothing here moves real money until you switch to Live Mode
and repeat the steps with live keys.

Never paste keys into chat, email or the code. They go only into the
hosting provider's environment variables (or `.env` on your own computer).

## 1. API keys

1. Sign in to the Razorpay Dashboard and turn on **Test Mode** (top bar).
2. Go to **Account & Settings → API Keys** and generate a key.
3. Add the two values as environment variables:
   - `RAZORPAY_KEY_ID` (starts with `rzp_test_`)
   - `RAZORPAY_KEY_SECRET`

## 2. Payment capture

In **Account & Settings → Payment Capture**, choose automatic capture.
(If it is left on manual, the shop captures payments itself, but automatic
is simpler.)

## 3. Webhook

1. Go to **Account & Settings → Webhooks → Add New Webhook**.
2. Webhook URL: `https://<your-domain>/api/webhooks/razorpay`
3. Secret: make up a long random value (for example the output of
   `openssl rand -hex 32`) and add it as `RAZORPAY_WEBHOOK_SECRET`.
4. Tick these events: `payment.authorized`, `payment.captured`,
   `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.

## Refunds

An Admin (or Owner) refunds an online order from its page in Admin → Orders.
The shop asks Razorpay to refund the payment. The refund shows as **done**
only when Razorpay reports it as processed, either straight away or later
through the `refund.processed` webhook.

If Razorpay gives no answer (for example a network error), the refund stays
"in progress" and is **not** retried automatically. Look up the payment in
the Razorpay dashboard, then record on the order page whether a refund
exists. If it does, enter its `rfnd_…` id.

COD orders are refunded by you, by UPI or bank transfer. Then record the
transfer's reference number on the order page.

## 4. Unpaid-order clean-up

Set `CRON_SECRET` to another long random value. On Vercel, `vercel.json`
already schedules `/api/cron/release-unpaid` every 10 minutes; Vercel sends
the secret automatically. On a VPS, call it from cron:

```
*/10 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/release-unpaid
```

Online orders not paid within 30 minutes are cancelled and their stock is
released. Each one is checked with Razorpay first, so a payment whose
notification was lost is recorded instead of cancelled.

## 5. Test it

With test keys, use Razorpay's test cards or test UPI ID from their
documentation. Then check, in the Razorpay Dashboard, that the payment shows
as captured, and on the order page that the order shows as Paid.

## How payment is trusted

- The amount is set by the server when the Razorpay order is created.
- The browser's success message is only a prompt: the server checks the
  signature and then asks Razorpay's API for the payment before marking
  the order paid. A captured payment for the wrong amount is never accepted.
- Webhooks are verified with the webhook secret and processed once per
  Razorpay event id.
