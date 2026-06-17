import React from 'react';
import { Link } from 'react-router-dom';

const roles = [
    { path: '/admin', icon: '⚙️', title: 'Администратор', desc: 'Управление этапами, сотрудниками, настройками и обновлениями', accent: 'ice' },
    { path: '/manager', icon: '📋', title: 'Менеджер', desc: 'Создание заказов, контроль сроков, комментариев и статусов', accent: 'cyan' },
    { path: '/carpenter', icon: '🪚', title: 'Столяр', desc: 'Раскрой, подготовка деталей и фиксация прогресса по этапам', accent: 'amber' },
    { path: '/designer', icon: '📐', title: 'Дизайнер', desc: 'Дизайн, чертежи и сопровождение заказа на раннем этапе', accent: 'violet' },
    { path: '/assembler', icon: '🔧', title: 'Комплектовщик', desc: 'Комплектация, сборка и контроль готовности изделия', accent: 'emerald' },
    { path: '/painter', icon: '🎨', title: 'Маляр', desc: 'Покраска, отделка и финальная обработка изделия', accent: 'rose' },
];

function Home() {
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
                        Выберите рабочую роль и перейдите к заказам, этапам, комментариям и статусам.
                        Интерфейс синхронизирован с цехами, админкой и Telegram.
                    </p>

                    <div className="home-hero-tags">
                        <span>Живые статусы</span>
                        <span>QR и Telegram</span>
                        <span>Мобильный доступ</span>
                    </div>

                    <div className="home-stats-grid">
                        <div className="home-stat-card">
                            <div className="home-stat-value">6</div>
                            <div className="home-stat-label">рабочих ролей</div>
                        </div>
                        <div className="home-stat-card">
                            <div className="home-stat-value">24/7</div>
                            <div className="home-stat-label">контроль прогресса</div>
                        </div>
                        <div className="home-stat-card">
                            <div className="home-stat-value">QR</div>
                            <div className="home-stat-label">быстрый вход к заказу</div>
                        </div>
                    </div>
                </section>

                <section className="home-role-panel">
                    <div className="home-role-panel-header">
                        <div>
                            <div className="home-role-panel-title">Выбор рабочего пространства</div>
                            <div className="home-role-panel-subtitle">
                                Каждая роль получает свой набор задач, этапов и действий по заказам.
                            </div>
                        </div>
                    </div>

                    <div className="home-role-grid">
                        {roles.map((role) => (
                            <Link key={role.path} to={role.path} className={`home-tech-card home-tech-card-${role.accent}`}>
                                <div className="home-tech-card-header">
                                    <div className="home-tech-card-icon">{role.icon}</div>
                                    <div className="home-tech-card-badge">Доступ</div>
                                </div>
                                <h3>{role.title}</h3>
                                <p>{role.desc}</p>
                                <div className="home-tech-card-footer">
                                    <span>Открыть раздел</span>
                                    <span className="home-tech-card-arrow">→</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

export default Home;
