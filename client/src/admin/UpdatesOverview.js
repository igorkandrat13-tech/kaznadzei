import React, { useEffect, useState } from 'react';
import { HelpTooltip, SectionHeader, SettingsHint } from '../adminUI';
import { Button } from '../ui';

const INSTALL_PROGRESS_STAGES = [
  { key: 'created', label: 'Запуск', percent: 8 },
  { key: 'check', label: 'Проверка', percent: 18 },
  { key: 'pull', label: 'Git', percent: 42 },
  { key: 'deps', label: 'Зависимости', percent: 68 },
  { key: 'build', label: 'Сборка', percent: 88 },
  { key: 'finalize', label: 'Завершение', percent: 96 },
];

function detectInstallProgressStage(installJob) {
  const text = `${installJob?.message || ''}\n${Array.isArray(installJob?.logs) ? installJob.logs.join('\n') : ''}`.toLowerCase();
  if (installJob?.status === 'completed') return { key: 'completed', percent: 100, label: 'Готово', tone: 'completed' };
  if (text.includes('итоговый статус')) return { key: 'finalize', percent: 96, label: 'Завершение', tone: 'running' };
  if (text.includes('собираю клиент') || text.includes('npm run build')) return { key: 'build', percent: 88, label: 'Сборка', tone: 'running' };
  if (text.includes('обновляю зависимости') || text.includes('npm ci') || text.includes('npm install')) return { key: 'deps', percent: 68, label: 'Зависимости', tone: 'running' };
  if (text.includes('git pull') || text.includes('получаю и применяю изменения')) return { key: 'pull', percent: 42, label: 'Git', tone: 'running' };
  if (text.includes('проверяю состояние репозитория')) return { key: 'check', percent: 18, label: 'Проверка', tone: 'running' };
  if (installJob?.status === 'failed') return { key: 'failed', percent: 100, label: 'Ошибка', tone: 'failed' };
  return { key: 'created', percent: 8, label: 'Запуск', tone: installJob?.status === 'running' ? 'running' : 'idle' };
}

function getInstallStageState(stageKey, activeStageKey, installJobStatus) {
  const stageIndex = INSTALL_PROGRESS_STAGES.findIndex((stage) => stage.key === stageKey);
  const activeIndex = INSTALL_PROGRESS_STAGES.findIndex((stage) => stage.key === activeStageKey);
  if (installJobStatus === 'completed') return 'completed';
  if (installJobStatus === 'failed') {
    if (stageKey === activeStageKey) return 'failed';
    return activeIndex > stageIndex ? 'completed' : 'pending';
  }
  if (activeIndex > stageIndex) return 'completed';
  if (activeIndex === stageIndex) return 'active';
  return 'pending';
}

function formatInstallHeartbeat(updatedAt, nowTs) {
  const updatedAtTs = new Date(updatedAt || '').getTime();
  if (!updatedAtTs) return 'Статус ещё не обновлялся';

  const diffSeconds = Math.max(0, Math.floor((nowTs - updatedAtTs) / 1000));
  if (diffSeconds < 5) return 'Статус обновлён только что';
  if (diffSeconds < 60) return `Последнее обновление ${diffSeconds} сек назад`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `Последнее обновление ${diffMinutes} мин назад`;

  const diffHours = Math.floor(diffMinutes / 60);
  return `Последнее обновление ${diffHours} ч назад`;
}

function UpdatesOverview({
  updateStatus,
  installJob,
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
  savingUpdateSettings,
}) {
  const [heartbeatNowTs, setHeartbeatNowTs] = useState(() => Date.now());
  const installProgress = installJob ? detectInstallProgressStage(installJob) : null;
  const installHeartbeatText = installJob?.updatedAt
    ? formatInstallHeartbeat(installJob.updatedAt, heartbeatNowTs)
    : '';

  useEffect(() => {
    if (!installJob?.updatedAt) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setHeartbeatNowTs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [installJob?.updatedAt]);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <SectionHeader
        title="🔄 Обновление проекта"
        description="Проверка удаленного Git-репозитория и установка новых изменений"
        actions={
          <>
            <Button variant="primary" onClick={onRefresh} disabled={checkingUpdates || installingUpdates}>
              {checkingUpdates ? 'Проверка...' : 'Проверить обновления'}
            </Button>
            <Button
              variant="success"
              onClick={onInstall}
              disabled={installingUpdates || checkingUpdates || !updateStatus?.canInstall || !updateStatus?.updatesAvailable}
            >
              {installingUpdates ? 'Установка...' : 'Установить обновления'}
            </Button>
            <Button
              onClick={onRestartService}
              disabled={restartingService || checkingUpdates || !updateStatus?.systemctlAvailable}
            >
              {restartingService ? 'Перезапуск...' : 'Перезапустить сервис'}
            </Button>
            <Button
              onClick={onShowServiceDetails}
              disabled={loadingServiceDetails || checkingUpdates || !updateStatus?.systemctlAvailable}
            >
              {loadingServiceDetails ? 'Загрузка...' : 'Статус и логи'}
            </Button>
          </>
        }
      />
      <div className="settings-hint" style={{ marginBottom: 10 }}>
        Здесь собраны все действия и настройки, связанные с обновлением проекта и перезапуском сервиса.
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
            disabled={savingUpdateSettings}
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
            disabled={savingUpdateSettings}
          />
        </div>
      </div>
      <div className="settings-actions" style={{ marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(appSettings?.selfUpdateEnabled)}
            onChange={e => onSettingsChange(current => ({ ...current, selfUpdateEnabled: e.target.checked }))}
            disabled={savingUpdateSettings}
          />
          Разрешить self-update из интерфейса
        </label>
        <Button variant="success" onClick={onSaveUpdateSettings} disabled={savingUpdateSettings}>
          {savingUpdateSettings ? 'Сохранение...' : 'Сохранить настройки обновления'}
        </Button>
      </div>
      {updateMessage && <div className="settings-alert settings-alert-success">{updateMessage}</div>}
      {updateError && <div className="settings-alert settings-alert-error" style={{ whiteSpace: 'pre-wrap' }}>{updateError}</div>}
      {updateStatus?.enabled ? (
        <>
          {installJob ? (
            <div className="card" style={{ marginBottom: 12, background: '#f8fafc' }}>
              <div className="service-details-title">
                Установка обновлений: {installJob.status === 'running' ? 'выполняется' : installJob.status === 'completed' ? 'завершена' : 'ошибка'}
              </div>
              {installProgress ? (
                <div className={`update-install-statusbar update-install-statusbar-${installProgress.tone}`}>
                  <div className="update-install-statusbar-meta">
                    <span className="update-install-statusbar-label">Этап: {installProgress.label}</span>
                    <span className="update-install-statusbar-percent">{installProgress.percent}%</span>
                  </div>
                  <div className="update-install-statusbar-track" aria-hidden="true">
                    <div
                      className="update-install-statusbar-fill"
                      style={{ width: `${installProgress.percent}%` }}
                    />
                  </div>
                  <div className="update-install-statusbar-stages">
                    {INSTALL_PROGRESS_STAGES.map((stage) => {
                      const stageState = getInstallStageState(stage.key, installProgress.key, installJob.status);
                      return (
                        <span
                          key={stage.key}
                          className={`update-install-statusbar-stage update-install-statusbar-stage-${stageState}`}
                        >
                          {stage.label}
                        </span>
                      );
                    })}
                  </div>
                  {installHeartbeatText ? (
                    <div className="update-install-statusbar-heartbeat">{installHeartbeatText}</div>
                  ) : null}
                </div>
              ) : null}
              <div className="settings-hint" style={{ marginBottom: 8 }}>
                {installJob.message || 'Статус установки обновлений пока не получен.'}
              </div>
              {installJob.startedAt ? (
                <div className="settings-hint" style={{ marginBottom: 8 }}>
                  Запущено: {new Date(installJob.startedAt).toLocaleString()}
                  {installJob.finishedAt ? ` · Завершено: ${new Date(installJob.finishedAt).toLocaleString()}` : ''}
                </div>
              ) : null}
              {Array.isArray(installJob.logs) && installJob.logs.length > 0 ? (
                <pre className="service-details-console service-details-console-logs" style={{ maxHeight: 240 }}>
                  {installJob.logs.join('\n')}
                </pre>
              ) : null}
            </div>
          ) : null}
          <div className="overview-stats-grid mt-16">
            <div className="overview-stat-card"><strong>Git:</strong> {updateStatus?.gitAvailable ? (updateStatus.gitVersion || 'установлен') : 'не найден'}</div>
            <div className="overview-stat-card"><strong>systemd:</strong> {updateStatus?.systemctlAvailable ? 'доступен' : 'недоступен'}</div>
            <div className="overview-stat-card"><strong>Сервис:</strong> {updateStatus?.serviceName || '—'}</div>
            <div className="overview-stat-card"><strong>Статус сервиса:</strong> {updateStatus?.serviceActiveState || 'не определен'}</div>
            <div className="overview-stat-card"><strong>Репозиторий:</strong> {updateStatus?.isRepo ? 'инициализирован' : 'не инициализирован'}</div>
            <div className="overview-stat-card"><strong>Remote origin:</strong> {updateStatus?.remoteUrl || 'не настроен'}</div>
            <div className="overview-stat-card"><strong>Ветка:</strong> {updateStatus?.branch || '—'}</div>
            <div className="overview-stat-card"><strong>Источник обновления:</strong> {updateStatus?.targetRef || '—'}</div>
            <div className="overview-stat-card"><strong>Новых коммитов:</strong> {updateStatus?.behind ?? '—'}</div>
            <div className="overview-stat-card"><strong>Локальные изменения:</strong> {updateStatus?.workingTreeDirty ? 'есть' : 'нет'}</div>
          </div>
          {!updateError && updateStatus?.message && <SettingsHint>{updateStatus.message}</SettingsHint>}
          {updateStatus?.workingTreeDirty ? (
            <SettingsHint>
              На тестовой ВМ есть локальные изменения в tracked-файлах. При установке обновлений они будут автоматически сохранены в <strong>git stash</strong>, чтобы <strong>git pull</strong> не падал.
              {Array.isArray(updateStatus?.dirtyTrackedFiles) && updateStatus.dirtyTrackedFiles.length > 0
                ? ` Файлы: ${updateStatus.dirtyTrackedFiles.join(', ')}.`
                : ''}
            </SettingsHint>
          ) : null}
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
            <div className="service-details-grid mt-16">
              <div>
                <div className="service-details-title">
                  Статус сервиса {serviceDetails.serviceName}
                </div>
                <pre className="service-details-console service-details-console-status">
                  {serviceDetails.statusText}
                </pre>
              </div>
              <div>
                <div className="service-details-title">
                  Последние логи
                </div>
                <pre className="service-details-console service-details-console-logs">
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
