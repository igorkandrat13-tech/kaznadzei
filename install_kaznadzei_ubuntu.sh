#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/igorkandrat13-tech/kaznadzey.git"
BRANCH="main"
APP_DIR="/opt/kaznadzei"
SERVICE_NAME="kaznadzei"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_MAJOR="20"
APP_USER="${SUDO_USER:-$USER}"

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

echo "[1/7] Установка системных пакетов..."
apt update
apt install -y curl git ca-certificates build-essential

if ! command -v node >/dev/null 2>&1; then
  echo "[2/7] Установка Node.js ${NODE_MAJOR}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt install -y nodejs
else
  echo "[2/7] Node.js уже установлен: $(node -v)"
fi

echo "[3/7] Подготовка директории проекта..."
mkdir -p "$(dirname "$APP_DIR")"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "Репозиторий уже существует, обновляю рабочую копию..."
  if [[ -f "${APP_DIR}/db.json" ]]; then
    cp "${APP_DIR}/db.json" "/tmp/${SERVICE_NAME}-db.json.backup"
  fi
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  if [[ -f "/tmp/${SERVICE_NAME}-db.json.backup" ]]; then
    cp "/tmp/${SERVICE_NAME}-db.json.backup" "${APP_DIR}/db.json"
  fi
fi

cd "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "[4/7] Настройка .env..."
if [[ ! -f .env ]]; then
  cat > .env <<EOF
PORT=5000
UPDATE_BRANCH=${BRANCH}
EOF
fi
chown "$APP_USER":"$APP_USER" .env

echo "[5/7] Установка зависимостей..."
sudo -u "$APP_USER" npm install
cd client
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build
cd ..

echo "[6/7] Создание systemd-сервиса..."
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
EnvironmentFile=${APP_DIR}/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "[7/7] Запуск сервиса..."
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
