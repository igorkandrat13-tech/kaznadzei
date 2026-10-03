import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, ModalHeader } from './ui';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SPECIALS = '!@#$%^&*()_+-=[]{};:,.<>?';

function secureInt(maxExclusive) {
  try {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] % maxExclusive;
    }
  } catch {
    // fallback
  }
  return Math.floor(Math.random() * maxExclusive);
}

function generatePassword(length, { useSpecials, useDigits, useCase }) {
  let pool = LOWER;
  const required = [];
  if (useCase) {
    pool += UPPER;
    required.push(UPPER[secureInt(UPPER.length)]);
  }
  if (useDigits) {
    pool += DIGITS;
    required.push(DIGITS[secureInt(DIGITS.length)]);
  }
  if (useSpecials) {
    pool += SPECIALS;
    required.push(SPECIALS[secureInt(SPECIALS.length)]);
  }
  const lowerPick = LOWER[secureInt(LOWER.length)];
  if (!required.some(c => LOWER.includes(c))) {
    required.push(lowerPick);
  }
  const remaining = Math.max(0, length - required.length);
  const chars = [...required];
  for (let i = 0; i < remaining; i += 1) {
    chars.push(pool[secureInt(pool.length)]);
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = secureInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function PasswordGeneratorModal({
  open,
  onClose,
  onAccept,
  defaultLength = 12,
}) {
  const [length, setLength] = useState(defaultLength);
  const [useSpecials, setUseSpecials] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useCase, setUseCase] = useState(true);
  const [password, setPassword] = useState('');
  const [copyFlash, setCopyFlash] = useState(false);

  useEffect(() => {
    if (open) {
      setLength(defaultLength);
      setUseSpecials(true);
      setUseDigits(true);
      setUseCase(true);
      const atLeastOne = true || useSpecials || useDigits || useCase;
      if (atLeastOne) {
        setPassword(generatePassword(defaultLength, { useSpecials: true, useDigits: true, useCase: true }));
      } else {
        setPassword('');
      }
    }
  }, [open, defaultLength]);

  const canGenerate = useSpecials || useDigits || useCase;

  const handleGenerate = () => {
    if (!canGenerate) return;
    setPassword(generatePassword(Math.max(4, Math.min(64, Number(length) || 12)), {
      useSpecials, useDigits, useCase,
    }));
  };

  const handleCopy = async () => {
    if (!password) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(password);
      } else {
        const ta = document.createElement('textarea');
        ta.value = password;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 1700);
    } catch {
      // noop
    }
  };

  const handleAccept = () => {
    if (!password) return;
    onAccept && onAccept(password);
    onClose && onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="md" className="password-generator-modal">
      <ModalHeader
        title="🎲 Сгенерировать пароль"
        subtitle="Настройте параметры и нажмите ОК, чтобы использовать пароль."
        onClose={onClose}
      />
      <div style={{ padding: '0 20px 20px' }}>
        <div className="responsive-form-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Длина пароля</label>
            <input
              type="number"
              min="4"
              max="64"
              value={length}
              onChange={(e) => setLength(Math.max(4, Math.min(64, Number(e.target.value) || 12)))}
              disabled={!open}
            />
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useSpecials}
              onChange={(e) => setUseSpecials(e.target.checked)}
              disabled={!open}
            />
            <span style={{ fontSize: 14 }}>Спецсимволы</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useDigits}
              onChange={(e) => setUseDigits(e.target.checked)}
              disabled={!open}
            />
            <span style={{ fontSize: 14 }}>Цифры</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useCase}
              onChange={(e) => setUseCase(e.target.checked)}
              disabled={!open}
            />
            <span style={{ fontSize: 14 }}>Регистр</span>
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Сгенерированный пароль</label>
            <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="text" readOnly value={password} style={{ flex: 1, fontFamily: 'ui-monospace, monospace', letterSpacing: 0.4 }} />
              <Button variant="primary" onClick={handleGenerate} disabled={!canGenerate} title="Сгенерировать">
                🎲 Сгенерировать
              </Button>
              <Button variant="secondary" onClick={handleCopy} disabled={!password} title="Скопировать">
                {copyFlash ? 'Скопировано ✔️' : '📋'}
              </Button>
            </div>
            {!canGenerate ? (
              <div className="settings-alert settings-alert-error" style={{ marginTop: 10, padding: '6px 12px', fontSize: 13 }}>
                Включите хотя бы один набор символов (Спецсимволы, Цифры или Регистр).
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose} disabled={!open}>Отмена</Button>
        <Button variant="success" onClick={handleAccept} disabled={!password || !canGenerate}>
          ОК (использовать)
        </Button>
      </div>
    </Modal>
  );
}

export default PasswordGeneratorModal;
export { generatePassword, secureInt };
