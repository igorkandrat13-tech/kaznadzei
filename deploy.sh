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

# 2. Настройка .env
echo "[2/4] Настраиваю .env..."
if [ ! -f .env ]; then
    ADMIN_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
    cat > .env <<EOF
PORT=5000
PUBLIC_BASE_URL=http://localhost:5000
ADMIN_TOKEN=${ADMIN_TOKEN}
ENABLE_SELF_UPDATE=false
UPDATE_BRANCH=main
EOF
    echo "  Создан .env с параметрами по умолчанию"
    echo "  Сгенерирован ADMIN_TOKEN: ${ADMIN_TOKEN}"
    echo "  Сохраните этот токен и используйте его в интерфейсе администратора"
else
    echo "  .env уже существует, пропускаю"
fi

# 3. Установка зависимостей и сборка
echo "[3/4] Устанавливаю зависимости и собираю клиент..."
npm install
cd client
npm install
npm run build
cd ..

# 4. Завершение
echo "[4/4] Готово"
echo ""
echo "============================================"
echo " Установка завершена!"
echo "============================================"
echo ""
echo "Production: npm start"
echo "Dev:        npm run dev"
echo "Сайт:    http://$(curl -s ifconfig.me):5000"
echo "         (или http://localhost:5000 локально)"
echo ""
