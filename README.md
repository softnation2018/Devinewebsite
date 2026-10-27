# Divine Mantra

Premium Indian spiritual and Vastu products store. A self-hosted e-commerce
application: Next.js 15, TypeScript, Tailwind CSS, PostgreSQL and Prisma.

## Run it locally

You need Node.js 22 and PostgreSQL 16.

```bash
npm install
cp .env.example .env          # then set DATABASE_URL to your local database
npx prisma migrate dev        # creates every table
npm run db:seed               # adds clearly labelled demo products
npm run dev                   # http://localhost:3000
```

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload |
| `npm run build` | Production build |
| `npm test` | Unit tests (no database needed) |
| `npm run test:db` | Database safety tests (needs PostgreSQL) |
| `npm run typecheck` | TypeScript check |
| `npm run db:seed` | Load demo categories, products and placeholder settings |
| `npx prisma migrate dev` | Apply database migrations locally |
| `npx prisma studio` | Browse the database in your browser |

## Payments

Online payment is off until Razorpay keys are set. See [docs/razorpay-setup.md](docs/razorpay-setup.md).

## Shipping

Parcels can be recorded by hand from day one. iThink Logistics and Shiprocket
switch on when their credentials are set. See [docs/shipping-setup.md](docs/shipping-setup.md).

## Product photos

Staff add photos on each product's admin page. The browser shrinks each photo
(1600px, plus a 600px copy for product cards) before uploading, which also
removes hidden camera data such as GPS location.

Where photos are kept is set by `MEDIA_STORAGE`:

- `local`: a folder on the server (`MEDIA_DIR`, default `storage/media`). This
  is the default in development. On a VPS, put it on a persistent disk.
- `r2`: Cloudflare R2. Needed on Vercel, whose disk is not kept. Create a
  bucket with a public custom domain, then an API token limited to that bucket
  with Object Read & Write, and set the `R2_*` variables in the hosting
  dashboard (never in the code or in chat).

In production with neither set, photo uploads are switched off and the shop
shows its "Photo coming soon" placeholder.

## Pages, contact and search engines

- **Policies** (privacy, terms, shipping, returns, cancellation) are edited by the owner in Admin → Pages. They stay as drafts until the text is complete and you tick that it has been reviewed. The shop does not write policies for you.
- **Contact page** (`/contact`) stores every message in Admin → Messages and, if a support email is set in Admin → Settings, also emails it there. Email, phone, WhatsApp and hours appear only once you enter them in Settings. A WhatsApp chat button appears when the WhatsApp number is set.
- **Newsletter** sign-up in the footer uses double opt-in: an address counts only after its owner confirms from the email. It needs `AUTH_SECRET`; without it the form is hidden.
- **Google**: `/sitemap.xml` lists real (non-demo) products, categories and published policies. Every page asks search engines not to index the site until `ALLOW_INDEXING=true` is set on the live site (then redeploy).
- **Analytics**: Google Analytics 4 and the Meta pixel load only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_META_PIXEL_ID` are set. With them empty, no tracking script is added.

## Secrets

Never commit real keys or passwords. `.env.example` lists every variable with
placeholder values only. Real values go in `.env` locally (git ignores it) and
in the hosting dashboard in production.

## Demo content

Everything `npm run db:seed` creates is marked as demo: products have
`isDemo = true` and "(Demo)" in their name. Store settings the owner has not
decided yet (shipping charges, COD rules, return window, business details)
are seeded as placeholders with `needsOwnerDecision = true`. Legal pages are
seeded as unpublished drafts.
