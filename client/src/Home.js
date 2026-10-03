import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, parseJsonSafely, toUserErrorMessage } from './api';
import {
  canAccessPage,
  canAccessRole,
  clearAppAuthSession,
  getAppAuthMe,
  getAppAuthRole,
  setAppAuthSession,
  subscribeToAppAuth,
} from './appAuth';
import { useGlobalErrorEffect } from './globalErrors';

const LOGIN_LOCK_STORAGE_KEY = 'kaznadzei.login-lock';

function getPersistedLockUntil() {
  try {
    const raw = window.localStorage.getItem(LOGIN_LOCK_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function setPersistedLockUntil(lockUntilMs) {
  try {
    if (!lockUntilMs) {
      window.localStorage.removeItem(LOGIN_LOCK_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LOGIN_LOCK_STORAGE_KEY, String(lockUntilMs));
    }
  } catch {
    // noop
  }
}

function PasswordToggleField({ label, value, onChange, placeholder, disabled, autoFocus }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus || false}
          style={{ paddingRight: 48 }}
        />
        <button
          type="button"
          className="help-tooltip"
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer',
            color: '#6b7280', fontSize: 16, padding: 4,
          }}
          onClick={() => setVisible(v => !v)}
          disabled={disabled}
          title={visible ? 'Скрыть пароль' : 'Показать пароль'}
          aria-label="toggle password visibility"
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  );
}

function Home() {
    const navigate = useNavigate();
    const [authConfig, setAuthConfig] = useState({
        adminPasswordConfigured: false,
        adminBootstrapAvailable: false,
    });
    const [authLoading, setAuthLoading] = useState(false);
    const [setupLoading, setSetupLoading] = useState(false);
    const [authError, setAuthError] = useState('');
    const [authSuccess, setAuthSuccess] = useState('');
    const [loginForm, setLoginForm] = useState({
        username: '',
        password: '',
    });
    const [setupForm, setSetupForm] = useState({
        adminPassword: '',
        passwordConfirm: '',
    });
    const [authRole, setAuthRole] = useState(() => getAppAuthRole());
    const [authMe, setAuthMe] = useState(() => getAppAuthMe());
    const [lockUntilMs, setLockUntilMs] = useState(() => getPersistedLockUntil());
    const [lockRemaining, setLockRemaining] = useState(0);
    useGlobalErrorEffect(authError, 'Ошибка доступа к системе.');

    useEffect(() => {
        const updateRemaining = () => {
            const until = lockUntilMs || getPersistedLockUntil();
            const diff = Math.max(0, until - Date.now());
            setLockRemaining(Math.ceil(diff / 1000));
            if (diff <= 0 && lockUntilMs) {
                setLockUntilMs(0);
                setPersistedLockUntil(0);
            }
        };
        updateRemaining();
        if (lockUntilMs || getPersistedLockUntil()) {
            const id = window.setInterval(updateRemaining, 500);
            return () => window.clearInterval(id);
        }
        return undefined;
    }, [lockUntilMs]);

    useEffect(() => {
        apiFetch('/api/auth/config')
            .then(res => parseJsonSafely(res))
            .then(data => setAuthConfig({
                adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
                adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
            }))
            .catch(() => {
                setAuthConfig({
                    adminPasswordConfigured: false,
                    adminBootstrapAvailable: false,
                });
            });
    }, []);

    useEffect(() => {
        const syncAuth = () => {
            setAuthRole(getAppAuthRole());
            setAuthMe(getAppAuthMe());
        };
        return subscribeToAppAuth(syncAuth);
    }, []);

    const needsInitialSetup = !authConfig.adminPasswordConfigured;
    const locked = lockRemaining > 0;

    const handleLoginChange = (field) => (event) => {
        setLoginForm(current => ({ ...current, [field]: event.target.value }));
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
        if (!setupForm.adminPassword.trim()) {
            setAuthError('Заполните новый пароль администратора.');
            setAuthSuccess('');
            return;
        }
        if (setupForm.adminPassword.length < 4) {
            setAuthError('Пароль администратора должен содержать минимум 4 символа.');
            return;
        }
        if (setupForm.adminPassword !== setupForm.passwordConfirm) {
            setAuthError('Пароли не совпадают.');
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
                    passwordConfirm: setupForm.passwordConfirm,
                }),
            });
            const data = await parseJsonSafely(res);
            if (!res.ok) {
                setAuthError(toUserErrorMessage(data?.message, 'Не удалось сохранить пароль администратора.'));
                return;
            }

            setAppAuthSession({
                sessionToken: data?.sessionToken || '',
                role: data?.role || 'admin',
                me: data?.me || null,
            });
            setAuthRole(data?.role || 'admin');
            setAuthMe(data?.me || null);
            setAuthConfig({
                adminPasswordConfigured: true,
                adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
            });
            setSetupForm({ adminPassword: '', passwordConfirm: '' });
            setLoginForm({ username: '', password: '' });
            setAuthSuccess(data?.message || 'Пароль администратора сохранен.');
            navigate('/orders');
        } catch (error) {
            setAuthError(toUserErrorMessage(error, 'Не удалось сохранить пароль администратора.'));
        } finally {
            setSetupLoading(false);
        }
    };

    const handleLoginSubmit = async (event) => {
        event.preventDefault();
        if (locked) return;
        const username = String(loginForm.username || '').trim();
        const password = String(loginForm.password || '');
        if (!username) {
            setAuthError('Введите имя пользователя.');
            return;
        }
        if (!password) {
            setAuthError('Введите пароль.');
            return;
        }

        setAuthLoading(true);
        setAuthError('');
        setAuthSuccess('');
        try {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await parseJsonSafely(res);
            if (res.status === 423) {
                const lockUntil = Number(data?.lockUntilMs) || (Date.now() + Number(data?.lockSecondsRemaining || 60) * 1000);
                setLockUntilMs(lockUntil);
                setPersistedLockUntil(lockUntil);
                setAuthError(toUserErrorMessage(data?.message, 'Слишком много неудачных попыток.'));
                return;
            }
            if (!res.ok) {
                setAuthError(toUserErrorMessage(data?.message, 'Не удалось выполнить вход.'));
                return;
            }

            setAppAuthSession({
                sessionToken: data?.sessionToken || '',
                role: data?.role || 'manager',
                me: data?.me || null,
            });
            setAuthRole(data?.role || 'manager');
            setAuthMe(data?.me || null);
            setPersistedLockUntil(0);
            setLockUntilMs(0);
            setLoginForm({ username: '', password: '' });
            setAuthSuccess('Вход выполнен.');
            const me = data?.me || null;
            if (me && canAccessPage('orders', me.role?.pages)) {
                navigate('/orders');
            } else if (canAccessRole('manager')) {
                navigate('/orders');
            } else {
                navigate('/');
            }
        } catch (error) {
            setAuthError(toUserErrorMessage(error, 'Не удалось выполнить вход.'));
        } finally {
            setAuthLoading(false);
        }
    };

    const handleLogout = () => {
        clearAppAuthSession();
        setAuthRole('');
        setAuthMe(null);
        setAuthSuccess('Сессия закрыта.');
        setAuthError('');
    };

    const defaultStartRoute = useMemo(() => {
        const me = authMe;
        if (me?.role?.pages?.orders) return '/orders';
        if (me?.role?.pages?.settings) return '/settings';
        if (me?.role?.pages?.users) return '/users';
        if (canAccessRole('manager')) return '/orders';
        if (canAccessRole('admin')) return '/settings';
        return '/';
    }, [authMe]);

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

            <div className="home-landing-content home-landing-content-centered">
                <section className="home-role-panel">
                    <div className="home-role-panel-header">
                        <div>
                            <div className="home-role-panel-title">Доступ к системе</div>
                            <div className="home-role-panel-subtitle">
                                Войдите по имени пользователя и паролю.
                            </div>
                        </div>
                    </div>

                    {authError && <div className="settings-alert settings-alert-error mb-16">{authError}</div>}
                    {authSuccess && <div className="settings-alert settings-alert-success mb-16">{authSuccess}</div>}

                    {needsInitialSetup ? (
                        <div className="home-auth-setup card">
                            <div className="home-role-panel-title">Первичная настройка доступа</div>
                            <div className="home-role-panel-subtitle" style={{ marginBottom: 16 }}>
                                Задайте пароль для системного пользователя <strong>Administrator</strong>.
                                Он сохранится в хэш и будет использоваться для всех следующих входов.
                            </div>
                            <form onSubmit={handleSetupSubmit}>
                                <div className="responsive-form-grid" style={{ marginBottom: 16 }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label>Имя пользователя</label>
                                        <input
                                            type="text"
                                            value="Administrator"
                                            disabled
                                            readOnly
                                            style={{ opacity: 0.85 }}
                                        />
                                    </div>
                                    <PasswordToggleField
                                        label="Пароль администратора"
                                        value={setupForm.adminPassword}
                                        onChange={handleSetupChange('adminPassword')}
                                        placeholder="Минимум 4 символа"
                                        disabled={setupLoading}
                                    />
                                    <PasswordToggleField
                                        label="Подтвердите пароль"
                                        value={setupForm.passwordConfirm}
                                        onChange={handleSetupChange('passwordConfirm')}
                                        placeholder="Повторите пароль"
                                        disabled={setupLoading}
                                    />
                                </div>
                                <div className="modal-actions-group">
                                    <button className="btn btn-success" type="submit" disabled={setupLoading}>
                                        {setupLoading ? 'Сохранение...' : 'Сохранить пароль и включить вход'}
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
                                    Пользователь: <strong>{authMe?.username || authRole}</strong>
                                    {authMe?.role?.name ? (
                                        <> · Права: <strong>{authMe.role.name}</strong></>
                                    ) : null}
                                </div>
                            </div>
                            <div className="section-header-actions">
                                {defaultStartRoute && defaultStartRoute !== '/' && (
                                    <Link to={defaultStartRoute} className="btn btn-primary">
                                        Открыть систему
                                    </Link>
                                )}
                                <button className="btn" onClick={handleLogout}>Выйти</button>
                            </div>
                        </div>
                    ) : null}

                    <div className="home-auth-grid">
                        <div className={`home-tech-card home-tech-card-ice home-auth-card`}>
                            <div className="home-tech-card-header">
                                <div className="home-tech-card-icon">🔐</div>
                                <div className="home-tech-card-badge">Вход по логину</div>
                            </div>
                            <h3>Вход в систему</h3>
                            <p>Введите имя пользователя и пароль. Забыли пароль — обратитесь к Администратору.</p>
                            <div className={`home-auth-status ${locked ? 'home-auth-status-pending' : 'home-auth-status-ready'}`}>
                                {locked ? `Блокировка: ${lockRemaining} с` : 'Вход активен'}
                            </div>
                            {locked ? (
                                <div className="home-auth-hint" style={{ color: '#d97706', fontWeight: 600 }}>
                                    Слишком много неудачных попыток. Повторите через: {lockRemaining} сек.
                                </div>
                            ) : null}
                            <form onSubmit={handleLoginSubmit}>
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label>Имя пользователя</label>
                                    <input
                                        type="text"
                                        value={loginForm.username}
                                        onChange={handleLoginChange('username')}
                                        placeholder="Например: Administrator"
                                        disabled={authLoading || locked || needsInitialSetup}
                                        autoFocus
                                        autoComplete="username"
                                    />
                                </div>
                                <PasswordToggleField
                                    label="Пароль"
                                    value={loginForm.password}
                                    onChange={handleLoginChange('password')}
                                    placeholder="Введите пароль"
                                    disabled={authLoading || locked || needsInitialSetup}
                                />
                                <div className="home-tech-card-footer">
                                    <button
                                        className="btn btn-primary"
                                        type="submit"
                                        disabled={authLoading || locked || needsInitialSetup}
                                    >
                                        {authLoading ? 'Вход...' : 'Войти'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default Home;
