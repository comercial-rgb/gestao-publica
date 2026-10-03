#!/usr/bin/env bash
# ═══ BASE DO SERVIDOR (Ubuntu 24.04) — o que `instalar-no-servidor.sh` confere e não instala ═══
#
# O script de instalação RECUSA versão errada de Node, Postgres, Chromium e fontes, mas não instala
# pacote do sistema (é decisão de quem opera a máquina). Este é o lado que instala, com as versões
# fixadas na mesma linha que o candidato foi construído e testado: Node 22, PostgreSQL 18.
#
# Idempotente: rodar de novo não estraga nada. Rodar como root (sudo bash).
#
# ⚠️ CHROMIUM: no Ubuntu 24.04 o pacote `chromium-browser` é um snap, e o confinamento do snap não
# enxerga o diretório temporário privado da unit (PrivateTmp) — o PDF falha no servidor e passa no
# ensaio. Usa-se o Chrome estável em .deb, com `chromium` apontando para ele (o conferir-runtime
# procura esse nome).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "[base] memória de troca de 4 GB (a máquina tem 4 GB; o build do Next passa disso no pico)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "[base] fuso do servidor em America/Sao_Paulo (a régua de data civil do sistema é do ente; isto é só para os logs)"
timedatectl set-timezone America/Sao_Paulo || true

apt-get update -q
apt-get install -yq ca-certificates curl gnupg lsb-release git nginx certbot python3-certbot-nginx \
  fontconfig fonts-liberation fonts-dejavu-core fonts-noto-core unzip jq

echo "[base] Node 22 (NodeSource)"
if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi

echo "[base] PostgreSQL 18 (repositório oficial PGDG)"
if ! command -v psql > /dev/null || ! psql --version | grep -q ' 18\.'; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -q
  apt-get install -yq postgresql-18
fi
# Só na interface interna: o banco não tem porta pública.
sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" /etc/postgresql/18/main/postgresql.conf
systemctl enable --now postgresql

echo "[base] Chrome estável (.deb) como chromium"
if ! command -v google-chrome > /dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -yq /tmp/chrome.deb
  rm -f /tmp/chrome.deb
fi
ln -sf "$(command -v google-chrome)" /usr/local/bin/chromium

echo "[base] nginx ligado; o site da aplicação é configurado depois da instalação"
systemctl enable --now nginx

echo "[base] versões:"
node -v; psql --version; google-chrome --version; nginx -v 2>&1; certbot --version 2>&1 | head -1
free -h | head -3
echo "[base] pronto."
