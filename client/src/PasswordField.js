import React, { useState } from 'react';

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
  allowGenerate = false,
  allowCopy = false,
  onRequestGenerate,
  id,
}) {
  const [visible, setVisible] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);

  const handleCopy = async () => {
    if (!value || !allowCopy) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(String(value));
      } else {
        const ta = document.createElement('textarea');
        ta.value = String(value);
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 1600);
    } catch {
      // noop
    }
  };

  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      {label ? <label htmlFor={id}>{label}</label> : null}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value || ''}
          onChange={(e) => onChange && onChange(e)}
          placeholder={placeholder || ''}
          disabled={disabled || false}
          autoFocus={autoFocus || false}
          autoComplete="new-password"
          style={{
            flex: 1,
            paddingRight: 48 + (allowGenerate ? 44 : 0) + (allowCopy ? 44 : 0),
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            gap: 2,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            title={visible ? 'Скрыть пароль' : 'Показать пароль'}
            className="help-tooltip"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: disabled ? 'default' : 'pointer',
              color: copyFlash ? '#15803d' : '#6b7280',
              fontSize: 15,
              padding: 4,
              minWidth: 30,
            }}
            onClick={() => setVisible(v => !v)}
            disabled={disabled}
            aria-label="toggle password visibility"
          >
            {visible ? '🙈' : '👁'}
          </button>
          {allowGenerate ? (
            <button
              type="button"
              title="Сгенерировать пароль"
              className="help-tooltip"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: disabled ? 'default' : 'pointer',
                color: '#6b7280',
                fontSize: 15,
                padding: 4,
                minWidth: 30,
              }}
              onClick={() => onRequestGenerate && onRequestGenerate()}
              disabled={disabled}
              aria-label="generate password"
            >
              🎲
            </button>
          ) : null}
          {allowCopy ? (
            <button
              type="button"
              title={copyFlash ? 'Пароль скопирован' : 'Скопировать пароль'}
              className="help-tooltip"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: disabled || !value ? 'default' : 'pointer',
                color: copyFlash ? '#15803d' : '#6b7280',
                fontSize: 15,
                padding: 4,
                minWidth: 30,
                opacity: value ? 1 : 0.35,
              }}
              onClick={handleCopy}
              disabled={disabled || !value}
              aria-label="copy password"
            >
              📋
            </button>
          ) : null}
        </div>
      </div>
      {copyFlash ? (
        <div className="settings-alert settings-alert-success" style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}>
          Пароль скопирован в буфер обмена
        </div>
      ) : null}
    </div>
  );
}

export default PasswordField;
