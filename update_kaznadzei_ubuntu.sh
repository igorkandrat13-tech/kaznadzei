#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-${UPDATE_REPOSITORY_URL:-https://github.com/igorkandrat13-tech/kaznadzei.git}}"
BRANCH="main"
APP_DIR="/opt/kaznadzei"
SERVICE_NAME="kaznadzei"
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

if [[ -f "${APP_DIR}/db.json" ]]; then
  cp "${APP_DIR}/db.json" "/tmp/${SERVICE_NAME}-db.json.backup"
fi

echo "[1/5] Обновление репозитория..."
prepare_repo
ensure_project_files

echo "[2/5] Проверка прав на каталог проекта..."
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "[3/5] Установка зависимостей..."
sudo -u "$APP_USER" npm install
cd "${APP_DIR}/client"
sudo -u "$APP_USER" npm install

echo "[4/5] Сборка клиента..."
sudo -u "$APP_USER" npm run build

restore_db_backup

echo "[5/5] Перезапуск сервиса..."
systemctl daemon-reload
systemctl restart "$SERVICE_NAME"
systemctl status "$SERVICE_NAME" --no-pager -l

echo ""
echo "============================================"
echo " Обновление завершено"
echo "============================================"
echo "Проект:   ${APP_DIR}"
echo "Сервис:   ${SERVICE_NAME}"
echo "Логи:     sudo journalctl -u ${SERVICE_NAME} -f"
