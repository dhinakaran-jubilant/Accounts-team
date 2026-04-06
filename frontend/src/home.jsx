import React, { useState, useRef } from 'react';

function Home() {
    const [bankFile, setBankFile] = useState(null);
    const [cloudFile, setCloudFile] = useState(null);
    const [bankError, setBankError] = useState('');
    const [cloudError, setCloudError] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [popupError, setPopupError] = useState('');

    const isValidExcel = (file) => /\.(xlsx|xls)$/i.test(file.name);

    const handleFileChange = (e, setFile, setError) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!isValidExcel(file)) {
                setError('Only .xlsx or .xls files are allowed.');
                setFile(null);
            } else {
                setError('');
                setFile(file);
            }
        }
    };

    const handleDrop = (e, setFile, setError) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (!isValidExcel(file)) {
                setError('Only .xlsx or .xls files are allowed.');
                setFile(null);
            } else {
                setError('');
                setFile(file);
            }
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleUpload = async () => {
        if (!bankFile || !cloudFile) {
            setPopupError('Please select both files.');
            return;
        }
        if (!isValidExcel(bankFile) || !isValidExcel(cloudFile)) {
            setPopupError('Only .xlsx or .xls files are allowed.');
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('bank_file', bankFile);
        formData.append('cloud_file', cloudFile);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "Matched_Cheques.xlsx";
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                setUploadStatus('success');
            } else {
                let errorMessage = "Unknown error";
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Server returned ${response.status}: ${response.statusText}`;
                }
                setUploadStatus('error');
                setPopupError(errorMessage);
            }
        } catch (error) {
            console.error("Error uploading files:", error);
            setUploadStatus('error');
            setPopupError(error.message || "Network error or server unreachable");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto w-full">
            <main className="max-w-4xl mx-auto px-4 py-12 flex-grow">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">All Cloud and Bank Statement Comparison</h1>
                    <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                        Please provide your financial documents to proceed with your application. Your data is encrypted and handled with the highest security standards.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 mb-10">
                    {/* Bank Statement Drop Zone */}
                    <div className="flex flex-col gap-1">
                        <div
                            className={`group relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl bg-white dark:bg-slate-900 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md ${bankError ? 'border-red-400 bg-red-50 dark:bg-red-900/10' :
                                bankFile ? 'border-primary bg-primary/5' :
                                    'border-slate-300 dark:border-slate-700 hover:border-primary dark:hover:border-primary'
                                }`}
                            onDrop={(e) => handleDrop(e, setBankFile, setBankError)}
                            onDragOver={handleDragOver}
                        >
                            <input
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                type="file"
                                onChange={(e) => handleFileChange(e, setBankFile, setBankError)}
                                accept=".xlsx, .xls"
                            />
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <span className="material-symbols-outlined text-primary text-3xl">description</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                {bankFile ? bankFile.name : 'Bank Statement File'}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Supports
                                <span className="font-semibold text-slate-700 dark:text-slate-200"> .xlsx and .xls</span>
                            </p>
                            {!bankFile && !bankError && (
                                <div className="flex gap-2 mb-6">
                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-slate-200 dark:border-slate-700">XLSX</span>
                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-slate-200 dark:border-slate-700">XLS</span>
                                </div>
                            )}
                            <p className="text-sm font-medium text-primary flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">add_circle</span>
                                {bankFile ? 'Change File' : 'Drag and drop or browse'}
                            </p>
                        </div>
                        {bankError && (
                            <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                <span className="material-symbols-outlined text-sm">error</span>
                                {bankError}
                            </p>
                        )}
                    </div>

                    {/* Cloud Storage Drop Zone */}
                    <div className="flex flex-col gap-1">
                        <div
                            className={`group relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-2xl bg-white dark:bg-slate-900 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md ${cloudError ? 'border-red-400 bg-red-50 dark:bg-red-900/10' :
                                cloudFile ? 'border-primary bg-primary/5' :
                                    'border-slate-300 dark:border-slate-700 hover:border-primary dark:hover:border-primary'
                                }`}
                            onDrop={(e) => handleDrop(e, setCloudFile, setCloudError)}
                            onDragOver={handleDragOver}
                        >
                            <input
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                type="file"
                                onChange={(e) => handleFileChange(e, setCloudFile, setCloudError)}
                                accept=".xlsx, .xls"
                            />
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <span className="material-symbols-outlined text-primary text-3xl">cloud</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                {cloudFile ? cloudFile.name : 'All Cloud File'}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Supports
                                <span className="font-semibold text-slate-700 dark:text-slate-200"> .xlsx and .xls</span>
                            </p>
                            {!cloudFile && !cloudError && (
                                <div className="flex gap-2 mb-6">
                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-slate-200 dark:border-slate-700">XLSX</span>
                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-slate-200 dark:border-slate-700">XLS</span>
                                </div>
                            )}
                            <p className="text-sm font-medium text-primary flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">add_circle</span>
                                {cloudFile ? 'Change File' : 'Drag and drop or browse'}
                            </p>
                        </div>
                        {cloudError && (
                            <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                <span className="material-symbols-outlined text-sm">error</span>
                                {cloudError}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col items-center gap-6">
                    <button
                        onClick={handleUpload}
                        disabled={isUploading}
                        className={`w-full max-w-sm h-14 bg-primary hover:bg-primary/90 text-white font-bold text-lg rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${isUploading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        <span className="material-symbols-outlined">{isUploading ? 'pending' : 'upload'}</span>
                        {isUploading ? 'Processing...' : 'Process Files'}
                    </button>

                    <div className="flex items-center gap-6 text-slate-400 dark:text-slate-500">
                        <div className="flex items-center gap-1 text-xs">
                            <span className="material-symbols-outlined text-sm text-green-500">lock</span>
                            End-to-end Encrypted
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                            <span className="material-symbols-outlined text-sm text-green-500">verified_user</span>
                            GDPR Compliant
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                            <span className="material-symbols-outlined text-sm text-green-500">security</span>
                            Bank-level Security
                        </div>
                    </div>
                </div>
            </main>

            <footer className="pt-5 pb-1 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark/50">
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

            {/* Error Popup Modal */}
            {popupError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 transform transition-all duration-300 scale-100 opacity-100 translate-y-0">
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 text-center">Upload Error</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed">
                                {popupError}
                            </p>
                        </div>
                        <button
                            onClick={() => setPopupError('')}
                            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-2xl transition-colors shadow-md shadow-red-500/20 active:scale-[0.98]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Home;
