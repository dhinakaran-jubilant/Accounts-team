/**
 * Project: Accounts Team
 * Component: SuccessModal
 * Author: Dhinakaran Sekar
 * Email: dhinakaran.s@jubilantenterprises.in
 * Date: 2026-04-08 11:53:28
 */
import React from 'react';

export default function SuccessModal({ title, message, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/20 transform transition-all animate-in zoom-in-95 duration-300">
        <div className="p-10 flex flex-col items-center text-center">
          {/* Animated Checkmark Circle */}
          <div className="w-24 h-24 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-8 relative group">
            <div className="absolute inset-0 rounded-full bg-emerald-400 opacity-20 animate-ping group-hover:animate-none" />
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <span className="material-symbols-outlined text-4xl text-white font-bold">check</span>
            </div>
          </div>

          <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">
            {title || "Success!"}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-10 px-2">
            {message || "Your operation was completed successfully."}
          </p>

          <button
            onClick={onClose}
            className="w-full h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-slate-900/10 dark:shadow-white/10 uppercase tracking-widest"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}
