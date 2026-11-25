import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

function Login() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err.message || 'Sign-in failed. Check your credentials.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login">
            <section className="login-side">
                <div>
                    <strong style={{ fontFamily: 'var(--serif)', fontSize: 22, color: '#fff' }}>DocShield</strong>
                </div>
                <div>
                    <h1>Know what expires before it does.</h1>
                    <p>One register for licences, certificates, insurance and permits, with reminders at 30, 15 and 7 days and a record of every change.</p>
                </div>
                <small>Compliance document register</small>
            </section>

            <section className="login-form-wrap">
                <div className="login-theme"><ThemeToggle /></div>
                <form className="login-form" onSubmit={handleSubmit}>
                    <h2>Sign in</h2>

                    {error && <div className="notice error" role="alert">{error}</div>}

                    <div className="field">
                        <label htmlFor="email">Email</label>
                        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="field">
                        <label htmlFor="password">Password</label>
                        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>

                    <button type="submit" className="btn" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
                    {submitting && <p className="login-hint">The server may be waking up. The first sign-in can take up to a minute.</p>}
                </form>
            </section>
        </div>
    );
}

export default Login;
