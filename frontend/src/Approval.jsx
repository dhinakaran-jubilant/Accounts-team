import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const Approval = ({ user, defaultTab = 'pending', isMyRequestsPage = false }) => {
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actioningId, setActioningId] = useState(null);
    const [activeTab, setActiveTab] = useState(defaultTab); // 'pending', 'history', or 'my-requests'
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'APPROVED', 'REJECTED'
    
    // Details Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLoan, setSelectedLoan] = useState(null);
    const [isFetching, setIsFetching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [lockedAccountIds, setLockedAccountIds] = useState([]);

    const toggleLock = (id) => {
        setLockedAccountIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };
    const navigate = useNavigate();
    const location = useLocation();

    const fetchApprovals = async (tabOverride) => {
        try {
            setLoading(true);
            const currentTab = tabOverride || activeTab;
            let url = `/api/approvals?user_name=${encodeURIComponent(user.name)}`;
            if (currentTab === 'history') url += '&history=true';
            if (currentTab === 'my-requests') url += '&requester=true';
            
            const res = await fetch(url);
            const result = await res.json();
            if (res.ok && result.success) {
                setApprovals(result.approvals || []);
            } else {
                setError(result.error || 'Failed to fetch approvals');
            }
        } catch (e) {
            setError('Network error occurred.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.name) {
            setActiveTab(defaultTab);
            setApprovals([]);
            fetchApprovals(defaultTab);
        }
    }, [user, defaultTab, location.key]);

    const fetchLoanDetails = async (loanId) => {
        try {
            setIsFetching(true);
            const res = await fetch(`/api/loans/${loanId}`);
            const result = await res.json();
            if (res.ok && result.success) {
                setSelectedLoan(result.loan);
                setModalData(JSON.parse(JSON.stringify(result.loan))); // Deep copy for editing
                setIsModalOpen(true);
            } else {
                alert(result.error || 'Failed to fetch loan details');
            }
        } catch (e) {
            alert('Network error.');
        } finally {
            setIsFetching(false);
        }
    };

    // Internal tab switching
    const handleTabChange = (newTab) => {
        setActiveTab(newTab);
        setApprovals([]);
        fetchApprovals(newTab);
    };

    const handleAction = async (loanId, action) => {
        try {
            setActioningId(loanId);
            const res = await fetch(`/api/approvals/${loanId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, actioner_name: user.name })
            });
            const result = await res.json();
            if (res.ok && result.success) {
                setApprovals(prev => prev.map(a => a.id === loanId ? { ...a, localAction: action } : a));
            } else {
                alert(result.error || 'Action failed');
            }
        } catch (e) {
            alert('Network error.');
        } finally {
            setActioningId(null);
        }
    };

    const fmtINR = (val) => {
        if (val === undefined || val === null) return '—';
        const num = Number(val);
        if (isNaN(num)) return '—';
        return num.toLocaleString('en-IN');
    };

    const parseINR = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        return Number(val.toString().replace(/,/g, "")) || 0;
    };

    const handleSaveInterest = async () => {
        try {
            setIsSaving(true);
            const body = {
                primary: {
                    interest: modalData.primary_account_interest
                },
                secondary: modalData.remaining_accounts.map(acc => ({
                    id: acc.id,
                    interest: acc.interest_amount
                }))
            };
            
            const res = await fetch(`/api/loans/${modalData.id}/accounts`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await res.json();
            if (res.ok && result.success) {
                // Refresh both lists
                fetchApprovals();
                setIsModalOpen(false);
            } else {
                alert(result.error || 'Save failed');
            }
        } catch (e) {
            alert('Network error during save.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDistributionChange = (index, type, newValue) => {
        const totalI = modalData.total_interest || 0;
        if (totalI <= 0) return;

        let newAmount;
        if (type === 'percentage') {
            newAmount = (newValue / 100) * totalI;
        } else {
            newAmount = newValue;
        }

        // Identify buffer accounts (Unlocked and not the one being edited)
        const primaryId = 'primary';
        const editedId = index === -1 ? primaryId : modalData.remaining_accounts[index].id;
        
        const availableBuffers = [];
        if (primaryId !== editedId && !lockedAccountIds.includes(primaryId)) {
            availableBuffers.push({ type: 'primary' });
        }
        modalData.remaining_accounts.forEach((acc, i) => {
            if (acc.id !== editedId && !lockedAccountIds.includes(acc.id)) {
                availableBuffers.push({ type: 'secondary', index: i, id: acc.id, current_amount: acc.interest_amount });
            }
        });

        if (availableBuffers.length === 0) {
            alert("No available unlocked accounts to absorb the difference. Please unlock at least one other account.");
            return;
        }

        const currentAmt = index === -1 ? modalData.primary_account_interest : modalData.remaining_accounts[index].interest_amount;
        const diff = newAmount - currentAmt;
        
        let newPrimaryAmount = modalData.primary_account_interest;
        const newRem = JSON.parse(JSON.stringify(modalData.remaining_accounts)); // Deep copy

        if (availableBuffers.length === 1) {
            const buffer = availableBuffers[0];
            if (buffer.type === 'primary') {
                newPrimaryAmount = Math.max(0, newPrimaryAmount - diff);
            } else {
                newRem[buffer.index].interest_amount = Math.max(0, newRem[buffer.index].interest_amount - diff);
            }
        } else {
            const bufferTotalInterest = availableBuffers.reduce((sum, b) => {
                const amt = b.type === 'primary' ? modalData.primary_account_interest : b.current_amount;
                return sum + amt;
            }, 0);

            availableBuffers.forEach(buffer => {
                const currentBufferAmt = buffer.type === 'primary' ? modalData.primary_account_interest : buffer.current_amount;
                const ratio = bufferTotalInterest > 0 ? currentBufferAmt / bufferTotalInterest : 1 / availableBuffers.length;
                const adjustment = diff * ratio;

                if (buffer.type === 'primary') {
                    newPrimaryAmount = Math.max(0, newPrimaryAmount - adjustment);
                } else {
                    newRem[buffer.index].interest_amount = Math.max(0, newRem[buffer.index].interest_amount - adjustment);
                }
            });
        }

        // Finalize edited account
        if (index === -1) {
            newPrimaryAmount = newAmount;
        } else {
            newRem[index].interest_amount = newAmount;
        }

        setModalData({ ...modalData, primary_account_interest: newPrimaryAmount, remaining_accounts: newRem });
    };

    // Added logic to handle percentage rebalancing between primary and secondary accounts.

    const formatTimestamp = (ts) => {
        if (!ts || !ts.includes(' ')) return ts;
        try {
            const [date, time] = ts.split(' ');
            const [hours, minutes] = time.split(':');
            let h = parseInt(hours);
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            const hh = h < 10 ? `0${h}` : h;
            return `${date} ${hh}:${minutes} ${ampm}`;
        } catch (e) {
            return ts;
        }
    };

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Reset page to 1 when filters or tabs change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, activeTab]);

    const baseFilteredApprovals = approvals.filter(item => {
        if (activeTab === 'pending') return true; 
        
        const matchesSearch = 
            item.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.requester_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.loan_ref_id?.toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesStatus = 
            statusFilter === 'ALL' || 
            item.approval_status === statusFilter;
            
        return matchesSearch && matchesStatus;
    });

    const totalPages = Math.ceil(baseFilteredApprovals.length / ITEMS_PER_PAGE);
    const filteredApprovals = baseFilteredApprovals.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);


    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="flex flex-col items-center text-slate-500 animate-pulse">
                    <span className="material-symbols-outlined text-[48px] mb-4">sync</span>
                    <span className="text-sm font-bold tracking-widest uppercase">Fetching Pending Approvals...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 mx-auto w-full">
            <div className="mb-10 flex flex-col md:flex-row md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                        {(user.role === 'admin' && !isMyRequestsPage) ? 'Approval Queue' : 'My Requests'}
                    </h1>
                </div>

                <div className="flex-1 flex flex-col sm:flex-row gap-3">
                    <div className="relative group flex-1 max-w-sm">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors text-[20px]">search</span>
                        <input
                            type="text"
                            placeholder="Search client or requester..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 dark:text-white"
                        />
                    </div>
                    
                    {activeTab === 'history' && (
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            <option value="ALL">All Status</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                        </select>
                    )}
                </div>

                {user.role === 'admin' && !isMyRequestsPage && (
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
                        <button
                            onClick={() => handleTabChange('pending')}
                            className={`px-6 py-2 text-xs font-black tracking-widest uppercase rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            Pending Items
                        </button>
                        <button
                            onClick={() => handleTabChange('history')}
                            className={`px-6 py-2 text-xs font-black tracking-widest uppercase rounded-lg transition-all ${activeTab === 'history' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            Action History
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="mb-8 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-2xl text-rose-600 dark:text-rose-400 flex items-center gap-3">
                    <span className="material-symbols-outlined">error</span>
                    <p className="font-bold">{error}</p>
                </div>
            )}

            {filteredApprovals.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-20 text-center shadow-sm">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300 dark:text-slate-600">
                        <span className="material-symbols-outlined text-[32px]">
                            {activeTab === 'history' ? (searchTerm || statusFilter !== 'ALL' ? 'search_off' : 'history') : 'check_circle'}
                        </span>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        {activeTab === 'history' 
                            ? (searchTerm || statusFilter !== 'ALL' ? 'No results found' : 'No History Found') 
                            : 'No Clearances Needed'}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                        {activeTab === 'history' 
                            ? (searchTerm || statusFilter !== 'ALL' 
                                ? "We couldn't find any data matching your current filters. Try adjusting your search."
                                : "You haven't processed any approval requests yet in this system.")
                            : "Your approval queue is completely empty. Great job staying on top of things!"}
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto scrollbar-premium">
                        <table className="min-w-full w-max border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">
                                        {activeTab === 'my-requests' ? 'Request Date' : 'Requester'}
                                    </th>
                                    {activeTab !== 'my-requests' && (
                                        <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">Verifier</th>
                                    )}
                                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left uppercase">Client Details</th>
                                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">Loan Date</th>
                                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Loan Amount</th>
                                    <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Repayment Amount</th>
                                    {(activeTab === 'history' || activeTab === 'my-requests') && (
                                        <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-left">Status</th>
                                    )}
                                    {activeTab === 'pending' && (
                                        <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-32">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredApprovals.map((approval) => (
                                    <tr key={approval.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors group">
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col">
                                                {activeTab !== 'my-requests' && (
                                                    <span className="text-sm font-bold text-slate-900 dark:text-white">{approval.requester_name}</span>
                                                )}
                                                <span className={`${activeTab === 'my-requests' ? 'text-sm font-bold text-slate-900 dark:text-white' : 'text-[11px] text-slate-500 dark:text-slate-400 font-medium'}`}>
                                                    {activeTab === 'my-requests' ? formatTimestamp(approval.requested_at) : `Req: ${formatTimestamp(approval.requested_at)}`}
                                                </span>
                                            </div>
                                        </td>
                                        {activeTab !== 'my-requests' && (
                                            <td className="py-4 px-6">
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{approval.verified_by || '—'}</span>
                                            </td>
                                        )}
                                        <td className="py-4 px-6 text-sm font-bold text-slate-900 dark:text-white">
                                            {approval.client_name}
                                        </td>
                                        <td className="py-4 px-6 text-sm text-slate-500 dark:text-slate-400 font-medium">
                                            {approval.loan_date}
                                        </td>
                                        <td className="py-4 px-6 text-right text-sm font-black text-slate-900 dark:text-white font-mono">
                                            ₹{fmtINR(approval.loan_amount)}
                                        </td>
                                        <td className="py-4 px-6 text-right text-sm font-black text-slate-900 dark:text-white font-mono">
                                            ₹{fmtINR(approval.repayment_amount)}
                                        </td>
                                        
                                        {(activeTab === 'history' || activeTab === 'my-requests') && (
                                            <td className="py-4 px-6">
                                                <div className={`w-fit flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${
                                                    approval.approval_status === 'APPROVED' 
                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' 
                                                        : approval.approval_status === 'VERIFIED'
                                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                                            : approval.approval_status === 'PENDING'
                                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                                                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                                                }`}>
                                                    {approval.approval_status === 'APPROVED' ? 'Approved' : (approval.approval_status === 'VERIFIED' ? 'Pending Admin' : (approval.approval_status === 'PENDING' ? 'Pending Verifier' : 'Rejected'))}
                                                </div>
                                            </td>
                                        )}


                                        {activeTab === 'pending' && (
                                            <td className="py-4 px-6">
                                                <div className="flex items-center justify-center gap-2">
                                                    {approval.localAction ? (
                                                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase ${
                                                            approval.localAction === 'APPROVE' 
                                                                ? (user.role === 'admin' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400')
                                                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                                                        }`}>
                                                            <span className="material-symbols-outlined text-[16px]">
                                                                {approval.localAction === 'APPROVE' ? 'check_circle' : 'cancel'}
                                                            </span>
                                                            {approval.localAction === 'APPROVE' ? (user.role === 'admin' ? 'Approved' : 'Pending Admin') : 'Declined'}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); fetchLoanDetails(approval.id); }}
                                                                disabled={isFetching && actioningId === approval.id}
                                                                title="View Details & Edit Interest"
                                                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 hover:bg-blue-500 hover:text-white transition-all active:scale-90 disabled:opacity-50"
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(approval.id, 'REJECT')}
                                                                disabled={actioningId === approval.id}
                                                                title="Decline"
                                                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-90 disabled:opacity-50"
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">close</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(approval.id, 'APPROVE')}
                                                                disabled={actioningId === approval.id}
                                                                title="Approve"
                                                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all active:scale-90 disabled:opacity-50"
                                                            >
                                                                {actioningId === approval.id ? (
                                                                    <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                                                                ) : (
                                                                    <span className="material-symbols-outlined text-[20px]">check</span>
                                                                )}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Pagination Footer */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                            <span className="text-sm text-slate-500 font-medium">
                                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, baseFilteredApprovals.length)} of {baseFilteredApprovals.length} entries
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Previous
                                </button>
                                <span className="px-4 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold text-blue-600 dark:text-blue-400">
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isModalOpen && modalData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Account Details</h2>
                                    {modalData.loan_ref_id && (
                                        <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-blue-200 dark:border-blue-800">
                                            {modalData.loan_ref_id}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{modalData.client_name}</p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 w-10 h-10 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-8 max-h-[70vh] overflow-y-auto scrollbar-premium">
                            {(() => {
                                const totalI = modalData.primary_account_interest + modalData.remaining_accounts.reduce((s, a) => s + a.interest_amount, 0);
                                return (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                                            <DetailCard label="Loan Amount" value={`₹${fmtINR(modalData.loan_amount)}`} icon="payments" color="blue" />
                                            <DetailCard label="Loan Date" value={modalData.loan_date} icon="calendar_today" color="indigo" />
                                            <DetailCard label="Total Repayment" value={`₹${fmtINR(modalData.total_repayment_amount)}`} icon="receipt_long" color="emerald" />
                                        </div>

                                        <div className="mb-4">
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Interest Distribution</h3>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-700">
                                                            <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Account Name</th>
                                                            <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Principal</th>
                                                            <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Repayment</th>
                                                            <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Interest</th>
                                                            <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Share %</th>
                                                            <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                        {/* Primary Account Row */}
                                                        <tr>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                                                    <span className="text-sm font-bold text-slate-900 dark:text-white">{modalData.primary_account_name}</span>
                                                                    <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-1.5 py-0.5 rounded font-black uppercase">Primary</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-right text-sm font-black text-slate-500">
                                                                ₹{fmtINR(modalData.primary_account_amount)}
                                                            </td>
                                                            <td className="px-4 py-4 text-right text-sm font-black text-slate-900 dark:text-white">
                                                                ₹{fmtINR(modalData.primary_account_amount + modalData.primary_account_interest)}
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                <FormattedInput 
                                                                    value={modalData.primary_account_interest}
                                                                    onChange={(val) => {
                                                                        const numVal = parseINR(val);
                                                                        handleDistributionChange(-1, 'amount', numVal);
                                                                    }}
                                                                    className="w-32 text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-4 text-right text-sm font-black text-slate-500">
                                                                <PercentageInput 
                                                                    value={modalData.total_interest > 0 ? (modalData.primary_account_interest / modalData.total_interest) * 100 : 0}
                                                                    onChange={(newPct) => handleDistributionChange(-1, 'percentage', newPct)}
                                                                    className="w-16 text-right bg-transparent border-none text-sm font-black text-slate-500 focus:outline-none focus:text-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                />%
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <button 
                                                                    onClick={() => toggleLock('primary')}
                                                                    className={`p-2 w-10 h-10 rounded-2xl transition-all ${lockedAccountIds.includes('primary') ? 'bg-amber-100 text-amber-600 shadow-sm' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                                                                >
                                                                    <span className="material-symbols-outlined text-[20px]">
                                                                        {lockedAccountIds.includes('primary') ? 'lock' : 'lock_open'}
                                                                    </span>
                                                                </button>
                                                            </td>
                                                        </tr>

                                                        {/* Secondary Accounts */}
                                                        {modalData.remaining_accounts.map((acc, idx) => (
                                                            <tr key={acc.id}>
                                                                <td className="px-4 py-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                                                        <span className="text-sm font-bold text-slate-900 dark:text-white">{acc.account_name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-4 text-right text-sm font-black text-slate-500">
                                                                    ₹{fmtINR(acc.share)}
                                                                </td>
                                                                <td className="px-4 py-4 text-right text-sm font-black text-slate-900 dark:text-white">
                                                                    ₹{fmtINR((acc.share || 0) + (acc.interest_amount || 0))}
                                                                </td>
                                                                <td className="px-4 py-4 text-right">
                                                                    <FormattedInput 
                                                                        value={acc.interest_amount}
                                                                        onChange={(val) => {
                                                                            const numVal = parseINR(val);
                                                                            handleDistributionChange(idx, 'amount', numVal);
                                                                        }}
                                                                        className="w-32 text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-4 text-right text-sm font-black text-slate-500">
                                                                    <PercentageInput 
                                                                        value={modalData.total_interest > 0 ? (acc.interest_amount / modalData.total_interest) * 100 : 0}
                                                                        onChange={(newPct) => handleDistributionChange(idx, 'percentage', newPct)}
                                                                        className="w-16 text-right bg-transparent border-none text-sm font-black text-slate-500 focus:outline-none focus:text-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                    />%
                                                                </td>
                                                                <td className="px-4 py-4 text-center">
                                                                    <button 
                                                                        onClick={() => toggleLock(acc.id)}
                                                                        className={`p-2 w-10 h-10 rounded-2xl transition-all ${lockedAccountIds.includes(acc.id) ? 'bg-amber-100 text-amber-600 shadow-sm' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[20px]">
                                                                            {lockedAccountIds.includes(acc.id) ? 'lock' : 'lock_open'}
                                                                        </span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot className="bg-slate-100/50 dark:bg-slate-800/80">
                                                        <tr>
                                                            <td className="px-4 py-4 text-sm font-black text-slate-900 dark:text-white">Totals</td>
                                                            <td className="px-4 py-4 text-right text-sm font-black text-slate-900 dark:text-white">
                                                                ₹{fmtINR(modalData.loan_amount)}
                                                            </td>
                                                            <td className="px-4 py-4 text-right text-sm font-black text-emerald-600 dark:text-emerald-400">
                                                                ₹{fmtINR(modalData.loan_amount + modalData.total_interest)}
                                                            </td>
                                                            <td className="px-4 py-4 text-right text-sm font-black text-blue-600 dark:text-blue-400">
                                                                ₹{fmtINR(modalData.total_interest)}
                                                            </td>
                                                            <td className="px-4 py-4 text-right text-sm font-black text-slate-900 dark:text-white">100%</td>
                                                            <td></td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveInterest}
                                disabled={isSaving}
                                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const DetailCard = ({ label, value, icon, color }) => {
    const colors = {
        blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
        indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
        emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
        slate: 'text-slate-600 bg-slate-50 dark:bg-slate-900/20',
    };
    return (
        <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colors[color]}`}>
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{value}</p>
        </div>
    );
};

// Formatted Input Helper Component
const FormattedInput = ({ value, onChange, className }) => {
    const [local, setLocal] = useState("");

    useEffect(() => {
        const num = Number(value) || 0;
        setLocal(num === 0 ? "" : num.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
    }, [value]);

    return (
        <input 
            type="text"
            value={local}
            onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                setLocal(e.target.value.replace(/[^0-9.,]/g, ''));
                if (onChange) onChange(val);
            }}
            onBlur={() => {
                const num = Number(local.replace(/,/g, '')) || 0;
                setLocal(num.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
            }}
            className={className}
        />
    );
};

// Percentage Input Helper Component
const PercentageInput = ({ value, onChange, className }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [local, setLocal] = useState("");

    // Sync from props only when NOT editing (e.g. initial load or external amount changes)
    useEffect(() => {
        if (!isEditing) {
            setLocal(value === 0 ? "" : value.toFixed(2));
        }
    }, [value, isEditing]);

    const handleChange = (e) => {
        const val = e.target.value;
        if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
            setLocal(val);
            const num = parseFloat(val);
            if (!isNaN(num)) {
                onChange(num);
            } else if (val === "") {
                onChange(0);
            }
        }
    };

    const handleBlur = () => {
        setIsEditing(false);
        setLocal(value === 0 ? "" : value.toFixed(2));
    };

    if (!isEditing) {
        return (
            <span 
                onClick={() => setIsEditing(true)}
                className={`${className} cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 px-2 py-1 rounded-md transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-600`}
            >
                {value === 0 ? "0.00" : value.toFixed(2)}
            </span>
        );
    }

    return (
        <input 
            autoFocus
            type="text"
            value={local}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); }}
            className={`${className} bg-white dark:bg-slate-900 ring-2 ring-blue-500/20 rounded-md px-2 py-1`}
        />
    );
}

export default Approval;
