import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImage from './assets/logo.png';

const Layout = ({ children, user, onLogout, activeMenu }) => {
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isDark, setIsDark] = useState(() => {
        return localStorage.getItem('isDark') === 'true';
    });

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const toggleTheme = () => {
        setIsDark(prev => {
            const next = !prev;
            localStorage.setItem('isDark', String(next));
            return next;
        });
    };

    return (
        <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
            {/* Top Navigation Bar */}
            <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <img src={logoImage} alt="Jubilant Group Logo" className="h-10 w-auto object-contain" />
                    <h2 className="text-xl font-extrabold tracking-tight mt-1 bg-gradient-to-r from-[#cbb161] via-[#d4af37] to-[#8a712c] text-transparent bg-clip-text drop-shadow-sm">JUBILANT GROUP</h2>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleTheme}
                        className="flex items-center justify-center rounded-lg h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-slate-600 dark:text-slate-400" title='Theme Switch'>
                            {isDark ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    <button className="flex items-center justify-center rounded-lg h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined text-slate-600 dark:text-slate-400" title='Notifications'>notifications</span>
                    </button>
                    <button className="flex items-center justify-center rounded-lg h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined text-slate-600 dark:text-slate-400" title='Help'>help_outline</span>
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-6 shrink-0">
                    <div className="flex flex-col gap-2 p-4">
                        <Link 
                            to="/db-ac-report" 
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeMenu === 'db-ac-report' 
                                ? 'bg-primary text-white shadow-md shadow-primary/20' 
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                            <span className="material-symbols-outlined">summarize</span>
                            <span className="text-sm font-semibold">Bank : All Cloud Export</span>
                        </Link>
                        <Link 
                            to="/jl-due-report" 
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeMenu === 'jl-due-report' 
                                ? 'bg-primary text-white shadow-md shadow-primary/20' 
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                            <span className="material-symbols-outlined">receipt_long</span>
                            <span className="text-sm font-semibold">JL Due Report</span>
                        </Link>
                    </div>
                </aside>

                {children}
            </div>
        </div>
    );
};

export default Layout;
