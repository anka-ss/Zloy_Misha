#!/bin/bash

# Скрипт запуска бота Злой Миша
echo "🚀 Запуск бота Злой Миша..."

# Проверяем наличие обязательных переменных окружения
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Ошибка: BOT_TOKEN не установлен"
    exit 1
fi

if [ -z "$MONITORED_GROUPS" ]; then
    echo "⚠️  Предупреждение: MONITORED_GROUPS не установлен"
fi

# Выводим информацию о конфигурации (без токена)
echo "📊 Конфигурация:"
echo "   Node.js версия: $(node --version)"
echo "   NPM версия: $(npm --version)"
echo "   Порт: ${PORT:-3000}"
echo "   Мониторимые группы: ${MONITORED_GROUPS:-'не заданы'}"
echo "   Группа отчетов: ${REPORTS_GROUP_ID:-'не задана'}"

# Ждем немного для стабильности
echo "⏳ Ожидание инициализации..."
sleep 3

# Запускаем бота
echo "🎯 Запуск основного процесса..."
exec node bot.js
