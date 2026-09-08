import React, { useCallback, useMemo, useState } from 'react';
import { generatePinCode } from '../adminUI';
import { Button, Modal, ModalHeader } from '../ui';
import { apiFetch, parseJsonSafely } from '../api';

function hexToRgb(hex) {
  const normalized = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function getReadableTextColor(backgroundHex) {
  const rgb = hexToRgb(backgroundHex);
  if (!rgb) return '#173857';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.62 ? '#173857' : '#F7FBFF';
}

function toRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(23, 56, 87, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getStatusBadgeStyle(level) {
  switch (String(level || 'none')) {
    case 'great':
      return { background: '#e8f6ec', border: '1px solid #bfe6cd', color: '#2d7a4a' };
    case 'ok':
      return { background: '#eaf3fb', border: '1px solid #c6e0f5', color: '#1f4f7a' };
    case 'soon':
      return { background: '#fff7e0', border: '1px solid #f3e0a3', color: '#8a6a11' };
    case 'expired':
      return { background: '#fde9e9', border: '1px solid #f3bdbd', color: '#a8272a' };
    case 'warning':
      return { background: '#fff1e5', border: '1px solid #f6cfb0', color: '#9c5a1d' };
    case 'none':
    default:
      return { background: '#f3f4f6', border: '1px solid #d9dce1', color: '#565a63' };
  }
}

function getStatusIcon(level) {
  switch (String(level || 'none')) {
    case 'great':
    case 'ok':
      return '✅';
    case 'soon':
      return '🟡';
    case 'expired':
      return '🔴';
    case 'warning':
      return '🟠';
    default:
      return '⚪';
  }
}

function formatDateRu(isoDate) {
  const s = String(isoDate || '').trim();
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(+d)) return s;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (_) {
    return s;
  }
}

function EmployeeModal({
  mode,
  employeeForm,
  setEmployeeForm,
  onAdd,
  onUpdate,
  onClose,
  saving = false,
  columnOptions = [],
  sessionStatus = null,
  refreshingSession = false,
  onRefreshSession = null,
  lastRefreshResult = null,
  sendingTelegram = false,
  onSendTelegramDirectLink = null,
  lastSendResult = null,
}) {
  if (!mode) return null;

  const decoratedColumnOptions = useMemo(() => {
    return columnOptions.map((column) => {
      const previewColor = column.previewColor || '#DCEBFA';
      const textColor = getReadableTextColor(previewColor);
      return {
        ...column,
        previewColor,
        textColor,
        descriptionColor: toRgba(textColor, 0.78),
        borderColor: toRgba(textColor, 0.18),
        shadowColor: toRgba(textColor, 0.12),
      };
    });
  }, [columnOptions]);

  const copyLink = useCallback(async (text) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text || ''));
      } else {
        const ta = document.createElement('textarea');
        ta.value = String(text || '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) { /* ignore */ }
        document.body.removeChild(ta);
      }
    } catch (_) { /* ignore */ }
  }, []);

  const badgeStyle = getStatusBadgeStyle(sessionStatus?.statusLevel);
  const statusIcon = getStatusIcon(sessionStatus?.statusLevel);
  const expiresAt = lastRefreshResult?.expiresAt || sessionStatus?.expiresAt;
  const expiresLabel = formatDateRu(expiresAt) || '';
  const lastSeenLabel = formatDateRu(sessionStatus?.telegramLastSeenAt) || '';
  const authorizedLabel = formatDateRu(sessionStatus?.telegramAuthorizedAt) || '';
  const webAppUrl = lastRefreshResult?.employeeWebAppUrl || lastSendResult?.employeeWebAppUrl || '';
  const refreshButtonVariant = (sessionStatus?.statusLevel === 'expired' || sessionStatus?.statusLevel === 'soon')
    ? 'success'
    : 'primary';
  const sendButtonVariant = (lastSendResult?.sent) ? 'success' : 'secondary';
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState(null);
  const runEmployeeTokenDiagnostics = useCallback(async () => {
    try {
      setDiagnosticsLoading(true);
      const sessionToken = lastRefreshResult?.sessionToken || lastSendResult?.sessionToken || '';
      const res = await apiFetch('/api/telegram/diagnostics/token-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          initData: '',
          unsafeUser: null,
          employeeId: employee?._id || '',
        }),
      });
      const data = await parseJsonSafely(res);
      setDiagnosticsResult(data || null);
    } catch (_err) {
      setDiagnosticsResult({ ok: false, steps: [], error: String(_err?.message || _err || 'Network error') });
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [employee?._id, lastRefreshResult?.sessionToken, lastSendResult?.sessionToken]);
  const sendStatusLabel = (() => {
    if (!lastSendResult) return null;
    if (lastSendResult.sent) return { icon: '✅', text: 'Ссылка отправлена сотруднику в личку Telegram', style: { color: '#2d7a4a', background: '#eefbf2', border: '1px solid #c9ecd5' } };
    if (lastSendResult.sendStatus === 'no-chat-id') return { icon: '⚠️', text: 'У сотрудника нет Telegram ChatId — отправка в бот невозможна. Скопируйте ссылку вручную и отправьте лично.', style: { color: '#8a6a11', background: '#fff7e0', border: '1px solid #f3e0a3' } };
    if (lastSendResult.sendStatus === 'telegram-error') return { icon: '❌', text: `Telegram отказал: ${lastSendResult.telegramError || 'неизвестная ошибка'}. Скопируйте ссылку и отправьте вручную.`, style: { color: '#a8272a', background: '#fde9e9', border: '1px solid #f3bdbd' } };
    return null;
  })();

  return (
    <Modal open={Boolean(mode)} onClose={onClose} closeDisabled={saving} size="lg">
      <ModalHeader
        title={mode === 'edit' ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
        subtitle="Параметры входа в Telegram-бот, должность и закрепленные производственные колонки."
        onClose={onClose}
        closeDisabled={saving}
      />

      <div className="form-group">
        <label>ФИО</label>
        <input
          value={employeeForm?.fullName || ''}
          onChange={e => setEmployeeForm({ ...employeeForm, fullName: e.target.value })}
          placeholder="Например: Иванов Иван Иванович"
          disabled={saving}
        />
      </div>

      <div className="form-group">
        <label>Должность</label>
        <input
          value={employeeForm?.role || ''}
          onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}
          placeholder="Например: Столяр, Маляр, Технолог"
          disabled={saving}
        />
        <div className="text-small text-subtle" style={{ marginTop: 6 }}>
          Должность вводится вручную. Если сотрудник работает с QR-этапами, указывайте понятное рабочее название без выпадающего списка.
        </div>
      </div>

      <div className="form-group">
        <label>Telegram username</label>
        <input
          value={employeeForm?.telegramUsername || ''}
          onChange={e => setEmployeeForm({ ...employeeForm, telegramUsername: e.target.value })}
          placeholder="@username"
          disabled={saving}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
          <label>PIN-код</label>
          <div className="modal-actions-group">
            <input
              value={employeeForm?.pinCode || ''}
              onChange={e => setEmployeeForm({ ...employeeForm, pinCode: e.target.value })}
              placeholder="Код для Telegram-бота"
              disabled={saving}
            />
            <Button
              variant="secondary"
              className="employee-pin-generate-btn"
              disabled={saving}
              onClick={() => setEmployeeForm({ ...employeeForm, pinCode: generatePinCode() })}
            >
              Сгенерировать
            </Button>
          </div>
      </div>

      {mode === 'edit' && (
        <div className="form-group" style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 10,
          background: 'linear-gradient(180deg,#fafbfc,#f5f7fb)',
          border: '1px solid #e3e7ee',
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 10,
            color: '#173857',
          }}>
            🔐 Статус Telegram-авторизации (токен на {Number(sessionStatus?.ttlDays || 1825) || 1825} дней)
          </div>

          {!sessionStatus && (
            <div style={{ fontSize: 13, color: '#565a63' }}>
              Загружаю статус токена...
            </div>
          )}

          {sessionStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: badgeStyle.background,
                border: badgeStyle.border,
                color: badgeStyle.color,
              }}>
                <span>{statusIcon}</span>
                <span>{sessionStatus?.statusLabel || '—'}</span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 8,
                fontSize: 12,
                color: '#4b5059',
              }}>
                {authorizedLabel && (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Авторизован:</div>
                    <div>{authorizedLabel}</div>
                  </div>
                )}
                {lastSeenLabel && (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Последний вход:</div>
                    <div>{lastSeenLabel}</div>
                  </div>
                )}
                {expiresLabel && (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Истекает:</div>
                    <div>{expiresLabel}</div>
                  </div>
                )}
                {sessionStatus?.telegramUsername && (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Username:</div>
                    <div>{sessionStatus.telegramUsername}</div>
                  </div>
                )}
                {!sessionStatus?.hasTelegramLink && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    Этот сотрудник ещё не связан с Telegram. Попросите его нажать «Сканер QR» в меню бота и ввести свой PIN-код.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                <Button
                  variant={refreshButtonVariant}
                  onClick={() => onRefreshSession && onRefreshSession()}
                  disabled={refreshingSession || saving || !onRefreshSession}
                >
                  {refreshingSession
                    ? 'Продлеваю...'
                    : '🔄 Продлить токен на 5 лет'}
                </Button>
                <Button
                  variant={sendButtonVariant}
                  onClick={() => onSendTelegramDirectLink && onSendTelegramDirectLink()}
                  disabled={sendingTelegram || saving || !onSendTelegramDirectLink || !sessionStatus?.hasTelegramLink}
                >
                  {sendingTelegram
                    ? 'Отправляю в Telegram...'
                    : '📤 Отправить ссылку в Telegram'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={runEmployeeTokenDiagnostics}
                  disabled={diagnosticsLoading || saving}
                >
                  {diagnosticsLoading ? 'Диагностика...' : '🔍 Диагностика токена'}
                </Button>
              </div>

              {diagnosticsResult && (
                <div style={{
                  marginTop: 10,
                  background: '#f5f7fb',
                  border: '1px solid #d9dfeb',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: '#1f3046',
                  maxHeight: 280,
                  overflowY: 'auto',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>
                      {diagnosticsResult.ok ? '✅ Авторизация работает' : '❌ Найдена проблема'}
                    </span>
                    <Button variant="secondary" onClick={() => copyLink(JSON.stringify(diagnosticsResult, null, 2))}>
                      📋 Скопировать JSON
                    </Button>
                  </div>
                  {JSON.stringify(diagnosticsResult, null, 2)}
                </div>
              )}

              {sendStatusLabel && (
                <div style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  ...sendStatusLabel.style,
                }}>
                  <span style={{ marginRight: 6 }}>{sendStatusLabel.icon}</span>
                  {sendStatusLabel.text}
                </div>
              )}

              {(lastRefreshResult?.ok || lastSendResult?.ok) && webAppUrl && (
                <div style={{
                  marginTop: 6,
                  padding: 12,
                  borderRadius: 8,
                  background: '#eefbf2',
                  border: '1px solid #c9ecd5',
                  fontSize: 13,
                  lineHeight: 1.55,
                }}>
                  <div style={{ fontWeight: 700, color: '#2d7a4a', marginBottom: 6 }}>
                    ✅ {lastSendResult?.sent ? 'Токен продлён и отправлен сотруднику в Telegram!' : 'Токен продлён!'} Действует до {formatDateRu(lastRefreshResult.expiresAt || lastSendResult.expiresAt)}.
                  </div>
                  <div style={{ marginBottom: 6, color: '#23394f' }}>
                    Отправьте сотруднику эту ссылку — при открытии он сразу получит доступ на {Number(lastRefreshResult.daysLeft || lastSendResult.daysLeft || 1825) || 1825} дней:
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{
                      flex: '1 1 240px',
                      minWidth: 240,
                      background: '#ffffff',
                      border: '1px solid #d9dfeb',
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      wordBreak: 'break-all',
                      color: '#1f3046',
                    }}>
                      {webAppUrl}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => copyLink(webAppUrl)}
                    >
                      📋 Копировать ссылку
                    </Button>
                    {(lastRefreshResult?.sessionToken || lastSendResult?.sessionToken) && (
                      <Button
                        variant="secondary"
                        onClick={() => copyLink(lastRefreshResult.sessionToken || lastSendResult.sessionToken)}
                      >
                        📋 Копировать токен
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="form-group">
        <label>Колонки, за которые отвечает сотрудник</label>
        <div className="role-columns-picker">
          {decoratedColumnOptions.map((column) => {
            const equivalentKeys = Array.isArray(column.equivalentKeys) && column.equivalentKeys.length > 0
              ? column.equivalentKeys
              : [column.key];
            const checked = Array.isArray(employeeForm?.allowedColumns)
              && equivalentKeys.some((key) => employeeForm.allowedColumns.includes(key));
            return (
              <label
                key={column.key}
                className={`role-columns-picker-item ${checked ? 'role-columns-picker-item-selected' : ''}`}
                style={{
                  background: column.previewColor,
                  color: column.textColor,
                  borderColor: column.borderColor,
                  boxShadow: checked ? `0 12px 24px ${column.shadowColor}` : `0 6px 16px ${column.shadowColor}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={(event) => {
                    const currentColumns = Array.isArray(employeeForm?.allowedColumns) ? employeeForm.allowedColumns : [];
                    const nextColumns = new Set(currentColumns);
                    equivalentKeys.forEach((key) => {
                      if (event.target.checked) {
                        nextColumns.add(key);
                      } else {
                        nextColumns.delete(key);
                      }
                    });
                    setEmployeeForm({
                      ...employeeForm,
                      allowedColumns: Array.from(nextColumns),
                    });
                  }}
                />
                <span className="role-columns-picker-body">
                  <span className="role-columns-picker-title" style={{ color: column.textColor }}>{column.label}</span>
                  {column.description ? (
                    <span className="role-columns-picker-description" style={{ color: column.descriptionColor }}>{column.description}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="modal-actions">
        <Button variant="success" onClick={mode === 'edit' ? onUpdate : onAdd} disabled={saving}>
          {saving ? (mode === 'edit' ? 'Сохранение...' : 'Добавление...') : (mode === 'edit' ? 'Сохранить сотрудника' : 'Добавить сотрудника')}
        </Button>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
      </div>
    </Modal>
  );
}

export default EmployeeModal;
