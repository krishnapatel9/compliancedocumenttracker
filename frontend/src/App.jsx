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
            <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
            <main className="admin-main">
                {currentPage === 'dashboard' && <Dashboard />}
                {currentPage === 'documents' && <Documents />}
            </main>
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
