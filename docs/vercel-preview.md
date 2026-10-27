# Preview on Vercel's free plan

This branch (`vercel-preview`) is set up for a look-only preview on Vercel's
Hobby plan. Hobby is for non-commercial use, so take real orders only on
Vercel Pro or your own server (see docs/self-hosting.md).

1. Import the repository in Vercel.
2. Environment variables: `SHOW_DEMO_PRODUCTS=true`, `EMAIL_PROVIDER=console`,
   `AUTH_SECRET` and `CRON_SECRET` (long random text each).
3. Storage → Create Database → Neon, connected to the project. It adds
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
4. Settings → Environments → Production → Branch Tracking: `vercel-preview`.
   Until then Vercel builds `main`, which holds only the README and shows 404.
5. Redeploy.

Cron jobs run once a day here (Hobby's limit), so unpaid online orders are
released daily rather than after 30 minutes.
