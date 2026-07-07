import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import EmployeeModal from './admin/EmployeeModal';
import StepModal from './admin/StepModal';
import UpdatesOverview from './admin/UpdatesOverview';
import { formatDateTimeDisplay } from './dateTime';
import { useRoleConfig } from './RoleConfigContext';
import { buildOrderStageLegendConfig } from './orderStageLegend';
import { ROLE_COLUMN_ACCESS_OPTIONS, normalizeAllowedColumns } from './roleColumnAccess';
import useEscapeKey from './useEscapeKey';
import { Button, Modal, ModalHeader } from './ui';

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const EMPLOYEE_HIDDEN_COLUMN_KEYS = new Set(['orderNumber', 'customer']);

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
  const location = useLocation();
  const { roleTabs, allRoleTabs, refreshRoleConfig, getRoleMetaByKey } = useRoleConfig();
  const getDefaultEmployeeForm = (role = '') => ({
    ...emptyEmployeeForm,
    role: role || '',
  });
  const [activeRole, setActiveRole] = useState('general');
  const [selectedStepsRole, setSelectedStepsRole] = useState(() => roleTabs[0]?.key || '');
  const [stageManagerRoleKey, setStageManagerRoleKey] = useState('');
  const [steps, setSteps] = useState([]);
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
  const [employeeModalMode, setEmployeeModalMode] = useState('');
  const [stepModalMode, setStepModalMode] = useState('');
  const [showLegendColorModal, setShowLegendColorModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [savingLegendColors, setSavingLegendColors] = useState(false);
  const [orderStageLegendConfig, setOrderStageLegendConfig] = useState(() => buildOrderStageLegendConfig());
  const [legendEditForm, setLegendEditForm] = useState(null);
  const [modalErrorMessage, setModalErrorMessage] = useState('');
  const [savingAppSettings, setSavingAppSettings] = useState(false);
  const [savingUpdateSettings, setSavingUpdateSettings] = useState(false);

  const [editStep, setEditStep] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [newStep, setNewStep] = useState({ stepName: '', description: '', order: 1 });
  const [newEmployee, setNewEmployee] = useState(() => getDefaultEmployeeForm());
  const backupImportInputRef = useRef(null);
  const settingsTabs = buildSettingsTabs();
  const settingsTabKeySet = useMemo(() => new Set(settingsTabs.map((tab) => tab.key)), [settingsTabs]);
  const requestedSettingsTab = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const nextTab = String(params.get('tab') || '').trim();
    return settingsTabKeySet.has(nextTab) ? nextTab : 'general';
  }, [location.search, settingsTabKeySet]);
  const filteredSteps = steps.filter(s => s.role === selectedStepsRole).sort((a, b) => a.order - b.order);
  const employeeForm = employeeModalMode === 'edit' ? editEmployee : newEmployee;
  const legendItems = useMemo(() => {
    return orderStageLegendConfig.stages.map((item) => {
      return {
        ...item,
        hex: item.defaultHex,
      };
    });
  }, [orderStageLegendConfig]);
  const stageLegendMap = useMemo(() => {
    return legendItems.reduce((acc, item) => {
      acc[item.key] = item;
      return acc;
    }, {});
  }, [legendItems]);
  const productionHeaderPreviewItems = useMemo(() => {
    return (orderStageLegendConfig.secondaryHeaders || []).flatMap((item, index) => (
      item.legendKey && !item.useTableBackground
        ? [{
            ...item,
            headerIndex: index,
            previewHex: item.useTableBackground ? '#0C1A2A' : (item.hex || '#FFFFFF'),
            currentStageLabel: stageLegendMap[item.legendKey]?.label || 'Без этапа',
            previewTitle: item.label || 'Без названия',
          }]
        : []
    ));
  }, [orderStageLegendConfig.secondaryHeaders, stageLegendMap]);
  const hasModalWindowOpen = Boolean(
    employeeModalMode || stepModalMode || showLegendColorModal || stageManagerRoleKey || showTelegramLogs || showActivityLogs || confirmAction,
  );
  const setEmployeeForm = (nextValue) => {
    if (employeeModalMode === 'edit') {
      setEditEmployee(nextValue);
      return;
    }
    setNewEmployee(nextValue);
  };
  const getOwnAllowedColumns = useCallback((entity, optionsByKey = null) => {
    const normalized = normalizeAllowedColumns(entity?.allowedColumns, { fallbackToAll: false });
    if (!optionsByKey) return normalized;
    return normalized.filter((columnKey) => Boolean(optionsByKey[columnKey]));
  }, []);
  const getEntityAllowedColumns = useCallback((entity, optionsByKey = null) => {
    const ownAllowedColumns = getOwnAllowedColumns(entity, optionsByKey);
    if (ownAllowedColumns.length > 0 || Array.isArray(entity?.allowedColumns)) {
      return ownAllowedColumns;
    }
    const fallbackRole = getRoleMetaByKey(String(entity?.role || '').trim());
    const fallbackAllowedColumns = normalizeAllowedColumns(fallbackRole?.allowedColumns, { fallbackToAll: false });
    if (!optionsByKey) {
      return fallbackAllowedColumns;
    }
    return fallbackAllowedColumns.filter((columnKey) => Boolean(optionsByKey[columnKey]));
  }, [getOwnAllowedColumns, getRoleMetaByKey]);
  const getAllowedColumnsSummary = (entity, { ownOnly = false, optionsByKey = roleColumnOptionsByKey, columnOptions = null } = {}) => {
    const allowedColumns = ownOnly
      ? getOwnAllowedColumns(entity, optionsByKey)
      : getEntityAllowedColumns(entity, optionsByKey);
    if (allowedColumns.length === 0) return 'Нет доступных колонок';
    const resolvedColumnOptions = Array.isArray(columnOptions) ? columnOptions : Object.values(optionsByKey || {});
    const uniqueOptions = [];
    const seenKeys = new Set();
    resolvedColumnOptions.forEach((column) => {
      if (!column) return;
      const equivalentKeys = Array.isArray(column.equivalentKeys) && column.equivalentKeys.length > 0
        ? column.equivalentKeys
        : [column.key];
      if (!equivalentKeys.some((columnKey) => allowedColumns.includes(columnKey))) return;
      if (seenKeys.has(column.key)) return;
      seenKeys.add(column.key);
      uniqueOptions.push(column);
    });
    const labels = uniqueOptions.map((column) => column.label);
    if (labels.length <= 3) return labels.join(', ');
    return `${labels.slice(0, 3).join(', ')} и еще ${labels.length - 3}`;
  };
  const roleColumnOptions = useMemo(() => {
    const secondaryHeaders = orderStageLegendConfig.secondaryHeaders || [];
    const getHeaderByPrimaryColumnIndex = (primaryColumnIndex = -1) => {
      if (primaryColumnIndex < 0) return null;
      let startIndex = 0;
      for (const header of secondaryHeaders) {
        const span = Number(header?.colSpan) || 1;
        const endIndex = startIndex + span - 1;
        if (primaryColumnIndex >= startIndex && primaryColumnIndex <= endIndex) {
          return header;
        }
        startIndex += span;
      }
      return null;
    };

    return ROLE_COLUMN_ACCESS_OPTIONS.map((column) => {
      const header = getHeaderByPrimaryColumnIndex(column.primaryColumnIndex);
      return {
        ...column,
        headerLabel: header?.label || '',
        legendKey: header?.legendKey || '',
        useTableBackground: Boolean(header?.useTableBackground),
        previewColor: header?.useTableBackground ? '#0C1A2A' : (header?.hex || '#DCEBFA'),
      };
    });
  }, [orderStageLegendConfig]);
  const employeeColumnOptions = useMemo(() => {
    const groupedOptions = new Map();
    roleColumnOptions
      .filter((column) => (
        !EMPLOYEE_HIDDEN_COLUMN_KEYS.has(column.key)
        && column.legendKey
        && !column.useTableBackground
      ))
      .forEach((column) => {
        const label = column.headerLabel || column.label;
        const groupKey = `${label}::${column.legendKey}`;
        const current = groupedOptions.get(groupKey);
        if (!current) {
          groupedOptions.set(groupKey, {
            ...column,
            label,
            description: '',
            equivalentKeys: [column.key],
          });
          return;
        }
        current.equivalentKeys = Array.from(new Set([...(current.equivalentKeys || []), column.key]));
      });
    return Array.from(groupedOptions.values());
  }, [roleColumnOptions]);
  const roleColumnOptionsByKey = useMemo(() => {
    return roleColumnOptions.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});
  }, [roleColumnOptions]);
  const employeeColumnOptionsByKey = useMemo(() => {
    return employeeColumnOptions.reduce((acc, column) => {
      const keys = Array.isArray(column.equivalentKeys) && column.equivalentKeys.length > 0
        ? column.equivalentKeys
        : [column.key];
      keys.forEach((key) => {
        acc[key] = column;
      });
      acc[column.key] = column;
      return acc;
    }, {});
  }, [employeeColumnOptions]);
  const renderAllowedColumnsMarkers = (entity, { compact = false, ownOnly = false, optionsByKey = roleColumnOptionsByKey } = {}) => {
    const allowedColumns = ownOnly
      ? getOwnAllowedColumns(entity, optionsByKey)
      : getEntityAllowedColumns(entity, optionsByKey);
    if (allowedColumns.length === 0) {
      return <span className="text-subtle">Нет доступа</span>;
    }
    const uniqueColumns = [];
    const seenKeys = new Set();
    allowedColumns.forEach((columnKey) => {
      const column = optionsByKey[columnKey];
      if (!column || seenKeys.has(column.key)) return;
      seenKeys.add(column.key);
      uniqueColumns.push(column);
    });
    return (
      <div
        className={`role-allowed-columns-markers ${compact ? 'role-allowed-columns-markers-compact' : ''}`}
        title={getAllowedColumnsSummary(entity, { ownOnly, optionsByKey })}
      >
        {uniqueColumns.map((column) => {
          return (
            <span
              key={column.key}
              className="role-allowed-column-marker"
              title={`${column.label}: ${column.description}`}
              style={{
                background: column.previewColor,
                width: column.widthVar ? `clamp(18px, calc(var(${column.widthVar}) / 4), 64px)` : undefined,
              }}
              aria-label={column.label}
            />
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    setEditStep(null);
    setEditEmployee(null);
    setEmployeeModalMode('');
    setStepModalMode('');
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
    setNewEmployee(getDefaultEmployeeForm());
    setSettingsError('');
    setSettingsSuccess('');
  }, [activeRole, filteredSteps.length, selectedStepsRole]);

  useEffect(() => {
    if (!settingsError) {
      setModalErrorMessage('');
      return;
    }
    if (hasModalWindowOpen) {
      setModalErrorMessage(settingsError);
    }
  }, [hasModalWindowOpen, settingsError]);

  useEffect(() => {
    fetchAppSettings().catch(error => setSettingsError(error.message || 'Не удалось загрузить настройки.'));
    fetchEmployees().catch(error => setSettingsError(error.message || 'Не удалось загрузить сотрудников.'));
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
    if (activeRole !== requestedSettingsTab) {
      setActiveRole(requestedSettingsTab);
    }
  }, [activeRole, requestedSettingsTab]);

  useEffect(() => {
    fetchSteps();
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

  const fetchOrderStageLegendConfig = async () => {
    const res = await apiFetch('/api/order-stage-legend-config');
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(data?.message || 'Не удалось загрузить конфигурацию легенды этапов.');
    }
    setOrderStageLegendConfig(buildOrderStageLegendConfig(data || {}));
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

  const handleSettingsTabChange = useCallback((nextTab) => {
    const normalizedTab = settingsTabKeySet.has(nextTab) ? nextTab : 'general';
    setActiveRole(normalizedTab);
    navigate(normalizedTab === 'general' ? '/settings' : `/settings?tab=${normalizedTab}`, { replace: true });
  }, [navigate, settingsTabKeySet]);

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
    const timestamp = entry?.createdAt ? formatDateTimeDisplay(entry.createdAt) : 'Без времени';
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
    const timestamp = entry?.createdAt ? formatDateTimeDisplay(entry.createdAt) : 'Без времени';
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

  const openCreateEmployeeModal = () => {
    resetEmployeeForm();
    setEmployeeModalMode('create');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const openEditEmployeeModal = (employee) => {
    setEditEmployee({
      ...getDefaultEmployeeForm(employee.role),
      ...employee,
      allowedColumns: [...getOwnAllowedColumns(employee, employeeColumnOptionsByKey)],
    });
    setEmployeeModalMode('edit');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeEmployeeModal = () => {
    if (savingEmployee) return;
    setEmployeeModalMode('');
    resetEmployeeForm();
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

  const openLegendColorModal = (targetHeaderIndex = null) => {
    const headerIndex = Number.isInteger(targetHeaderIndex) ? targetHeaderIndex : -1;
    const targetHeader = orderStageLegendConfig.secondaryHeaders?.[headerIndex];
    if (!targetHeader) return;
    const linkedStage = stageLegendMap[targetHeader.legendKey] || null;
    setLegendEditForm({
      headerIndex,
      label: targetHeader.label || '',
      legendKey: targetHeader.legendKey || '',
      stageLabel: linkedStage?.label || 'Без этапа',
      useTableBackground: Boolean(targetHeader.useTableBackground),
      hex: targetHeader.useTableBackground ? '#0C1A2A' : (targetHeader.hex || '#FFFFFF'),
    });
    setShowLegendColorModal(true);
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeLegendColorModal = () => {
    if (savingLegendColors) return;
    setShowLegendColorModal(false);
    setLegendEditForm(null);
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
      } else if (confirmAction.type === 'step') {
        success = await handleDeleteStep(confirmAction.id);
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
      const payload = {
        ...newEmployee,
        allowedColumns: getOwnAllowedColumns(newEmployee, employeeColumnOptionsByKey),
      };
      const res = await apiFetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const payload = {
        ...editEmployee,
        allowedColumns: getOwnAllowedColumns(editEmployee, employeeColumnOptionsByKey),
      };
      const res = await apiFetch(`/api/employees/${editEmployee._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const handleSaveLegendColors = async () => {
    if (!legendEditForm) return;
    setSettingsError('');
    setSettingsSuccess('');
    setSavingLegendColors(true);
    try {
      const normalizedHex = legendEditForm.useTableBackground
        ? ''
        : String(legendEditForm.hex || '').trim().toUpperCase();
      if (!legendEditForm.useTableBackground && !HEX_COLOR_PATTERN.test(normalizedHex)) {
        throw new Error(`Цвет ячейки "${legendEditForm.label || 'Без названия'}" должен быть в формате #RRGGBB.`);
      }

      const normalizedStages = (orderStageLegendConfig.stages || []).map((stage) => ({
        key: stage.key,
        label: String(stage.label || '').trim(),
        description: String(stage.description || '').trim(),
        storeName: stage.storeName,
        defaultHex: String(stage.defaultHex || '').trim().toUpperCase() || '#000000',
      }));

      const configPayload = {
        primaryHeaders: (orderStageLegendConfig.primaryHeaders || []).map((label) => String(label ?? '')),
        stages: normalizedStages,
        secondaryHeaders: (orderStageLegendConfig.secondaryHeaders || []).map((item, index) => ({
          label: index === legendEditForm.headerIndex ? String(legendEditForm.label || '').trim() : item.label,
          legendKey: item.legendKey,
          hex: index === legendEditForm.headerIndex
            ? (legendEditForm.useTableBackground ? '' : normalizedHex)
            : (item.useTableBackground ? '' : String(item.hex || '').trim()),
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
          selectedStageLabel: legendEditForm.stageLabel || '',
          selectedHeaderLabel: legendEditForm.label || '',
          stagesCount: normalizedStages.length,
          headersCount: configPayload.secondaryHeaders.length,
        });
        const error = new Error(detailedMessage);
        error.legendDebugMessage = detailedMessage;
        throw error;
      }

      await fetchOrderStageLegendConfig();
      setSettingsSuccess('Название и цвет ячейки обновлены.');
      closeLegendColorModal();
    } catch (error) {
      const detailedMessage = error?.legendDebugMessage || buildLegendSaveErrorMessage({
        summary: 'Не удалось сохранить настройки этапов.',
        step: 'Локальная подготовка данных',
        error,
        selectedStageLabel: legendEditForm?.stageLabel || '',
        selectedHeaderLabel: legendEditForm?.label || '',
        stagesCount: orderStageLegendConfig.stages?.length,
        headersCount: orderStageLegendConfig.secondaryHeaders?.length,
      });
      console.error('Legend save failed:', {
        error,
        selectedHeader: legendEditForm,
      });
      setSettingsError(detailedMessage);
    } finally {
      setSavingLegendColors(false);
    }
  };

  const settingsCrudModals = (
    <>
      <EmployeeModal
        mode={employeeModalMode}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        onAdd={handleAddEmployee}
        onUpdate={handleUpdateEmployee}
        onClose={closeEmployeeModal}
        saving={savingEmployee}
        columnOptions={employeeColumnOptions}
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

      <Modal
        open={showLegendColorModal}
        onClose={closeLegendColorModal}
        closeDisabled={savingLegendColors}
        size="md"
        className="stage-legend-simple-modal"
      >
        <ModalHeader
          title="Редактирование ячейки"
          subtitle={legendEditForm ? `Текущий этап: ${legendEditForm.stageLabel}` : 'Измените название и цвет выбранной ячейки второй строки.'}
          onClose={closeLegendColorModal}
          closeDisabled={savingLegendColors}
        />
        {legendEditForm ? (
          <>
            <div className="stage-legend-simple-preview-row">
              <span
                className={`orders-stage-legend-swatch ${legendEditForm.useTableBackground ? 'orders-stage-legend-swatch-table' : ''}`}
                style={{ background: legendEditForm.useTableBackground ? '#0C1A2A' : legendEditForm.hex }}
              />
              <div className="stage-legend-simple-preview-text">
                <strong>{legendEditForm.label || 'Без названия'}</strong>
                <span>{legendEditForm.stageLabel}</span>
              </div>
            </div>
            <div className="form-group">
              <label>Название ячейки</label>
              <input
                value={legendEditForm.label}
                onChange={(event) => setLegendEditForm((current) => current ? { ...current, label: event.target.value } : current)}
                placeholder="Введите название из второй строки"
                disabled={savingLegendColors}
              />
            </div>
            <div className="form-group">
              <label>Цвет ячейки</label>
              {legendEditForm.useTableBackground ? (
                <input value="Цвет таблицы" disabled />
              ) : (
                <div className="stage-legend-simple-color-row">
                  <input
                    type="color"
                    value={legendEditForm.hex || '#FFFFFF'}
                    onChange={(event) => setLegendEditForm((current) => current ? { ...current, hex: event.target.value } : current)}
                    disabled={savingLegendColors}
                  />
                  <input
                    value={legendEditForm.hex || '#FFFFFF'}
                    onChange={(event) => setLegendEditForm((current) => current ? { ...current, hex: event.target.value } : current)}
                    placeholder="#RRGGBB"
                    disabled={savingLegendColors}
                  />
                </div>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="success" onClick={handleSaveLegendColors} disabled={savingLegendColors}>
                {savingLegendColors ? 'Сохранение...' : 'Сохранить'}
              </Button>
              <Button onClick={closeLegendColorModal} disabled={savingLegendColors}>Отмена</Button>
            </div>
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        onConfirm={handleConfirmDelete}
        onCancel={() => !confirmLoading && setConfirmAction(null)}
        loading={confirmLoading}
      />

      <Modal
        open={Boolean(modalErrorMessage)}
        onClose={() => setModalErrorMessage('')}
        size="sm"
        className="modal-window-top"
      >
        <ModalHeader
          title="Ошибка"
          subtitle="Исправьте данные и повторите действие."
          onClose={() => setModalErrorMessage('')}
        />
        <div className="settings-alert settings-alert-error" style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>
          {modalErrorMessage}
        </div>
        <div className="modal-actions">
          <Button onClick={() => setModalErrorMessage('')}>Закрыть</Button>
        </div>
      </Modal>
    </>
  );

  if (activeRole === 'general') {
    return (
      <div>
        <SettingsHeader title="⚙️ Настройки — Общие параметры" onBack={() => navigate('/orders')} activeRole={activeRole} onTabChange={handleSettingsTabChange} tabs={[]} />

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
        <SettingsHeader title="⚙️ Настройки — Сотрудники" onBack={() => navigate('/orders')} activeRole={activeRole} onTabChange={handleSettingsTabChange} tabs={[]} />

          <div className="card" style={{ marginBottom: 20 }}>
            <p>Список сотрудников для входа в Telegram-бот и работы с заказами по ролям.</p>
            <SettingsHint>
              <div><strong>Как работать:</strong> нажмите "Добавить сотрудника", заполните ФИО, должность, закрепленные колонки и PIN-код.</div>
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
                <thead><tr><th>ФИО</th><th>Должность</th><th>Колонки</th><th>Статус TG</th><th>Пользователь TG</th><th>Авторизован</th><th>PIN</th><th>Действия</th></tr></thead>
                <tbody>
                  {employees.map(employee => (
                    <tr key={employee._id}>
                      <td>{employee.fullName}</td>
                      <td>{getRoleLabel(employee.role) || '—'}</td>
                      <td>{renderAllowedColumnsMarkers(employee, { compact: true, ownOnly: true, optionsByKey: employeeColumnOptionsByKey })}</td>
                      <td>{employee.telegramUserId ? 'Привязан' : 'Не привязан'}</td>
                      <td>{getEmployeeTelegramSummary(employee)}</td>
                      <td>{employee.telegramAuthorizedAt ? formatDateTimeDisplay(employee.telegramAuthorizedAt) : '—'}</td>
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
                    <div className="mobile-order-card-subtitle">{getRoleLabel(employee.role) || 'Должность не указана'}</div>
                  </div>
                  <div className="mobile-settings-card-meta">
                    <div><strong>Статус TG:</strong> {employee.telegramUserId ? 'Привязан' : 'Не привязан'}</div>
                    <div><strong>Пользователь TG:</strong> {employee.telegramUserId ? employee.telegramUsername || 'без username' : '—'}</div>
                    <div><strong>Авторизован:</strong> {employee.telegramAuthorizedAt ? formatDateTimeDisplay(employee.telegramAuthorizedAt) : '—'}</div>
                    <div><strong>PIN:</strong> {employee.pinCode || (employee.telegramUserId ? 'Использован' : '—')}</div>
                  </div>
                  <div className="mobile-settings-card-note">
                    <strong>Колонки:</strong>
                    <div style={{ marginTop: 8 }}>{renderAllowedColumnsMarkers(employee, { compact: true, ownOnly: true, optionsByKey: employeeColumnOptionsByKey })}</div>
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

  if (activeRole === 'colors') {
    return (
      <div>
        <SettingsHeader title="⚙️ Настройки — Этапы производства" onBack={() => navigate('/orders')} activeRole={activeRole} onTabChange={handleSettingsTabChange} tabs={[]} />

          <div className="card">
            <p>Здесь настраиваются этапы производства, цвета ячеек второй строки и привязка колонок для единой таблицы заказов.</p>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />
            <div className="orders-stage-legend">
              <div className="orders-stage-legend-header">
                <div>
                  <div className="orders-stage-legend-title">Этапы производства</div>
                  <div className="orders-stage-legend-subtitle">Цвета ячеек второй строки, названия этапов и привязка колонок ниже применяются ко всей логике таблицы заказов.</div>
                </div>
              </div>
              <div className="orders-stage-legend-grid">
                {productionHeaderPreviewItems.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="orders-stage-legend-item">
                    <span
                      className={`orders-stage-legend-swatch ${item.useTableBackground ? 'orders-stage-legend-swatch-table' : ''}`}
                      style={{ background: item.previewHex }}
                    />
                    <div className="orders-stage-legend-content">
                      <div className="orders-stage-legend-item-title">{item.previewTitle}</div>
                    </div>
                    <div className="orders-stage-legend-editor">
                      <div className="orders-stage-legend-hex">{item.useTableBackground ? 'Цвет таблицы' : item.hex}</div>
                      <button
                        type="button"
                        className="btn btn-small btn-secondary"
                        onClick={() => openLegendColorModal(item.headerIndex)}
                        title={`Редактировать "${item.label || item.previewTitle}"`}
                        aria-label={`Редактировать "${item.label || item.previewTitle}"`}
                      >
                        ✎
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {settingsCrudModals}
      </div>
    );
  }

  return null;
}

export default Admin;
