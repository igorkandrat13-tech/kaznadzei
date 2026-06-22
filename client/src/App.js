import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, Navigate, useLocation } from 'react-router-dom';
import Admin from './Admin';
import Manager from './Manager';
import Archive from './Archive';
import OrderDetail from './OrderDetail';
import RoleWorkspacePage from './RoleWorkspacePage';
import Home from './Home';
import TelegramScannerPage from './TelegramScannerPage';
import {
    hasTelegramWebAppSession,
    isTelegramWebApp as detectTelegramWebApp,
    markTelegramWebAppSession,
} from './telegramWebApp';
import { apiFetch } from './api';
import { canAccessRole, clearAppAuthSession, getAppAuthRole, getAppAuthToken, subscribeToAppAuth } from './appAuth';
import { RoleConfigProvider, useRoleConfig } from './RoleConfigContext';
import './App.css';

const THEME_STORAGE_KEY = 'kaznadzei.theme';

function ProtectedRoute({ requiredRole, children }) {
    const authRole = getAppAuthRole();
    if (!canAccessRole(requiredRole, authRole)) {
        return <Navigate to="/" replace />;
    }
    return children;
}

function getAuthRoleLabel(role) {
    if (role === 'admin') return 'Администратор';
    if (role === 'manager') return 'Менеджер';
    return '';
}

function AppLayout() {
    const location = useLocation();
    const routeTelegramMode = location.pathname === '/telegram-app';
    const telegramMode = detectTelegramWebApp() || hasTelegramWebAppSession() || routeTelegramMode;
    const [theme, setTheme] = useState(() => window.localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [authRole, setAuthRole] = useState(() => getAppAuthRole());
    const { roleTabs } = useRoleConfig();

    useEffect(() => {
        if (detectTelegramWebApp()) {
            markTelegramWebAppSession();
        }
    }, [location.pathname]);

    useEffect(() => {
        document.body.dataset.theme = theme;
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        const syncAuth = () => {
            setAuthRole(getAppAuthRole());
        };
        return subscribeToAppAuth(syncAuth);
    }, []);

    useEffect(() => {
        const token = getAppAuthToken();
        if (!token) {
            setAuthRole('');
            return undefined;
        }

        let cancelled = false;
        apiFetch('/api/auth/session')
            .then(async (res) => {
                if (!res.ok) {
                    clearAppAuthSession();
                    return;
                }
                if (!cancelled) {
                    setAuthRole(getAppAuthRole());
                }
            })
            .catch(() => {
                if (!cancelled) {
                    clearAppAuthSession();
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const handleLogout = () => {
        clearAppAuthSession();
        setAuthRole('');
        setMobileMenuOpen(false);
    };

    return (
        <>
            {!telegramMode && (
                <div className={`App-header ${mobileMenuOpen ? 'App-header-mobile-open' : ''}`}>
                    <div className="App-header-main">
                        <div className="App-header-brand">
                            <h1>🏭 Мебельная фабрика Kaznadzei</h1>
                            <div className="App-header-subtitle">Быстрый доступ к ключевым разделам. Рабочие роли остаются на главной странице.</div>
                        </div>
                        <div className="App-header-controls">
                            <button
                                className="theme-switch"
                                type="button"
                                onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
                                aria-label={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
                                title={theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
                            >
                                <span className={`theme-switch-option ${theme === 'light' ? 'theme-switch-option-active' : ''}`}>Светлая</span>
                                <span className={`theme-switch-option ${theme === 'dark' ? 'theme-switch-option-active' : ''}`}>Темная</span>
                            </button>
                            <button
                                className="mobile-menu-toggle"
                                type="button"
                                onClick={() => setMobileMenuOpen(current => !current)}
                                aria-expanded={mobileMenuOpen}
                                aria-label={mobileMenuOpen ? 'Скрыть меню' : 'Показать меню'}
                            >
                                {mobileMenuOpen ? 'Закрыть' : 'Меню'}
                            </button>
                        </div>
                    </div>
                    <div className={`App-header-actions ${mobileMenuOpen ? 'App-header-actions-open' : ''}`}>
                        <nav className="App-header-nav App-header-nav-primary">
                            <Link to="/" onClick={() => setMobileMenuOpen(false)}>Главная</Link>
                            {canAccessRole('manager', authRole) && <Link to="/manager" onClick={() => setMobileMenuOpen(false)}>Менеджер</Link>}
                            {canAccessRole('manager', authRole) && <Link to="/archive" onClick={() => setMobileMenuOpen(false)}>Архив</Link>}
                            {canAccessRole('admin', authRole) && <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>Админ</Link>}
                        </nav>
                        {canAccessRole('manager', authRole) ? (
                            <nav className="App-header-nav App-header-nav-specialists">
                                {roleTabs.map(tab => (
                                    <Link
                                        key={tab.key}
                                        to={tab.route || '/manager'}
                                        onClick={() => setMobileMenuOpen(false)}
                                    >
                                        {tab.plainLabel || tab.label}
                                    </Link>
                                ))}
                            </nav>
                        ) : null}
                        <div className="App-header-actions-right">
                            {authRole ? (
                                <div className="App-header-session">
                                    <span className="App-header-session-badge">{getAuthRoleLabel(authRole)}</span>
                                    <button className="btn btn-secondary App-header-logout" type="button" onClick={handleLogout}>
                                        Выйти
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
            <div className={telegramMode ? 'container container-telegram' : 'container'}>
                <Routes>
                    <Route path='/admin' element={<ProtectedRoute requiredRole='admin'><Admin /></ProtectedRoute>} />
                    <Route path='/manager' element={<ProtectedRoute requiredRole='manager'><Manager /></ProtectedRoute>} />
                    <Route path='/archive' element={<ProtectedRoute requiredRole='manager'><Archive /></ProtectedRoute>} />
                    <Route path='/order/:id' element={<OrderDetail />} />
                    <Route path='/role/:roleKey' element={<ProtectedRoute requiredRole='manager'><RoleWorkspacePage /></ProtectedRoute>} />
                    <Route path='/carpenter' element={<Navigate to='/role/carpenter' replace />} />
                    <Route path='/designer' element={<Navigate to='/role/designer' replace />} />
                    <Route path='/assembler' element={<Navigate to='/role/assembler' replace />} />
                    <Route path='/painter' element={<Navigate to='/role/painter' replace />} />
                    <Route path='/telegram-app' element={<TelegramScannerPage />} />
                    <Route path='/' element={<Home />} />
                </Routes>
            </div>
        </>
    );
}

function App() {
    return (
        <RoleConfigProvider>
            <Router>
                <AppLayout />
            </Router>
        </RoleConfigProvider>
    );
}

export default App;
