import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Rail from './components/Rail';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Frameworks from './pages/Frameworks';
import Warnings from './pages/Warnings';
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';

function Layout() {
    return (
        <div className="app">
            <Rail />
            <main className="main">
                <Outlet />
            </main>
        </div>
    );
}

/** Sends signed-out visitors to /login and remembers where they were going. */
function RequireAuth() {
    const { token } = useAuth();
    if (!token) return <Navigate to="/login" replace />;
    return <Layout />;
}

function LoginRoute() {
    const { token } = useAuth();
    return token ? <Navigate to="/" replace /> : <Login />;
}

function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
            <ToastProvider>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={<LoginRoute />} />
                        <Route element={<RequireAuth />}>
                            <Route index element={<Dashboard />} />
                            <Route path="documents" element={<Documents />} />
                            <Route path="frameworks" element={<Frameworks />} />
                            <Route path="warnings" element={<Warnings />} />
                            <Route path="analytics" element={<Analytics />} />
                            <Route path="audit" element={<AuditLog />} />
                        </Route>
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AuthProvider>
            </ToastProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}

export default App;
