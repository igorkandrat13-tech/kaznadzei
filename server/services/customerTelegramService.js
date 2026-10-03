let loaded = null;
let loadedSource = 'new';
try {
  loaded = require('./customer-tg/index.js');
  loadedSource = 'customer-tg';
} catch (err) {
  loaded = require('./customerTelegramService.legacy.js');
  loadedSource = 'legacy';
}

if (!loaded || typeof loaded !== 'object') {
  loaded = require('./customerTelegramService.legacy.js');
  loadedSource = 'legacy';
}

const requiredPublicNames = [
  'buildCustomerSharePayload',
  'getCustomerKeyboardReplyMarkup',
  'getCustomerRemoveKeyboardReplyMarkup',
  'getCustomerAccessClosedText',
  'getCustomerFullOrderText',
  'getCustomerBackToItemsButtonText',
  'getCustomerOrderCardMessage',
  'getCustomerItemCardMessage',
  'getCustomerOrderChangedItemsText',
  'getCustomerOrderUpdateItemText',
  'buildCustomerOrderItemsStatusLines',
  'buildCustomerOrderProgressSummary',
  'CUSTOMER_FULL_ORDER_BUTTON_TEXT',
  'CUSTOMER_CALLBACK_ACTION_ITEM',
  'CUSTOMER_CALLBACK_ACTION_ORDER',
  'ensureCustomerOrderAccess',
  'CUSTOMER_START_PREFIX',
  'extractCustomerAccessTokenFromStartText',
  'parseCustomerCallbackData',
  'resolveCustomerBackToItemsFromText',
  'resolveCustomerItemSelectionFromText',
  'resolveRememberedCustomerAccess',
  'getCustomerAlreadyLinkedText',
  'getCustomerSubscriptionReadyText',
  'getCustomerOrderShare',
  'issueCustomerOrderAccess',
  'notifyCustomerOrderArchived',
  'notifyCustomerOrderCreated',
  'notifyCustomerOrderRestored',
  'notifyCustomerOrderStatusText',
  'sendCustomerTelegramMessage',
];

const missing = requiredPublicNames.filter(name => typeof loaded[name] === 'undefined');
if (missing.length > 0) {
  loaded = require('./customerTelegramService.legacy.js');
  loadedSource = 'legacy';
}

loaded.__source = loadedSource;

module.exports = loaded;
