/**
 * Project: Accounts Team
 * Component: Dashboard
 * Author: Dhinakaran Sekar
 * Email: dhinakaran.s@jubilantenterprises.in
 * Date: 2026-05-12
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

const Dashboard = ({ user }) => {
    const navigate = useNavigate();
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [pendingFile, setPendingFile] = useState(null);
    const [uploadedFolders, setUploadedFolders] = useState([]);
    const [filesMap, setFilesMap] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingLogs, setProcessingLogs] = useState([]);
    const [batchSummary, setBatchSummary] = useState([]);
    const [skippedSummary, setSkippedSummary] = useState([]);
    const [isFinished, setIsFinished] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const fileInputRef = React.useRef(null);
    const logsEndRef = React.useRef(null);

    // Fetch staged folders from server to show ticks for all users
    React.useEffect(() => {
        const fetchStaged = async () => {
            try {
                const response = await fetch('/api/staged-folders');
                const data = await response.json();
                if (data.success) {
                    setUploadedFolders(data.folders);
                }
            } catch (error) {
                console.error("Error fetching staged folders:", error);
            }
        };

        fetchStaged();
        const interval = setInterval(fetchStaged, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);
    const ACCOUNT_OPTIONS = [
        { value: 'SCS', label: 'Surge Capital Solutions - SCS', color: 'blue' },
        { value: 'GC', label: 'Growth Capital - GC', color: 'indigo' },
        { value: 'FC', label: 'Finova Capital - FC', color: 'emerald' },
        { value: 'AS', label: 'Ascend Solutions - AS', color: 'amber' },
        { value: 'ASE', label: 'AS Enterprises - ASE', color: 'rose' },
        { value: 'SCE', label: 'SC Enterprises - SCE', color: 'violet' },
        { value: 'ASQ', label: 'A Square Enterprises - ASQ', color: 'cyan' },
        { value: 'SN', label: 'S Nirmala - SN', color: 'teal' },
        { value: 'FE', label: 'Fortune Enterprises - FE', color: 'orange' },
        { value: 'JC', label: 'Jubilant Capital - JC', color: 'sky' },
        { value: 'RP', label: 'Raja Priya - RP', color: 'pink' }
    ];

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

    const getHoverColorClass = (color) => {
        const classes = {
            blue: 'group-hover:text-blue-500',
            indigo: 'group-hover:text-indigo-500',
            emerald: 'group-hover:text-emerald-500',
            amber: 'group-hover:text-amber-500',
            rose: 'group-hover:text-rose-500',
            violet: 'group-hover:text-violet-500',
            cyan: 'group-hover:text-cyan-500',
            teal: 'group-hover:text-teal-500',
            orange: 'group-hover:text-orange-500',
            sky: 'group-hover:text-sky-500',
            pink: 'group-hover:text-pink-500',
        };
        return classes[color] || 'group-hover:text-primary';
    };


    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            setUploadStatus({ type: 'error', message: 'Please select a valid Excel file (.xlsx or .xls)' });
            return;
        }

        setUploadStatus({ type: 'info', message: 'Verifying file structure...' });
        setPendingFile(null);

        try {
            // Frontend verification of columns
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const headers = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })[0] || [];

            const requiredColumns = [
                'Transaction Date', 'Details', 'Debit', 'Voucher Type', 
                'Voucher Number', 'Instrument No.', 'Particulars', 
                'Credit', 'Comments', 'Actions'
            ];

            const missingColumns = requiredColumns.filter(col => 
                !headers.some(h => String(h).trim() === col)
            );

            if (missingColumns.length > 0) {
                setUploadStatus({ 
                    type: 'error', 
                    message: 'Invalid file format',
                    details: [`Missing columns: ${missingColumns.join(', ')}`]
                });
                return;
            }

            setUploadStatus({ 
                type: 'success', 
                message: 'File verified successfully!',
                details: [`File: ${file.name}`]
            });
            setPendingFile(file);
        } catch (error) {
            setUploadStatus({ type: 'error', message: 'Error processing file. Please check if the file is valid.' });
        } finally {
            e.target.value = ''; // Reset input
        }
    };

    const handleCopyReport = () => {
        const text = [
            "--- UPDATED INSTALLMENTS ---",
            ...batchSummary.slice().sort((a, b) => a.localeCompare(b)),
            "\n--- SKIPPED / NOTIFICATIONS ---",
            ...skippedSummary.slice().sort((a, b) => a.localeCompare(b))
        ].join('\n');
        
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleConfirmUpload = async () => {
        if (!pendingFile) return;

        setIsUploading(true);
        setUploadStatus({ type: 'info', message: 'Staging file on server...' });

        try {
            const formData = new FormData();
            formData.append('file', pendingFile);
            formData.append('account_name', selectedAccount.value);

            const response = await fetch('/api/stage-day-book', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                setUploadedFolders(prev => [...new Set([...prev, selectedAccount.value])]);
                setIsModalOpen(false);
                setPendingFile(null);
                setUploadStatus(null);
            } else {
                setUploadStatus({ type: 'error', message: data.error || 'Failed to stage file' });
            }
        } catch (error) {
            setUploadStatus({ type: 'error', message: 'Network error while staging file' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleFinalProcess = async () => {
        setIsProcessing(true);
        setIsFinished(false);
        setProcessingLogs([]);
        setBatchSummary([]);
        setSkippedSummary([]);
        
        const allUpdates = [];
        const allSkips = [];
        
        for (const accountValue of uploadedFolders) {
            setProcessingLogs(prev => [...prev, { 
                account: accountValue, 
                status: 'pending', 
                message: `${accountValue} processing...` 
            }]);

            const formData = new FormData();
            formData.append('account_name', accountValue);

            try {
                const response = await fetch('/api/upload-day-book', {
                    method: 'POST',
                    body: formData,
                });
                const result = await response.json();
                
                if (response.ok && result.success) {
                    if (result.updated_details) {
                        allUpdates.push(...result.updated_details);
                    }
                    if (result.skipped_details) {
                        const accountSkips = result.skipped_details.map(s => `[${accountValue}] ${s}`);
                        allSkips.push(...accountSkips);
                    }
                    
                    const wasUpdated = result.updated_count > 0;
                    setProcessingLogs(prev => prev.map(log => 
                        log.account === accountValue 
                        ? { 
                            ...log, 
                            status: wasUpdated ? 'success' : 'warning', 
                            message: wasUpdated ? `${accountValue} daybook updated` : `${accountValue} daybook skipped` 
                          }
                        : log
                    ));
                } else {
                    setProcessingLogs(prev => prev.map(log => 
                        log.account === accountValue 
                        ? { ...log, status: 'error', message: `Failed to process ${accountValue}: ${result.error || 'Unknown error'}` }
                        : log
                    ));
                }
            } catch (error) {
                setProcessingLogs(prev => prev.map(log => 
                    log.account === accountValue 
                    ? { ...log, status: 'error', message: `Network error for ${accountValue}` }
                    : log
                ));
            }
            
            if (logsEndRef.current) {
                logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }

            await new Promise(r => setTimeout(r, 600));
        }
        
        setBatchSummary(allUpdates);
        setSkippedSummary(allSkips);
        setIsFinished(true);

        // Cleanup temp folder on backend after successful batch processing
        try {
            await fetch('/api/clear-temp-folder', { method: 'POST' });
            setUploadedFolders([]);
            setFilesMap({});
        } catch (e) {
            console.error("Cleanup failed", e);
        }
    };

    return (
        <div className="flex-1 flex flex-col p-8 overflow-y-auto scrollbar-premium">
            <div className="max-w-[1600px] mx-auto w-full">
                <header className="mb-12">
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                        Dashboard
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        Streamline your financial workflow by uploading Day Books for each account. 
                        At least one verified upload is required to enable the automated processing and comparison tool.
                    </p>
                </header>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6 xl:grid-cols-6 gap-4">
                    {ACCOUNT_OPTIONS.map((account) => {
                        // Check permissions: Admins see everything, users see only assigned acronyms
                        const permissions = typeof user?.permissions === 'string' 
                            ? JSON.parse(user.permissions) 
                            : (user?.permissions || []);
                        const isLocked = user?.role !== 'admin' && !permissions.includes(account.value);

                        return (
                            <div
                                key={account.value}
                                onClick={() => {
                                    if (isLocked) return;
                                    setSelectedAccount(account);
                                    setIsModalOpen(true);
                                }}
                                className={`group relative flex flex-col p-5 rounded-3xl bg-white dark:bg-[#101822] border border-slate-100 dark:border-slate-800 shadow-sm transition-all duration-300 ${
                                    isLocked 
                                        ? 'opacity-40 grayscale cursor-not-allowed' 
                                        : 'hover:shadow-xl hover:shadow-primary/5 cursor-pointer hover:-translate-y-1 active:scale-95'
                                }`}
                            >
                                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                                    {uploadedFolders.includes(account.value) && (
                                        <div className="text-emerald-500 animate-in zoom-in duration-500">
                                            <span className="material-symbols-outlined font-black text-2xl">check_circle</span>
                                        </div>
                                    )}
                                    {isLocked && (
                                        <div className="text-slate-400">
                                            <span className="material-symbols-outlined text-xl">lock</span>
                                        </div>
                                    )}
                                </div>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${!isLocked && 'group-hover:scale-110'} ${getColorClass(account.color)} border`}>
                                    <span className="material-symbols-outlined text-2xl">folder</span>
                                </div>
                                <h3 className={`text-xl font-black text-slate-900 dark:text-white mb-1 tracking-tight ${!isLocked && getHoverColorClass(account.color)} transition-colors`}>
                                    {account.value}
                                </h3>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-16 flex flex-col items-end">
                    <button
                        onClick={handleFinalProcess}
                        disabled={uploadedFolders.length === 0 || isProcessing}
                        className={`w-full max-w-[160px] h-14 bg-primary hover:bg-primary/90 text-white font-bold text-lg rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${uploadedFolders.length === 0 || isProcessing ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                    >
                        <span className="material-symbols-outlined">{isProcessing ? 'sync' : 'upload'}</span>
                        {isProcessing ? 'Processing...' : 'Process'}
                    </button>
                </div>
            </div>

            {/* Account Modal */}
            {isModalOpen && selectedAccount && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 transform transition-all animate-in zoom-in-95 duration-300">
                        <div className="p-8">
                            <div className="flex justify-between items-start mb-8">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${getColorClass(selectedAccount.color)} border shadow-sm`}>
                                    <span className="material-symbols-outlined text-3xl">folder</span>
                                </div>
                                <button 
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                                {selectedAccount.value}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 mb-10 leading-relaxed font-medium">
                                {selectedAccount.label}
                            </p>

                            <div className="grid grid-cols-1 gap-4">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept=".xlsx, .xls"
                                    className="hidden"
                                />
                                {uploadedFolders.includes(selectedAccount.value) && !pendingFile && !uploadStatus ? (
                                    <button
                                        onClick={handleUploadClick}
                                        disabled={isUploading}
                                        className="h-16 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                                    >
                                        <span className="material-symbols-outlined">restart_alt</span>
                                        Replace Day Book
                                    </button>
                                ) : (
                                    <button
                                        onClick={pendingFile ? handleConfirmUpload : handleUploadClick}
                                        disabled={isUploading}
                                        className={`h-16 ${pendingFile ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary hover:bg-primary/90'} text-white font-bold rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${isUploading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                    >
                                        <span className="material-symbols-outlined">{isUploading ? 'sync' : pendingFile ? 'check_circle' : 'upload'}</span>
                                        {isUploading ? 'Processing...' : pendingFile ? 'Confirm Upload' : 'Upload Day Book'}
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setIsModalOpen(false);
                                        setUploadStatus(null);
                                        setPendingFile(null);
                                    }}
                                    className="h-16 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                >
                                    {pendingFile ? 'Cancel' : 'Close'}
                                </button>
                            </div>

                            {uploadStatus && (
                                <div className={`mt-6 p-4 rounded-2xl border ${
                                    uploadStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                    uploadStatus.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400' :
                                    'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                                } animate-in slide-in-from-top-2 duration-300`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="material-symbols-outlined text-sm">
                                            {uploadStatus.type === 'success' ? 'check_circle' : uploadStatus.type === 'error' ? 'error' : 'info'}
                                        </span>
                                        <p className="text-sm font-bold">{uploadStatus.message}</p>
                                    </div>
                                    {uploadStatus.details && (
                                        <div className="mt-2 text-[10px] font-medium opacity-80 max-h-20 overflow-y-auto">
                                            {uploadStatus.details.map((d, i) => <div key={i}>{d}</div>)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Processing Modal */}
            {isProcessing && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden relative">
                        <button 
                            onClick={() => {
                                setIsProcessing(false);
                                setIsFinished(false);
                            }}
                            className="absolute top-6 right-6 w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors z-10"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                        
                        <div className="p-10">
                            {(!isFinished || processingLogs.some(l => l.status === 'error')) ? (
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-premium mt-4">
                                    <div className="mb-6">
                                        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                            {isFinished ? 'Processing Complete' : 'Processing Day Books'}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                            {isFinished ? 'Review the results below.' : 'Please wait while we update the database.'}
                                        </p>
                                    </div>
                                    {processingLogs.map((log, idx) => (
                                        <div 
                                            key={idx} 
                                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 animate-in slide-in-from-left-4 ${
                                                log.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/10' : 
                                                log.status === 'warning' ? 'bg-amber-500/5 border-amber-500/10' : 
                                                log.status === 'error' ? 'bg-rose-500/5 border-rose-500/10' : 
                                                'bg-slate-500/5 border-slate-500/10'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                log.status === 'success' ? 'text-emerald-500 bg-emerald-500/10' : 
                                                log.status === 'warning' ? 'text-amber-500 bg-amber-500/10' : 
                                                log.status === 'error' ? 'text-rose-500 bg-rose-500/10' : 
                                                'text-primary bg-primary/10'
                                            }`}>
                                                <span className="material-symbols-outlined text-xl">
                                                    {log.status === 'success' ? 'check' : log.status === 'warning' ? 'info' : log.status === 'error' ? 'close' : 'sync'}
                                                </span>
                                            </div>
                                            <p className={`text-sm font-bold tracking-tight ${
                                                log.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 
                                                log.status === 'warning' ? 'text-amber-600 dark:text-amber-400' : 
                                                log.status === 'error' ? 'text-rose-600 dark:text-rose-400' : 
                                                'text-slate-700 dark:text-slate-300'
                                            }`}>
                                                {log.message}
                                            </p>
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                    
                                    {isFinished && processingLogs.some(l => l.status === 'error') && (
                                        <div className="mt-8">
                                            <button
                                                onClick={() => {
                                                    setIsProcessing(false);
                                                    setIsFinished(false);
                                                }}
                                                className="w-full h-14 bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-bold rounded-2xl transition-all active:scale-[0.98]"
                                            >
                                                Close & Resolve Issues
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center">
                                    <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
                                        <span className="material-symbols-outlined text-5xl text-emerald-500">verified</span>
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight text-center">
                                        Processing Complete
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 font-medium text-center mb-10 max-w-sm">
                                        Database has been updated with the latest entries.
                                    </p>
                                    
                                    <div className="flex flex-col w-full gap-4">
                                        <button
                                            onClick={() => {
                                                setIsReportModalOpen(true);
                                                setIsProcessing(false);
                                                setIsFinished(false);
                                            }}
                                            className="h-16 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                                        >
                                            <span className="material-symbols-outlined">description</span>
                                            View Detailed Report
                                        </button>
                                        <button
                                            onClick={() => navigate('/db-ac-report')}
                                            className="h-16 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                        >
                                            Go to Comparison Tool
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!isFinished && (
                                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-primary transition-all duration-500" 
                                            style={{ width: `${(processingLogs.filter(l => l.status !== 'pending').length / ACCOUNT_OPTIONS.length) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Detailed Report Modal */}
            {isReportModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-2xl animate-in fade-in duration-300">
                    <div className="w-full max-w-2xl bg-white dark:bg-[#0f172a] rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden transform animate-in zoom-in-95 duration-300">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Detailed Report</h2>
                                    <p className="text-slate-500 dark:text-slate-400 font-medium">Complete record of updates and skipped entries.</p>
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={handleCopyReport}
                                        disabled={batchSummary.length === 0 && skippedSummary.length === 0}
                                        className={`h-12 px-6 rounded-2xl transition-all text-sm font-bold flex items-center gap-2 ${
                                            (batchSummary.length === 0 && skippedSummary.length === 0)
                                            ? 'bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 cursor-not-allowed border border-slate-100 dark:border-slate-800'
                                            : isCopied 
                                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-lg">
                                            {isCopied ? 'check' : 'content_copy'}
                                        </span>
                                        {isCopied ? 'Copied!' : 'Copy'}
                                    </button>
                                    <button 
                                        onClick={() => setIsReportModalOpen(false)}
                                        className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center"
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 p-8 max-h-[500px] overflow-y-auto scrollbar-premium">
                                <div className="space-y-8">
                                    {batchSummary.length > 0 ? (
                                        <div>
                                            <div className="flex items-center justify-between mb-6">
                                                <h4 className="text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-3">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                                    Updated Installments
                                                </h4>
                                                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[10px] font-black">{batchSummary.length} Records</span>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3">
                                                {batchSummary.slice().sort((a, b) => a.localeCompare(b)).map((detail, idx) => (
                                                    <div key={idx} className="p-2 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4 transition-transform hover:translate-x-1">
                                                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                            <span className="material-symbols-outlined text-xs text-emerald-500 font-black">check</span>
                                                        </div>
                                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                            {detail}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-10 flex flex-col items-center justify-center opacity-30">
                                            <span className="material-symbols-outlined text-6xl mb-4">info</span>
                                            <p className="text-xl font-black">No updates made</p>
                                        </div>
                                    )}

                                    {skippedSummary.length > 0 && (
                                        <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center justify-between mb-6">
                                                <h4 className="text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-3">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                    Skipped / Notifications
                                                </h4>
                                                <span className="px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-[10px] font-black">{skippedSummary.length} Records</span>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2 opacity-80">
                                                {skippedSummary.slice().sort((a, b) => a.localeCompare(b)).map((detail, idx) => (
                                                    <div key={idx} className="flex gap-3 text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed pl-5 relative">
                                                        <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-amber-500/40" />
                                                        {detail}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
