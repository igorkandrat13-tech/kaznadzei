import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, parseJsonSafely } from './api';
import { canAccessRole, clearAppAuthSession, getAppAuthRole, setAppAuthSession, subscribeToAppAuth } from './appAuth';

function Home() {
    const navigate = useNavigate();
    const [authConfig, setAuthConfig] = useState({
        adminPasswordConfigured: false,
        managerPasswordConfigured: false,
        adminBootstrapAvailable: false,
    });
    const [authLoading, setAuthLoading] = useState(false);
    const [setupLoading, setSetupLoading] = useState(false);
    const [authError, setAuthError] = useState('');
    const [authSuccess, setAuthSuccess] = useState('');
    const [authForm, setAuthForm] = useState({
        admin: '',
        manager: '',
    });
    const [setupForm, setSetupForm] = useState({
        adminPassword: '',
        managerPassword: '',
    });
    const [authRole, setAuthRole] = useState(() => getAppAuthRole());

    useEffect(() => {
        apiFetch('/api/auth/config')
            .then(res => parseJsonSafely(res))
            .then(data => setAuthConfig({
                adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
                managerPasswordConfigured: Boolean(data?.managerPasswordConfigured),
                adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
            }))
            .catch(() => {
                setAuthConfig({
                    adminPasswordConfigured: false,
                    managerPasswordConfigured: false,
                    adminBootstrapAvailable: false,
                });
            });
    }, []);

    useEffect(() => {
        const syncAuth = () => setAuthRole(getAppAuthRole());
        return subscribeToAppAuth(syncAuth);
    }, []);

    const accessCards = useMemo(() => ([
        {
            role: 'admin',
            title: 'Администратор',
            icon: '⚙️',
            accent: 'ice',
            description: 'Полный доступ к заказам, настройкам, сотрудникам, этапам, Telegram и обновлениям.',
            route: '/admin',
            configured: authConfig.adminPasswordConfigured,
            statusLabel: authConfig.adminPasswordConfigured ? 'Пароль задан' : 'Не настроено',
            helper: authConfig.adminPasswordConfigured
                ? 'Пароль администратора настроен.'
                : 'Пароль администратора пока не настроен.',
        },
        {
            role: 'manager',
            title: 'Менеджер',
            icon: '📋',
            accent: 'cyan',
            description: 'Доступ ко всем рабочим разделам, кроме административной панели и системных настроек.',
            route: '/manager',
            configured: authConfig.managerPasswordConfigured,
            statusLabel: authConfig.managerPasswordConfigured ? 'Пароль задан' : 'Не настроено',
            helper: authConfig.managerPasswordConfigured
                ? 'Пароль менеджера настроен.'
                : 'Пароль менеджера пока не задан в админ-панели.',
        },
    ]), [authConfig]);

    const needsInitialSetup = !authConfig.adminPasswordConfigured && !authConfig.managerPasswordConfigured;

    const handleAuthChange = (role) => (event) => {
        setAuthForm(current => ({ ...current, [role]: event.target.value }));
        setAuthError('');
        setAuthSuccess('');
    };

    const handleSetupChange = (field) => (event) => {
        setSetupForm(current => ({ ...current, [field]: event.target.value }));
        setAuthError('');
        setAuthSuccess('');
    };

    const handleSetupSubmit = (event) => {
        event.preventDefault();
        handleInitialSetup();
    };

    const handleInitialSetup = async () => {
        if (!setupForm.adminPassword.trim() || !setupForm.managerPassword.trim()) {
            setAuthError('Заполните новый пароль администратора и пароль менеджера.');
            setAuthSuccess('');
            return;
        }

        setSetupLoading(true);
        setAuthError('');
        setAuthSuccess('');
        try {
            const res = await apiFetch('/api/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adminPassword: setupForm.adminPassword,
                    managerPassword: setupForm.managerPassword,
                }),
            });
            const data = await parseJsonSafely(res);
            if (!res.ok) {
                setAuthError(data?.message || 'Не удалось сохранить пароли доступа.');
                return;
            }

            setAppAuthSession({
                sessionToken: data?.sessionToken || '',
                role: data?.role || 'admin',
            });
            setAuthRole(data?.role || 'admin');
            setAuthConfig({
                adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
                managerPasswordConfigured: Boolean(data?.managerPasswordConfigured),
                adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
            });
            setSetupForm({
                adminPassword: '',
                managerPassword: '',
            });
            setAuthForm(current => ({ ...current, admin: '', manager: '' }));
            setAuthSuccess(data?.message || 'Пароли администратора и менеджера сохранены.');
        } catch (error) {
            setAuthError(error.message || 'Не удалось сохранить пароли доступа.');
        } finally {
            setSetupLoading(false);
        }
    };

    const handleLogin = async (role) => {
        const password = String(authForm[role] || '').trim();
        if (!password) {
            setAuthError(role === 'admin' ? 'Введите пароль администратора.' : 'Введите пароль менеджера.');
            return;
        }

        setAuthLoading(true);
        setAuthError('');
        setAuthSuccess('');
        try {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, password }),
            });
            const data = await parseJsonSafely(res);
            if (!res.ok) {
                setAuthError(data?.message || 'Не удалось выполнить вход.');
                return;
            }

            setAppAuthSession({
                sessionToken: data?.sessionToken || '',
                role: data?.role || role,
            });
            setAuthRole(data?.role || role);
            setAuthSuccess(role === 'admin' ? 'Вход администратора выполнен.' : 'Вход менеджера выполнен.');
            navigate(role === 'admin' ? '/admin' : '/manager');
        } catch (error) {
            setAuthError(error.message || 'Не удалось выполнить вход.');
        } finally {
            setAuthLoading(false);
        }
    };

    const handleLoginSubmit = (role) => (event) => {
        event.preventDefault();
        handleLogin(role);
    };

    const handleLogout = () => {
        clearAppAuthSession();
        setAuthRole('');
        setAuthSuccess('Сессия закрыта.');
        setAuthError('');
    };

    return (
        <div className="home-landing">
            <div className="home-landing-bg" aria-hidden="true">
                <div className="home-landing-grid" />
                <div className="home-landing-orb home-landing-orb-left" />
                <div className="home-landing-orb home-landing-orb-right" />
                <div className="home-landing-line home-landing-line-a" />
                <div className="home-landing-line home-landing-line-b" />
                <div className="home-landing-line home-landing-line-c" />
            </div>

            <div className="home-landing-content">
                <section className="home-hero-panel">
                    <div className="home-hero-topline">TECH WORKSHOP INTERFACE</div>
                    <h2>Цифровая панель управления мебельным производством</h2>
                    <p>
                        Войдите как администратор или менеджер по паролю и перейдите к нужному разделу.
                        Основной доступ в веб-интерфейс теперь начинается отсюда.
                    </p>

                    <div className="home-hero-tags">
                        <span>Живые статусы</span>
                        <span>QR и Telegram</span>
                        <span>Мобильный доступ</span>
                    </div>

                    <div className="home-stats-grid">
                        <div className="home-stat-card">
                            <div className="home-stat-value">2</div>
                            <div className="home-stat-label">роли входа</div>
                        </div>
                        <div className="home-stat-card">
                            <div className="home-stat-value">Full</div>
                            <div className="home-stat-label">доступ администратора</div>
                        </div>
                        <div className="home-stat-card">
                            <div className="home-stat-value">Role</div>
                            <div className="home-stat-label">доступ менеджера без админки</div>
                        </div>
                    </div>
                </section>

                <section className="home-role-panel">
                    <div className="home-role-panel-header">
                        <div>
                            <div className="home-role-panel-title">Доступ к системе</div>
                            <div className="home-role-panel-subtitle">
                                Администратор получает полный доступ, менеджер работает без доступа к админ-панели.
                            </div>
                        </div>
                    </div>

                    {authError && <div className="settings-alert settings-alert-error mb-16">{authError}</div>}
                    {authSuccess && <div className="settings-alert settings-alert-success mb-16">{authSuccess}</div>}

                    {needsInitialSetup ? (
                        <div className="home-auth-setup card">
                            <div className="home-role-panel-title">Первичная настройка доступа</div>
                            <div className="home-role-panel-subtitle" style={{ marginBottom: 16 }}>
                                После обновления сразу задайте пароль администратора и пароль менеджера.
                                Они сохранятся в хэш и будут использоваться для всех следующих входов.
                            </div>
                            <form onSubmit={handleSetupSubmit}>
                                <div className="responsive-form-grid" style={{ marginBottom: 16 }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label>Пароль администратора</label>
                                        <input
                                            type="password"
                                            value={setupForm.adminPassword}
                                            onChange={handleSetupChange('adminPassword')}
                                            placeholder="Введите пароль администратора"
                                            disabled={setupLoading}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label>Пароль менеджера</label>
                                        <input
                                            type="password"
                                            value={setupForm.managerPassword}
                                            onChange={handleSetupChange('managerPassword')}
                                            placeholder="Введите пароль менеджера"
                                            disabled={setupLoading}
                                        />
                                    </div>
                                </div>
                                <div className="modal-actions-group">
                                    <button className="btn btn-success" type="submit" disabled={setupLoading}>
                                        {setupLoading ? 'Сохранение...' : 'Сохранить пароли и включить вход'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : null}

                    {authRole ? (
                        <div className="home-auth-session card">
                            <div>
                                <div className="home-role-panel-title">Активная сессия</div>
                                <div className="home-role-panel-subtitle">
                                    Текущая роль: <strong>{authRole === 'admin' ? 'Администратор' : 'Менеджер'}</strong>
                                </div>
                            </div>
                            <div className="section-header-actions">
                                {canAccessRole('admin', authRole) && <Link to="/admin" className="btn btn-primary">Открыть админку</Link>}
                                {canAccessRole('manager', authRole) && <Link to="/manager" className="btn btn-secondary">Открыть менеджера</Link>}
                                <button className="btn" onClick={handleLogout}>Выйти</button>
                            </div>
                        </div>
                    ) : null}

                    <div className="home-auth-grid">
                        {accessCards.map(card => (
                            <div key={card.role} className={`home-tech-card home-tech-card-${card.accent} home-auth-card`}>
                                <div className="home-tech-card-header">
                                    <div className="home-tech-card-icon">{card.icon}</div>
                                    <div className="home-tech-card-badge">{card.role === 'admin' ? 'Full access' : 'Role access'}</div>
                                </div>
                                <h3>{card.title}</h3>
                                <p>{card.description}</p>
                                <div className={`home-auth-status ${card.configured ? 'home-auth-status-ready' : 'home-auth-status-pending'}`}>
                                    {card.statusLabel}
                                </div>
                                <div className="home-auth-hint">{card.helper}</div>
                                <form onSubmit={handleLoginSubmit(card.role)}>
                                    <div className="form-group" style={{ marginBottom: 12 }}>
                                        <label>{card.role === 'admin' ? 'Пароль администратора' : 'Пароль менеджера'}</label>
                                        <input
                                            type="password"
                                            value={authForm[card.role]}
                                            onChange={handleAuthChange(card.role)}
                                            placeholder={card.role === 'admin' ? 'Введите пароль администратора' : 'Введите пароль менеджера'}
                                            disabled={authLoading || !card.configured}
                                        />
                                    </div>
                                    <div className="home-tech-card-footer">
                                        <button
                                            className="btn btn-primary"
                                            type="submit"
                                            disabled={authLoading || !card.configured}
                                        >
                                            {authLoading ? 'Вход...' : 'Войти'}
                                        </button>
                                        {card.configured && canAccessRole(card.role, authRole) ? (
                                            <Link to={card.route} className="btn btn-secondary">
                                                Открыть
                                            </Link>
                                        ) : null}
                                    </div>
                                </form>
                            </div>
                        ))}
                    </div>
                    <div className="home-auth-note">
                        Рабочие роли цеха, QR и Telegram-сценарии продолжают работать по своим маршрутам и не требуют входа admin / manager на этой странице.
                    </div>
                </section>
            </div>
        </div>
    );
}

export default Home;
