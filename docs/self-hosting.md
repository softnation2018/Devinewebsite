# Running the shop on your own server (Docker)

The planned home for the shop is Vercel + Neon (see `launch-checklist.md`).
This guide is the other option: one rented Linux server (for example 2 CPU,
4 GB RAM) running everything with Docker. Setting it up takes some comfort
with a command line. A developer can do it in about an hour.

## What runs

| Part | What it does |
|---|---|
| `db` | PostgreSQL 16, the shop's database. |
| `app` | The shop. On its first start it sets up the database and builds itself (a few minutes). |
| `cron` | Every 10 minutes it releases stock held by unpaid online orders. Every hour it refreshes courier tracking. |
| `backup` | A database backup every night into the `backups/` folder, kept for 14 days. |
| `https` | Optional. Gets a free HTTPS certificate for your domain and serves the shop on it. |

Product photos are stored in a Docker volume (`media`) unless you set
`MEDIA_STORAGE=r2` to use Cloudflare R2.

## First start

1. Install Docker on the server, then copy this repository onto it.
2. Copy `.env.example` to `.env` and fill it in on the server:
   - `POSTGRES_PASSWORD`: letters and digits only. Make one with `openssl rand -hex 24`.
   - `AUTH_SECRET` and `CRON_SECRET`: make each with `openssl rand -hex 32`.
   - `NEXT_PUBLIC_SITE_URL`: your web address, for example `https://divinemantra.in`.
   - `SITE_DOMAIN`: the same domain without `https://`, for example `divinemantra.in`.
   - `ADMIN_SEED_EMAIL`: the owner's email. That account becomes the shop owner.
   - Email, Razorpay and courier keys, as described in the other guides.
   - Delete the `DATABASE_URL` line. Docker sets it.
   - Leave `ALLOW_INDEXING` empty until you are ready to launch.
3. Point your domain's DNS **A record** at the server's IP address.
4. Start everything:
   ```sh
   docker compose --profile https up -d --build
   ```
5. Wait a few minutes, then open your domain. On a brand-new database the shop
   creates the categories, settings, policy drafts and the owner account. It
   adds **no** demo products.
6. On the sign-in page, choose **Forgot password** and enter the owner's email
   to set a password. No password is ever stored in a file.

Check that it is healthy: `curl https://YOUR-DOMAIN/api/health` should
answer `{"ok":true}`.

## Updating to a new version

```sh
git pull
docker compose --profile https up -d --build
```

Database changes are applied automatically when the shop starts. Back up first (see below).

Changing a `NEXT_PUBLIC_…` value or `ALLOW_INDEXING` needs a new build:
```sh
docker compose up -d --build --force-recreate app
```

## Backups

### Where they are

- Every night at 02:30 India time, a database backup is written to
  `backups/divine-mantra-YYYYMMDD-HHMMSS.dump` next to `docker-compose.yml`.
- The last 14 days are kept. To keep longer, change `BACKUP_KEEP_DAYS`.
- Backups contain customer names, addresses and orders. Only the server's
  administrator account can read them.

### Keep a copy somewhere else

If the server is lost, backups stored on it are lost too. Copy the
`backups/` folder off the server at least weekly, for example:

- with `rclone` to Cloudflare R2, Google Drive or another cloud store, on a daily schedule; or
- with your hosting company's snapshot feature.

Product photos in the `media` volume need the same care. Using R2 for photos
(`MEDIA_STORAGE=r2`) avoids this.

### Make a backup right now (before an update)

```sh
docker compose exec backup sh -c 'pg_dump --format=custom --no-owner --file=/backups/divine-mantra-manual-$(date -u +%Y%m%d-%H%M%S).dump "$DATABASE_URL"'
```

### Restore a backup

This **replaces** everything in the shop's database with the backup.

```sh
docker compose stop app cron
docker compose exec -T db dropdb -U divine divine_mantra
docker compose exec -T db createdb -U divine divine_mantra
docker compose exec -T db pg_restore -U divine -d divine_mantra --no-owner < backups/THE-FILE.dump
docker compose start app cron
```

Practise a restore once on a spare server before launch, so you know it works.

## Useful commands

```sh
docker compose ps                  # what is running
docker compose logs -f app         # the shop's log
docker compose logs backup         # did last night's backup work?
docker compose down                # stop everything (data is kept)
```

`docker compose down -v` **deletes the database and photos**. Don't run it on a live shop.
