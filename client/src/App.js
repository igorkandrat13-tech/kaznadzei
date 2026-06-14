import React, { useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import Admin from './Admin';
import Manager from './Manager';
import Archive from './Archive';
import OrderDetail from './OrderDetail';
import Carpenter from './Carpenter';
import Designer from './Designer';
import Assembler from './Assembler';
import Painter from './Painter';
import Home from './Home';
import TelegramScannerPage from './TelegramScannerPage';
import {
    hasTelegramWebAppSession,
    isTelegramWebApp as detectTelegramWebApp,
    markTelegramWebAppSession,
} from './telegramWebApp';
import './App.css';

function AppLayout() {
    const location = useLocation();
    const routeTelegramMode = location.pathname === '/telegram-app';
    const telegramMode = detectTelegramWebApp() || hasTelegramWebAppSession() || routeTelegramMode;

    useEffect(() => {
        if (detectTelegramWebApp()) {
            markTelegramWebAppSession();
        }
    }, [location.pathname]);

    return (
        <>
            {!telegramMode && (
                <div className="App-header">
                    <div className="App-header-brand">
                        <h1>🏭 Мебельная фабрика Kaznadzei</h1>
                        <div className="App-header-subtitle">Быстрый доступ к ключевым разделам. Рабочие роли остаются на главной странице.</div>
                    </div>
                    <nav>
                        <Link to="/">Главная</Link>
                        <Link to="/manager">Менеджер</Link>
                        <Link to="/archive">Архив</Link>
                        <Link to="/admin">Админ</Link>
                    </nav>
                </div>
            )}
            <div className={telegramMode ? 'container container-telegram' : 'container'}>
                <Routes>
                    <Route path='/admin' element={<Admin />} />
                    <Route path='/manager' element={<Manager />} />
                    <Route path='/archive' element={<Archive />} />
                    <Route path='/order/:id' element={<OrderDetail />} />
                    <Route path='/carpenter' element={<Carpenter />} />
                    <Route path='/designer' element={<Designer />} />
                    <Route path='/assembler' element={<Assembler />} />
                    <Route path='/painter' element={<Painter />} />
                    <Route path='/telegram-app' element={<TelegramScannerPage />} />
                    <Route path='/' element={<Home />} />
                </Routes>
            </div>
        </>
    );
}

function App() {
    return (
        <Router>
            <AppLayout />
        </Router>
    );
}

export default App;
