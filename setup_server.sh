#!/bin/bash
set -e

echo "============================================"
echo " Установка проекта Мебельная фабрика"
echo "============================================"

# 1. Node.js
if ! command -v node &> /dev/null; then
    echo "[1/5] Устанавливаю Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt-get install -y nodejs
else
    echo "[1/5] Node.js уже установлен: $(node -v)"
fi

# 2. Git (для клонирования, если нужно)
if ! command -v git &> /dev/null; then
    echo "[2/5] Устанавливаю git..."
    sudo apt-get install -y git
else
    echo "[2/5] Git уже установлен"
fi

# 3. .env
echo "[3/5] Настраиваю .env..."
if [ ! -f .env ]; then
    cat > .env << 'EOF'
MONGODB_URI=mongodb://127.0.0.1:27017/my-furniture-db
PORT=5000
EOF
    echo "  .env создан"
else
    echo "  .env уже существует"
fi

# 4. Установка зависимостей
echo "[4/5] Устанавливаю зависимости..."

echo "  -> root dependencies..."
npm install --omit=dev

echo "  -> client dependencies..."
cd client
npm install --omit=dev
cd ..

echo "  -> исправление прав на исполняемые файлы..."
find client/node_modules/.bin -type f -exec chmod +x {} \; 2>/dev/null || true

echo "  -> сборка React фронтенда..."
cd client
npm run build
cd ..

# 5. Запуск
echo "[5/5] Запускаю сервер..."
echo ""
echo "============================================"
echo " Установка завершена!"
echo "============================================"
echo ""
echo "Запуск:  node server.js &"
echo "Сайт:    http://$(curl -s ifconfig.me 2>/dev/null || echo '<IP_сервера>'):5000"
echo "         (или http://localhost:5000 локально)"
echo ""
echo "Для автозапуска через systemd:"
echo "  sudo cp kaznadzei.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now kaznadzei"
echo ""

node server.js
