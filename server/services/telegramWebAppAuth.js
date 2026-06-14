const crypto = require('crypto');

function getTelegramWebAppUser(token, initData) {
  const normalizedToken = String(token || '').trim();
  const normalizedInitData = String(initData || '').trim();

  if (!normalizedToken) {
    throw new Error('Токен Telegram-бота не настроен.');
  }

  if (!normalizedInitData) {
    throw new Error('Не передан initData Telegram Web App.');
  }

  const params = new URLSearchParams(normalizedInitData);
  const hash = params.get('hash');
  if (!hash) {
    throw new Error('Отсутствует hash в initData Telegram Web App.');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(normalizedToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const providedHash = Buffer.from(hash, 'hex');
  const expectedHash = Buffer.from(calculatedHash, 'hex');

  if (providedHash.length !== expectedHash.length || !crypto.timingSafeEqual(providedHash, expectedHash)) {
    throw new Error('Подпись Telegram Web App не прошла проверку.');
  }

  const userJson = params.get('user');
  if (!userJson) {
    throw new Error('В initData отсутствуют данные пользователя Telegram.');
  }

  let user;
  try {
    user = JSON.parse(userJson);
  } catch (error) {
    throw new Error('Не удалось разобрать пользователя Telegram из initData.');
  }

  if (!user?.id) {
    throw new Error('Некорректные данные пользователя Telegram.');
  }

  return user;
}

module.exports = {
  getTelegramWebAppUser,
};
