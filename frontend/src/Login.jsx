/**
 * Project: Accounts Team
 * Component: Login
 * Author: Dhinakaran Sekar
 * Email: dhinakaran.s@jubilantenterprises.in
 * Date: 2026-04-08 11:53:28
 */
import React, { useState, useEffect } from 'react';
import InitialSetupModal from './InitialSetupModal';
import ForgotPasswordModal from './ForgotPasswordModal';
import config from './config';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [tempUser, setTempUser] = useState(null);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employee_code: email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (data.user.is_initial_password) {
          setTempUser(data.user);
          setShowSetup(true);
        } else {
          if (onLogin) onLogin(data.user);
        }
      } else {
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center p-4 bg-gradient-to-tr from-slate-50 via-white to-primary/5 dark:from-[#0a0f18] dark:via-[#101822] dark:to-[#1a2333] font-[Inter] antialiased overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/10 rounded-full blur-[120px] animate-pulse" />

      {/* Login Card */}
      <div className="w-full max-w-[460px] bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-slate-200/50 dark:shadow-none border border-white dark:border-slate-800 overflow-hidden">
        <div className="p-12">
          {/* Header */}
          <div className="mb-10 text-center">
            <h2 className="text-slate-900 dark:text-white text-3xl font-black leading-tight tracking-tight">DropOut</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-3 text-sm font-medium">
              Securely Manage Financial Reporting & Dues
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="flex flex-col gap-2">
              <label className="text-slate-700 dark:text-slate-300 text-xs font-black uppercase ml-1">Employee Code</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined text-xl">badge</span>
                </div>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="EX: E001"
                  required
                  className="flex w-full rounded-2xl text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 h-14 pl-12 pr-4 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-md font-medium"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-slate-700 dark:text-slate-300 text-xs font-black uppercase">Password</label>
                <button 
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-primary text-[10px] font-black uppercase tracking-widest hover:text-primary/70 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined text-xl">lock</span>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="flex w-full rounded-2xl text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 h-14 pl-12 pr-12 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-md font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-3 py-1 px-1">
              <div className="relative flex items-center">
                <input
                  id="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-primary focus:ring-primary/20 transition-all cursor-pointer appearance-none checked:bg-primary"
                />
                <span className="material-symbols-outlined absolute pointer-events-none text-white text-xs opacity-0 check-icon">check</span>
              </div>
              <label htmlFor="remember" className="text-slate-500 dark:text-slate-400 text-xs font-bold cursor-pointer select-none">
                REMEMBER ME
              </label>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black h-14 rounded-2xl transition-all shadow-xl shadow-slate-900/10 dark:shadow-white/10 flex items-center justify-center gap-2 mt-4 active:scale-95 group ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:scale-[1.02]'}`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  SIGN IN
                  <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">east</span>
                </>
              )}
            </button>
            
            {/* Error Message */}
            {error && (
              <div className="text-red-500 text-sm mt-3 text-center bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                {error}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Setup Modal */}
      {showSetup && (
        <InitialSetupModal 
          employeeCode={tempUser.employee_code} 
          onClose={() => {
            setShowSetup(false);
            if (onLogin) onLogin({ ...tempUser, is_initial_password: false });
          }} 
        />
      )}

      {/* Forgot Password Modal */}
      {showForgot && (
        <ForgotPasswordModal onClose={() => setShowForgot(false)} />
      )}
    </div>
  );
}

