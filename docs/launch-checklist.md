# Launch checklist

Work through this in order. Items marked **(owner)** need you. Everything
else a developer can do. Nothing here is done until it has been tested on the
live address.

## 1. Accounts and hosting

- [ ] **(owner)** Domain name bought, and you can log in to its DNS settings.
- [ ] **(owner)** Hosting chosen:
  - **Vercel Pro + Neon** (planned): Vercel runs the shop, Neon is the database.
  - **Your own server**: see `self-hosting.md`.
- [ ] Neon project created in the Singapore or Mumbai region. Use its **direct**
      (not "pooled") connection string as `DATABASE_URL`, because database changes need it.
- [ ] **(owner)** Cloudflare R2 bucket for product photos (see README → Product photos).
- [ ] **(owner)** Email sending: a Resend account with your domain verified. Then set `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` and `EMAIL_FROM`.
      Without it, sign-up confirmations, password resets and order emails are **not sent**.

## 2. Settings on the host

Set these in the Vercel dashboard (Project → Settings → Environment
Variables) or in `.env` on your server. Never paste them in chat or commit them.

- [ ] `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`
- [ ] `AUTH_SECRET`, `CRON_SECRET`: long random values
- [ ] `ADMIN_SEED_EMAIL`: the owner's email
- [ ] Photos: `MEDIA_STORAGE=r2` and the `R2_…` values
- [ ] Email: the `EMAIL_…` values
- [ ] Payments: the Razorpay values (`razorpay-setup.md`). Use **test** keys first.
- [ ] Couriers: the iThink and/or Shiprocket values (`shipping-setup.md`)
- [ ] Leave `ALLOW_INDEXING` empty for now

On Vercel, each deployment applies database changes and, on a brand-new
database only, adds the categories, settings, policy drafts and owner account
(no demo products). This is set in `vercel.json`.

## 3. First sign-in and shop setup (owner)

- [ ] Open the site, choose **Forgot password**, enter the owner email, and set a password.
- [ ] Admin → **Settings**: shipping charges, free-shipping limit, COD on/off and fee, support email, phone, WhatsApp and hours.
- [ ] Admin → **Pages**: write or paste each policy, have it reviewed by a professional, then publish it.
      Razorpay asks to see these pages when it activates your account.
- [ ] Admin → **Products**: add real products with photos, prices, GST rate (confirm with your CA), weight and stock.
      Authenticity or certification wording needs the documents tick.
- [ ] Send the logo file, so the "Logo placeholder" can be replaced.
- [ ] Review the "Our promise" wording on the home page.

## 4. Test before opening

On the live address, with Razorpay **test** keys:

- [ ] Register, confirm the email (the email must arrive), sign out, then sign in.
- [ ] Place a COD order. Book it with the courier, print the label, and cancel the booking.
- [ ] Place an online order with a Razorpay test card. The order shows as paid only after Razorpay confirms it.
- [ ] Start an online payment and abandon it. After about 30 minutes the held stock comes back.
- [ ] Contact form: the message appears in Admin → Messages and at the support email.
- [ ] Newsletter: the confirmation email arrives and the link works.
- [ ] Check `https://YOUR-DOMAIN/api/health` answers `{"ok":true}`.
- [ ] On Vercel, check Project → Cron Jobs shows the two jobs succeeding.
- [ ] Backups: Neon's restore window, or last night's file in `backups/`. Do one practice restore.

## 5. Go live

- [ ] Switch Razorpay to **live** keys, after Razorpay activates your account.
- [ ] Switch the couriers to live, after a test parcel.
- [ ] Set `ALLOW_INDEXING=true` and redeploy. Add the site to Google Search Console and submit `/sitemap.xml`.
- [ ] Optional: add `NEXT_PUBLIC_GA_MEASUREMENT_ID` and/or `NEXT_PUBLIC_META_PIXEL_ID`, then redeploy.
      If you use them, your privacy policy must say so.
- [ ] Place one small real order end to end, then refund or cancel it.
