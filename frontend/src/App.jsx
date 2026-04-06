import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './home';
import JlDueReport from './JlDueReport';
import LoanDetail from './LoanDetail';
import Layout from './Layout';

function App() {
    // Basic user info for the Layout sidebar display
    const user = { full_name: 'Admin User', role: 'admin' };

    return (
        <BrowserRouter>
            <Routes>
                <Route 
                    path="/db-ac-report" 
                    element={
                        <Layout user={user} activeMenu="db-ac-report">
                            <Home />
                        </Layout>
                    } 
                />
                <Route 
                    path="/jl-due-report" 
                    element={
                        <Layout user={user} activeMenu="jl-due-report">
                            <JlDueReport />
                        </Layout>
                    } 
                />
                <Route 
                    path="/jl-due-report/:id" 
                    element={
                        <Layout user={user} activeMenu="jl-due-report">
                            <LoanDetail />
                        </Layout>
                    } 
                />
                <Route path="*" element={<Navigate to="/db-ac-report" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
