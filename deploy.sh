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

# 2. Docker (для MongoDB)
if ! command -v docker &> /dev/null; then
    echo "[2/5] Устанавливаю Docker..."
    sudo apt-get update
    sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce
    sudo systemctl start docker
    sudo systemctl enable docker
else
    echo "[2/5] Docker уже установлен"
fi

# 3. MongoDB в Docker
echo "[3/5] Запускаю MongoDB в Docker..."
sudo docker rm -f kaznadzei-mongo 2>/dev/null || true
sudo docker run -d \
  --name kaznadzei-mongo \
  --restart always \
  -p 27017:27017 \
  -v kaznadzei-mongo-data:/data/db \
  mongo:7

# 4. Настройка .env
echo "[4/5] Настраиваю .env..."
if [ ! -f .env ]; then
    cat > .env << 'EOF'
MONGODB_URI=mongodb://127.0.0.1:27017/my-furniture-db
PORT=5000
EOF
    echo "  Создан .env с параметрами по умолчанию"
else
    echo "  .env уже существует, пропускаю"
fi

# 5. Установка зависимостей и сборка
echo "[5/5] Устанавливаю зависимости и собираю клиент..."
npm install
cd client
npm install
npm run build
cd ..

echo ""
echo "============================================"
echo " Установка завершена!"
echo "============================================"
echo ""
echo "Запуск:  npm start"
echo "Сайт:    http://$(curl -s ifconfig.me):5000"
echo "         (или http://localhost:5000 локально)"
echo ""
