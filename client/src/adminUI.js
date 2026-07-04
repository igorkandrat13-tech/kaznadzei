import React from 'react';
import { Button } from './ui';

export const emptyEmployeeForm = {
  fullName: '',
  role: '',
  telegramUsername: '',
  pinCode: '',
};

export function HelpTooltip({ text }) {
  return (
    <span className="help-tooltip" tabIndex={0}>
      <span className="help-tooltip-icon">?</span>
      <span className="help-tooltip-content">{text}</span>
    </span>
  );
}

export function SettingsHeader({ title, onBack, activeRole, onTabChange, tabs = [] }) {
  return (
    <div className="card settings-header-card">
      <div className="settings-header-top">
        <h2>{title}</h2>
        <Button onClick={onBack}>← Назад</Button>
      </div>
      <div className="tabs">
        {tabs.map(tab => (
          <button key={tab.key} className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`} onClick={() => onTabChange(tab.key)} type="button">
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsFeedback({ error, success }) {
  return (
    <>
      {error && <div className="settings-alert settings-alert-error">{error}</div>}
      {success && <div className="settings-alert settings-alert-success">{success}</div>}
    </>
  );
}

export function SettingsActions({ children }) {
  return <div className="settings-actions">{children}</div>;
}

export function SettingsHint({ children }) {
  return <div className="settings-hint">{children}</div>;
}

export function SectionHeader({ title, description, actions }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions ? <div className="section-header-actions">{actions}</div> : null}
    </div>
  );
}

export function generatePinCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function buildSettingsTabs() {
  return [
    { key: 'general', label: '⚙️ Общие' },
    { key: 'roles', label: '🧩 Роли' },
    { key: 'employees', label: '👥 Сотрудники' },
    { key: 'colors', label: '🎨 Легенда этапов' },
  ];
}
