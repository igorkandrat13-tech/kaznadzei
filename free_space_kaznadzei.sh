#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kaznadzei}"
SERVICE_NAME="${SERVICE_NAME:-kaznadzei}"
PORT="${PORT:-5000}"
HEALTHZ_URL="${HEALTHZ_URL:-http://127.0.0.1:${PORT}/healthz}"

ensure_sudo_or_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Запусти скрипт через sudo:"
    echo "  sudo bash $(basename "$0")"
    exit 1
  fi
}

app_user() {
  if [[ -d "$APP_DIR" ]]; then
    stat -c '%U' "$APP_DIR"
    return
  fi
  if [[ -n "${SUDO_USER:-}" ]]; then
    echo "$SUDO_USER"
    return
  fi
  echo "root"
}

home_of() {
  getent passwd "$1" 2>/dev/null | awk -F: '{print $6}' || echo "/home/$1"
}

available_mb() {
  df -k "${1:-/}" 2>/dev/null | awk 'NR==2 {printf "%.0f", $4/1024}' || echo 0
}

echo "============================================"
echo " Очистка места + проверка Kaznadzei"
echo "============================================"

ensure_sudo_or_root
APP_USER="$(app_user)"
APP_HOME="$(home_of "$APP_USER")"

FREE_BEFORE_MB="$(available_mb "/")"
echo "До очистки: ${FREE_BEFORE_MB} MB на /"
echo "APP_DIR = ${APP_DIR}, APP_USER = ${APP_USER}"

echo ""
echo "[1/6] package manager + journal + tmp"
command -v npm >/dev/null 2>&1 && sudo -u "$APP_USER" npm cache clean --force 2>/dev/null || true
command -v npm >/dev/null 2>&1 && npm cache clean --force 2>/dev/null || true
command -v apt-get >/dev/null 2>&1 && (apt-get -y autoclean || true ; apt-get -y autoremove || true ; apt-get clean || true)
command -v journalctl >/dev/null 2>&1 && (journalctl --vacuum-time=2d || true)
find /tmp -maxdepth 3 -type f \( -name '*.bak' -o -name '*backup*' -o -name '*.log' -o -name '*.tmp' \) -delete 2>/dev/null || true
find /var/tmp -maxdepth 3 -type f \( -name '*.bak' -o -name '*backup*' -o -name '*.log' -o -name '*.tmp' \) -delete 2>/dev/null || true

echo "[2/6] npm logs (user + root)"
[[ -d "${APP_HOME}/.npm/_logs" ]] && find "${APP_HOME}/.npm/_logs" -type f -mtime +1 -delete 2>/dev/null || true
[[ -d /root/.npm/_logs ]] && find /root/.npm/_logs -type f -mtime +1 -delete 2>/dev/null || true

echo "[3/6] файлы приложения (db.json.bak, tmp)"
find "${APP_DIR}" -maxdepth 3 -type f -name 'db.json.bak' -delete 2>/dev/null || true
find "${APP_DIR}/tmp" -maxdepth 3 -type f -delete 2>/dev/null || true

echo "[4/6] npm prune (если install прошёл частично)"
cd "${APP_DIR}"
if [[ -d "${APP_DIR}/node_modules" ]]; then
  command -v npm >/dev/null 2>&1 && sudo -u "$APP_USER" npm prune 2>/dev/null || true
fi
if [[ -d "${APP_DIR}/client/node_modules" ]]; then
  command -v npm >/dev/null 2>&1 && (cd "${APP_DIR}/client" && sudo -u "$APP_USER" npm prune 2>/dev/null || true)
fi

sync
FREE_AFTER_MB="$(available_mb "/")"
FREED_MB=$((FREE_AFTER_MB - FREE_BEFORE_MB))

echo ""
echo "[5/6] syntax check server/**/*.js"
FAILS="$(mktemp)"
find "${APP_DIR}/server" -type f -name '*.js' -print0 2>/dev/null \
  | while IFS= read -r -d '' f; do
      if ! sudo -u "$APP_USER" node --check "$f" 2>/dev/null; then
        echo "$f" >> "$FAILS"
      fi
    done
if [[ -s "$FAILS" ]]; then
  echo "  ⚠️ node --check FAIL:"
  cat "$FAILS"
else
  echo "  ✅ все *.js ОК"
fi
rm -f "$FAILS"

echo "[6/6] /healthz"
SVC_OK=0
for _ in 1 2 3 4 5; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "$HEALTHZ_URL" 2>/dev/null || echo 000)"
  BODY="$(curl -s --max-time 4 "$HEALTHZ_URL" 2>/dev/null || echo '')"
  if [[ "$CODE" == "200" && "$BODY" == *'"ok":true'* ]]; then SVC_OK=1 ; break ; fi
  sleep 2
done
if [[ "$SVC_OK" == 1 ]]; then
  echo "  ✅ сервис ${SERVICE_NAME} отвечает /healthz 200 ok:true"
else
  echo "  ⚠️ сервис не отвечает /healthz. Статус:"
  systemctl status "$SERVICE_NAME" --no-pager -l 2>/dev/null || true
fi

echo ""
echo "============================================"
echo " Отчёт"
echo "============================================"
echo "Было свободно : ${FREE_BEFORE_MB} MB"
echo "Стало свободно: ${FREE_AFTER_MB} MB"
echo "Освобождено   : ${FREED_MB} MB"
echo "Путь          : ${APP_DIR}"
echo "Логи сервиса  : sudo journalctl -u ${SERVICE_NAME} -f"
