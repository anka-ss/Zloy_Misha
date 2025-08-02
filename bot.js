const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

// Инициализация Express для веб-сервера (для Render.com)
const app = express();
const PORT = process.env.PORT || 3000;

// Токен бота (получить у @BotFather)
const BOT_TOKEN = process.env.BOT_TOKEN;

// ID групп и тем для мониторинга (заполнить своими значениями)
const MONITORED_GROUPS = process.env.MONITORED_GROUPS ? process.env.MONITORED_GROUPS.split(',') : [];
const MONITORED_TOPICS = process.env.MONITORED_TOPICS ? process.env.MONITORED_TOPICS.split(',') : [];

// Создаем экземпляр бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Хранилище предупреждений и черного списка (в продакшене лучше использовать базу данных)
const userWarnings = new Map(); // userId -> количество предупреждений
const blackList = new Set(); // множество заблокированных пользователей

// Запрещенные фразы для удаления сообщений
const FORBIDDEN_PHRASES = [
    'го в лс',
    'в лс',
    'файлик лс',
    'файлик в лс',
    'файлик в личку',
    'в личке',
    'пиши в лс',
    'напиши в лс',
    'в личные сообщения',
    'скинь в личку',
    'в личку',
    'кину в личку',
    'пишите в личку',
    'вышлю в лс',
    'скинь лс',
    'пиши лс',
    'напиши лс',
    'скинь в лс'
];

// Фразы, за которые выдается предупреждение
const WARNING_PHRASES = [
    'есть машинка',
    'скинь машинку',
    'скину машинку',
    'машинка',
    'го машинку',
    'лс машинка',
    'машинка лс',
    'лс машинку',
    'машнка',
    'личка',
    'Личка',
    'файл',
    'Файл',
    'бот дурак',
    'Бот дурак',
    'Бот Дурак'
];

// Функция проверки, содержит ли текст запрещенные фразы
function containsForbiddenPhrase(text) {
    const lowerText = text.toLowerCase();
    return FORBIDDEN_PHRASES.some(phrase => lowerText.includes(phrase));
}

// Функция проверки, содержит ли текст фразы для предупреждения
function containsWarningPhrase(text) {
    const lowerText = text.toLowerCase();
    return WARNING_PHRASES.some(phrase => lowerText.includes(phrase));
}

// Функция получения количества предупреждений пользователя
function getUserWarnings(userId) {
    return userWarnings.get(userId) || 0;
}

// Функция добавления предупреждения
function addWarning(userId) {
    const currentWarnings = getUserWarnings(userId);
    const newWarnings = currentWarnings + 1;
    userWarnings.set(userId, newWarnings);
    return newWarnings;
}

// Функция добавления в черный список
function addToBlackList(userId) {
    blackList.add(userId);
}

// Функция проверки, находится ли пользователь в черном списке
function isInBlackList(userId) {
    return blackList.has(userId);
}

// Основной обработчик сообщений
bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const messageId = msg.message_id;
        const text = msg.text || msg.caption || '';
        
        // Проверяем, что это нужная группа
        if (!MONITORED_GROUPS.includes(chatId.toString())) {
            return;
        }

        // Проверяем, что это нужная тема (если указаны темы)
        if (MONITORED_TOPICS.length > 0 && msg.message_thread_id) {
            if (!MONITORED_TOPICS.includes(msg.message_thread_id.toString())) {
                return;
            }
        }

        // Проверяем, не является ли пользователь администратором (ПРОСТАЯ проверка)
        try {
            const chatMember = await bot.getChatMember(chatId, userId);
            if (['administrator', 'creator'].includes(chatMember.status)) {
                return; // Игнорируем сообщения от администраторов
            }
        } catch (error) {
            // Если не удалось проверить статус, продолжаем как с обычным пользователем
            console.log(`Не удалось проверить статус пользователя ${userId}:`, error.message);
        }

        // Проверяем, не в черном списке ли пользователь
        if (isInBlackList(userId)) {
            // Удаляем сообщение от пользователя из черного списка
            try {
                await bot.deleteMessage(chatId, messageId);
                console.log(`Удалено сообщение от пользователя в черном списке: ${userId}`);
            } catch (error) {
                console.error('Ошибка при удалении сообщения от пользователя в черном списке:', error);
            }
            return;
        }

        // Проверяем на запрещенные фразы (удаление сообщения)
        if (containsForbiddenPhrase(text)) {
            try {
                await bot.deleteMessage(chatId, messageId);
                console.log(`Удалено сообщение с запрещенной фразой от пользователя ${userId}: "${text}"`);
                
                // Отправляем предупреждение в личку (опционально)
                try {
                    await bot.sendMessage(userId, 
                        '⚠️ Ваше сообщение в группе было удалено за использование запрещенных фраз. ' +
                        'Пожалуйста, соблюдайте правила группы.'
                    );
                } catch (pmError) {
                    console.log(`Не удалось отправить ЛС пользователю ${userId}`);
                }
            } catch (error) {
                console.error('Ошибка при удалении сообщения:', error);
            }
            return;
        }

        // Проверяем на фразы для предупреждения
        if (containsWarningPhrase(text)) {
            const warnings = addWarning(userId);
            
            // Получаем информацию о пользователе
            const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
            
            if (warnings >= 3) {
                // Добавляем в черный список
                addToBlackList(userId);
                
                // Удаляем текущее сообщение
                try {
                    await bot.deleteMessage(chatId, messageId);
                } catch (error) {
                    console.error('Ошибка при удалении сообщения:', error);
                }
                
                // Отправляем сообщение о добавлении в черный список
                await bot.sendMessage(chatId, 
                    `❌ ${username}, вы получили 3 предупреждения и добавлены в черный список. ` +
                    `Ваши сообщения будут автоматически удаляться.`,
                    { reply_to_message_id: messageId }
                );
                
                console.log(`Пользователь ${userId} добавлен в черный список`);
            } else {
                // Отправляем предупреждение
                await bot.sendMessage(chatId, 
                    `⚠️ ${username}, по правилам это запрещено. ` +
                    `Вам ${warnings === 1 ? 'первое' : warnings === 2 ? 'второе' : 'третье'} предупреждение. ` +
                    `(${warnings}/3)`,
                    { reply_to_message_id: messageId }
                );
                
                console.log(`Пользователь ${userId} получил предупреждение ${warnings}/3`);
            }
        }
    } catch (error) {
        console.error('Ошибка при обработке сообщения:', error);
    }
});

// Команды бота для администраторов
bot.onText(/\/warnings (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];
    
    // Проверяем права администратора
    try {
        const chatMember = await bot.getChatMember(chatId, msg.from.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            return;
        }
    } catch (error) {
        return;
    }
    
    const warnings = getUserWarnings(parseInt(userId));
    await bot.sendMessage(chatId, `Пользователь ${userId} имеет ${warnings} предупреждений.`);
});

bot.onText(/\/blacklist/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Проверяем права администратора
    try {
        const chatMember = await bot.getChatMember(chatId, msg.from.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            return;
        }
    } catch (error) {
        return;
    }
    
    const blackListArray = Array.from(blackList);
    const message = blackListArray.length > 0 
        ? `Черный список (${blackListArray.length} пользователей):\n${blackListArray.join('\n')}`
        : 'Черный список пуст.';
    
    await bot.sendMessage(chatId, message);
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = parseInt(match[1]);
    
    // Проверяем права администратора
    try {
        const chatMember = await bot.getChatMember(chatId, msg.from.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            return;
        }
    } catch (error) {
        return;
    }
    
    blackList.delete(userId);
    userWarnings.delete(userId);
    
    await bot.sendMessage(chatId, `Пользователь ${userId} удален из черного списка и его предупреждения сброшены.`);
});

// Обработка ошибок бота
bot.on('error', (error) => {
    console.error('Ошибка бота:', error);
});

bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

// Express маршруты для Render.com
app.get('/', (req, res) => {
    res.json({
        status: 'Bot is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        bot_running: true,
        warnings_count: userWarnings.size,
        blacklist_count: blackList.size
    });
});

app.get('/stats', (req, res) => {
    res.json({
        total_warnings_issued: Array.from(userWarnings.values()).reduce((sum, count) => sum + count, 0),
        users_with_warnings: userWarnings.size,
        blacklisted_users: blackList.size,
        monitored_groups: MONITORED_GROUPS.length,
        monitored_topics: MONITORED_TOPICS.length
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log('Бот запущен и готов к работе');
    console.log(`Мониторим группы: ${MONITORED_GROUPS.join(', ')}`);
    console.log(`Мониторим темы: ${MONITORED_TOPICS.join(', ')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Получен сигнал SIGINT, завершаем работу...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Получен сигнал SIGTERM, завершаем работу...');
    bot.stopPolling();
    process.exit(0);
});
