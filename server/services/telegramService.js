const https = require('https');

function telegramRequest(token, method, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${encodeURIComponent(token)}/${method}`,
      method: body ? 'POST' : 'GET',
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      } : undefined,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (!parsed.ok) {
            reject(new Error(parsed.description || `Telegram API error: ${method}`));
            return;
          }
          resolve(parsed.result);
        } catch (error) {
          reject(new Error(`Не удалось разобрать ответ Telegram API для ${method}.`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function getBotInfo(token) {
  return telegramRequest(token, 'getMe');
}

async function getWebhookInfo(token) {
  return telegramRequest(token, 'getWebhookInfo');
}

async function setWebhook(token, url) {
  return telegramRequest(token, 'setWebhook', {
    url,
    allowed_updates: ['message'],
  });
}

async function sendMessage(token, chatId, text, extra = {}) {
  return telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function setChatMenuButton(token, { chatId, text, url, type } = {}) {
  const payload = {};
  if (chatId) {
    payload.chat_id = chatId;
  }
  if (type === 'default') {
    payload.menu_button = { type: 'default' };
  } else if (text && url) {
    payload.menu_button = {
      type: 'web_app',
      text,
      web_app: { url },
    };
  }
  return telegramRequest(token, 'setChatMenuButton', payload);
}

module.exports = {
  getBotInfo,
  getWebhookInfo,
  setWebhook,
  setChatMenuButton,
  sendMessage,
};
