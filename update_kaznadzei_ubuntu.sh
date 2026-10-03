#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-${UPDATE_REPOSITORY_URL:-https://github.com/igorkandrat13-tech/kaznadzei.git}}"
BRANCH="${UPDATE_BRANCH:-main}"
APP_DIR="/opt/kaznadzei"
SERVICE_NAME="kaznadzei"
PORT="${PORT:-5000}"
MIN_DISK_MB_BEFORE_CLEAN="${MIN_DISK_MB_BEFORE_CLEAN:-500}"
MIN_DISK_MB_AFTER_CLEAN="${MIN_DISK_MB_AFTER_CLEAN:-200}"
HEALTHZ_URL="${HEALTHZ_URL:-http://127.0.0.1:${PORT}/healthz}"
REQUIRED_PROJECT_FILES=(
  "package.json"
  "server.js"
  "client/package.json"
  "server/routes/orderRoutes.js"
)

ensure_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Запусти скрипт через sudo:"
    echo "  sudo bash $(basename "$0")"
    exit 1
  fi
}

ensure_command() {
  local command_name="$1"
  local install_hint="$2"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Ошибка: команда '${command_name}' не найдена."
    echo "$install_hint"
    exit 1
  fi
}

get_app_user() {
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

home_of_user() {
  local user="$1"
  getent passwd "$user" 2>/dev/null | awk -F: '{print $6}' || echo "/home/$user"
}

available_disk_mb() {
  local target_path="${1:-/}"
  df -k "$target_path" 2>/dev/null | awk 'NR==2 {printf "%.0f", $4/1024}' || echo 0
}

cleanup_disk_space() {
  local user="$1"
  local user_home
  user_home="$(home_of_user "$user")"

  echo "  • npm cache clean (user + root)"
  command -v npm >/dev/null 2>&1 && sudo -u "$user" npm cache clean --force 2>/dev/null || true
  command -v npm >/dev/null 2>&1 && npm cache clean --force 2>/dev/null || true

  echo "  • apt autoclean / autoremove / clean"
  command -v apt-get >/dev/null 2>&1 && apt-get -y autoclean 2>/dev/null || true
  command -v apt-get >/dev/null 2>&1 && apt-get -y autoremove 2>/dev/null || true
  command -v apt-get >/dev/null 2>&1 && apt-get clean 2>/dev/null || true

  echo "  • journalctl vacuum (2 days)"
  command -v journalctl >/dev/null 2>&1 && journalctl --vacuum-time=2d 2>/dev/null || true

  echo "  • /tmp/*.bak /tmp/*backup /tmp/*.log"
  find /tmp -maxdepth 3 -type f \( -name '*.bak' -o -name '*backup*' -o -name '*.log' -o -name '*.tmp' \) -delete 2>/dev/null || true

  if [[ -d "${user_home}/.npm/_logs" ]]; then
    echo "  • user npm logs (${user_home}/.npm/_logs)"
    find "${user_home}/.npm/_logs" -type f -mtime +1 -delete 2>/dev/null || true
  fi

  if [[ -d /root/.npm/_logs ]]; then
    echo "  • root npm logs"
    find /root/.npm/_logs -type f -mtime +1 -delete 2>/dev/null || true
  fi

  if [[ -d "${APP_DIR}/node_modules" ]]; then
    echo "  • prune node_modules (root + client)"
    command -v npm >/dev/null 2>&1 && sudo -u "$user" bash -c "cd '${APP_DIR}' && npm prune --production=false 2>/dev/null || true" || true
  fi
  if [[ -d "${APP_DIR}/client/node_modules" ]]; then
    command -v npm >/dev/null 2>&1 && sudo -u "$user" bash -c "cd '${APP_DIR}/client' && npm prune 2>/dev/null || true" || true
  fi

  echo "  • очистка старых db.json.bak и tmp-файлов приложения"
  find "${APP_DIR}" -maxdepth 3 -type f -name 'db.json.bak' -delete 2>/dev/null || true
  find "${APP_DIR}/tmp" -maxdepth 3 -type f -delete 2>/dev/null || true

  sync
}

ensure_project_files() {
  local missing=0

  for file_path in "${REQUIRED_PROJECT_FILES[@]}"; do
    if [[ ! -f "${APP_DIR}/${file_path}" ]]; then
      echo "Не найден обязательный файл: ${APP_DIR}/${file_path}"
      missing=1
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    echo "Ошибка: проект на сервере имеет неполную структуру."
    echo "Если это новая машина, сначала выполните install_kaznadzei_ubuntu.sh."
    exit 1
  fi
}

prepare_repo() {
  if [[ ! -d "${APP_DIR}/.git" ]]; then
    echo "Ошибка: git-репозиторий не найден в ${APP_DIR}."
    echo "Сначала выполните install_kaznadzei_ubuntu.sh на сервере."
    exit 1
  fi

  cd "$APP_DIR"
  git remote set-url origin "$REPO_URL"
  git fetch origin --prune
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
}

restore_db_backup() {
  if [[ -f "/tmp/${SERVICE_NAME}-db.json.backup" ]]; then
    cp "/tmp/${SERVICE_NAME}-db.json.backup" "${APP_DIR}/db.json"
  fi
}

verify_node_check() {
  local user="$1"
  echo "  • node --check все server/**/*.js"
  local fails_file
  fails_file="$(mktemp)"
  find "${APP_DIR}/server" -type f -name '*.js' -print0 2>/dev/null \
    | while IFS= read -r -d '' f; do
        if ! sudo -u "$user" node --check "$f" 2>/dev/null; then
          echo "$f" >> "$fails_file"
        fi
      done
  if [[ -s "$fails_file" ]]; then
    echo "ОШИБКА: node --check не прошёл для файлов:"
    cat "$fails_file"
    rm -f "$fails_file"
    echo "Откатываю БД и прерываю обновление (сервис не трогаю)."
    restore_db_backup
    exit 1
  fi
  rm -f "$fails_file"
}

verify_healthz() {
  echo "  • /healthz check (${HEALTHZ_URL})"
  local ok=0
  for _ in 1 2 3 4 5 6 7 8; do
    local http_code
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTHZ_URL" 2>/dev/null || echo 000)"
    local body
    body="$(curl -s --max-time 5 "$HEALTHZ_URL" 2>/dev/null || echo '')"
    if [[ "$http_code" == "200" && "$body" == *'"ok":true'* ]]; then
      ok=1
      break
    fi
    sleep 2
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "ОШИБКА: /healthz не вернул HTTP 200 {ok:true} за 16 секунд."
    echo "  journalctl -u ${SERVICE_NAME} -n 80 --no-pager"
    journalctl -u "$SERVICE_NAME" -n 80 --no-pager 2>/dev/null || true
    exit 1
  fi
  echo "  • /healthz OK (HTTP 200 ok:true)"
}

echo "============================================"
echo " Обновление проекта Kaznadzei на Ubuntu"
echo "============================================"

ensure_root
ensure_command git "Установите Git и повторите попытку."
ensure_command node "Установите Node.js и повторите попытку."
ensure_command npm "Установите npm и повторите попытку."

APP_USER="$(get_app_user)"

if ! id "$APP_USER" >/dev/null 2>&1; then
  echo "Ошибка: пользователь ${APP_USER} не найден."
  exit 1
fi

FREE_BEFORE_MB="$(available_disk_mb "/")"
echo "[PREFLIGHT] Свободно на диске / : ${FREE_BEFORE_MB} MB"
if [[ "${FREE_BEFORE_MB}" -lt "${MIN_DISK_MB_BEFORE_CLEAN}" ]]; then
  echo "[PREFLIGHT] Меньше ${MIN_DISK_MB_BEFORE_CLEAN} MB — запускаю очистку диска..."
  cleanup_disk_space "$APP_USER"
  FREE_AFTER_MB="$(available_disk_mb "/")"
  echo "[PREFLIGHT] После очистки свободно: ${FREE_AFTER_MB} MB"
  if [[ "${FREE_AFTER_MB}" -lt "${MIN_DISK_MB_AFTER_CLEAN}" ]]; then
    echo "[PREFLIGHT] ОШИБКА: после очистки меньше ${MIN_DISK_MB_AFTER_CLEAN} MB свободного места."
    echo "  • df -h /"
    df -h / || true
    echo "  • освободите место вручную и повторите."
    exit 1
  fi
fi

if [[ -f "${APP_DIR}/db.json" ]]; then
  cp "${APP_DIR}/db.json" "/tmp/${SERVICE_NAME}-db.json.backup"
fi

echo "[1/6] Обновление репозитория..."
prepare_repo
ensure_project_files

echo "[2/6] Проверка прав на каталог проекта..."
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "[3/6] Установка зависимостей..."
FREE_NOW_MB="$(available_disk_mb "/")"
if [[ "${FREE_NOW_MB}" -lt "${MIN_DISK_MB_AFTER_CLEAN}" ]]; then
  echo "  • перед npm install ещё раз очистка (${FREE_NOW_MB} MB < ${MIN_DISK_MB_AFTER_CLEAN})"
  cleanup_disk_space "$APP_USER"
fi
sudo -u "$APP_USER" bash -c "cd '${APP_DIR}' && npm install --no-audit --no-fund"
cd "${APP_DIR}/client"
sudo -u "$APP_USER" npm install --no-audit --no-fund

echo "[4/6] Проверка синтаксиса server-side..."
verify_node_check "$APP_USER"

echo "[4.5/6] Сборка клиента..."
sudo -u "$APP_USER" npm run build

restore_db_backup
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "[5/6] Перезапуск сервиса..."
systemctl daemon-reload
systemctl restart "$SERVICE_NAME"
systemctl status "$SERVICE_NAME" --no-pager -l || true

echo "[6/6] Проверка /healthz..."
verify_healthz

echo ""
echo "============================================"
echo " Обновление завершено"
echo "============================================"
echo "Проект:   ${APP_DIR}"
echo "Сервис:   ${SERVICE_NAME}"
echo "Свободно: $(available_disk_mb "/") MB"
echo "Логи:     sudo journalctl -u ${SERVICE_NAME} -f"
