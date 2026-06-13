import React from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Admin from './Admin';
import Manager from './Manager';
import Archive from './Archive';
import OrderDetail from './OrderDetail';
import Carpenter from './Carpenter';
import Designer from './Designer';
import Assembler from './Assembler';
import Painter from './Painter';
import Home from './Home';
import AdminTokenControls from './AdminTokenControls';
import './App.css';

function App() {
    return (
        <Router>
            <div className="App-header">
                <h1>🏭 Мебельная фабрика Kaznadzei</h1>
                <nav>
                    <Link to="/">Главная</Link>
                    <Link to="/admin">Админ</Link>
                    <Link to="/manager">Менеджер</Link>
                    <Link to="/carpenter">Столяр</Link>
                    <Link to="/designer">Дизайнер</Link>
                    <Link to="/assembler">Комплектовщик</Link>
                    <Link to="/painter">Маляр</Link>
                </nav>
                <AdminTokenControls />
            </div>
            <div className="container">
                <Routes>
                    <Route path='/admin' element={<Admin />} />
                    <Route path='/manager' element={<Manager />} />
                    <Route path='/archive' element={<Archive />} />
                    <Route path='/order/:id' element={<OrderDetail />} />
                    <Route path='/carpenter' element={<Carpenter />} />
                    <Route path='/designer' element={<Designer />} />
                    <Route path='/assembler' element={<Assembler />} />
                    <Route path='/painter' element={<Painter />} />
                    <Route path='/' element={<Home />} />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
