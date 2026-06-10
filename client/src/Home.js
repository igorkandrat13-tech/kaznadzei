import React from 'react';

const roles = [
    { path: '/admin', icon: '⚙️', title: 'Администратор', desc: 'Управление этапами и заказами' },
    { path: '/manager', icon: '📋', title: 'Менеджер', desc: 'Создание и управление заказами' },
    { path: '/carpenter', icon: '🪚', title: 'Столяр', desc: 'Раскрой и подготовка деталей' },
    { path: '/designer', icon: '📐', title: 'Дизайнер', desc: 'Разработка дизайна и чертежей' },
    { path: '/assembler', icon: '🔧', title: 'Комплектовщик', desc: 'Комплектация деталей и сборка' },
    { path: '/painter', icon: '🎨', title: 'Маляр', desc: 'Покраска и финишная обработка' },
];

function Home() {
    return (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <h2>Добро пожаловать на фабрику!</h2>
            <p>Выберите ваш цех для просмотра задач и этапов производства</p>
            <div className="home-grid">
                {roles.map((role, i) => (
                    <a key={i} href={role.path} className="home-card">
                        <div className="icon">{role.icon}</div>
                        <h3>{role.title}</h3>
                        <p>{role.desc}</p>
                    </a>
                ))}
            </div>
        </div>
    );
}

export default Home;
