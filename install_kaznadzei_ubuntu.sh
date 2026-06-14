#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-${UPDATE_REPOSITORY_URL:-https://github.com/igorkandrat13-tech/kaznadzei.git}}"
BRANCH="main"
APP_DIR="/opt/kaznadzei"
SERVICE_NAME="kaznadzei"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_MAJOR="20"
APP_USER="${SUDO_USER:-$USER}"
DISABLED_REPO_SUFFIX=".disabled-by-kaznadzei"
REQUIRED_PROJECT_FILES=(
  "package.json"
  "server.js"
  "client/package.json"
  "server/routes/orderRoutes.js"
)

disable_repo_file() {
  local file_path="$1"
  local disabled_path="${file_path}${DISABLED_REPO_SUFFIX}"
  if [[ -f "$disabled_path" ]]; then
    rm -f "$disabled_path"
  fi
  mv "$file_path" "$disabled_path"
  echo "  Отключён репозиторий: ${file_path}"
}

comment_out_repo_lines() {
  local file_path="$1"
  local pattern="$2"
  if [[ ! -f "$file_path" ]]; then
    return
  fi

  if grep -Eq "$pattern" "$file_path"; then
    cp "$file_path" "${file_path}.bak-kaznadzei"
    sed -i -E "/${pattern}/ s|^|# disabled by kaznadzei installer: |" "$file_path"
    echo "  Закомментированы лишние репозитории в: ${file_path}"
  fi
}

cleanup_unused_repos() {
  local found=0
  local repo_pattern='mongodb\.org'

  echo "[1/8] Проверка лишних apt-репозиториев..."

  shopt -s nullglob
  for file_path in /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
    if grep -Eq "$repo_pattern" "$file_path"; then
      disable_repo_file "$file_path"
      found=1
    fi
  done
  shopt -u nullglob

  if [[ -f /etc/apt/sources.list ]] && grep -Eq "$repo_pattern" /etc/apt/sources.list; then
    comment_out_repo_lines /etc/apt/sources.list "$repo_pattern"
    found=1
  fi

  if [[ "$found" -eq 0 ]]; then
    echo "  Лишние репозитории не найдены"
  fi
}

upsert_env_var() {
  local file_path="$1"
  local key="$2"
  local value="$3"

  touch "$file_path"
  if grep -Eq "^${key}=" "$file_path"; then
    sed -i -E "s|^${key}=.*|${key}=${value}|" "$file_path"
  else
    echo "${key}=${value}" >> "$file_path"
  fi
}

ensure_admin_token() {
  local file_path="$1"
  local current_token=""

  if grep -Eq '^ADMIN_TOKEN=' "$file_path"; then
    current_token="$(sed -n 's/^ADMIN_TOKEN=//p' "$file_path" | tail -n 1 | tr -d '\r' | xargs)"
  fi

  if [[ -z "$current_token" || "$current_token" == "change-me" ]]; then
    current_token="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
    upsert_env_var "$file_path" "ADMIN_TOKEN" "$current_token"
    echo "Сгенерирован ADMIN_TOKEN: ${current_token}"
    echo "Сохраните этот токен и используйте его в интерфейсе администратора."
  fi
}

ensure_project_files() {
  local missing=0
  echo "  Проверка файлов проекта..."

  for file_path in "${REQUIRED_PROJECT_FILES[@]}"; do
    if [[ ! -f "${APP_DIR}/${file_path}" ]]; then
      echo "  Не найден обязательный файл: ${APP_DIR}/${file_path}"
      missing=1
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    echo "Ошибка: репозиторий загружен не полностью или имеет неверную структуру."
    exit 1
  fi
}

prepare_project_repo() {
  mkdir -p "$(dirname "$APP_DIR")"

  if [[ ! -d "$APP_DIR" ]]; then
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    return
  fi

  if [[ ! -d "${APP_DIR}/.git" ]]; then
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    return
  fi

  echo "Репозиторий уже существует, обновляю рабочую копию..."

  if [[ -f "${APP_DIR}/db.json" ]]; then
    cp "${APP_DIR}/db.json" "/tmp/${SERVICE_NAME}-db.json.backup"
  fi

  cd "$APP_DIR"
  git remote set-url origin "$REPO_URL"
  git fetch origin --prune
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"

  if [[ -f "/tmp/${SERVICE_NAME}-db.json.backup" ]]; then
    cp "/tmp/${SERVICE_NAME}-db.json.backup" "${APP_DIR}/db.json"
  fi
}

echo "============================================"
echo " Установка проекта Kaznadzei на Ubuntu"
echo "============================================"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запусти скрипт через sudo:"
  echo "  sudo bash $(basename "$0")"
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  echo "Пользователь ${APP_USER} не найден"
  exit 1
fi

cleanup_unused_repos

echo "[2/8] Установка системных пакетов..."
apt update
apt install -y curl git ca-certificates build-essential

if ! command -v node >/dev/null 2>&1; then
  echo "[3/8] Установка Node.js ${NODE_MAJOR}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt install -y nodejs
else
  echo "[3/8] Node.js уже установлен: $(node -v)"
fi

echo "[4/8] Подготовка директории проекта..."
prepare_project_repo
ensure_project_files

cd "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "[5/8] Настройка .env..."
touch .env
upsert_env_var .env "PORT" "5000"
upsert_env_var .env "PUBLIC_BASE_URL" "http://localhost:5000"
upsert_env_var .env "ENABLE_SELF_UPDATE" "true"
upsert_env_var .env "UPDATE_BRANCH" "${BRANCH}"
upsert_env_var .env "UPDATE_REPOSITORY_URL" "${REPO_URL}"
ensure_admin_token .env
chown "$APP_USER":"$APP_USER" .env

echo "[6/8] Установка зависимостей..."
sudo -u "$APP_USER" npm install
cd client
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build
cd ..

echo "[7/8] Создание systemd-сервиса..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Kaznadzei Furniture Factory App
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=${APP_DIR}/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "[8/8] Запуск сервиса..."
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "============================================"
echo " Установка завершена"
echo "============================================"
echo "Проект:   ${APP_DIR}"
echo "Сервис:   ${SERVICE_NAME}"
echo "Статус:   sudo systemctl status ${SERVICE_NAME}"
echo "Логи:     sudo journalctl -u ${SERVICE_NAME} -f"
echo "Сайт:     http://$(hostname -I | awk '{print $1}'):5000"
