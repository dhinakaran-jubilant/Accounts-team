import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './home';
import JlDueReport from './JlDueReport';
import LoanDetail from './LoanDetail';
import Layout from './Layout';
import Login from './Login';
import UsersManager from './UsersManager';

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                setUser(JSON.parse(savedUser));
            } catch (e) {
                localStorage.removeItem('user');
            }
        }
        setLoading(false);
    }, []);

    const handleLogin = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('user');
        // Hard replace to clear React history context and disable forward button
        window.location.replace('/login');
    };

    if (loading) return null;

    return (
        <BrowserRouter>
            <Routes>
                {/* Public Route */}
                <Route 
                    path="/login" 
                    element={user ? <Navigate to="/db-ac-report" replace /> : <Login onLogin={handleLogin} />} 
                />

                {/* Protected Routes */}
                <Route 
                    path="/db-ac-report" 
                    element={
                        user ? (
                            <Layout user={user} onLogout={handleLogout} activeMenu="db-ac-report">
                                <Home />
                            </Layout>
                        ) : <Navigate to="/login" replace />
                    } 
                />
                <Route 
                    path="/jl-due-report" 
                    element={
                        user ? (
                            <Layout user={user} onLogout={handleLogout} activeMenu="jl-due-report">
                                <JlDueReport user={user} />
                            </Layout>
                        ) : <Navigate to="/login" replace />
                    } 
                />
                <Route 
                    path="/jl-due-report/:id" 
                    element={
                        user ? (
                            <Layout user={user} onLogout={handleLogout} activeMenu="jl-due-report">
                                <LoanDetail />
                            </Layout>
                        ) : <Navigate to="/login" replace />
                    } 
                />
                <Route 
                    path="/users" 
                    element={
                        user ? (
                            <Layout user={user} onLogout={handleLogout} activeMenu="users">
                                <UsersManager />
                            </Layout>
                        ) : <Navigate to="/login" replace />
                    } 
                />

                {/* Root Redirects */}
                <Route 
                    path="/" 
                    element={<Navigate to={user ? "/db-ac-report" : "/login"} replace />} 
                />
                <Route path="*" element={<Navigate to={user ? "/db-ac-report" : "/login"} replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
