import React, { useState, useEffect, useMemo } from 'react';

const Settings = () => {
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState('');
    
    // Config states
    const [requireSecondaryApproval, setRequireSecondaryApproval] = useState(true);
    const [requireAdminApproval, setRequireAdminApproval] = useState(true);

    // Account names states
    const [accounts, setAccounts] = useState([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [accountName, setAccountName] = useState('');
    const [accountAcronym, setAccountAcronym] = useState('');
    const [accountType, setAccountType] = useState('jl_report');
    const [isNeedApproval, setIsNeedApproval] = useState(true);
    const [accountsError, setAccountsError] = useState('');
    const [accountsSuccess, setAccountsSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

    const filteredAccounts = useMemo(() => {
        if (!searchQuery.trim()) return accounts;
        const q = searchQuery.toLowerCase().trim();
        return accounts.filter(acc => 
            (acc.name && acc.name.toLowerCase().includes(q)) ||
            (acc.acronym && acc.acronym.toLowerCase().includes(q)) ||
            (acc.type && acc.type.toLowerCase().includes(q))
        );
    }, [accounts, searchQuery]);

    const fetchAccounts = async () => {
        setIsLoadingAccounts(true);
        try {
            const res = await fetch('/api/accounts-name');
            const result = await res.json();
            if (res.ok && result.success) {
                setAccounts(result.accounts);
            } else {
                setAccountsError(result.message || 'Failed to load accounts');
            }
        } catch (e) {
            setAccountsError('Network error loading accounts');
        } finally {
            setIsLoadingAccounts(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const handleAddAccount = async (e) => {
        e.preventDefault();
        if (!accountName.trim() || !accountAcronym.trim()) {
            setAccountsError('Both name and acronym are required.');
            return;
        }
        setAccountsError('');
        setAccountsSuccess('');
        try {
            const url = editingAccount 
                ? `/api/accounts-name/${editingAccount.id}` 
                : '/api/accounts-name';
            const method = editingAccount ? 'PUT' : 'POST';
            
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: accountName,
                    acronym: accountAcronym,
                    type: accountType,
                    is_need_approval: isNeedApproval
                })
            });
            const result = await res.json();
            if (res.ok && result.success) {
                setAccountsSuccess(editingAccount ? 'Account name updated successfully.' : 'Account name added successfully.');
                closeModal();
                fetchAccounts();
                setTimeout(() => setAccountsSuccess(''), 3000);
            } else {
                setAccountsError(result.message || 'Failed to save account');
            }
        } catch (err) {
            setAccountsError('Network error saving account');
        }
    };

    const handleEditClick = (acc) => {
        setEditingAccount(acc);
        setAccountName(acc.name);
        setAccountAcronym(acc.acronym);
        setAccountType(acc.type || 'jl_report');
        setIsNeedApproval(acc.is_need_approval);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingAccount(null);
        setAccountName('');
        setAccountAcronym('');
        setAccountType('jl_report');
        setIsNeedApproval(true);
        setAccountsError('');
        setIsTypeDropdownOpen(false);
    };

    const handleDeleteAccount = async (id) => {
        if (!window.confirm('Are you sure you want to delete this account name?')) {
            return;
        }
        setAccountsError('');
        setAccountsSuccess('');
        try {
            const res = await fetch(`/api/accounts-name/${id}`, {
                method: 'DELETE'
            });
            const result = await res.json();
            if (res.ok && result.success) {
                setAccountsSuccess('Account name deleted successfully.');
                fetchAccounts();
                setTimeout(() => setAccountsSuccess(''), 3000);
            } else {
                setAccountsError(result.message || 'Failed to delete account');
            }
        } catch (err) {
            setAccountsError('Network error deleting account');
        }
    };

    const getColorClass = (color) => {
        const classes = {
            blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
            indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
            emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
            amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
            rose: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
            violet: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
            cyan: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
            teal: 'text-teal-500 bg-teal-500/10 border-teal-500/20',
            orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
            sky: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
            pink: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
        };
        return classes[color] || classes.blue;
    };

    const getDotColorClass = (color) => {
        const classes = {
            blue: 'bg-blue-500',
            indigo: 'bg-indigo-500',
            emerald: 'bg-emerald-500',
            amber: 'bg-amber-500',
            rose: 'bg-rose-500',
            violet: 'bg-violet-500',
            cyan: 'bg-cyan-500',
            teal: 'bg-teal-500',
            orange: 'bg-orange-500',
            sky: 'bg-sky-500',
            pink: 'bg-pink-500',
        };
        return classes[color] || classes.blue;
    };

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
        <div className="p-8 w-full min-h-0 flex flex-col">
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
                        className="flex items-center gap-2 h-10 px-6 bg-primary hover:bg-primary/90 text-white rounded-xl transition-all font-bold shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-75"
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

            {/* Account Names Management Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm space-y-6 mt-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                            Account Names Management
                            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full border border-slate-200/60 dark:border-slate-700/60">
                                {accounts.length}
                            </span>
                        </h3>
                        <p className="text-xs text-slate-400">Add, view, and delete account names used across the system.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:flex-initial">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                            <input
                                type="text"
                                placeholder="Search accounts..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 h-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white w-full sm:w-60 transition-all focus:bg-white dark:focus:bg-slate-900"
                            />
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-2xl transition-all font-bold shadow-lg shadow-primary/10 active:scale-95 text-sm whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Add New
                        </button>
                    </div>
                </div>
                <hr className="border-slate-100 dark:border-slate-800/60" />

                {accountsError && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">error</span>
                        {accountsError}
                    </div>
                )}
                {accountsSuccess && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl text-xs font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        {accountsSuccess}
                    </div>
                )}

                {/* Accounts Table */}
                <div className="overflow-x-auto border border-slate-100 dark:border-slate-800/80 rounded-2xl h-[20rem]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800/80">
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Acronym</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account Name</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Type</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Approval</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {isLoadingAccounts ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-sm text-slate-400">
                                        <div className="flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            Loading accounts...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredAccounts.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-10 text-center text-sm text-slate-400">
                                        {searchQuery ? 'No accounts match your search.' : 'No account names configured yet. Click "Add New" to add one.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredAccounts.map((acc) => (
                                    <tr key={acc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/30 transition-colors">
                                        <td className="px-6 py-3 text-sm font-bold text-slate-900 dark:text-white">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-wide border ${getColorClass(acc.color)}`}>
                                                {acc.acronym}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-slate-700 dark:text-slate-300 font-medium">
                                            {acc.name}
                                        </td>
                                        <td className="px-6 py-3 text-sm font-semibold text-center">
                                            {acc.type === 'both' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30">
                                                    Both
                                                </span>
                                            ) : acc.type === 'short_loan' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
                                                    Short Loan
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                                                    JL Report
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-center">
                                            {acc.is_need_approval ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30 text-xs">
                                                    Yes
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-bold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                                                    No
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-right flex justify-end gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => handleEditClick(acc)}
                                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl active:scale-95 transition-all inline-flex items-center justify-center"
                                                title="Edit Account Name"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteAccount(acc.id)}
                                                className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/70 text-rose-500 rounded-xl active:scale-95 transition-all inline-flex items-center justify-center"
                                                title="Delete Account Name"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Account Modal Popup */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 transform transition-all animate-in fade-in zoom-in-95 duration-200">
                        <div>
                            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-1">
                                {editingAccount ? 'Edit Account' : 'Add New Account'}
                            </h3>
                            <p className="text-xs text-slate-400">
                                {editingAccount ? 'Modify account configuration details.' : 'Register a new account name to be used across reports.'}
                            </p>
                        </div>
                        <hr className="border-slate-100 dark:border-slate-800/60" />

                        <form onSubmit={handleAddAccount} className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Account Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Surge Capital Solutions"
                                    value={accountName}
                                    onChange={(e) => setAccountName(e.target.value)}
                                    className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Acronym</label>
                                <input
                                    type="text"
                                    placeholder="e.g. SCS"
                                    value={accountAcronym}
                                    onChange={(e) => setAccountAcronym(e.target.value)}
                                    className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white uppercase"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 relative">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Type</label>
                                <button
                                    type="button"
                                    onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-left focus:outline-none focus:border-primary text-slate-900 dark:text-white"
                                >
                                    <span>{accountType === 'jl_report' ? 'JL Report' : accountType === 'short_loan' ? 'Short Loan' : 'Both'}</span>
                                    <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isTypeDropdownOpen ? 'rotate-180' : ''}`}>keyboard_arrow_down</span>
                                </button>

                                {isTypeDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsTypeDropdownOpen(false)}></div>
                                        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-20 p-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAccountType('jl_report');
                                                    setIsTypeDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors font-medium ${accountType === 'jl_report' ? 'text-primary dark:text-primary bg-primary/5' : 'text-slate-700 dark:text-slate-300'}`}
                                            >
                                                JL Report
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAccountType('short_loan');
                                                    setIsTypeDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors font-medium ${accountType === 'short_loan' ? 'text-primary dark:text-primary bg-primary/5' : 'text-slate-700 dark:text-slate-300'}`}
                                            >
                                                Short Loan
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAccountType('both');
                                                    setIsTypeDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors font-medium ${accountType === 'both' ? 'text-primary dark:text-primary bg-primary/5' : 'text-slate-700 dark:text-slate-300'}`}
                                            >
                                                Both
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className={`flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/50 ${accountType === 'short_loan' ? 'opacity-50' : ''}`}>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Needs Approval</h4>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {accountType === 'both' ? 'Approval applies only to JL Report' : accountType === 'short_loan' ? 'Not applicable for Short Loans' : 'Toggle approval requirement'}
                                    </p>
                                </div>
                                <label className={`relative inline-flex items-center shrink-0 ${accountType === 'short_loan' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <input
                                        type="checkbox"
                                        checked={accountType === 'short_loan' ? false : isNeedApproval}
                                        onChange={(e) => {
                                            if (accountType !== 'short_loan') {
                                                setIsNeedApproval(e.target.checked);
                                            }
                                        }}
                                        disabled={accountType === 'short_loan'}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-5 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-md shadow-primary/10 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    {editingAccount ? 'Save Changes' : 'Add Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
