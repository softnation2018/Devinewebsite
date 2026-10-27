# Preview on Vercel's free plan

This branch (`vercel-preview`) is set up for a look-only preview on Vercel's
Hobby plan. Hobby is for non-commercial use, so take real orders only on
Vercel Pro or your own server (see docs/self-hosting.md).

1. Import the repository in Vercel.
2. Environment variables: `SHOW_DEMO_PRODUCTS=true`, `EMAIL_PROVIDER=console`,
   `AUTH_SECRET` and `CRON_SECRET` (long random text each).
3. Storage → Create Database → Neon or Prisma Postgres, connected to the
   project. Any prefix works; the app finds the `postgres://` address.
4. Production branch: `main` (or `vercel-preview`).
5. Redeploy.

Owner sign-in: open `/account/setup-owner?token=<token>`, where the token is
the base64url HMAC-SHA256 of `owner-setup:v1` keyed with `AUTH_SECRET`
(`node -e "console.log(require('crypto').createHmac('sha256', process.env.AUTH_SECRET).update('owner-setup:v1').digest('base64url'))"`).
The page works only until the first owner exists. Or add `OWNER_EMAIL` and `OWNER_PASSWORD` (at least 10
characters) and redeploy. The build creates that owner account once, only
while the shop has no owner. Sign in at /account/login, then delete
`OWNER_PASSWORD` from the settings.

Photos: with no `MEDIA_STORAGE` set, Vercel keeps product photos in the
database (`MediaObject` table), since Vercel has no lasting disk. That suits
a preview; use Cloudflare R2 (`MEDIA_STORAGE=r2`) for the real shop.

Cron jobs run once a day here (Hobby's limit), so unpaid online orders are
released daily rather than after 30 minutes.
