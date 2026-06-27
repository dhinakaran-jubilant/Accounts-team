import React, { useState, useEffect } from 'react';

const Settings = () => {
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState('');
    
    // Config states
    const [requireSecondaryApproval, setRequireSecondaryApproval] = useState(true);
    const [requireAdminApproval, setRequireAdminApproval] = useState(true);

    // Fetch config from backend
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch('/api/system/config');
                const result = await res.json();
                if (res.ok && result.success) {
                    setRequireSecondaryApproval(result.config.require_secondary_approval);
                    setRequireAdminApproval(result.config.require_admin_approval);
                } else {
                    setError(result.error || 'Failed to load system config');
                }
            } catch (e) {
                setError('Network error loading system configuration');
            }
        };
        fetchConfig();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        try {
            const res = await fetch('/api/system/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    require_secondary_approval: requireSecondaryApproval,
                    require_admin_approval: requireAdminApproval
                })
            });
            const result = await res.json();
            if (res.ok && result.success) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            } else {
                setError(result.error || 'Failed to save configuration');
            }
        } catch (e) {
            setError('Network error saving configuration');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-12 w-full min-h-0 flex flex-col">
            {/* Header */}
            <div className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">System Settings</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure global approval workflows and authorization stages.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    {error && (
                        <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded-lg border border-rose-100 dark:border-rose-900/30">
                            {error}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-2xl transition-all font-bold shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-75"
                    >
                        {isSaving ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                Saving Settings...
                            </>
                        ) : saveSuccess ? (
                            <>
                                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                Saved Successfully!
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">save</span>
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Card Content */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm space-y-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Approval Workflow Configuration</h3>
                    <p className="text-xs text-slate-400">Configure authorization nodes and approval requirements for uploaded loans.</p>
                </div>
                <hr className="border-slate-100 dark:border-slate-800/60" />

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/50 transition-all hover:border-slate-200 dark:hover:border-slate-800">
                        <div className="pr-4">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-lg">supervisor_account</span>
                                Secondary Account Manager Approval
                            </h4>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                When enabled, newly uploaded loans go to the secondary account manager for initial verification (status set to <strong>PENDING</strong>).
                                If disabled, this stage is skipped.
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                                type="checkbox"
                                checked={requireSecondaryApproval}
                                onChange={(e) => setRequireSecondaryApproval(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/50 transition-all hover:border-slate-200 dark:hover:border-slate-800">
                        <div className="pr-4">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-lg">admin_panel_settings</span>
                                System Administrator Approval
                            </h4>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                When enabled, final approval from the System Administrator is required before a loan is activated (status set to <strong>VERIFIED</strong> until approved).
                                If disabled, approval by the secondary manager immediately sets the status to <strong>APPROVED</strong>.
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                                type="checkbox"
                                checked={requireAdminApproval}
                                onChange={(e) => setRequireAdminApproval(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                </div>

                {/* Workflow diagram preview */}
                <div className="p-5 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-950/20">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Active Flow Topology</h4>
                    <div className="flex flex-col sm:flex-row items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                            Loan Upload
                        </div>
                        <span className="material-symbols-outlined text-slate-400 rotate-90 sm:rotate-0">arrow_right_alt</span>
                        
                        {requireSecondaryApproval ? (
                            <>
                                <div className="px-3.5 py-2 bg-indigo-50/80 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                    Manager Review
                                </div>
                                <span className="material-symbols-outlined text-slate-400 rotate-90 sm:rotate-0">arrow_right_alt</span>
                            </>
                        ) : null}

                        {requireAdminApproval ? (
                            <>
                                <div className="px-3.5 py-2 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
                                    Admin Review
                                </div>
                                <span className="material-symbols-outlined text-slate-400 rotate-90 sm:rotate-0">arrow_right_alt</span>
                            </>
                        ) : null}

                        <div className="px-3.5 py-2 bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl font-bold">
                            Approved & Active
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
