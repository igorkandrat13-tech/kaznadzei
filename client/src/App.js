import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, Navigate, useLocation } from 'react-router-dom';
import Admin from './Admin';
import Archive from './Archive';
import OrderDetail from './OrderDetail';
import RoleWorkspacePage from './RoleWorkspacePage';
import OrdersWorkspace from './OrdersWorkspace';
import Home from './Home';
import TelegramScannerPage from './TelegramScannerPage';
import {
    hasTelegramWebAppSession,
    isTelegramWebApp as detectTelegramWebApp,
    markTelegramWebAppSession,
} from './telegramWebApp';
import { apiFetch } from './api';
import { canAccessRole, clearAppAuthSession, getAppAuthRole, getAppAuthToken, subscribeToAppAuth } from './appAuth';
import { RoleConfigProvider } from './RoleConfigContext';
import './App.css';

const THEME_STORAGE_KEY = 'kaznadzei.theme';
const HEADER_LOGO_SRC = '/files/Logo-1024x307.png';
class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            errorMessage: '',
        };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            errorMessage: error?.message || 'Неизвестная ошибка интерфейса.',
        };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Application render error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="container">
                    <div className="card" style={{ maxWidth: 760, margin: '48px auto' }}>
                        <h2 style={{ marginTop: 0 }}>Интерфейс не смог загрузиться</h2>
                        <p style={{ marginBottom: 12 }}>
                            Приложение поймало ошибку во время рендера. Обновите страницу.
                            Если ошибка повторится, пришлите текст ниже.
                        </p>
                        <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
                            {this.state.errorMessage}
                        </div>
                        <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
                            Обновить страницу
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

function ProtectedRoute({ requiredRole, children }) {
    const authRole = getAppAuthRole();
    if (!canAccessRole(requiredRole, authRole)) {
        return <Navigate to="/" replace />;
    }
    return children;
}

function getAuthRoleLabel(role) {
    if (role === 'admin') return 'Администратор';
    if (role === 'manager') return 'Рабочий доступ';
    return '';
}

function AppLayout() {
    const location = useLocation();
    const routeTelegramMode = location.pathname === '/telegram-app';
    const ordersRoute = location.pathname === '/orders';
    const telegramMode = detectTelegramWebApp() || hasTelegramWebAppSession() || routeTelegramMode;
    const [theme, setTheme] = useState(() => {
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        return storedTheme === 'dark' ? 'dark' : 'light';
    });
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [authRole, setAuthRole] = useState(() => getAppAuthRole());
    const canAccessOrders = canAccessRole('manager', authRole);
    const mobileMenuAnchorRef = useRef(null);

    useEffect(() => {
        if (detectTelegramWebApp()) {
            markTelegramWebAppSession();
        }
    }, [location.pathname]);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        document.body.dataset.theme = theme;
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!mobileMenuOpen) return undefined;

        const handlePointerDown = (event) => {
            const anchorNode = mobileMenuAnchorRef.current;
            if (anchorNode?.contains(event.target)) return;
            setMobileMenuOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setMobileMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [mobileMenuOpen]);

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
                <div
                    className={`App-header ${mobileMenuOpen ? 'App-header-mobile-open' : ''}`}
                    style={{ '--header-logo-image': `url("${HEADER_LOGO_SRC}")` }}
                >
                    <div className="App-header-main">
                        {canAccessOrders && ordersRoute ? (
                            <div className="App-header-center">
                                <div id="orders-header-primary-actions" className="App-header-orders-primary-slot" />
                            </div>
                        ) : null}
                        <div ref={mobileMenuAnchorRef} className="App-header-menu-anchor">
                            <button
                                className="mobile-menu-toggle"
                                type="button"
                                onClick={() => setMobileMenuOpen(current => !current)}
                                aria-expanded={mobileMenuOpen}
                                aria-label={mobileMenuOpen ? 'Скрыть меню навигации' : 'Показать меню навигации'}
                                title="Навигация"
                            >
                                <span className="mobile-menu-toggle-line" aria-hidden="true" />
                                <span className="mobile-menu-toggle-line" aria-hidden="true" />
                                <span className="mobile-menu-toggle-line" aria-hidden="true" />
                            </button>
                            <div className={`App-header-actions ${mobileMenuOpen ? 'App-header-actions-open' : ''}`}>
                                <nav className="App-header-nav App-header-nav-primary">
                                    <Link to="/" onClick={() => setMobileMenuOpen(false)}>Главная</Link>
                                    {canAccessOrders && <Link to="/orders" onClick={() => setMobileMenuOpen(false)}>Заказы</Link>}
                                    {canAccessOrders && <Link to="/archive" onClick={() => setMobileMenuOpen(false)}>Архив</Link>}
                                    {canAccessRole('admin', authRole) && <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>Настройки</Link>}
                                </nav>
                                <div className="App-header-menu-footer">
                                    <button
                                        className="theme-icon-toggle App-header-menu-theme-toggle"
                                        type="button"
                                        onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
                                        aria-label={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
                                        title={theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
                                    >
                                        {theme === 'dark' ? '☀' : '◐'}
                                    </button>
                                    {authRole ? (
                                        <button className="btn btn-secondary App-header-logout" type="button" onClick={handleLogout}>
                                            Выйти
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className={telegramMode ? 'container container-telegram' : 'container'}>
                <Routes>
                    <Route path='/settings' element={<ProtectedRoute requiredRole='admin'><Admin /></ProtectedRoute>} />
                    <Route path='/admin' element={<Navigate to='/settings' replace />} />
                    <Route path='/orders' element={<ProtectedRoute requiredRole='manager'><OrdersWorkspace /></ProtectedRoute>} />
                    <Route path='/manager' element={<Navigate to='/orders' replace />} />
                    <Route path='/archive' element={<ProtectedRoute requiredRole='manager'><Archive /></ProtectedRoute>} />
                    <Route path='/order/:id/item/:itemId' element={<OrderDetail />} />
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
                <AppErrorBoundary>
                    <AppLayout />
                </AppErrorBoundary>
            </Router>
        </RoleConfigProvider>
    );
}

export default App;
