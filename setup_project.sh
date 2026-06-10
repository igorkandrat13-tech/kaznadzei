#!/bin/bash

# Обновление пакетов
sudo apt update && sudo apt upgrade -y

# Установить Node.js и npm с использованием nvm

# Установка необходимых инструментов
sudo apt install -y build-essential curl git

# Установить nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source ~/.bashrc

# Установить последнюю версию Node.js (версия LTS)
nvm install --lts

# Установить MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu focal/multiverse amd64 mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org

# Запуск MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Замена на директорию проекта
mkdir -p ~/my-furniture-app
cd ~/my-furniture-app

# Инициализация npm проекта
npm init -y

# Установка необходимого программного обеспечения
npm install express mongoose dotenv qrcode node-telegram-bot-api

# Создание структуры проекта
mkdir -p client/src/{components,styles,assets}
mkdir -p server/{models,routes,controllers,config,services}
mkdir -p tests/{client,server}
mkdir -p scripts

echo "MONGODB_URI=mongodb://localhost:27017/my-furniture-db\nPORT=5000" > .env

echo "const express = require('express');\nconst mongoose = require('mongoose');\nconst dotenv = require('dotenv');\n\n// Настройка dotenv\ndotenv.config();\n\nconst app = express();\napp.use(express.json());\n\n// Подключение к MongoDB\nmongoose.connect(process.env.MONGODB_URI)\n  .then(() => console.log('MongoDB connected'))\n  .catch(err => console.error('MongoDB connection error:', err));\n\n// Запуск сервера\nconst PORT = process.env.PORT || 5000;\napp.listen(PORT, () => {\n  console.log(`Server running on port ${PORT}`);\n});" > server/server.js

# Установка Nodemon для разработки
npm install --save-dev nodemon

# Напоминание об окончании установки
echo "Проект успешно развернут на Ubuntu сервере! Используйте 'node server/server.js' или 'npx nodemon server/server.js' для запуска сервера."