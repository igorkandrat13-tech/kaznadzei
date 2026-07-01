import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminTokenControls from './AdminTokenControls';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import ConfirmDialog from './ConfirmDialog';
import {
  HelpTooltip,
  SettingsActions,
  SettingsFeedback,
  SettingsHeader,
  SettingsHint,
  buildSettingsTabs,
  emptyEmployeeForm,
} from './adminUI';
import ColorModal from './admin/ColorModal';
import EmployeeModal from './admin/EmployeeModal';
import RoleModal from './admin/RoleModal';
import StepModal from './admin/StepModal';
import UpdatesOverview from './admin/UpdatesOverview';
import { useRoleConfig } from './RoleConfigContext';
import { buildOrderStageLegendConfig } from './orderStageLegend';
import useEscapeKey from './useEscapeKey';

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

function buildLegendSaveErrorMessage({
  summary,
  step,
  status,
  statusText,
  serverMessage,
  error,
  selectedStageLabel,
  selectedHeaderLabel,
  stagesCount,
  headersCount,
}) {
  const lines = [
    summary || 'Не удалось сохранить настройки этапов.',
    step ? `Шаг: ${step}` : '',
    status ? `HTTP: ${status}${statusText ? ` ${statusText}` : ''}` : '',
    serverMessage ? `Ответ сервера: ${serverMessage}` : '',
    error?.name ? `Тип ошибки: ${error.name}` : '',
    error?.message ? `Сообщение: ${error.message}` : '',
    selectedStageLabel ? `Выбранный этап: ${selectedStageLabel}` : '',
    selectedHeaderLabel ? `Выбранная колонка: ${selectedHeaderLabel}` : '',
    Number.isFinite(stagesCount) ? `Этапов в конфиге: ${stagesCount}` : '',
    Number.isFinite(headersCount) ? `Колонок в конфиге: ${headersCount}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function Admin() {

  const navigate = useNavigate();
  const { roleTabs, allRoleTabs, refreshRoleConfig } = useRoleConfig();
  const getDefaultEmployeeForm = (role = '') => ({
    ...emptyEmployeeForm,
    role: role || roleTabs[0]?.key || '',
  });
  const [activeRole, setActiveRole] = useState('general');
  const [selectedStepsRole, setSelectedStepsRole] = useState(() => roleTabs[0]?.key || '');
  const [stageManagerRoleKey, setStageManagerRoleKey] = useState('');
  const [steps, setSteps] = useState([]);
  const [colors, setColors] = useState([]);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [installJob, setInstallJob] = useState(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installingUpdates, setInstallingUpdates] = useState(false);
  const [restartingService, setRestartingService] = useState(false);
  const [loadingServiceDetails, setLoadingServiceDetails] = useState(false);
  const [serviceDetails, setServiceDetails] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [appSettings, setAppSettings] = useState({
    publicBaseUrl: '',
    telegramBotToken: '',
    selfUpdateEnabled: false,
    updateBranch: 'main',
    updateRepositoryUrl: '',
    roleLabels: {},
  });
  const [telegramCheckResult, setTelegramCheckResult] = useState(null);
  const [checkingTelegramBot, setCheckingTelegramBot] = useState(false);
  const [settingTelegramWebhook, setSettingTelegramWebhook] = useState(false);
  const [showTelegramLogs, setShowTelegramLogs] = useState(false);
  const [telegramLogs, setTelegramLogs] = useState([]);
  const [telegramLogsLoading, setTelegramLogsLoading] = useState(false);
  const [clearingTelegramLogs, setClearingTelegramLogs] = useState(false);
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [clearingActivityLogs, setClearingActivityLogs] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showDeletedRoles, setShowDeletedRoles] = useState(false);
  const [employeeModalMode, setEmployeeModalMode] = useState('');
  const [roleModalMode, setRoleModalMode] = useState('');
  const [stepModalMode, setStepModalMode] = useState('');
  const [colorModalMode, setColorModalMode] = useState('');
  const [showLegendColorModal, setShowLegendColorModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [savingLegendColors, setSavingLegendColors] = useState(false);
  const [orderStageLegendConfig, setOrderStageLegendConfig] = useState(() => buildOrderStageLegendConfig());
  const [selectedLegendStageKey, setSelectedLegendStageKey] = useState('brief');
  const [selectedLegendHeaderId, setSelectedLegendHeaderId] = useState('');
  const [legendModalTab, setLegendModalTab] = useState('columns');
  const [savingAppSettings, setSavingAppSettings] = useState(false);
  const [savingUpdateSettings, setSavingUpdateSettings] = useState(false);

  const [editStep, setEditStep] = useState(null);
  const [editColor, setEditColor] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [editRole, setEditRole] = useState(null);
  const [newStep, setNewStep] = useState({ stepName: '', description: '', order: 1 });
  const [newColor, setNewColor] = useState({ name: '', hex: '#000000' });
  const [legendConfigDraft, setLegendConfigDraft] = useState(() => buildOrderStageLegendConfig());
  const [newEmployee, setNewEmployee] = useState(() => getDefaultEmployeeForm());
  const [newRole, setNewRole] = useState({ label: '', icon: '🧩', shortTitle: '', description: '', noStepsText: '' });
  const backupImportInputRef = useRef(null);
  const settingsTabs = buildSettingsTabs();
  const filteredSteps = steps.filter(s => s.role === selectedStepsRole).sort((a, b) => a.order - b.order);
  const employeeForm = employeeModalMode === 'edit' ? editEmployee : newEmployee;
  const roleForm = roleModalMode === 'edit' ? editRole : newRole;
  const legendItems = useMemo(() => {
    return orderStageLegendConfig.stages.map((item) => {
      return {
        ...item,
        hex: item.defaultHex,
      };
    });
  }, [orderStageLegendConfig]);
  const legendDraftStageMap = useMemo(() => {
    return (legendConfigDraft.stages || []).reduce((acc, item) => {
      acc[item.key] = item;
      return acc;
    }, {});
  }, [legendConfigDraft]);
  const selectedLegendStage = useMemo(
    () => (legendConfigDraft.stages || []).find((item) => item.key === selectedLegendStageKey) || (legendConfigDraft.stages || [])[0] || null,
    [legendConfigDraft, selectedLegendStageKey],
  );
  const selectedLegendHeader = useMemo(
    () => (legendConfigDraft.secondaryHeaders || []).find((item) => item.draftId === selectedLegendHeaderId) || null,
    [legendConfigDraft, selectedLegendHeaderId],
  );
  const legendDraftHeaders = legendConfigDraft.secondaryHeaders || [];
  const legendDraftStages = legendConfigDraft.stages || [];
  const legendAssignedColumnsCount = useMemo(
    () => legendDraftHeaders.filter((item) => item.legendKey).length,
    [legendDraftHeaders],
  );
  const selectedLegendStageUsageCount = useMemo(
    () => legendDraftHeaders.filter((item) => item.legendKey === selectedLegendStageKey).length,
    [legendDraftHeaders, selectedLegendStageKey],
  );
  const employeeRoleTabs = (() => {
    if (!employeeForm?.role) {
      return roleTabs;
    }
    const currentRole = allRoleTabs.find(role => role.key === employeeForm.role);
    if (!currentRole || !currentRole.isDeleted || roleTabs.some(role => role.key === currentRole.key)) {
      return roleTabs;
    }
    return [...roleTabs, currentRole].sort((a, b) => a.order - b.order || a.plainLabel.localeCompare(b.plainLabel, 'ru'));
  })();
  const setEmployeeForm = (nextValue) => {
    if (employeeModalMode === 'edit') {
      setEditEmployee(nextValue);
      return;
    }
    setNewEmployee(nextValue);
  };
  const setRoleForm = (nextValue) => {
    if (roleModalMode === 'edit') {
      setEditRole(nextValue);
      return;
    }
    setNewRole(nextValue);
  };

  useEffect(() => {
    setEditStep(null);
    setEditColor(null);
    setEditEmployee(null);
    setEditRole(null);
    setEmployeeModalMode('');
    setRoleModalMode('');
    setStepModalMode('');
    setColorModalMode('');
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
    setNewEmployee(getDefaultEmployeeForm());
    setNewColor({ name: '', hex: '#000000' });
    setNewRole({ label: '', icon: '🧩', shortTitle: '', description: '', noStepsText: '' });
    setSettingsError('');
    setSettingsSuccess('');
  }, [activeRole, filteredSteps.length, selectedStepsRole]);

  useEffect(() => {
    fetchAppSettings().catch(error => setSettingsError(error.message || 'Не удалось загрузить настройки.'));
    fetchEmployees().catch(error => setSettingsError(error.message || 'Не удалось загрузить сотрудников.'));
    fetchRoles({ includeDeleted: true }).catch(error => setSettingsError(error.message || 'Не удалось загрузить роли.'));
  }, []);

  useEffect(() => {
    if (!roleTabs.length) {
      setSelectedStepsRole('');
      return;
    }

    if (!selectedStepsRole || !roleTabs.some(role => role.key === selectedStepsRole)) {
      setSelectedStepsRole(roleTabs[0]?.key || '');
    }
  }, [roleTabs, selectedStepsRole]);

  useEffect(() => {
    fetchSteps();
    fetchColors();
    fetchOrderStageLegendConfig().catch(error => setSettingsError(error.message || 'Не удалось загрузить легенду этапов.'));
    fetchUpdateStatus();
  }, []);

  useEffect(() => {
    if (!installingUpdates) {
      return undefined;
    }

    const pollInstallStatus = () => {
      fetchInstallJobStatus({ silent: true });
    };

    pollInstallStatus();
    const intervalId = window.setInterval(pollInstallStatus, 3000);
    return () => window.clearInterval(intervalId);
  }, [installingUpdates]);

  useEffect(() => {
    const refreshOverview = () => {
      fetchSteps();
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      refreshOverview();
    };

    const intervalId = window.setInterval(refreshOverview, 10000);
    window.addEventListener('focus', refreshOverview);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOverview);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, []);

  const fetchSteps = async () => {
    const res = await apiFetch('/api/processSteps');
    const data = await parseJsonSafely(res);
    setSteps(Array.isArray(data) ? data : []);
  };

  const fetchColors = async () => {
    const res = await apiFetch('/api/colors');
    const data = await parseJsonSafely(res);
    setColors(Array.isArray(data) ? data : []);
  };

  const fetchOrderStageLegendConfig = async () => {
    const res = await apiFetch('/api/order-stage-legend-config');
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(data?.message || 'Не удалось загрузить конфигурацию легенды этапов.');
    }
    setOrderStageLegendConfig(buildOrderStageLegendConfig(data || {}));
  };

  const fetchRoles = async ({ includeDeleted = false } = {}) => {
    const res = await apiFetch(`/api/roles${includeDeleted ? '?includeDeleted=1' : ''}`);
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(data?.message || 'Не удалось загрузить роли.');
    }
    if (includeDeleted) {
      setRoles(Array.isArray(data) ? data : []);
    }
    return Array.isArray(data) ? data : [];
  };

  const fetchAppSettings = async () => {
    const res = await apiFetch('/api/settings');
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(data?.message || 'Не удалось загрузить настройки.');
    }
    setAppSettings({
      publicBaseUrl: data?.publicBaseUrl || '',
      telegramBotToken: data?.telegramBotToken || '',
      selfUpdateEnabled: Boolean(data?.selfUpdateEnabled),
      updateBranch: data?.updateBranch || 'main',
      updateRepositoryUrl: data?.updateRepositoryUrl || '',
      roleLabels: data?.roleLabels || {},
    });
  };

  const fetchEmployees = async () => {
    const res = await apiFetch('/api/employees');
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(data?.message || 'Не удалось загрузить сотрудников.');
    }
    setEmployees(Array.isArray(data) ? data : []);
  };

  const fetchUpdateStatus = async () => {
    setCheckingUpdates(true);
    setUpdateError('');
    try {
      const res = await apiFetch('/api/updates/status');
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.message || 'Не удалось проверить обновления');
      setUpdateStatus(data);
      setInstallJob(data?.installJob || null);
      setInstallingUpdates(Boolean(data?.installInProgress));
      setUpdateMessage(data?.message || '');
    } catch (error) {
      setUpdateError(error.message || 'Не удалось проверить обновления');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const fetchInstallJobStatus = async ({ silent = false } = {}) => {
    if (!silent) {
      setUpdateError('');
    }
    try {
      const res = await apiFetch('/api/updates/install-status');
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.message || 'Не удалось получить статус установки обновлений');

      const nextJob = data?.installJob || null;
      const inProgress = Boolean(data?.installInProgress && nextJob?.status === 'running');
      setInstallJob(nextJob);
      setInstallingUpdates(inProgress);

      if (!nextJob) {
        return;
      }

      if (nextJob.status === 'completed') {
        setUpdateMessage(nextJob.message || 'Обновления установлены');
        setUpdateError('');
        if (nextJob.statusAfter) {
          setUpdateStatus(nextJob.statusAfter);
        } else if (!inProgress) {
          fetchUpdateStatus();
        }
        return;
      }

      if (nextJob.status === 'failed') {
        setUpdateError(nextJob.details || nextJob.message || 'Не удалось установить обновления');
        if (nextJob.statusAfter) {
          setUpdateStatus(nextJob.statusAfter);
        } else if (!inProgress) {
          fetchUpdateStatus();
        }
      }
      return { nextJob, inProgress };
    } catch (error) {
      if (!silent) {
        setUpdateError(error.message || 'Не удалось получить статус установки обновлений');
      }
      return { nextJob: null, inProgress: false };
    }
  };

  const installUpdates = async () => {
    setInstallingUpdates(true);
    setUpdateError('');
    try {
      const res = await apiFetch('/api/updates/install', { method: 'POST' });
      const data = await parseJsonSafely(res);
      if (res.status === 504) {
        const installState = await fetchInstallJobStatus({ silent: true });
        if (installState?.inProgress) {
          setUpdateMessage('Установка обновлений уже запущена. Продолжаю отслеживать её статус после ответа прокси с таймаутом.');
          return;
        }
      }
      if (res.status === 409 && data?.installJob) {
        setInstallJob(data.installJob);
        setInstallingUpdates(data.installJob.status === 'running');
        setUpdateMessage(data?.message || 'Установка обновлений уже выполняется.');
        return;
      }
      if (!res.ok) throw new Error(data?.details || data?.message || 'Не удалось запустить установку обновлений');
      if (data?.status) {
        setUpdateStatus(data.status);
      }
      setInstallJob(data?.installJob || null);
      setInstallingUpdates(Boolean(data?.installJob?.status === 'running' || res.status === 202));
      setUpdateMessage(data?.message || 'Установка обновлений запущена');
    } catch (error) {
      const errorText = error.message || 'Не удалось установить обновления';
      if (errorText.includes('504 Gateway Time-out')) {
        const installState = await fetchInstallJobStatus({ silent: true });
        if (installState?.inProgress) {
          setUpdateMessage('Установка обновлений уже запущена. Продолжаю отслеживать её статус после ответа прокси с таймаутом.');
          return;
        }
      }
      setUpdateError(errorText);
      setInstallingUpdates(false);
    }
  };

  const restartService = async () => {
    setRestartingService(true);
    setUpdateError('');
    try {
      const res = await apiFetch('/api/updates/restart-service', { method: 'POST' });
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.details || data?.message || 'Не удалось перезапустить сервис');
      setUpdateMessage(data?.message || 'Команда перезапуска отправлена');
      fetchUpdateStatus();
    } catch (error) {
      setUpdateError(error.message || 'Не удалось перезапустить сервис');
    } finally {
      setRestartingService(false);
    }
  };

  const fetchServiceDetails = async () => {
    setLoadingServiceDetails(true);
    setUpdateError('');
    try {
      const res = await apiFetch('/api/updates/service-details');
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.details || data?.message || 'Не удалось получить статус и логи сервиса');
      setServiceDetails(data);
      setUpdateMessage(`Получены статус и логи сервиса ${data?.serviceName || ''}`.trim());
    } catch (error) {
      setUpdateError(error.message || 'Не удалось получить статус и логи сервиса');
    } finally {
      setLoadingServiceDetails(false);
    }
  };

  const saveUpdateSettings = async () => {
    if (savingUpdateSettings) return;
    setUpdateError('');
    setUpdateMessage('');
    setSavingUpdateSettings(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appSettings),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.message || 'Не удалось сохранить настройки обновления');
      setAppSettings({
        publicBaseUrl: data?.publicBaseUrl || '',
        telegramBotToken: data?.telegramBotToken || '',
        selfUpdateEnabled: Boolean(data?.selfUpdateEnabled),
        updateBranch: data?.updateBranch || 'main',
        updateRepositoryUrl: data?.updateRepositoryUrl || '',
        roleLabels: data?.roleLabels || {},
      });
      await refreshRoleConfig();
      setUpdateMessage('Настройки обновления сохранены.');
      await fetchUpdateStatus();
    } catch (error) {
      setUpdateError(error.message || 'Не удалось сохранить настройки обновления');
    } finally {
      setSavingUpdateSettings(false);
    }
  };

  const getRoleLabel = (role) => {
    return allRoleTabs.find(item => item.key === role)?.label || role;
  };

  const getEmployeeTelegramSummary = (employee) => {
    if (!employee.telegramUserId) {
      return '—';
    }

    return (
      <div>
        <div>{employee.telegramUsername || 'без username'}</div>
        <div className="text-small text-subtle">
          {employee.telegramFirstName || ''} {employee.telegramLastName || ''}
          {employee.telegramFirstName || employee.telegramLastName ? ' ' : ''}ID: {employee.telegramUserId}
        </div>
      </div>
    );
  };

  const formatActivityLogEntry = (entry) => {
    const timestamp = entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Без времени';
    const actor = entry?.actor?.label || 'Система';
    const message = entry?.message || entry?.action || 'Событие';
    const details = entry?.details && typeof entry.details === 'object'
      ? JSON.stringify(entry.details, null, 2)
      : String(entry?.details || '');
    return `[${timestamp}] ${actor}\n${message}\n${details}`;
  };

  const saveAppSettings = async () => {
    if (savingAppSettings) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingAppSettings(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appSettings),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setSettingsError(data?.message || 'Не удалось сохранить настройки.');
        return;
      }
      setAppSettings({
        publicBaseUrl: data?.publicBaseUrl || '',
        telegramBotToken: data?.telegramBotToken || '',
        selfUpdateEnabled: Boolean(data?.selfUpdateEnabled),
        updateBranch: data?.updateBranch || 'main',
        updateRepositoryUrl: data?.updateRepositoryUrl || '',
        roleLabels: data?.roleLabels || {},
      });
      await refreshRoleConfig();
      setSettingsSuccess('Настройки сохранены.');
      await fetchUpdateStatus();
    } catch (error) {
      setSettingsError(error.message || 'Не удалось сохранить настройки.');
    } finally {
      setSavingAppSettings(false);
    }
  };

  const checkTelegramBot = async () => {
    setCheckingTelegramBot(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch('/api/telegram/check', { method: 'POST' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось проверить Telegram-бота.');
      }
      setTelegramCheckResult(data);
      setSettingsSuccess(`Бот ${data?.bot?.firstName || ''} @${data?.bot?.username || ''} успешно проверен.`.trim());
    } catch (error) {
      setTelegramCheckResult(null);
      setSettingsError(error.message || 'Не удалось проверить Telegram-бота.');
    } finally {
      setCheckingTelegramBot(false);
    }
  };

  const setupTelegramWebhook = async () => {
    setSettingTelegramWebhook(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch('/api/telegram/webhook/setup', { method: 'POST' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось установить webhook Telegram-бота.');
      }
      setTelegramCheckResult(data);
      setSettingsSuccess(data?.message || 'Webhook Telegram-бота установлен.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось установить webhook Telegram-бота.');
    } finally {
      setSettingTelegramWebhook(false);
    }
  };

  const fetchTelegramLogs = async ({ openModal = false } = {}) => {
    setTelegramLogsLoading(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch('/api/telegram/logs?limit=200');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось загрузить логи ТГ бота.');
      }
      setTelegramLogs(Array.isArray(data?.logs) ? data.logs : []);
      if (openModal) {
        setShowTelegramLogs(true);
      }
    } catch (error) {
      setSettingsError(error.message || 'Не удалось загрузить логи ТГ бота.');
      if (openModal) {
        setShowTelegramLogs(true);
      }
    } finally {
      setTelegramLogsLoading(false);
    }
  };

  const clearTelegramLogs = async () => {
    if (clearingTelegramLogs) return;
    setClearingTelegramLogs(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch('/api/telegram/logs', { method: 'DELETE' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось очистить логи ТГ бота.');
      }
      setTelegramLogs([]);
      setSettingsSuccess(data?.message || 'Логи ТГ бота очищены.');
      return true;
    } catch (error) {
      setSettingsError(error.message || 'Не удалось очистить логи ТГ бота.');
      return false;
    } finally {
      setClearingTelegramLogs(false);
    }
  };

  const fetchActivityLogs = async ({ openModal = false } = {}) => {
    setActivityLogsLoading(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch('/api/activity-logs?limit=200');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось загрузить журнал действий.');
      }
      setActivityLogs(Array.isArray(data?.logs) ? data.logs : []);
      if (openModal) {
        setShowActivityLogs(true);
      }
    } catch (error) {
      setSettingsError(error.message || 'Не удалось загрузить журнал действий.');
      if (openModal) {
        setShowActivityLogs(true);
      }
    } finally {
      setActivityLogsLoading(false);
    }
  };

  const clearActivityLogs = async () => {
    if (clearingActivityLogs) return;
    setClearingActivityLogs(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch('/api/activity-logs', { method: 'DELETE' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось очистить журнал действий.');
      }
      setActivityLogs([]);
      setSettingsSuccess(data?.message || 'Журнал действий очищен.');
      return true;
    } catch (error) {
      setSettingsError(error.message || 'Не удалось очистить журнал действий.');
      return false;
    } finally {
      setClearingActivityLogs(false);
    }
  };

  const exportBackup = async () => {
    if (exportingBackup) return;
    setExportingBackup(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch('/api/backup/export');
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, 'Не удалось экспортировать резервную копию.'));
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const fileNameMatch = disposition.match(/filename="([^"]+)"/i);
      const fileName = fileNameMatch?.[1] || `kaznadzei-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setSettingsSuccess('Резервная копия экспортирована.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось экспортировать резервную копию.');
    } finally {
      setExportingBackup(false);
    }
  };

  const openBackupImportPicker = () => {
    if (importingBackup) return;
    backupImportInputRef.current?.click();
  };

  const handleBackupImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const confirmed = window.confirm(`Импортировать резервную копию "${file.name}"? Текущие данные проекта будут заменены.`);
    if (!confirmed) return;

    setImportingBackup(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const fileText = await file.text();
      const payload = JSON.parse(fileText);
      const res = await apiFetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось импортировать резервную копию.');
      }
      await Promise.all([
        fetchSteps(),
        fetchColors(),
        fetchEmployees().catch(() => {}),
        fetchAppSettings().catch(() => {}),
      ]);
      setSettingsSuccess(data?.message || 'Резервная копия импортирована.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось импортировать резервную копию.');
    } finally {
      setImportingBackup(false);
    }
  };

  const formatTelegramLogEntry = (entry) => {
    const timestamp = entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Без времени';
    const scope = entry?.scope || 'telegram';
    const event = entry?.event || 'event';
    const details = entry?.details && typeof entry.details === 'object'
      ? JSON.stringify(entry.details, null, 2)
      : String(entry?.details || '');
    return `[${timestamp}] [${scope}] ${event}\n${details}`;
  };

  const resetEmployeeForm = () => {
    setEditEmployee(null);
    setNewEmployee(getDefaultEmployeeForm());
  };

  const resetRoleForm = () => {
    setEditRole(null);
    setNewRole({ label: '', icon: '🧩', shortTitle: '', description: '', noStepsText: '' });
  };

  const openCreateEmployeeModal = () => {
    resetEmployeeForm();
    setEmployeeModalMode('create');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const openEditEmployeeModal = (employee) => {
    setEditEmployee({ ...getDefaultEmployeeForm(employee.role), ...employee });
    setEmployeeModalMode('edit');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeEmployeeModal = () => {
    if (savingEmployee) return;
    setEmployeeModalMode('');
    resetEmployeeForm();
  };

  const openCreateRoleModal = () => {
    resetRoleForm();
    setRoleModalMode('create');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const openEditRoleModal = (role) => {
    setEditRole({
      key: role.key,
      label: role.plainLabel || role.label || '',
      icon: role.icon || '🧩',
      shortTitle: role.shortTitle || '',
      description: role.description || '',
      noStepsText: role.noStepsText || '',
    });
    setRoleModalMode('edit');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeRoleModal = () => {
    if (savingRole) return;
    setRoleModalMode('');
    resetRoleForm();
  };

  const openStageManager = (roleKey) => {
    setSelectedStepsRole(roleKey);
    setStageManagerRoleKey(roleKey);
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeStageManager = () => {
    if (savingStep) return;
    setStageManagerRoleKey('');
  };

  const openCreateStepModal = () => {
    setEditStep(null);
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
    setStepModalMode('create');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const openEditStepModal = (step) => {
    setEditStep({ ...step });
    setStepModalMode('edit');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeStepModal = () => {
    if (savingStep) return;
    setStepModalMode('');
    setEditStep(null);
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
  };

  const openCreateColorModal = () => {
    setEditColor(null);
    setNewColor({ name: '', hex: '#000000' });
    setColorModalMode('create');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const openEditColorModal = (color) => {
    setEditColor({ ...color });
    setColorModalMode('edit');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeColorModal = () => {
    if (savingColor) return;
    setColorModalMode('');
    setEditColor(null);
    setNewColor({ name: '', hex: '#000000' });
  };

  const openLegendColorModal = () => {
    const nextStages = legendItems.map(item => ({
      key: item.key,
      label: item.label,
      description: item.description,
      storeName: item.storeName,
      hex: item.hex,
      defaultHex: item.hex,
    }));
    const nextHeaders = orderStageLegendConfig.secondaryHeaders.map((item, index) => ({
      ...item,
      draftId: `secondary-header-${index}`,
    }));
    setLegendConfigDraft({
      stages: nextStages,
      secondaryHeaders: nextHeaders,
    });
    setSelectedLegendStageKey(nextStages.find((item) => item.key)?.key || '');
    setSelectedLegendHeaderId(nextHeaders.find((item) => !item.stickyCol)?.draftId || nextHeaders[0]?.draftId || '');
    setLegendModalTab('columns');
    setShowLegendColorModal(true);
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeLegendColorModal = () => {
    if (savingLegendColors) return;
    setShowLegendColorModal(false);
    setLegendConfigDraft(buildOrderStageLegendConfig());
    setSelectedLegendStageKey('brief');
    setSelectedLegendHeaderId('');
    setLegendModalTab('columns');
  };

  useEscapeKey(() => {
    if (confirmAction && !confirmLoading) {
      setConfirmAction(null);
      return;
    }
    if (showActivityLogs) {
      setShowActivityLogs(false);
      return;
    }
    if (showTelegramLogs) {
      setShowTelegramLogs(false);
      return;
    }
    if (showLegendColorModal && !savingLegendColors) {
      closeLegendColorModal();
      return;
    }
    if (stageManagerRoleKey && !savingStep) {
      closeStageManager();
    }
  }, Boolean(confirmAction || showActivityLogs || showTelegramLogs || showLegendColorModal || stageManagerRoleKey));

  const updateLegendStageDraft = (key, patch) => {
    setLegendConfigDraft(current => ({
      ...current,
      stages: (current.stages || []).map(item => (
        item.key === key ? { ...item, ...patch } : item
      )),
    }));
  };

  const updateLegendSecondaryHeaderDraft = (draftId, patch) => {
    setLegendConfigDraft(current => ({
      ...current,
      secondaryHeaders: (current.secondaryHeaders || []).map(item => (
        item.draftId === draftId ? { ...item, ...patch } : item
      )),
    }));
  };

  const assignLegendStageToHeader = (draftId, legendKey) => {
    if (savingLegendColors) return;
    updateLegendSecondaryHeaderDraft(draftId, { legendKey });
  };
  const openLegendStageEditor = (legendKey) => {
    if (!legendKey || savingLegendColors) return;
    setSelectedLegendStageKey(legendKey);
    setLegendModalTab('stages');
  };

  const requestDeleteAction = (action) => {
    setSettingsError('');
    setSettingsSuccess('');
    setConfirmAction(action);
  };

  const requestDeleteEmployee = (employee) => {
    requestDeleteAction({
      type: 'employee',
      id: employee._id,
      title: 'Удалить сотрудника?',
      message: `Сотрудник "${employee.fullName}" будет удален. Если он уже привязан к Telegram, связь тоже придется настраивать заново.`,
      confirmLabel: 'Удалить сотрудника',
    });
  };

  const requestDeleteStep = (step) => {
    requestDeleteAction({
      type: 'step',
      id: step._id,
      title: 'Удалить этап?',
      message: `Этап "${step.stepName}" будет удален из роли "${getRoleLabel(step.role)}". Проверьте, что он больше не нужен в рабочих сценариях.`,
      confirmLabel: 'Удалить этап',
    });
  };

  const requestDeleteColor = (color) => {
    requestDeleteAction({
      type: 'color',
      id: color._id,
      title: 'Удалить цвет?',
      message: `Цвет "${color.name}" (${color.hex}) будет удален из справочника.`,
      confirmLabel: 'Удалить цвет',
    });
  };

  const requestDeleteRole = (role) => {
    requestDeleteAction({
      type: 'role',
      id: role.key,
      title: 'Удалить роль?',
      message: `Роль "${role.plainLabel || role.label}" будет скрыта из рабочих экранов, но останется в истории и сможет быть восстановлена.`,
      confirmLabel: 'Пометить удаленной',
    });
  };

  const requestClearTelegramLogs = () => {
    requestDeleteAction({
      type: 'clearTelegramLogs',
      title: 'Очистить лог ТГ бота?',
      message: `Все записи в логе ТГ бота будут удалены без возможности восстановления.`,
      confirmLabel: 'Очистить лог',
    });
  };

  const requestClearActivityLogs = () => {
    requestDeleteAction({
      type: 'clearActivityLogs',
      title: 'Очистить журнал действий?',
      message: `Все записи журнала действий будут удалены без возможности восстановления.`,
      confirmLabel: 'Очистить журнал',
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmAction) return;
    if (confirmLoading) return;
    setConfirmLoading(true);
    let success = false;
    try {
      if (confirmAction.type === 'employee') {
        success = await handleDeleteEmployee(confirmAction.id);
      } else if (confirmAction.type === 'role') {
        success = await handleDeleteRole(confirmAction.id);
      } else if (confirmAction.type === 'step') {
        success = await handleDeleteStep(confirmAction.id);
      } else if (confirmAction.type === 'color') {
        success = await handleDeleteColor(confirmAction.id);
      } else if (confirmAction.type === 'clearTelegramLogs') {
        success = await clearTelegramLogs();
      } else if (confirmAction.type === 'clearActivityLogs') {
        success = await clearActivityLogs();
      }
    } finally {
      setConfirmLoading(false);
    }
    if (success) {
      setConfirmAction(null);
    }
  };

  const handleAddEmployee = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    setSavingEmployee(true);
    try {
      const res = await apiFetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee),
      });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось добавить сотрудника.'));
        return;
      }
      resetEmployeeForm();
      setEmployeeModalMode('');
      await fetchEmployees();
      setSettingsSuccess('Сотрудник добавлен.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось добавить сотрудника.');
    } finally {
      setSavingEmployee(false);
    }
  };

  const handleUpdateEmployee = async () => {
    if (!editEmployee) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingEmployee(true);
    try {
      const res = await apiFetch(`/api/employees/${editEmployee._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editEmployee),
      });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось обновить сотрудника.'));
        return;
      }
      resetEmployeeForm();
      setEmployeeModalMode('');
      await fetchEmployees();
      setSettingsSuccess('Данные сотрудника обновлены.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось обновить сотрудника.');
    } finally {
      setSavingEmployee(false);
    }
  };

  const handleDeleteEmployee = async (id) => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch(`/api/employees/${id}`, { method: 'DELETE' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setSettingsError(data?.message || 'Не удалось удалить сотрудника.');
        return false;
      }
      if (editEmployee?._id === id) {
        resetEmployeeForm();
      }
      await fetchEmployees();
      setSettingsSuccess(data?.warning || data?.message || 'Сотрудник удален.');
      return true;
    } catch (error) {
      setSettingsError(error.message || 'Не удалось удалить сотрудника.');
      return false;
    }
  };

  const handleAddRole = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    setSavingRole(true);
    try {
      const res = await apiFetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRole),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setSettingsError(data?.message || 'Не удалось добавить роль.');
        return;
      }
      closeRoleModal();
      await fetchRoles({ includeDeleted: true });
      await refreshRoleConfig();
      setSettingsSuccess('Роль добавлена.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось добавить роль.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editRole?.key) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingRole(true);
    try {
      const res = await apiFetch(`/api/roles/${editRole.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRole),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setSettingsError(data?.message || 'Не удалось обновить роль.');
        return;
      }
      closeRoleModal();
      await fetchRoles({ includeDeleted: true });
      await refreshRoleConfig();
      setSettingsSuccess('Роль обновлена.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось обновить роль.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (roleKey) => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch(`/api/roles/${roleKey}`, { method: 'DELETE' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setSettingsError(data?.message || 'Не удалось удалить роль.');
        return false;
      }
      if (activeRole === roleKey) {
        setActiveRole('roles');
      }
      if (selectedStepsRole === roleKey) {
        const nextRole = roleTabs.find(role => role.key !== roleKey);
        setSelectedStepsRole(nextRole?.key || '');
      }
      if (stageManagerRoleKey === roleKey) {
        setStageManagerRoleKey('');
      }
      if (editRole?.key === roleKey) {
        closeRoleModal();
      }
      await fetchRoles({ includeDeleted: true });
      await refreshRoleConfig();
      setSettingsSuccess('Роль помечена удаленной.');
      return true;
    } catch (error) {
      setSettingsError(error.message || 'Не удалось удалить роль.');
      return false;
    }
  };

  const handleRestoreRole = async (roleKey) => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch(`/api/roles/${roleKey}/restore`, { method: 'POST' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setSettingsError(data?.message || 'Не удалось восстановить роль.');
        return;
      }
      await fetchRoles({ includeDeleted: true });
      await refreshRoleConfig();
      setSettingsSuccess('Роль восстановлена.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось восстановить роль.');
    }
  };

  // Settings
  const handleAddStep = async () => {
    if (!selectedStepsRole || !newStep.stepName || !newStep.description) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingStep(true);
    try {
      const res = await apiFetch('/api/processSteps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newStep, role: selectedStepsRole }),
      });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось добавить этап.'));
        return;
      }
      setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
      setStepModalMode('');
      await fetchSteps();
      setSettingsSuccess('Этап добавлен.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось добавить этап.');
    } finally {
      setSavingStep(false);
    }
  };

  const handleUpdateStep = async () => {
    if (!editStep) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingStep(true);
    try {
      const res = await apiFetch(`/api/processSteps/${editStep._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepName: editStep.stepName, description: editStep.description, order: editStep.order }),
      });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось обновить этап.'));
        return;
      }
      setEditStep(null);
      setStepModalMode('');
      await fetchSteps();
      setSettingsSuccess('Этап обновлен.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось обновить этап.');
    } finally {
      setSavingStep(false);
    }
  };

  const handleDeleteStep = async (id) => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch(`/api/processSteps/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось удалить этап.'));
        return false;
      }
      await fetchSteps();
      setSettingsSuccess('Этап удален.');
      return true;
    } catch (error) {
      setSettingsError(error.message || 'Не удалось удалить этап.');
      return false;
    }
  };

  const handleAddColor = async () => {
    if (!newColor.name) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingColor(true);
    try {
      const res = await apiFetch('/api/colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newColor),
      });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось добавить цвет.'));
        return;
      }
      setNewColor({ name: '', hex: '#000000' });
      setColorModalMode('');
      await fetchColors();
      setSettingsSuccess('Цвет добавлен.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось добавить цвет.');
    } finally {
      setSavingColor(false);
    }
  };

  const handleUpdateColor = async () => {
    if (!editColor) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingColor(true);
    try {
      const res = await apiFetch(`/api/colors/${editColor._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editColor.name, hex: editColor.hex }),
      });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось обновить цвет.'));
        return;
      }
      setEditColor(null);
      setColorModalMode('');
      await fetchColors();
      setSettingsSuccess('Цвет обновлен.');
    } catch (error) {
      setSettingsError(error.message || 'Не удалось обновить цвет.');
    } finally {
      setSavingColor(false);
    }
  };

  const handleDeleteColor = async (id) => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await apiFetch(`/api/colors/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setSettingsError(await getErrorMessage(res, 'Не удалось удалить цвет.'));
        return false;
      }
      await fetchColors();
      setSettingsSuccess('Цвет удален.');
      return true;
    } catch (error) {
      setSettingsError(error.message || 'Не удалось удалить цвет.');
      return false;
    }
  };

  const handleSaveLegendColors = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    setSavingLegendColors(true);
    try {
      const normalizedStages = (legendConfigDraft.stages || []).map((draft) => {
        const normalizedHex = String(draft.hex || '').trim().toUpperCase() || '#000000';
        if (!HEX_COLOR_PATTERN.test(normalizedHex)) {
          throw new Error(`Цвет этапа "${draft.label || 'Без названия'}" должен быть в формате #RRGGBB.`);
        }
        return {
          key: draft.key,
          label: String(draft.label || '').trim(),
          description: String(draft.description || '').trim(),
          storeName: draft.storeName,
          defaultHex: normalizedHex,
        };
      });

      const configPayload = {
        stages: normalizedStages,
        secondaryHeaders: (legendConfigDraft.secondaryHeaders || []).map((item) => ({
          label: item.label,
          legendKey: item.legendKey,
        })),
      };

      const configRes = await apiFetch('/api/order-stage-legend-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload),
      });
      if (!configRes.ok) {
        const errorData = await parseJsonSafely(configRes);
        const detailedMessage = buildLegendSaveErrorMessage({
          summary: 'Не удалось сохранить конфигурацию этапов.',
          step: 'PUT /api/order-stage-legend-config',
          status: configRes.status,
          statusText: configRes.statusText,
          serverMessage: errorData?.details || errorData?.message || '',
          selectedStageLabel: selectedLegendStage?.label || '',
          selectedHeaderLabel: selectedLegendHeader?.label || '',
          stagesCount: normalizedStages.length,
          headersCount: configPayload.secondaryHeaders.length,
        });
        const error = new Error(detailedMessage);
        error.legendDebugMessage = detailedMessage;
        throw error;
      }

      await fetchOrderStageLegendConfig();
      setSettingsSuccess('Цвета, названия этапов и привязка колонок обновлены.');
      setShowLegendColorModal(false);
      setLegendConfigDraft(buildOrderStageLegendConfig());
      setSelectedLegendStageKey('brief');
      setSelectedLegendHeaderId('');
      setLegendModalTab('columns');
    } catch (error) {
      const detailedMessage = error?.legendDebugMessage || buildLegendSaveErrorMessage({
        summary: 'Не удалось сохранить настройки этапов.',
        step: 'Локальная подготовка данных',
        error,
        selectedStageLabel: selectedLegendStage?.label || '',
        selectedHeaderLabel: selectedLegendHeader?.label || '',
        stagesCount: legendConfigDraft.stages?.length,
        headersCount: legendConfigDraft.secondaryHeaders?.length,
      });
      console.error('Legend save failed:', {
        error,
        selectedStage: selectedLegendStage,
        selectedHeader: selectedLegendHeader,
        draft: legendConfigDraft,
      });
      setSettingsError(detailedMessage);
    } finally {
      setSavingLegendColors(false);
    }
  };

  const settingsCrudModals = (
    <>
      <RoleModal
        mode={roleModalMode}
        roleForm={roleForm}
        setRoleForm={setRoleForm}
        onAdd={handleAddRole}
        onUpdate={handleUpdateRole}
        onClose={closeRoleModal}
        saving={savingRole}
      />
      <EmployeeModal
        mode={employeeModalMode}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        onAdd={handleAddEmployee}
        onUpdate={handleUpdateEmployee}
        onClose={closeEmployeeModal}
        saving={savingEmployee}
        roleTabs={employeeRoleTabs}
      />

      {stageManagerRoleKey ? (
        <div className="modal-overlay" onClick={savingStep ? undefined : closeStageManager}>
          <div className="modal-window modal-window-xl" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Этапы роли {getRoleLabel(stageManagerRoleKey)}</div>
                <div className="modal-subtitle">
                  Управляйте этапами выбранной роли прямо из действий.
                </div>
              </div>
              <button className="btn btn-small modal-close-btn" onClick={closeStageManager} disabled={savingStep}>
                ✕
              </button>
            </div>

            <SettingsFeedback error={settingsError} success={settingsSuccess} />
            <SettingsActions>
              <button className="btn btn-success" onClick={openCreateStepModal} disabled={!selectedStepsRole}>
                Добавить этап
              </button>
              <button className="btn" onClick={fetchSteps}>
                Обновить этапы
              </button>
            </SettingsActions>

            <div className="table-scroll desktop-table-only">
              <table>
                <thead><tr><th>№</th><th>Название этапа</th><th>Описание</th><th>Действия</th></tr></thead>
                <tbody>
                  {filteredSteps.map(step => (
                    <tr key={step._id}>
                      <td>{step.order}</td>
                      <td>{step.stepName}</td>
                      <td>{step.description}</td>
                      <td>
                        <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => openEditStepModal(step)}>✎</button>
                        <button className="btn btn-danger" onClick={() => requestDeleteStep(step)}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {filteredSteps.length === 0 && <tr><td colSpan={4} className="empty-cell">Нет этапов для выбранной роли</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mobile-card-list">
              {filteredSteps.map(step => (
                <div key={step._id} className="mobile-settings-card">
                  <div className="mobile-settings-card-header">
                    <div>
                      <div className="mobile-order-card-title">{step.stepName}</div>
                      <div className="mobile-order-card-subtitle">Порядок: {step.order}</div>
                    </div>
                  </div>
                  <div className="mobile-settings-card-note">
                    {step.description || 'Без описания'}
                  </div>
                  <div className="mobile-settings-card-actions">
                    <button className="btn btn-primary" onClick={() => openEditStepModal(step)}>Редактировать</button>
                    <button className="btn btn-danger" onClick={() => requestDeleteStep(step)}>Удалить</button>
                  </div>
                </div>
              ))}
              {filteredSteps.length === 0 && <div className="mobile-empty-state">Нет этапов для выбранной роли</div>}
            </div>
          </div>
        </div>
      ) : null}

      <StepModal
        mode={stepModalMode}
        editStep={editStep}
        newStep={newStep}
        setEditStep={setEditStep}
        setNewStep={setNewStep}
        onAdd={handleAddStep}
        onUpdate={handleUpdateStep}
        onClose={closeStepModal}
        saving={savingStep}
      />

      {showLegendColorModal ? (
        <div className="modal-overlay" onClick={savingLegendColors ? undefined : closeLegendColorModal}>
          <div className="modal-window modal-window-xl stage-legend-modal-window" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Выбор колонок и этапов</div>
                <div className="modal-subtitle">Настройка разбита на два коротких шага: сначала колонки, потом сами этапы.</div>
              </div>
              <button className="btn btn-small modal-close-btn" onClick={closeLegendColorModal} disabled={savingLegendColors}>✕</button>
            </div>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />

            <div className="stage-legend-modal-body">
              <div className="stage-legend-modal-tabs" role="tablist" aria-label="Настройка легенды этапов">
                <button
                  type="button"
                  role="tab"
                  aria-selected={legendModalTab === 'columns'}
                  className={`stage-legend-modal-tab ${legendModalTab === 'columns' ? 'stage-legend-modal-tab-active' : ''}`}
                  onClick={() => setLegendModalTab('columns')}
                  disabled={savingLegendColors}
                >
                  <span className="stage-legend-modal-tab-title">Колонки</span>
                  <span className="stage-legend-modal-tab-meta">{legendAssignedColumnsCount}/{legendDraftHeaders.length} привязано</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={legendModalTab === 'stages'}
                  className={`stage-legend-modal-tab ${legendModalTab === 'stages' ? 'stage-legend-modal-tab-active' : ''}`}
                  onClick={() => setLegendModalTab('stages')}
                  disabled={savingLegendColors}
                >
                  <span className="stage-legend-modal-tab-title">Этапы</span>
                  <span className="stage-legend-modal-tab-meta">{legendDraftStages.length} этапов</span>
                </button>
              </div>

              {legendModalTab === 'columns' ? (
                <>
                  <div className="stage-legend-modal-summary">
                    <div className="stage-legend-modal-summary-card">
                      <span className="stage-legend-modal-summary-label">Выбрана</span>
                      <strong>
                        {selectedLegendHeader
                          ? (selectedLegendHeader.label || 'Без названия')
                          : 'Колонка не выбрана'}
                      </strong>
                    </div>
                    <div className="stage-legend-modal-summary-card">
                      <span className="stage-legend-modal-summary-label">Этап</span>
                      <strong>{legendDraftStageMap[selectedLegendHeader?.legendKey]?.label || 'Без этапа'}</strong>
                    </div>
                    <div className="stage-legend-modal-summary-card">
                      <span className="stage-legend-modal-summary-label">Подсказка</span>
                      <strong>Выберите ячейку слева и сразу назначьте этап справа</strong>
                    </div>
                  </div>

                  <div className="stage-legend-builder-layout stage-legend-builder-layout-tab">
                    <div className="stage-legend-builder-panel stage-legend-builder-panel-wide">
                      <div className="stage-legend-config-section-title">Колонки таблицы</div>
                      <div className="stage-legend-builder-note">Нажмите на колонку второй строки шапки, которую хотите переименовать или перекрасить.</div>
                      <div className="stage-legend-table-preview">
                        {legendDraftHeaders.map((item, index) => {
                          const stage = legendDraftStageMap[item.legendKey] || null;
                          const isSelectedHeader = selectedLegendHeaderId === item.draftId;
                          return (
                            <div
                              key={item.draftId || `${item.label}-${index}`}
                              className={`stage-legend-table-cell ${isSelectedHeader ? 'stage-legend-table-cell-active' : ''} ${item.stickyCol ? 'stage-legend-table-cell-service' : ''}`}
                              style={{ background: stage?.hex || (item.useTableBackground ? 'rgba(12, 26, 42, 0.94)' : undefined), color: item.useTableBackground ? '#d8ecff' : '#000000' }}
                              onClick={() => !savingLegendColors && setSelectedLegendHeaderId(item.draftId)}
                              onKeyDown={(event) => {
                                if ((event.key === 'Enter' || event.key === ' ') && !savingLegendColors) {
                                  event.preventDefault();
                                  setSelectedLegendHeaderId(item.draftId);
                                }
                              }}
                              role="button"
                              tabIndex={savingLegendColors ? -1 : 0}
                              title={stage ? `Этап: ${stage.label}` : 'Этап не назначен'}
                            >
                              <span className="stage-legend-table-cell-index">Колонка {index + 1}</span>
                              <span className="stage-legend-table-cell-title">{item.label || 'Без названия'}</span>
                              <span className="stage-legend-table-cell-stage">
                                {stage ? stage.label : 'Без этапа'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="stage-legend-builder-panel stage-legend-column-editor">
                      <div className="stage-legend-config-section-title">Редактор колонки</div>
                      {selectedLegendHeader ? (
                        <>
                          <div className="stage-legend-column-editor-meta">
                            <span className="stage-legend-column-editor-index">
                              {selectedLegendHeader.stickyCol ? `Служебная колонка ${selectedLegendHeader.stickyCol}` : `Колонка ${Number(String(selectedLegendHeader.draftId || '').split('-').pop()) + 1 || ''}`}
                            </span>
                            <span className="stage-legend-column-editor-stage">
                              Текущий этап: {legendDraftStageMap[selectedLegendHeader.legendKey]?.label || 'Без этапа'}
                            </span>
                          </div>
                          <label className="stage-legend-field">
                            <span>Название колонки</span>
                            <input
                              value={selectedLegendHeader.label}
                              onChange={(event) => updateLegendSecondaryHeaderDraft(selectedLegendHeader.draftId, { label: event.target.value })}
                              placeholder="Введите название колонки"
                              disabled={savingLegendColors}
                            />
                          </label>
                          <div className="stage-legend-config-section-title stage-legend-config-section-subtitle">Назначение этапа</div>
                          <div className="stage-legend-assignment-toolbar">
                            <button
                              type="button"
                              className={`stage-legend-stage-chip ${!selectedLegendHeader.legendKey ? 'stage-legend-stage-chip-active' : ''}`}
                              onClick={() => assignLegendStageToHeader(selectedLegendHeader.draftId, '')}
                              disabled={savingLegendColors}
                            >
                              Без этапа
                            </button>
                            {legendDraftStages.map((stage) => (
                              <button
                                key={stage.key}
                                type="button"
                                className={`stage-legend-stage-chip ${selectedLegendHeader.legendKey === stage.key ? 'stage-legend-stage-chip-active' : ''}`}
                                style={{ background: stage.hex, color: '#000000' }}
                                onClick={() => assignLegendStageToHeader(selectedLegendHeader.draftId, stage.key)}
                                disabled={savingLegendColors}
                                title={stage.description || stage.label}
                              >
                                {stage.label}
                              </button>
                            ))}
                          </div>
                          {selectedLegendHeader.legendKey ? (
                            <div className="stage-legend-linked-stage-card">
                              <div className="stage-legend-linked-stage-card-info">
                                <span className="stage-legend-linked-stage-card-label">Редактирование этапа</span>
                                <strong>{legendDraftStageMap[selectedLegendHeader.legendKey]?.label || 'Этап'}</strong>
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => openLegendStageEditor(selectedLegendHeader.legendKey)}
                                disabled={savingLegendColors}
                              >
                                Изменить название и цвет
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="stage-legend-builder-note">Выберите колонку слева, чтобы изменить название и назначить этап.</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="stage-legend-modal-summary">
                    <div className="stage-legend-modal-summary-card">
                      <span className="stage-legend-modal-summary-label">Выбран этап</span>
                      <strong>{selectedLegendStage?.label || 'Этап не выбран'}</strong>
                    </div>
                    <div className="stage-legend-modal-summary-card">
                      <span className="stage-legend-modal-summary-label">Используется</span>
                      <strong>{selectedLegendStageUsageCount} колонок</strong>
                    </div>
                    <div className="stage-legend-modal-summary-card">
                      <span className="stage-legend-modal-summary-label">Подсказка</span>
                      <strong>Измените название, описание и цвет выбранного этапа</strong>
                    </div>
                  </div>

                  <div className="stage-legend-builder-layout stage-legend-builder-layout-tab stage-legend-builder-layout-bottom">
                    <div className="stage-legend-builder-panel stage-legend-stage-list-panel">
                      <div className="stage-legend-config-section-title">Этапы</div>
                      <div className="stage-legend-builder-note">Выберите этап из списка, чтобы отредактировать его справа.</div>
                      <div className="stage-legend-stage-list">
                        {legendDraftStages.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`stage-legend-stage-list-item ${selectedLegendStageKey === item.key ? 'stage-legend-stage-list-item-active' : ''}`}
                            onClick={() => setSelectedLegendStageKey(item.key)}
                            disabled={savingLegendColors}
                          >
                            <span className="stage-legend-stage-list-swatch" style={{ background: item.hex }} />
                            <span className="stage-legend-stage-list-text">
                              <strong>{item.label || 'Этап'}</strong>
                              <small>{item.description || 'Без описания'}</small>
                            </span>
                            <span className="stage-legend-stage-list-usage">
                              {legendDraftHeaders.filter((header) => header.legendKey === item.key).length}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="stage-legend-builder-panel stage-legend-stage-editor-panel">
                      <div className="stage-legend-config-section-title">Редактор этапа</div>
                      {selectedLegendStage ? (
                        <div className="stage-legend-stage-card stage-legend-stage-editor-card">
                          <div className="stage-legend-stage-card-header">
                            <div
                              className="stage-legend-stage-preview"
                              style={{ background: selectedLegendStage.hex, color: '#000000' }}
                            >
                              {selectedLegendStage.label || 'Этап'}
                            </div>
                            <div className="stage-legend-stage-color">
                              <input
                                type="color"
                                value={selectedLegendStage.hex}
                                onChange={(event) => updateLegendStageDraft(selectedLegendStage.key, { hex: event.target.value })}
                                disabled={savingLegendColors}
                              />
                              <input
                                value={selectedLegendStage.hex}
                                onChange={(event) => updateLegendStageDraft(selectedLegendStage.key, { hex: event.target.value })}
                                disabled={savingLegendColors}
                              />
                            </div>
                          </div>
                          <div className="stage-legend-stage-fields">
                            <label className="stage-legend-field">
                              <span>Название этапа</span>
                              <input
                                value={selectedLegendStage.label}
                                onChange={(event) => updateLegendStageDraft(selectedLegendStage.key, { label: event.target.value })}
                                placeholder="Например: Чертежи"
                                disabled={savingLegendColors}
                              />
                            </label>
                            <label className="stage-legend-field">
                              <span>Подсказка</span>
                              <input
                                value={selectedLegendStage.description}
                                onChange={(event) => updateLegendStageDraft(selectedLegendStage.key, { description: event.target.value })}
                                placeholder="Что входит в этот этап"
                                disabled={savingLegendColors}
                              />
                            </label>
                            <div className="stage-legend-builder-note">
                              Этот этап сейчас привязан к {selectedLegendStageUsageCount} колонкам таблицы.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="stage-legend-builder-note">Выберите этап слева, чтобы изменить его название, описание и цвет.</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="modal-actions stage-legend-modal-actions">
              <button className="btn btn-success" onClick={handleSaveLegendColors} disabled={savingLegendColors}>
                {savingLegendColors ? 'Сохранение...' : 'Сохранить настройки этапов'}
              </button>
              <button className="btn" onClick={closeLegendColorModal} disabled={savingLegendColors}>Отмена</button>
            </div>
          </div>
        </div>
      ) : null}

      <ColorModal
        mode={colorModalMode}
        editColor={editColor}
        newColor={newColor}
        setEditColor={setEditColor}
        setNewColor={setNewColor}
        onAdd={handleAddColor}
        onUpdate={handleUpdateColor}
        onClose={closeColorModal}
        saving={savingColor}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        onConfirm={handleConfirmDelete}
        onCancel={() => !confirmLoading && setConfirmAction(null)}
        loading={confirmLoading}
      />
    </>
  );

  if (activeRole === 'general') {
    return (
      <div>
        <SettingsHeader title="⚙️ Настройки — Общие параметры" onBack={() => navigate('/orders')} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

          <div className="card">
            <p>Здесь можно настроить адрес проекта для QR-кодов и токен Telegram-бота.</p>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />
            <input
              ref={backupImportInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleBackupImport}
              style={{ display: 'none' }}
            />

            <div className="form-group">
              <label className="helper-label">
                Публичный адрес проекта
                <HelpTooltip text="Укажите внешний HTTPS-адрес сайта. Он используется в QR-кодах и для Telegram webhook, поэтому адрес должен открываться из интернета." />
              </label>
              <input
                value={appSettings.publicBaseUrl}
                onChange={e => setAppSettings({ ...appSettings, publicBaseUrl: e.target.value })}
                placeholder="Например: https://factory.example.com"
              />
            </div>

            <div className="form-group">
              <label className="helper-label">
                Токен Telegram-бота
                <HelpTooltip text="Вставьте bot token, полученный у BotFather, в формате 123456789:AA.... Этот токен нужен для проверки бота, установки webhook и отправки ответов сотрудникам." />
              </label>
              <input
                type="password"
                value={appSettings.telegramBotToken}
                onChange={e => setAppSettings({ ...appSettings, telegramBotToken: e.target.value })}
                placeholder="Например: 123456789:AA..."
              />
            </div>

            <div className="form-group">
              <label className="helper-label">
                Названия ролей
                <HelpTooltip text="Названия берутся из вкладки 'Роли'. Здесь они отображаются для контроля и всегда синхронизированы с рабочими экранами." />
              </label>
              <div className="order-role-summary">
                {roleTabs.map(role => (
                  <span key={role.key} className="order-role-summary-chip">
                    {role.label}
                  </span>
                ))}
              </div>
            </div>

            <SettingsActions>
              <button className="btn btn-success" onClick={saveAppSettings} disabled={savingAppSettings}>
                {savingAppSettings ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
              <button className="btn btn-primary" onClick={checkTelegramBot} disabled={checkingTelegramBot || savingAppSettings}>
                {checkingTelegramBot ? 'Проверка...' : 'Проверить бота'}
              </button>
              <button className="btn" onClick={setupTelegramWebhook} disabled={settingTelegramWebhook || savingAppSettings}>
                {settingTelegramWebhook ? 'Установка...' : 'Установить webhook'}
              </button>
              <button className="btn btn-secondary" onClick={() => fetchTelegramLogs({ openModal: true })} disabled={telegramLogsLoading}>
                {telegramLogsLoading ? 'Загрузка логов...' : 'Логи ТГ бота'}
              </button>
              <button className="btn btn-secondary" onClick={() => fetchActivityLogs({ openModal: true })} disabled={activityLogsLoading}>
                {activityLogsLoading ? 'Загрузка журнала...' : 'Журнал действий'}
              </button>
              <button className="btn btn-secondary" onClick={() => setActiveRole('roles')}>
                Управление ролями
              </button>
              <button className="btn btn-secondary" onClick={exportBackup} disabled={exportingBackup}>
                {exportingBackup ? 'Экспорт...' : 'Экспорт данных'}
              </button>
              <button className="btn btn-secondary" onClick={openBackupImportPicker} disabled={importingBackup}>
                {importingBackup ? 'Импорт...' : 'Импорт данных'}
              </button>
            </SettingsActions>

            {telegramCheckResult && (
              <div className="panel-info">
                <div className="panel-info-title">Telegram-бот подключен</div>
                <div className="panel-info-grid">
                  <div><strong>Бот:</strong> {telegramCheckResult?.bot?.firstName || '—'}</div>
                  <div><strong>Username:</strong> {telegramCheckResult?.bot?.username ? `@${telegramCheckResult.bot.username}` : '—'}</div>
                  <div><strong>Webhook:</strong> {telegramCheckResult?.webhook?.url || 'не настроен'}</div>
                  <div><strong>Ожидает обновлений:</strong> {telegramCheckResult?.webhook?.pendingUpdateCount ?? 0}</div>
                </div>
                <div className="panel-info-text">
                  Для авторизации сотрудников webhook должен указывать на адрес:
                  <div className="panel-info-code text-mono">
                    {telegramCheckResult.recommendedWebhookUrl}
                  </div>
                </div>
                {telegramCheckResult?.webhook?.lastErrorMessage && (
                  <div className="mt-10 text-danger text-small-13">
                    Последняя ошибка webhook: {telegramCheckResult.webhook.lastErrorMessage}
                  </div>
                )}
              </div>
            )}

            <AdminTokenControls />
          </div>

          {showTelegramLogs && (
            <div className="modal-overlay" onClick={() => setShowTelegramLogs(false)}>
              <div className="modal-window modal-window-xl" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div className="modal-title">Логи ТГ бота</div>
                    <div className="modal-subtitle">
                      Здесь сохраняются диагностические события Telegram Web App и Telegram-заказов.
                    </div>
                  </div>
                  <button className="btn btn-small modal-close-btn" onClick={() => setShowTelegramLogs(false)}>
                    ✕
                  </button>
                </div>

                <div className="modal-actions modal-actions-between">
                  <div className="modal-actions-group">
                    <button className="btn btn-secondary" onClick={() => fetchTelegramLogs()} disabled={telegramLogsLoading}>
                      {telegramLogsLoading ? 'Обновление...' : 'Обновить'}
                    </button>
                    <button className="btn btn-danger" onClick={requestClearTelegramLogs} disabled={clearingTelegramLogs || confirmLoading}>
                      {clearingTelegramLogs ? 'Очистка...' : 'Очистить лог'}
                    </button>
                  </div>
                  <div className="text-small text-subtle">
                    Записей: {telegramLogs.length}
                  </div>
                </div>

                {telegramLogs.length > 0 ? (
                  <div className="telegram-log-list">
                    {telegramLogs.map((entry) => (
                      <pre key={entry.id || `${entry.createdAt}-${entry.event}`} className="service-details-console service-details-console-status telegram-log-entry">
                        {formatTelegramLogEntry(entry)}
                      </pre>
                    ))}
                  </div>
                ) : (
                  <div className="mobile-empty-state">
                    {telegramLogsLoading ? 'Загружаю логи ТГ бота...' : 'Логи пока пусты.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {showActivityLogs && (
            <div className="modal-overlay" onClick={() => setShowActivityLogs(false)}>
              <div className="modal-window modal-window-xl" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div className="modal-title">Журнал действий</div>
                    <div className="modal-subtitle">
                      Здесь сохраняются изменения по заказам, сотрудникам, настройкам и справочникам.
                    </div>
                  </div>
                  <button className="btn btn-small modal-close-btn" onClick={() => setShowActivityLogs(false)}>
                    ✕
                  </button>
                </div>

                <div className="modal-actions modal-actions-between">
                  <div className="modal-actions-group">
                    <button className="btn btn-secondary" onClick={() => fetchActivityLogs()} disabled={activityLogsLoading}>
                      {activityLogsLoading ? 'Обновление...' : 'Обновить'}
                    </button>
                    <button className="btn btn-danger" onClick={requestClearActivityLogs} disabled={clearingActivityLogs || confirmLoading}>
                      {clearingActivityLogs ? 'Очистка...' : 'Очистить журнал'}
                    </button>
                  </div>
                  <div className="text-small text-subtle">
                    Записей: {activityLogs.length}
                  </div>
                </div>

                {activityLogs.length > 0 ? (
                  <div className="telegram-log-list">
                    {activityLogs.map((entry) => (
                      <pre key={entry._id || `${entry.createdAt}-${entry.action}`} className="service-details-console service-details-console-status telegram-log-entry">
                        {formatActivityLogEntry(entry)}
                      </pre>
                    ))}
                  </div>
                ) : (
                  <div className="mobile-empty-state">
                    {activityLogsLoading ? 'Загружаю журнал действий...' : 'Журнал действий пока пуст.'}
                  </div>
                )}
              </div>
            </div>
          )}

          <UpdatesOverview
            updateStatus={updateStatus}
            installJob={installJob}
            updateMessage={updateMessage}
            updateError={updateError}
            checkingUpdates={checkingUpdates}
            installingUpdates={installingUpdates}
            restartingService={restartingService}
            loadingServiceDetails={loadingServiceDetails}
            serviceDetails={serviceDetails}
            appSettings={appSettings}
            onSettingsChange={setAppSettings}
            onRefresh={fetchUpdateStatus}
            onInstall={installUpdates}
            onRestartService={restartService}
            onShowServiceDetails={fetchServiceDetails}
            onSaveUpdateSettings={saveUpdateSettings}
            savingUpdateSettings={savingUpdateSettings}
          />
      </div>
    );
  }

  if (activeRole === 'employees') {
    return (
      <div>
        <SettingsHeader title="⚙️ Настройки — Сотрудники" onBack={() => navigate('/orders')} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

          <div className="card" style={{ marginBottom: 20 }}>
            <p>Список сотрудников для входа в Telegram-бот и работы с заказами по ролям.</p>
            <SettingsHint>
              <div><strong>Как работать:</strong> нажмите "Добавить сотрудника", заполните ФИО, роль, пароль и PIN-код.</div>
              <div><strong>Редактирование:</strong> используйте кнопку ✎ или "Редактировать" в карточке сотрудника.</div>
              <div><strong>Удаление:</strong> используйте кнопку ✕ или "Удалить", подтвердите действие, после чего привязанному сотруднику придет уведомление в Telegram.</div>
            </SettingsHint>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />

            <SettingsActions>
              <button className="btn btn-success" onClick={openCreateEmployeeModal}>Добавить сотрудника</button>
              <button className="btn" onClick={fetchEmployees}>Обновить список</button>
            </SettingsActions>

            <div className="table-scroll desktop-table-only">
              <table>
                <thead><tr><th>ФИО</th><th>Роль</th><th>Статус TG</th><th>Пользователь TG</th><th>Авторизован</th><th>Пароль</th><th>PIN</th><th>Действия</th></tr></thead>
                <tbody>
                  {employees.map(employee => (
                    <tr key={employee._id}>
                      <td>{employee.fullName}</td>
                      <td>{getRoleLabel(employee.role)}</td>
                      <td>{employee.telegramUserId ? 'Привязан' : 'Не привязан'}</td>
                      <td>{getEmployeeTelegramSummary(employee)}</td>
                      <td>{employee.telegramAuthorizedAt ? new Date(employee.telegramAuthorizedAt).toLocaleString() : '—'}</td>
                      <td>{employee.password || '—'}</td>
                      <td>{employee.pinCode || (employee.telegramUserId ? 'Использован' : '—')}</td>
                      <td>
                        <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => openEditEmployeeModal(employee)}>✎</button>
                        <button className="btn btn-danger" onClick={() => requestDeleteEmployee(employee)}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && <tr><td colSpan={8} className="empty-cell">Сотрудники пока не добавлены</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mobile-card-list">
              {employees.map(employee => (
                <div key={employee._id} className="mobile-settings-card">
                  <div className="mobile-settings-card-header">
                    <div className="mobile-order-card-title">{employee.fullName}</div>
                    <div className="mobile-order-card-subtitle">{getRoleLabel(employee.role)}</div>
                  </div>
                  <div className="mobile-settings-card-meta">
                    <div><strong>Статус TG:</strong> {employee.telegramUserId ? 'Привязан' : 'Не привязан'}</div>
                    <div><strong>Пользователь TG:</strong> {employee.telegramUserId ? employee.telegramUsername || 'без username' : '—'}</div>
                    <div><strong>Авторизован:</strong> {employee.telegramAuthorizedAt ? new Date(employee.telegramAuthorizedAt).toLocaleString() : '—'}</div>
                    <div><strong>Пароль:</strong> {employee.password || '—'}</div>
                    <div><strong>PIN:</strong> {employee.pinCode || (employee.telegramUserId ? 'Использован' : '—')}</div>
                  </div>
                  {employee.telegramUserId ? (
                    <div className="mobile-settings-card-note">
                      {getEmployeeTelegramSummary(employee)}
                    </div>
                  ) : null}
                  <div className="mobile-settings-card-actions">
                    <button className="btn btn-primary" onClick={() => openEditEmployeeModal(employee)}>Редактировать</button>
                    <button className="btn btn-danger" onClick={() => requestDeleteEmployee(employee)}>Удалить</button>
                  </div>
                </div>
              ))}
              {employees.length === 0 && <div className="mobile-empty-state">Сотрудники пока не добавлены</div>}
            </div>
          </div>

          {settingsCrudModals}
      </div>
    );
  }

  if (activeRole === 'roles') {
    const visibleRoles = roles.filter(role => showDeletedRoles || !role.isDeleted);
    return (
      <div>
        <SettingsHeader title="⚙️ Настройки — Роли" onBack={() => navigate('/orders')} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

          <div className="card" style={{ marginBottom: 20 }}>
            <p>Здесь настраиваются производственные роли, которые используются в этапах, сотрудниках, таблицах и рабочих экранах.</p>
            <SettingsHint>
              <div><strong>Удаление:</strong> роль не удаляется физически, а помечается как удаленная и скрывается из рабочих разделов.</div>
              <div><strong>Восстановление:</strong> включите показ удаленных ролей и нажмите "Восстановить".</div>
              <div><strong>Синхронизация:</strong> названия ролей из этого списка автоматически отображаются в "Общих параметрах", таблицах, карточках сотрудников и Telegram.</div>
            </SettingsHint>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />

            <SettingsActions>
              <button className="btn btn-success" onClick={openCreateRoleModal}>Добавить роль</button>
              <button className="btn" onClick={() => fetchRoles({ includeDeleted: true })}>Обновить список</button>
              <label className="checkbox-inline" style={{ marginLeft: 8 }}>
                <input
                  type="checkbox"
                  checked={showDeletedRoles}
                  onChange={event => setShowDeletedRoles(event.target.checked)}
                />
                Показывать удаленные
              </label>
            </SettingsActions>

            <div className="table-scroll desktop-table-only">
              <table>
                <thead><tr><th>Название</th><th>Заголовок страницы</th><th>Описание</th><th>Статус</th><th>Действия</th></tr></thead>
                <tbody>
                  {visibleRoles.map(role => (
                    <tr key={role.key}>
                      <td>
                        <strong>{role.icon} {role.label}</strong>
                        <div className="text-small text-subtle text-mono">{role.key}</div>
                      </td>
                      <td>{role.shortTitle || '—'}</td>
                      <td>{role.description || '—'}</td>
                      <td>{role.isDeleted ? 'Удалена' : 'Активна'}</td>
                      <td>
                        {role.isDeleted ? (
                          <button className="btn btn-secondary" onClick={() => handleRestoreRole(role.key)}>Восстановить</button>
                        ) : (
                          <>
                            <button className="btn btn-secondary" style={{ marginRight: 6 }} onClick={() => openStageManager(role.key)}>Этапы</button>
                            <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => openEditRoleModal(role)}>✎</button>
                            <button className="btn btn-danger" onClick={() => requestDeleteRole(role)}>✕</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleRoles.length === 0 && <tr><td colSpan={5} className="empty-cell">Роли не найдены</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mobile-card-list">
              {visibleRoles.map(role => (
                <div key={role.key} className="mobile-settings-card">
                  <div className="mobile-settings-card-header">
                    <div>
                      <div className="mobile-order-card-title">{role.icon} {role.label}</div>
                      <div className="mobile-order-card-subtitle">{role.shortTitle || role.key}</div>
                    </div>
                    <div className="mobile-order-card-subtitle">{role.isDeleted ? 'Удалена' : 'Активна'}</div>
                  </div>
                  <div className="mobile-settings-card-note">
                    {role.description || 'Описание не задано'}
                  </div>
                  <div className="mobile-settings-card-actions">
                    {role.isDeleted ? (
                      <button className="btn btn-secondary" onClick={() => handleRestoreRole(role.key)}>Восстановить</button>
                    ) : (
                      <>
                        <button className="btn btn-secondary" onClick={() => openStageManager(role.key)}>Этапы</button>
                        <button className="btn btn-primary" onClick={() => openEditRoleModal(role)}>Редактировать</button>
                        <button className="btn btn-danger" onClick={() => requestDeleteRole(role)}>Удалить</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {visibleRoles.length === 0 && <div className="mobile-empty-state">Роли не найдены</div>}
            </div>
          </div>

          {settingsCrudModals}
      </div>
    );
  }

  if (activeRole === 'colors') {
    return (
      <div>
        <SettingsHeader title="⚙️ Настройки — Цвета и легенда этапов" onBack={() => navigate('/orders')} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

          <div className="card">
            <p>Здесь настраиваются цвета справочника, названия этапов и привязка колонок легенды для единой таблицы заказов.</p>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />
            <div className="orders-stage-legend">
              <div className="orders-stage-legend-header">
                <div>
                  <div className="orders-stage-legend-title">Легенда этапов</div>
                  <div className="orders-stage-legend-subtitle">Цвета, названия этапов и привязка колонок ниже применяются ко всей логике таблицы заказов.</div>
                </div>
                <button className="btn btn-secondary" onClick={openLegendColorModal}>Выбор колонок</button>
              </div>
              <div className="orders-stage-legend-grid">
                {legendItems.map(item => (
                  <div key={item.key} className="orders-stage-legend-item">
                    <span className="orders-stage-legend-swatch" style={{ background: item.hex }} />
                    <div className="orders-stage-legend-content">
                      <div className="orders-stage-legend-item-title">{item.label}</div>
                      <div className="orders-stage-legend-item-subtitle">{item.description}</div>
                    </div>
                    <div className="orders-stage-legend-hex">{item.hex}</div>
                  </div>
                ))}
              </div>
            </div>
            <SettingsActions>
              <button className="btn btn-success" onClick={openCreateColorModal}>Добавить цвет</button>
              <button className="btn" onClick={fetchColors}>Обновить список</button>
            </SettingsActions>
            <div className="table-scroll desktop-table-only">
              <table>
                <thead><tr><th>Название</th><th>Цвет</th><th>Действия</th></tr></thead>
                <tbody>
                  {colors.map(c => (
                    <tr key={c._id}>
                      <td>{c.name}</td>
                      <td><span className="color-swatch-inline" style={{ background: c.hex }} />{c.hex}</td>
                      <td>
                        <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => openEditColorModal(c)}>✎</button>
                        <button className="btn btn-danger" onClick={() => requestDeleteColor(c)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-card-list">
              {colors.map(color => (
                <div key={color._id} className="mobile-settings-card">
                  <div className="mobile-settings-card-header">
                    <div className="mobile-order-card-title">{color.name}</div>
                    <div className="mobile-settings-color-row">
                      <span className="color-swatch-inline" style={{ background: color.hex }} />
                      {color.hex}
                    </div>
                  </div>
                  <div className="mobile-settings-card-actions">
                    <button className="btn btn-primary" onClick={() => openEditColorModal(color)}>Редактировать</button>
                    <button className="btn btn-danger" onClick={() => requestDeleteColor(color)}>Удалить</button>
                  </div>
                </div>
              ))}
              {colors.length === 0 && <div className="mobile-empty-state">Цвета пока не добавлены</div>}
            </div>
          </div>
          {settingsCrudModals}
      </div>
    );
  }

  return null;
}

export default Admin;
