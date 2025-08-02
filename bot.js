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

// ID группы для отчетов о банах
const REPORTS_GROUP_ID = process.env.REPORTS_GROUP_ID;

// Создаем экземпляр бота с увеличенным тайм-аутом
const bot = new TelegramBot(BOT_TOKEN, { 
    polling: {
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 30
        }
    }
});

// Хранилище предупреждений и черного списка (в продакшене лучше использовать базу данных)
const userWarnings = new Map(); // userId -> количество предупреждений
const blackList = new Set(); // множество заблокированных пользователей
const recentExplanations = new Map(); // userId -> timestamp последнего объяснения

// Запрещенные фразы для удаления сообщений
const FORBIDDEN_PHRASES = [
    'го в лс',
    'в лс',
    'файлик лс',
    'файлик в лс',
    'файлик в личку',
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
    'го машинку',
    'го машинка',
    'лс машинка',
    'лс машинку',
    'лс файлик',
    'лс файл',
    'машинка лс',
    'машинку лс',
    'файлик лс',
    'файл лс',
    'го файлик',
    'скинь файлик',
    'скинь файл',
    'скину файлик',
    'скину файл',
    'бот дурак',
    'личка файлик',
    'личка машинка'
];

// Фразы, на которые бот отвечает объяснением об удалении
const DELETION_QUESTION_PHRASES = [
    'почему удалил',
    'удаляются сообщения',
    'удалилось сообщение',
    'почему удалилось',
    'мои сообщения удалились',
    'удалились сообщения',
    'пропали сообщения',
    'сообщения пропали',
    'пропало сообщение',
    'сообщение пропало',
    'сообщение удалилось',
    'удалилось сообщение'
];

// Функция проверки, содержит ли текст запрещенные фразы
function containsForbiddenPhrase(text) {
    const lowerText = text.toLowerCase().trim();
    
    // Проверяем на точное совпадение с запрещенными фразами
    return FORBIDDEN_PHRASES.some(phrase => {
        const lowerPhrase = phrase.toLowerCase();
        
        // Точное совпадение всего сообщения
        if (lowerText === lowerPhrase) {
            return true;
        }
        
        // Проверяем, что фраза окружена пробелами, знаками препинания или началом/концом строки
        const regex = new RegExp(`(^|[\\s.,!?;:()\\[\\]{}"\'-])${lowerPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\// Функция проверки, содержит ли текст запрещенные фразы
function containsForbiddenPhrase(text) {
    const lowerText = text.toLowerCase();
    
    // Список фраз, которые могут быть частью безобидных сообщений
    const safeContexts = [
        'что я с кем-то',
        'с кем-то вчера',
        'с кем-то сегодня',
        'с кем-то общался',
        'с кем-то общалась',
        'с кем-то говорил',
        'с кем-то говорила',
        'с кем-то встречался',
        'с кем-то встречалась',
        'общалась в личке',
        'общался в личке',
        'говорил в личке',
        'говорила в личке'
    ];
    
    // Если сообщение содержит безопасный контекст, не удаляем его
    if (safeContexts.some(context => lowerText.includes(context))) {
        return false;
    }
    
    return FORBIDDEN_PHRASES.some(phrase => lowerText.includes(phrase.toLowerCase()));
}')}($|[\\s.,!?;:()\\[\\]{}"\'-])`, 'i');
        return regex.test(lowerText);
    });
}

// Функция проверки, содержит ли текст фразы для предупреждения
function containsWarningPhrase(text) {
    const lowerText = text.toLowerCase();
    return WARNING_PHRASES.some(phrase => lowerText.includes(phrase.toLowerCase()));
}

// Функция проверки, содержит ли текст вопросы об удалении
function containsDeletionQuestion(text) {
    const lowerText = text.toLowerCase();
    return DELETION_QUESTION_PHRASES.some(phrase => lowerText.includes(phrase.toLowerCase()));
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
        
        // Дополнительное логирование для диагностики
        console.log(`[${new Date().toLocaleTimeString()}] Обработка сообщения от ${userId} в чате ${chatId}: "${text.substring(0, 50)}..."`);
        
        // Проверяем, что это нужная группа (НЕ группа отчетов)
        if (!MONITORED_GROUPS.includes(chatId.toString())) {
            return;
        }

        // Дополнительная проверка: игнорируем группу отчетов
        if (REPORTS_GROUP_ID && chatId.toString() === REPORTS_GROUP_ID) {
            return;
        }

        // Проверяем, что это нужная тема (если указаны темы)
        if (MONITORED_TOPICS.length > 0 && msg.message_thread_id) {
            if (!MONITORED_TOPICS.includes(msg.message_thread_id.toString())) {
                console.log(`Сообщение в неотслеживаемой теме ${msg.message_thread_id}, пропускаем`);
                return;
            }
        } else if (msg.message_thread_id) {
            // Если темы не заданы, но сообщение в теме - логируем ID темы для настройки
            console.log(`Сообщение в теме ${msg.message_thread_id}. Для мониторинга добавьте ID в MONITORED_TOPICS`);
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
            // Пользователь в черном списке - он уже заглушен, ничего не делаем
            console.log(`Сообщение от заглушенного пользователя ${userId}: "${text}"`);
            return;
        }

        // Проверяем на запрещенные фразы (удаление сообщения)
        if (containsForbiddenPhrase(text)) {
            try {
                await bot.deleteMessage(chatId, messageId);
                console.log(`Удалено сообщение с запрещенной фразой от пользователя ${userId}: "${text}"`);
            } catch (error) {
                console.error('Ошибка при удалении сообщения:', error);
            }
            return; // ВАЖНО: выходим здесь, не проверяем на предупреждения
        }

        // Проверяем на вопросы об удалении сообщений
        if (containsDeletionQuestion(text)) {
            // Проверяем, не отправляли ли мы недавно объяснение этому пользователю
            const lastExplanation = recentExplanations.get(userId);
            const now = Date.now();
            
            // Если прошло меньше 30 секунд с последнего объяснения, не отправляем повторно
            if (lastExplanation && (now - lastExplanation) < 30000) {
                console.log(`Пропускаем дублирующее объяснение для пользователя ${userId}`);
                return;
            }
            
            try {
                const explanationMessage = 
                    `✂️ Это я удалил ваше сообщение из-за нарушения правил. Прочитайте их еще раз внимательнее. Если произошла ошибка, напишите админам в бот: @ProPerevod_bot\n[ваш Злой Миша]`;
                
                // Подготавливаем опции для отправки
                const sendOptions = { reply_to_message_id: messageId };
                
                // Если сообщение в подтеме, отвечаем в ту же подтему
                if (msg.message_thread_id) {
                    sendOptions.message_thread_id = msg.message_thread_id;
                }
                
                await bot.sendMessage(chatId, explanationMessage, sendOptions);
                
                // Запоминаем время отправки объяснения
                recentExplanations.set(userId, now);
                
                console.log(`Отправлено объяснение об удалении пользователю ${userId} в ${new Date().toLocaleTimeString()}`);
            } catch (error) {
                console.error('Ошибка при отправке объяснения:', error);
            }
            return; // Выходим, не проверяем на предупреждения
        }

        // Проверяем на фразы для предупреждения
        if (containsWarningPhrase(text)) {
            const warnings = addWarning(userId);
            
            // Получаем информацию о пользователе
            const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
            
            if (warnings >= 3) {
                // Добавляем в черный список
                addToBlackList(userId);
                
                // Мьютим пользователя в группе навсегда
                try {
                    await bot.restrictChatMember(chatId, userId, {
                        can_send_messages: false,
                        can_send_media_messages: false,
                        can_send_polls: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false,
                        can_change_info: false,
                        can_invite_users: false,
                        can_pin_messages: false,
                        until_date: 0 // 0 = навсегда
                    });
                    console.log(`Пользователь ${userId} заглушен в группе навсегда`);
                } catch (muteError) {
                    console.error('Ошибка при мьюте пользователя:', muteError);
                    // Если не удалось замьютить, продолжаем с удалением сообщений
                }
                
                // Отправляем сообщение о добавлении в черный список в основную группу
                try {
                    const banMessage = `❌ ${username}, вы получили 3 предупреждения и добавлены в черный список. (3/3)\n[ваш Злой Миша]`;
                    
                    // Подготавливаем опции для отправки
                    const sendOptions = {};
                    
                    // Если сообщение в подтеме, отвечаем в ту же подтему
                    if (msg.message_thread_id) {
                        sendOptions.message_thread_id = msg.message_thread_id;
                    }
                    
                    await bot.sendMessage(chatId, banMessage, sendOptions);
                } catch (error) {
                    console.error('Ошибка при отправке сообщения о бане:', error);
                }
                
                // Отправляем отчет в группу отчетов
                if (REPORTS_GROUP_ID) {
                    try {
                        const groupName = msg.chat.title || `группе ${chatId}`;
                        const userInfo = msg.from.username 
                            ? `@${msg.from.username} (ID: ${userId})`
                            : `${msg.from.first_name} (ID: ${userId})`;
                        
                        const reportMessage = 
                            `🚫 НОВЫЙ БАН\n\n` +
                            `👤 Пользователь: ${userInfo}\n` +
                            `💬 Группа: ${groupName}\n` +
                            `📝 Нарушение: "${text}"\n` +
                            `⚠️ Предупреждений: 3/3\n` +
                            `🕐 Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n\n` +
                            `[Злой Миша - отчет о модерации]`;
                        
                        await bot.sendMessage(REPORTS_GROUP_ID, reportMessage);
                        console.log(`Отчет о бане отправлен в группу отчетов: ${userId}`);
                    } catch (reportError) {
                        console.error('Ошибка при отправке отчета:', reportError);
                    }
                }
                
                console.log(`Пользователь ${userId} добавлен в черный список`);
            } else {
                // Отправляем предупреждение
                let warningText;
                if (warnings === 1) {
                    warningText = `⚠️ ${username}, по правилам это запрещено. Вам первое предупреждение. (1/3)\n[ваш Злой Миша]`;
                } else if (warnings === 2) {
                    warningText = `⚠️ ${username}, по правилам это запрещено. Вам второе предупреждение. Следующее будет последним. (2/3)\n[ваш Злой Миша]`;
                }
                
                // Подготавливаем опции для отправки
                const sendOptions = { reply_to_message_id: messageId };
                
                // Если сообщение в подтеме, отвечаем в ту же подтему
                if (msg.message_thread_id) {
                    sendOptions.message_thread_id = msg.message_thread_id;
                }
                
                await bot.sendMessage(chatId, warningText, sendOptions);
                
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
    const targetUserId = match[1];
    
    // Проверяем права администратора
    try {
        const chatMember = await bot.getChatMember(chatId, msg.from.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            return;
        }
    } catch (error) {
        console.error('Ошибка проверки прав администратора:', error);
        return;
    }
    
    // Проверяем, что передан корректный ID
    const userId = parseInt(targetUserId);
    if (isNaN(userId)) {
        await bot.sendMessage(chatId, 'Неверный формат ID пользователя. Используйте: /warnings 123456789');
        return;
    }
    
    const warnings = getUserWarnings(userId);
    const isBlacklisted = isInBlackList(userId);
    const status = isBlacklisted ? ' (в черном списке)' : '';
    
    await bot.sendMessage(chatId, `Пользователь ${userId} имеет ${warnings} предупреждений${status}.`);
    
    console.log(`Админ ${msg.from.id} запросил информацию о пользователе ${userId}: ${warnings} предупреждений`);
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
    
    // Удаляем из черного списка
    blackList.delete(userId);
    userWarnings.delete(userId);
    
    // Размьючиваем пользователя
    try {
        await bot.restrictChatMember(chatId, userId, {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false
        });
        console.log(`Пользователь ${userId} размьючен`);
        
        // Отправляем ОДНО сообщение об успешном разбане
        await bot.sendMessage(chatId, `Пользователь ${userId} удален из черного списка, размьючен и его предупреждения сброшены.`);
    } catch (unmuteError) {
        console.error('Ошибка при размьючивании:', unmuteError);
        // Даже если размьючивание не удалось, отправляем сообщение
        await bot.sendMessage(chatId, `Пользователь ${userId} удален из черного списка и его предупреждения сброшены.`);
    }
});

// Команда приветствия для администраторов
bot.onText(/\/misha/, async (msg) => {
    const chatId = msg.chat.id;
    
    // НЕ работает в группе отчетов
    if (REPORTS_GROUP_ID && chatId.toString() === REPORTS_GROUP_ID) {
        return;
    }
    
    // Проверяем права администратора
    try {
        const chatMember = await bot.getChatMember(chatId, msg.from.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            console.log(`Пользователь ${msg.from.id} попытался использовать /misha без прав администратора`);
            return;
        }
    } catch (error) {
        console.error('Ошибка проверки прав администратора для /misha:', error);
        return;
    }
    
    const greetingMessage = 
        `Привет! Я — бот Злой Миша. Теперь я буду активно следить за правилами в чатах. Ждите меня, я приду 👹\n[ваш Злой Миша]`;
    
    try {
        // Подготавливаем опции для отправки
        const sendOptions = {};
        
        // Если команда в подтеме, отвечаем в ту же подтему
        if (msg.message_thread_id) {
            sendOptions.message_thread_id = msg.message_thread_id;
        }
        
        await bot.sendMessage(chatId, greetingMessage, sendOptions);
        console.log(`Команда /misha выполнена администратором ${msg.from.id} в чате ${chatId}`);
    } catch (error) {
        console.error('Ошибка при отправке приветствия:', error);
    }
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
    console.log(`Группа отчетов: ${REPORTS_GROUP_ID || 'не настроена'}`);
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
