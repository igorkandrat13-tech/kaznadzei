import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminTokenControls from './AdminTokenControls';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import ConfirmDialog from './ConfirmDialog';
import { getOrderStatusMeta, getStageStatusMeta } from './statusMeta';
import {
  HelpTooltip,
  SectionHeader,
  SettingsActions,
  SettingsFeedback,
  SettingsHeader,
  SettingsHint,
  emptyEmployeeForm,
  roleTabs,
} from './adminUI';
import ColorModal from './admin/ColorModal';
import CommentsModal from './admin/CommentsModal';
import EmployeeModal from './admin/EmployeeModal';
import StepModal from './admin/StepModal';
import UpdatesOverview from './admin/UpdatesOverview';

function Admin() {
  const [showSettings, setShowSettings] = useState(false);
  const [activeRole, setActiveRole] = useState('general');
  const [steps, setSteps] = useState([]);
  const [colors, setColors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [commentsModal, setCommentsModal] = useState(null);
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
  });
  const [telegramCheckResult, setTelegramCheckResult] = useState(null);
  const [checkingTelegramBot, setCheckingTelegramBot] = useState(false);
  const [settingTelegramWebhook, setSettingTelegramWebhook] = useState(false);
  const [showTelegramLogs, setShowTelegramLogs] = useState(false);
  const [telegramLogs, setTelegramLogs] = useState([]);
  const [telegramLogsLoading, setTelegramLogsLoading] = useState(false);
  const [clearingTelegramLogs, setClearingTelegramLogs] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeeModalMode, setEmployeeModalMode] = useState('');
  const [stepModalMode, setStepModalMode] = useState('');
  const [colorModalMode, setColorModalMode] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [savingAppSettings, setSavingAppSettings] = useState(false);
  const [savingUpdateSettings, setSavingUpdateSettings] = useState(false);

  const [editStep, setEditStep] = useState(null);
  const [editColor, setEditColor] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [newStep, setNewStep] = useState({ stepName: '', description: '', order: 1 });
  const [newColor, setNewColor] = useState({ name: '', hex: '#000000' });
  const [newEmployee, setNewEmployee] = useState(emptyEmployeeForm);

  const filteredSteps = steps.filter(s => s.role === activeRole).sort((a, b) => a.order - b.order);
  const employeeForm = employeeModalMode === 'edit' ? editEmployee : newEmployee;
  const setEmployeeForm = (nextValue) => {
    if (employeeModalMode === 'edit') {
      setEditEmployee(nextValue);
      return;
    }
    setNewEmployee(nextValue);
  };

  useEffect(() => {
    if (!showSettings) return;
    setEditStep(null);
    setEditColor(null);
    setEditEmployee(null);
    setEmployeeModalMode('');
    setStepModalMode('');
    setColorModalMode('');
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
    setNewEmployee(emptyEmployeeForm);
    setNewColor({ name: '', hex: '#000000' });
    setSettingsError('');
    setSettingsSuccess('');
  }, [activeRole, showSettings, filteredSteps.length]);

  useEffect(() => {
    if (!showSettings) return;
    fetchAppSettings().catch(error => setSettingsError(error.message || 'Не удалось загрузить настройки.'));
    fetchEmployees().catch(error => setSettingsError(error.message || 'Не удалось загрузить сотрудников.'));
  }, [showSettings]);

  useEffect(() => {
    fetchSteps();
    fetchColors();
    fetchOrders();
    fetchUpdateStatus();
  }, []);

  useEffect(() => {
    const refreshOverview = () => {
      fetchOrders();
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

  const fetchOrders = async () => {
    try {
      const res = await apiFetch('/api/orders');
      const data = await parseJsonSafely(res);
      setOrders(Array.isArray(data) ? data : []);
    } catch { setOrders([]); }
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
      });
      setUpdateMessage('Настройки обновления сохранены.');
      await fetchUpdateStatus();
    } catch (error) {
      setUpdateError(error.message || 'Не удалось сохранить настройки обновления');
    } finally {
      setSavingUpdateSettings(false);
    }
  };

  // Admin overview
  const findStage = (order, stepId) => {
    return (order.stages || []).find(stage => stage.stepId === stepId);
  };

  const getRoleLabel = (role) => {
    return roleTabs.find(item => item.key === role)?.label || role;
  };

  const getCommentPreview = (text) => {
    if (!text) return 'Без текста';
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  };

  const renderOrderComments = (order) => {
    const comments = order.comments || [];
    if (comments.length === 0) {
      return <span className="empty-inline">—</span>;
    }

    return (
      <div className="comments-cell">
        <button
          className="btn btn-small"
          onClick={() => openCommentsModal(order)}
        >
          Открыть все ({comments.length})
        </button>
        <div className="comments-chip-list">
          {comments.map((comment, index) => (
            <span
              key={`${comment.role}-${index}`}
              onClick={() => openCommentsModal(order, comment.role)}
              className="comments-chip"
              title={comment.text}
            >
              📝 {getRoleLabel(comment.role)}
            </span>
          ))}
        </div>
      </div>
    );
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

  const openCommentsModal = (order, initialRole) => {
    const comments = Array.isArray(order.comments) ? order.comments : [];
    if (comments.length === 0) return;
    const activeComment = comments.find(comment => comment.role === initialRole) || comments[0];
    setCommentsModal({
      orderName: order.name,
      comments,
      activeRole: activeComment.role,
    });
  };

  const closeCommentsModal = () => {
    setCommentsModal(null);
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
      });
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
    setNewEmployee(emptyEmployeeForm);
  };

  const openCreateEmployeeModal = () => {
    resetEmployeeForm();
    setEmployeeModalMode('create');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const openEditEmployeeModal = (employee) => {
    setEditEmployee({ ...employee });
    setEmployeeModalMode('edit');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const closeEmployeeModal = () => {
    if (savingEmployee) return;
    setEmployeeModalMode('');
    resetEmployeeForm();
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
      <EmployeeModal
        mode={employeeModalMode}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        onAdd={handleAddEmployee}
        onUpdate={handleUpdateEmployee}
        onClose={closeEmployeeModal}
        saving={savingEmployee}
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
          <SettingsHeader title="⚙️ Настройки — Общие параметры" onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} />

          <div className="card">
            <p>Здесь можно настроить адрес проекта для QR-кодов и токен Telegram-бота.</p>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />

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
          <SettingsHeader title="⚙️ Настройки — Сотрудники" onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} />

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

    if (activeRole === 'colors') {
      return (
        <div>
          <SettingsHeader title="⚙️ Настройки — Цвета покраски" onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} />

          <div className="card">
            <p>Список доступных цветов для малярного цеха</p>
            <SettingsFeedback error={settingsError} success={settingsSuccess} />
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
        <SettingsHeader title={`⚙️ Настройки — ${roleTabs.find(t => t.key === activeRole)?.label}`} onBack={() => setShowSettings(false)} activeRole={activeRole} onTabChange={setActiveRole} />

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

  // ===== OVERVIEW VIEW =====
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <SectionHeader
          title="⚙️ Панель администратора"
          description="Общая сводка по этапам производства, заказам и обновлениям проекта"
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

      <div className="card" style={{ marginBottom: 20 }}>
        <SectionHeader
          title="📊 Сводка по всем заказам"
          description="Прогресс каждого изделия по всем этапам производства"
        />
        <div className="table-scroll desktop-table-only">
          <table className="orders-table admin-overview-table">
            <thead>
              <tr>
                <th>Изделие</th>
                {sortedSteps.map(s => <th key={s._id} title={s.description}>{s.stepName}</th>)}
                <th>Общий статус</th>
                <th>Примечания</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const overallStatusMeta = getOrderStatusMeta(order.overallStatus);
                return (
                  <tr key={order._id}>
                    <td><strong>{order.name}</strong></td>
                    {sortedSteps.map(s => {
                      const st = findStage(order, s._id);
                      const stageMeta = st ? getStageStatusMeta(st.status) : null;
                      return (
                        <td key={s._id} style={{ textAlign: 'center' }}>
                          {stageMeta ? (
                            <span className={stageMeta.className}>{stageMeta.label}</span>
                          ) : '—'}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center' }}>
                      <span className={overallStatusMeta.className}>
                        {overallStatusMeta.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 200, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {renderOrderComments(order)}
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && <tr><td colSpan={sortedSteps.length + 3} className="empty-cell">Нет заказов</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list">
          {orders.map(order => {
            const overallStatusMeta = getOrderStatusMeta(order.overallStatus);
            return (
              <div key={order._id} className="mobile-order-card">
                <div className="mobile-order-card-header">
                  <div className="mobile-order-card-title">{order.name}</div>
                  <span className={overallStatusMeta.className}>{overallStatusMeta.label}</span>
                </div>

                <div className="mobile-order-stage-list">
                  {sortedSteps.map(step => {
                    const stage = findStage(order, step._id);
                    const stageMeta = stage ? getStageStatusMeta(stage.status) : null;
                    return (
                      <div key={step._id} className="mobile-order-stage-row">
                        <div className="mobile-order-card-label">{step.stepName}</div>
                        <div className="mobile-order-stage-action">
                          {stageMeta ? <span className={stageMeta.className}>{stageMeta.label}</span> : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mobile-order-card-note">
                  <div className="mobile-order-card-label">Примечания</div>
                  <div>{renderOrderComments(order)}</div>
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <div className="mobile-empty-state">Нет заказов</div>}
        </div>
      </div>

      <CommentsModal
        commentsModal={commentsModal}
        closeCommentsModal={closeCommentsModal}
        setCommentsModal={setCommentsModal}
        getRoleLabel={getRoleLabel}
        getCommentPreview={getCommentPreview}
      />

      <EmployeeModal
        mode={employeeModalMode}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        onAdd={handleAddEmployee}
        onUpdate={handleUpdateEmployee}
        onClose={closeEmployeeModal}
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
