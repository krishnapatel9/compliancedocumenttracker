import React from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

const GROUPS = [
    { label: 'Register', items: [
        { to: '/', end: true, icon: 'overview', text: 'Overview' },
        { to: '/documents', icon: 'documents', text: 'Documents' },
        { to: '/frameworks', icon: 'frameworks', text: 'Frameworks' },
    ] },
    { label: 'Records', items: [
        { to: '/warnings', icon: 'reminders', text: 'Reminders' },
        { to: '/analytics', icon: 'analytics', text: 'Analytics' },
        { to: '/audit', icon: 'audit', text: 'Audit log' },
    ] },
];

function Rail() {
    const { admin, logout } = useAuth();

    return (
        <aside className="rail">
            <div className="wordmark">
                <strong>DocShield</strong>
                <span>Compliance register</span>
            </div>

            <nav aria-label="Main">
                {GROUPS.map((group) => (
                    <div className="rail-group" key={group.label}>
                        <div className="rail-label">{group.label}</div>
                        {group.items.map((item) => (
                            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}>
                                <Icon name={item.icon} />
                                {item.text}
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            <div className="rail-foot">
                <ThemeToggle />
                <div className="rail-user" title={admin?.email}>{admin?.email}</div>
                <button className="rail-signout" onClick={logout}><Icon name="signout" size={16} /> Sign out</button>
            </div>
        </aside>
    );
}

export default Rail;
