#!/bin/sh
# One-command preview server on an Oracle Cloud "Always Free" Ubuntu VM.
#
#   curl -fsSL https://raw.githubusercontent.com/softnation2018/Devinewebsite/oracle-preview/docker/oracle-setup.sh | sudo sh
#
# It installs Docker from Ubuntu's own packages, opens ports 80 and 443 in the
# VM's firewall, downloads the shop, writes a .env with fresh random secrets,
# and starts everything with HTTPS on a free address of the form
# 1-2-3-4.sslip.io (built from the server's public IP). Demo products are
# shown and emails are only written to the log: this is a preview, not the
# real shop. Running it again keeps the existing .env and data.
set -eu

BRANCH="${BRANCH:-oracle-preview}"
DIR=/opt/divine-mantra

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo." >&2; exit 1; fi

echo "== Installing Docker"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io docker-compose-v2 git curl openssl iptables-persistent

echo "== Opening ports 80 and 443 in the VM firewall"
# Oracle's Ubuntu images reject everything except SSH by default.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport "$port" -j ACCEPT
done
netfilter-persistent save >/dev/null

echo "== Downloading the shop"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" https://github.com/softnation2018/Devinewebsite.git "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  IP="${PUBLIC_IP:-$(curl -fsS https://api.ipify.org)}"
  DOMAIN="$(echo "$IP" | tr . -).sslip.io"
  echo "== Writing settings for https://$DOMAIN"
  umask 077
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 32)
SITE_DOMAIN=$DOMAIN
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
NEXT_PUBLIC_SITE_NAME=Divine Mantra
MEDIA_STORAGE=local
EMAIL_PROVIDER=console
SHOW_DEMO_PRODUCTS=true
APP_PORT=127.0.0.1:3000
ENV
fi

echo "== Starting (the first start builds the shop and takes about 5-10 minutes)"
docker compose --profile https up -d --build

DOMAIN="$(grep ^SITE_DOMAIN= .env | cut -d= -f2)"
echo
echo "Started. In about 10 minutes the shop will open at: https://$DOMAIN"
echo "Watch progress with:  sudo docker compose -f $DIR/docker-compose.yml logs -f app"
echo
echo "To open the admin panel: register on the site, then run (with your email):"
echo "  cd $DIR && sudo docker compose exec db psql -U divine -d divine_mantra -c \"update \\\"User\\\" set role='OWNER' where email='you@example.com'\""
