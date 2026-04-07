import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImage from './assets/logo.png';

const Layout = ({ children, user, onLogout, activeMenu, showFooter = false }) => {
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
        <div className="relative flex h-screen w-full flex-col overflow-hidden bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100 font-[Inter] antialiased">
            {/* Top Navigation Bar */}
            <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101822] px-6 shrink-0 shadow-sm z-10 transition-colors">
                <div className="flex items-center gap-4">
                    <img src={logoImage} alt="Logo" className="h-10 w-auto object-contain" />
                    <h2 className="text-xl font-extrabold tracking-tight mt-1 bg-gradient-to-r from-[#cbb161] via-[#d4af37] to-[#8a712c] text-transparent bg-clip-text drop-shadow-sm">JUBILANT GROUP - DROPOUT</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleTheme}
                        className="flex items-center justify-center rounded-2xl h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 active:scale-90"
                    >
                        <span className="material-symbols-outlined text-[20px]" title='Theme Switch'>
                            {isDark ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
                    <button className="flex items-center justify-center rounded-2xl h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 active:scale-90 relative">
                        <span className="material-symbols-outlined text-[20px]" title='Notifications'>notifications</span>
                        <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900" />
                    </button>
                    <button className="flex items-center justify-center rounded-2xl h-10 w-10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 active:scale-90">
                        <span className="material-symbols-outlined text-[20px]" title='Help'>help</span>
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101822] flex flex-col shrink-0 transition-colors">

                    <div className="flex flex-col gap-1 p-6 pt-2 flex-1 overflow-y-auto">
                        <Link
                            to="/db-ac-report"
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group ${activeMenu === 'db-ac-report'
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'}`}
                        >
                            <span className="material-symbols-outlined text-[20px]">account_balance</span>
                            <span className="text-sm font-semibold">Bank : All Cloud</span>
                        </Link>
                        <Link
                            to="/jl-due-report"
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group ${activeMenu === 'jl-due-report'
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'}`}
                        >
                            <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                            <span className="text-sm font-semibold">JL Due Report</span>
                        </Link>
                        {user?.role === 'admin' && (
                            <Link
                                to="/users"
                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group ${activeMenu === 'users'
                                    ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'}`}
                            >
                                <span className="material-symbols-outlined text-[20px]">group</span>
                                <span className="text-sm font-semibold">Users</span>
                            </Link>
                        )}
                    </div>

                    {/* Bottom User Profile & Logout */}
                    <div className="mt-auto p-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-4">
                            {/* Circular Avatar */}
                            <div className="w-12 h-12 rounded-full bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-500 shadow-inner">
                                <span className="material-symbols-outlined text-3xl">person</span>
                            </div>

                            {/* Name & Role */}
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate tracking-tight">
                                    {user?.name || 'User'}
                                </h4>
                                <p className="text-[10px] font-black text-blue-500/70 dark:text-blue-400/70 uppercase tracking-[0.2em]">
                                    {user?.role || 'Member'}
                                </p>
                            </div>

                            {/* Streamlined Logout Icon */}
                            <button
                                onClick={() => setShowLogoutConfirm(true)}
                                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-500"
                                title="Sign Out"
                            >
                                <span className="material-symbols-outlined text-xl">logout</span>
                            </button>
                        </div>
                    </div>
                </aside>

                <div className="flex-1 flex flex-col overflow-y-auto">
                    <main className="flex-1">
                        {children}
                    </main>
                    {showFooter && (
                        <footer className="pt-5 pb-1 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101822]/50">
                            <div className="max-w-7xl mx-auto px-4 text-center flex flex-col items-center justify-center">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                    Designed and Developed by{' '}
                                    <a
                                        href="mailto:dhinakaran.s@jubilantenterprises.in"
                                        className="text-primary hover:underline font-medium"
                                    >
                                        Dhinakaran Sekar
                                    </a>
                                </p>
                            </div>
                        </footer>
                    )}
                </div>
            </div>

            {/* Logout Confirm Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/20 transform transition-all animate-in zoom-in-95 duration-300">
                        <div className="p-10 text-center">
                            <div className="w-20 h-20 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-6 mx-auto">
                                <span className="material-symbols-outlined text-rose-500 text-3xl">logout</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Ready to Leave?</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-10">
                                Are you sure you want to log out of your account?
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[12px] font-black rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={onLogout}
                                    className="h-14 bg-rose-500 text-white text-[12px] font-black rounded-2xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 uppercase tracking-widest"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
