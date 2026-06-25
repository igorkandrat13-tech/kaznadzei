import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminTokenControls from './AdminTokenControls';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import ConfirmDialog from './ConfirmDialog';
import {
  HelpTooltip,
  SectionHeader,
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
import { ORDER_STAGE_LEGEND } from './orderStageLegend';

function Admin() {
  const { roleTabs, allRoleTabs, refreshRoleConfig } = useRoleConfig();
  const getDefaultEmployeeForm = (role = '') => ({
    ...emptyEmployeeForm,
    role: role || roleTabs[0]?.key || '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [activeRole, setActiveRole] = useState('general');
  const [steps, setSteps] = useState([]);
  const [colors, setColors] = useState([]);
  const [updateStatus, setUpdateStatus] = useState(null);
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
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [savingAppSettings, setSavingAppSettings] = useState(false);
  const [savingUpdateSettings, setSavingUpdateSettings] = useState(false);

  const [editStep, setEditStep] = useState(null);
  const [editColor, setEditColor] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [editRole, setEditRole] = useState(null);
  const [newStep, setNewStep] = useState({ stepName: '', description: '', order: 1 });
  const [newColor, setNewColor] = useState({ name: '', hex: '#000000' });
  const [newEmployee, setNewEmployee] = useState(() => getDefaultEmployeeForm());
  const [newRole, setNewRole] = useState({ label: '', icon: '🧩', shortTitle: '', description: '', noStepsText: '' });
  const backupImportInputRef = useRef(null);
  const settingsTabs = buildSettingsTabs(roleTabs);
  const filteredSteps = steps.filter(s => s.role === activeRole).sort((a, b) => a.order - b.order);
  const employeeForm = employeeModalMode === 'edit' ? editEmployee : newEmployee;
  const roleForm = roleModalMode === 'edit' ? editRole : newRole;
  const legendItems = useMemo(() => {
    return ORDER_STAGE_LEGEND.map((item) => {
      const savedColor = colors.find(color => String(color.name || '').trim() === item.storeName);
      return {
        ...item,
        hex: savedColor?.hex || item.defaultHex,
      };
    });
  }, [colors]);
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
    if (!showSettings) return;
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
  }, [activeRole, showSettings, filteredSteps.length]);

  useEffect(() => {
    if (!showSettings) return;
    fetchAppSettings().catch(error => setSettingsError(error.message || 'Не удалось загрузить настройки.'));
    fetchEmployees().catch(error => setSettingsError(error.message || 'Не удалось загрузить сотрудников.'));
    fetchRoles({ includeDeleted: true }).catch(error => setSettingsError(error.message || 'Не удалось загрузить роли.'));
  }, [showSettings]);

  useEffect(() => {
    fetchSteps();
    fetchColors();
    fetchUpdateStatus();
  }, []);

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
      setUpdateMessage(data?.message || '');
    } catch (error) {
      setUpdateError(error.message || 'Не удалось проверить обновления');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const installUpdates = async () => {
    setInstallingUpdates(true);
    setUpdateError('');
    try {
      const res = await apiFetch('/api/updates/install', { method: 'POST' });
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.details || data?.message || 'Не удалось установить обновления');
      setUpdateStatus(data?.status || null);
      setUpdateMessage(data?.message || 'Обновления установлены');
    } catch (error) {
      setUpdateError(error.message || 'Не удалось установить обновления');
    } finally {
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
    } catch (error) {
      setSettingsError(error.message || 'Не удалось очистить логи ТГ бота.');
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
    } catch (error) {
      setSettingsError(error.message || 'Не удалось очистить журнал действий.');
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
    if (!newStep.stepName || !newStep.description) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingStep(true);
    try {
      const res = await apiFetch('/api/processSteps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newStep, role: activeRole }),
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

  // ===== SETTINGS VIEW =====
  if (showSettings) {
    if (activeRole === 'general') {
      return (
        <div>
          <SettingsHeader title="⚙️ Настройки — Общие параметры" onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

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
                    <button className="btn btn-danger" onClick={clearTelegramLogs} disabled={clearingTelegramLogs}>
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
                    <button className="btn btn-danger" onClick={clearActivityLogs} disabled={clearingActivityLogs}>
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
          <SettingsHeader title="⚙️ Настройки — Сотрудники" onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

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
          <SettingsHeader title="⚙️ Настройки — Роли" onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

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
          <SettingsHeader title="⚙️ Настройки — Цвета и легенда этапов" onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

          <div className="card">
            <p>Здесь настраиваются цвета справочника и легенды этапов для единой таблицы заказов.</p>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />
            <div className="orders-stage-legend">
              <div className="orders-stage-legend-header">
                <div>
                  <div className="orders-stage-legend-title">Легенда этапов</div>
                  <div className="orders-stage-legend-subtitle">Цвета ниже применяются к этапам в таблице заказов.</div>
                </div>
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

    return (
      <div>
        <SettingsHeader title={`⚙️ Настройки — ${settingsTabs.find(t => t.key === activeRole)?.label}`} onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} tabs={settingsTabs} />

        <div className="card">
          <p>Настройка этапов для данной роли</p>
          <SettingsFeedback error={settingsError} success={settingsSuccess} />
          <SettingsActions>
            <button className="btn btn-success" onClick={openCreateStepModal}>Добавить этап</button>
            <button className="btn" onClick={fetchSteps}>Обновить список</button>
          </SettingsActions>
          <div className="table-scroll desktop-table-only">
            <table>
              <thead><tr><th>№</th><th>Название этапа</th><th>Описание</th><th>Действия</th></tr></thead>
              <tbody>
                {filteredSteps.map(s => (
                  <tr key={s._id}>
                    <td>{s.order}</td><td>{s.stepName}</td><td>{s.description}</td>
                    <td>
                      <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => openEditStepModal(s)}>✎</button>
                      <button className="btn btn-danger" onClick={() => requestDeleteStep(s)}>✕</button>
                    </td>
                  </tr>
                ))}
                {filteredSteps.length === 0 && <tr><td colSpan={4} className="empty-cell">Нет этапов</td></tr>}
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
            {filteredSteps.length === 0 && <div className="mobile-empty-state">Нет этапов</div>}
          </div>
        </div>
        {settingsCrudModals}
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <SectionHeader
          title="⚙️ Настройки системы"
          description="Управление ролями, сотрудниками, этапами, цветами, Telegram и обновлениями проекта"
          actions={
            <>
            <Link to="/archive" className="btn btn-secondary section-toolbar-btn">📦 Архив</Link>
            <button className="btn btn-secondary section-toolbar-btn" onClick={() => { setActiveRole('general'); setShowSettings(true); }}>
              ⚙️ Настройки
            </button>
            </>
          }
        />
      </div>

      <EmployeeModal
        mode={employeeModalMode}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        onAdd={handleAddEmployee}
        onUpdate={handleUpdateEmployee}
        onClose={closeEmployeeModal}
        roleTabs={employeeRoleTabs}
      />

      <StepModal
        mode={stepModalMode}
        editStep={editStep}
        newStep={newStep}
        setEditStep={setEditStep}
        setNewStep={setNewStep}
        onAdd={handleAddStep}
        onUpdate={handleUpdateStep}
        onClose={closeStepModal}
      />

      <ColorModal
        mode={colorModalMode}
        editColor={editColor}
        newColor={newColor}
        setEditColor={setEditColor}
        setNewColor={setNewColor}
        onAdd={handleAddColor}
        onUpdate={handleUpdateColor}
        onClose={closeColorModal}
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
    </div>
  );
}

export default Admin;
