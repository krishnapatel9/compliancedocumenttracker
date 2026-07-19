import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';

function MainApp() {
    const { token, loading } = useAuth();
    const [currentPage, setCurrentPage] = useState('dashboard');

    if (loading) {
        return (
            <div className="sync-overlay">
                <div className="spinner"></div>
                <p>Restoring session state...</p>
            </div>
        );
    }

    if (!token) {
        return <Login />;
    }

    return (
        <div className="admin-layout">
            {/* Top Navigation Banner Header */}
            <header className="top-header">
                <div className="header-left">
                    <div className="header-brand">
                        <span className="header-logo-symbol">🛡️</span>
                        <h3>DocShield</h3>
                    </div>
                </div>

                <div className="header-center-nav">
                    <button
                        className={`nav-link ${currentPage === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setCurrentPage('dashboard')}
                    >
                        Overview
                    </button>
                    <button
                        className={`nav-link ${currentPage === 'documents' ? 'active' : ''}`}
                        onClick={() => setCurrentPage('documents')}
                    >
                        Inventory
                    </button>
                    <button className="nav-link" title="Compliance Frameworks (Locked)">
                        Frameworks
                    </button>
                </div>

                <div className="header-right">
                    <div className="global-search-mock" title="Global search console">
                        <span>Search console...</span>
                        <span className="search-shortcut">⌘K</span>
                    </div>
                    <button className="header-btn" title="No active notifications">🔔</button>
                    <div className="header-user-avatar" title="System Admin profile">
                        <span style={{ fontSize: '1rem' }}>👤</span>
                    </div>
                </div>
            </header>

            <div className="layout-container">
                <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
                <main className="admin-main">
                    {currentPage === 'dashboard' && <Dashboard />}
                    {currentPage === 'documents' && <Documents />}
                </main>
            </div>
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <MainApp />
        </AuthProvider>
    );
}

export default App;
