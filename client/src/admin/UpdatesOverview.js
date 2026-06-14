import React from 'react';
import { SectionHeader, SettingsHint } from '../adminUI';

function UpdatesOverview({
  updateStatus,
  updateMessage,
  updateError,
  checkingUpdates,
  installingUpdates,
  onRefresh,
  onInstall,
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
          </>
        }
      />
      {updateMessage && <div className="settings-alert settings-alert-success">{updateMessage}</div>}
      {updateError && <div className="settings-alert settings-alert-error" style={{ whiteSpace: 'pre-wrap' }}>{updateError}</div>}
      {updateStatus?.enabled ? (
        <>
          <div className="overview-stats-grid" style={{ marginTop: 16 }}>
            <div className="overview-stat-card"><strong>Git:</strong> {updateStatus?.gitAvailable ? (updateStatus.gitVersion || 'установлен') : 'не найден'}</div>
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
        </>
      ) : (
        <SettingsHint>
          Self-update сейчас отключён. Чтобы включить обновления из интерфейса, установите <strong>ENABLE_SELF_UPDATE=true</strong> в <strong>/opt/kaznadzei/.env</strong>, перезапустите сервис и сохраните актуальный <strong>ADMIN_TOKEN</strong> в панели сверху.
        </SettingsHint>
      )}
    </div>
  );
}

export default UpdatesOverview;
