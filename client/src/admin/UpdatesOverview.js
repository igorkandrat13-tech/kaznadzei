import React from 'react';
import { HelpTooltip, SectionHeader, SettingsHint } from '../adminUI';

function UpdatesOverview({
  updateStatus,
  updateMessage,
  updateError,
  checkingUpdates,
  installingUpdates,
  restartingService,
  loadingServiceDetails,
  serviceDetails,
  appSettings,
  onSettingsChange,
  onRefresh,
  onInstall,
  onRestartService,
  onShowServiceDetails,
  onSaveUpdateSettings,
}) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <SectionHeader
        title="🔄 Обновление проекта"
        description="Проверка удаленного Git-репозитория и установка новых изменений"
        actions={
          <>
            <button className="btn btn-primary" onClick={onRefresh} disabled={checkingUpdates || installingUpdates}>
              {checkingUpdates ? 'Проверка...' : 'Проверить обновления'}
            </button>
            <button
              className="btn btn-success"
              onClick={onInstall}
              disabled={installingUpdates || checkingUpdates || !updateStatus?.canInstall || !updateStatus?.updatesAvailable}
            >
              {installingUpdates ? 'Установка...' : 'Установить обновления'}
            </button>
            <button
              className="btn"
              onClick={onRestartService}
              disabled={restartingService || checkingUpdates || !updateStatus?.systemctlAvailable}
            >
              {restartingService ? 'Перезапуск...' : 'Перезапустить сервис'}
            </button>
            <button
              className="btn"
              onClick={onShowServiceDetails}
              disabled={loadingServiceDetails || checkingUpdates || !updateStatus?.systemctlAvailable}
            >
              {loadingServiceDetails ? 'Загрузка...' : 'Статус и логи'}
            </button>
          </>
        }
      />
      <div className="settings-hint" style={{ marginBottom: 10 }}>
        Настройки обновления перенесены сюда и больше не показываются в разделе общих настроек.
      </div>
      <div className="responsive-form-grid" style={{ marginBottom: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Ветка обновлений
            <HelpTooltip text="Для текущего публичного репозитория GitHub используйте main." />
          </label>
          <input
            value={appSettings?.updateBranch || ''}
            onChange={e => onSettingsChange(current => ({ ...current, updateBranch: e.target.value }))}
            placeholder="main"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Git репозиторий для обновлений
            <HelpTooltip text="Для текущего публичного GitHub используйте HTTPS URL. Для приватного репозитория позже можно перейти на SSH URL с deploy key." />
          </label>
          <input
            value={appSettings?.updateRepositoryUrl || ''}
            onChange={e => onSettingsChange(current => ({ ...current, updateRepositoryUrl: e.target.value }))}
            placeholder="https://github.com/igorkandrat13-tech/kaznadzei.git"
          />
        </div>
      </div>
      <div className="settings-actions" style={{ marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(appSettings?.selfUpdateEnabled)}
            onChange={e => onSettingsChange(current => ({ ...current, selfUpdateEnabled: e.target.checked }))}
          />
          Разрешить self-update из интерфейса
        </label>
        <button className="btn btn-success" onClick={onSaveUpdateSettings}>
          Сохранить настройки обновления
        </button>
      </div>
      {updateMessage && <div className="settings-alert settings-alert-success">{updateMessage}</div>}
      {updateError && <div className="settings-alert settings-alert-error" style={{ whiteSpace: 'pre-wrap' }}>{updateError}</div>}
      {updateStatus?.enabled ? (
        <>
          <div className="overview-stats-grid" style={{ marginTop: 16 }}>
            <div className="overview-stat-card"><strong>Git:</strong> {updateStatus?.gitAvailable ? (updateStatus.gitVersion || 'установлен') : 'не найден'}</div>
            <div className="overview-stat-card"><strong>systemd:</strong> {updateStatus?.systemctlAvailable ? 'доступен' : 'недоступен'}</div>
            <div className="overview-stat-card"><strong>Сервис:</strong> {updateStatus?.serviceName || '—'}</div>
            <div className="overview-stat-card"><strong>Статус сервиса:</strong> {updateStatus?.serviceActiveState || 'не определен'}</div>
            <div className="overview-stat-card"><strong>Репозиторий:</strong> {updateStatus?.isRepo ? 'инициализирован' : 'не инициализирован'}</div>
            <div className="overview-stat-card"><strong>Remote origin:</strong> {updateStatus?.remoteUrl || 'не настроен'}</div>
            <div className="overview-stat-card"><strong>Ветка:</strong> {updateStatus?.branch || '—'}</div>
            <div className="overview-stat-card"><strong>Источник обновления:</strong> {updateStatus?.targetRef || '—'}</div>
            <div className="overview-stat-card"><strong>Новых коммитов:</strong> {updateStatus?.behind ?? '—'}</div>
          </div>
          {!updateError && updateStatus?.message && <SettingsHint>{updateStatus.message}</SettingsHint>}
          {updateStatus && !updateStatus.gitAvailable && (
            <SettingsHint>
              Для включения обновлений установите Git и убедитесь, что команда <strong>git</strong> доступна в PATH.
            </SettingsHint>
          )}
          {updateStatus && updateStatus.gitAvailable && !updateStatus.isRepo && (
            <SettingsHint>
              Инициализируйте локальный репозиторий командой <strong>git init</strong> в корне проекта.
            </SettingsHint>
          )}
          {updateStatus && updateStatus.isRepo && !updateStatus.hasRemote && (
            <SettingsHint>
              Подключите удаленный репозиторий командой <strong>git remote add origin &lt;URL_РЕПОЗИТОРИЯ&gt;</strong>.
            </SettingsHint>
          )}
          {updateStatus && !updateStatus.systemctlAvailable && (
            <SettingsHint>
              Перезапуск из интерфейса доступен только на Linux-сервере с <strong>systemd</strong>.
            </SettingsHint>
          )}
          {updateStatus && updateStatus.systemctlAvailable && (
            <SettingsHint>
              Для работы кнопки перезапуска процессу приложения нужны права на <strong>systemctl restart {updateStatus.serviceName || 'kaznadzei'}</strong>. Обычно это настраивается через <strong>sudoers</strong> с режимом <strong>NOPASSWD</strong>.
            </SettingsHint>
          )}
          {serviceDetails && (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#2c3e50' }}>
                  Статус сервиса {serviceDetails.serviceName}
                </div>
                <pre style={{ margin: 0, padding: 12, borderRadius: 10, background: '#0f172a', color: '#e5eefc', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5, maxHeight: 280, overflow: 'auto' }}>
                  {serviceDetails.statusText}
                </pre>
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#2c3e50' }}>
                  Последние логи
                </div>
                <pre style={{ margin: 0, padding: 12, borderRadius: 10, background: '#111827', color: '#d1fae5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5, maxHeight: 320, overflow: 'auto' }}>
                  {serviceDetails.logsText}
                </pre>
              </div>
              {(serviceDetails.statusError || serviceDetails.logsError) && (
                <SettingsHint>
                  {serviceDetails.statusError || serviceDetails.logsError}
                </SettingsHint>
              )}
            </div>
          )}
        </>
      ) : (
        <SettingsHint>
          Self-update сейчас отключён. Чтобы включить обновления из интерфейса, установите <strong>ENABLE_SELF_UPDATE=true</strong> в <strong>/opt/kaznadzei/.env</strong> и перезапустите сервис.
        </SettingsHint>
      )}
    </div>
  );
}

export default UpdatesOverview;
