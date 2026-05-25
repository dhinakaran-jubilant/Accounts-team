/**
 * Project: Accounts Team
 * Component: JlDueReport
 * Author: Dhinakaran Sekar
 * Email: dhinakaran.s@jubilantenterprises.in
 * Date: 2026-04-08 11:53:28
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import LoanDetail from './LoanDetail';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

const getAcronym = (name) => {
    if (!name) return '—';
    const n = name.trim().toLowerCase();
    if (n === 'surge capital solution' || n.includes('surge capital')) return 'SCS';
    if (n === 'growth capital' || n.includes('growth capital')) return 'GC';
    if (n === 'growth capital enterprises' || n.includes('growth capital corp') || n.includes('gce')) return 'GCE';
    if (n === 'jubilant capital' || n.includes('jubilant capital')) return 'JC';
    if (n === 'finova capital' || n.includes('finova capital')) return 'FC';
    if (n === 'ascend solutions' || n.includes('ascend solutions')) return 'AS';
    if (n === 'as enterprises' || n.includes('as enterprises')) return 'ASE';
    if (n === 'fortune enterprises' || n.includes('fortune enterprises')) return 'FE';
    if (n === 'sc enterprises' || n.includes('sc enterprises')) return 'SCE';
    if (n === 'a square enterprises' || n.includes('square enterprises')) return 'ASQ';
    if (n === 's nirmala' || n.includes('nirmala')) return 'SN';
    if (n === 'raja priya' || n.includes('raja priya')) return 'RP';
    return name;
};

const REQUIRED_DAY_BOOK_COLUMNS = [
    'Transaction Date',
    'Details',
    'Debit',
    'Voucher Type',
    'Voucher Number',
    'Instrument No.',
    'Particulars',
    'Credit',
    'Comments',
    'Actions'
];

const parseINR = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return parseFloat(val.toString().replace(/,/g, '')) || 0;
};

const getSplitData = (splitsStr, targetKey) => {
    let sDict = {};
    try { sDict = splitsStr ? JSON.parse(splitsStr) : {}; } catch (err) { }

    // Try primary key (Full Name)
    let val = sDict[targetKey];

    // Fallback: Try Acronym if targetKey is a full name
    if (val === undefined || val === null) {
        const acronym = getAcronym(targetKey);
        if (acronym && acronym !== targetKey) {
            val = sDict[acronym];
        }
    }

    // Fallback: Case-insensitive search
    if (val === undefined || val === null) {
        const lowerKey = targetKey.toLowerCase().trim();
        const foundKey = Object.keys(sDict).find(k => k.toLowerCase().trim() === lowerKey);
        if (foundKey) val = sDict[foundKey];
    }

    if (val === undefined || val === null) return null;
    const objVal = (typeof val === 'object' && val !== null) ? val : { amount: parseINR(val) || 0, tds: '', remarks: '' };
    if (Array.isArray(objVal)) return objVal;
    return [objVal];
};

const getSplitAmount = (splitsStr, targetKey) => {
    const dataArray = getSplitData(splitsStr, targetKey);
    if (!dataArray || dataArray.length === 0) return 0;
    return dataArray.reduce((s, acc) => s + (parseINR(acc.amount) || 0), 0);
};

const getSplitTDS = (splitsStr, targetKey) => {
    const dataArray = getSplitData(splitsStr, targetKey);
    if (!dataArray || dataArray.length === 0) return 0;
    return dataArray.reduce((s, acc) => s + (parseINR(acc.tds) || 0), 0);
};

const getDateKey = (val) => {
    if (!val || typeof val !== 'string') return 0;
    const trimmed = val.trim();
    if (trimmed === '—' || trimmed === 'dd-mm-yyyy' || trimmed === '-' || trimmed === '') return 0;
    const parts = trimmed.split(/[-/]/);
    if (parts.length !== 3) return 0;
    let y, m, d;
    if (parts[0].length === 4) { // YYYY-MM-DD
        y = parts[0]; m = parts[1].padStart(2, '0'); d = parts[2].padStart(2, '0');
    } else { // DD-MM-YYYY
        d = parts[0].padStart(2, '0'); m = parts[1].padStart(2, '0'); y = parts[2];
    }
    return parseInt(`${y}${m}${d}`) || 0;
};

const toYYYYMMDD = (val) => {
    if (!val || typeof val !== 'string') return '0000-00-00';
    const key = getDateKey(val);
    if (key === 0) return '0000-00-00';
    const s = key.toString();
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

const getRowAccountPaid = (entry, accName, targetShare, isPrimary, expectedTds = 0) => {
    const dVal = isPrimary ? entry.received_date : entry.payment_date;
    const hasDate = dVal && dVal !== '—' && dVal !== 'dd-mm-yyyy' && dVal !== '-' && dVal !== '';

    // Priority 1: Check splits for actual recorded payments (Amount + TDS)
    const dataArray = entry.splits ? getSplitData(entry.splits, accName) : null;
    if (dataArray && dataArray.length > 0) {
        // We add both the manual splits and the autoTds IF AND ONLY IF the date is filled or specific manual TDS entered
        const splitTotal = dataArray.reduce((s, x) => s + (parseINR(x.amount) || 0) + (parseINR(x.tds) || 0), 0);
        // If date is filled but manual TDS in split is 0, we still credit the expected autoTds
        const manualTds = dataArray.reduce((s, x) => s + (parseINR(x.tds) || 0), 0);
        const autoCredit = (hasDate && manualTds === 0) ? expectedTds : 0;
        return splitTotal + autoCredit;
    }

    // Priority 2: Fallback to date column if no specific splits for this account
    // If date exists but no split, assume full share was paid
    return hasDate ? targetShare : 0;
};

const getRowPaidTotalRaw = (entry, loan) => {
    const secAccs = loan.secondary_accounts || loan.remaining_accounts || [];
    const schedule = loan.repayment_schedule || [];
    const standardRows = schedule.filter(s => s.type !== 'manual');
    const interestRowId = standardRows[0]?.id;
    const isIntRow = entry.id === interestRowId;

    const priLoan = parseINR(loan.primary_account_amount) || 0;
    const priInterest = parseINR(loan.primary_account_interest) || 0;
    const priRepayTotal = priLoan + priInterest;

    const secPrincipalSum = secAccs.reduce((sum, acc) => sum + (parseINR(acc.share) || 0), 0);
    const secInterestSum = secAccs.reduce((sum, acc) => sum + (parseINR(acc.interest_amount) || 0), 0);
    const secRepayTotal = secPrincipalSum + secInterestSum;

    const grandTotal = priRepayTotal + secRepayTotal;
    const effectivePrimaryPercentage = grandTotal > 0 ? (priRepayTotal / grandTotal) * 100 : 0;

    const rawTarget = entry.type === 'manual' ? 0 : parseINR(entry.amount);

    // Primary Paid
    const priTarget = rawTarget * (effectivePrimaryPercentage / 100);
    const priPaid = getRowAccountPaid(entry, loan.primary_account_name, priTarget, true, 0);

    // Secondaries Paid
    let secPaidTotal = 0;
    secAccs.forEach(acc => {
        const accTotal = (parseINR(acc.share) || 0) + (parseINR(acc.interest_amount) || 0);
        const sPercentage = grandTotal > 0 ? (accTotal / grandTotal) * 100 : 0;
        const sTarget = rawTarget * (sPercentage / 100);
        const sExpectedTds = isIntRow ? (parseINR(acc.interest_amount) || 0) * 0.10 : 0;
        secPaidTotal += getRowAccountPaid(entry, acc.account_name, sTarget, false, sExpectedTds);
    });

    return priPaid + secPaidTotal;
};

const hasRowBalance = (entry, loan) => {
    const target = entry.type === 'manual' ? 0 : parseINR(entry.amount);
    const paid = getRowPaidTotalRaw(entry, loan);

    if (target === 0) {
        // For manual entries, only show as O/S if a split was intentionally created with a remaining balance
        // Usually manual entries are not part of the O/S report unless specifically filtered.
        return false;
    }

    // Use a small epsilon for float comparison
    return (target - paid) > 0.99;
};

const getLoanStatus = (loan) => {
    if (loan.approval_status === 'PENDING') {
        return { label: 'PENDING', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50' };
    }
    const schedule = loan.repayment_schedule || [];
    if (schedule.length === 0) return { label: 'No Data', color: 'bg-slate-100 text-slate-500 border-slate-200' };

    const today = new Date();
    const todayKey = getDateKey(today.toLocaleDateString('en-CA'));

    // Filter non-zero installments (plan rows)
    const validDues = schedule.filter(e => e.type !== 'manual' && parseINR(e.amount) > 0);

    // Condition 4: CLOSED (Green) - ALL dues correctly received (no balance remaining)
    const isAllPaid = validDues.length > 0 && validDues.every(e => !hasRowBalance(e, loan));
    if (isAllPaid) {
        return { label: 'CLOSED', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' };
    }

    // Sort to find the last due date correctly
    const sortedKeys = [...validDues].map(e => getDateKey(e.date)).filter(k => k > 0).sort();
    const lastKey = sortedKeys[sortedKeys.length - 1];

    // Condition 1: DATE OVERDUE (Red) - LAST due date crossed today (and not CLOSED)
    if (lastKey > 0 && lastKey < todayKey) {
        return { label: 'DATE OVERDUE', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50' };
    }

    // Condition 3: ACTIVE (Red) - LAST due not crossed, but previous/current due (<= today) not fully received
    const hasPendingHistoricalDue = validDues.some(e => {
        const dKey = getDateKey(e.date);
        return dKey > 0 && dKey <= todayKey && hasRowBalance(e, loan);
    });

    if (hasPendingHistoricalDue) {
        return { label: 'OVERDUE', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50' };
    }

    // Condition 2: ACTIVE (Green) - LAST due NOT crossed AND all dues up to today already received
    return { label: 'ACTIVE', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' };
};

const JlDueReport = ({ user }) => {
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [updatedDetails, setUpdatedDetails] = useState([]);
    const [skippedDetails, setSkippedDetails] = useState([]);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [accounts, setAccounts] = useState([{ name: '', share: '' }]);
    const [loanRefId, setLoanRefId] = useState('');
    const [verifiedBy, setVerifiedBy] = useState('System Admin');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [accountFilter, setAccountFilter] = useState('');
    const [adminAccountFilter, setAdminAccountFilter] = useState(['SCS', 'GC', 'FC', 'AS', 'ASE', 'SCE', 'ASQ', 'SN', 'FE', 'JC', 'RP']);
    const [statusFilter, setStatusFilter] = useState(() => {
        const saved = sessionStorage.getItem('jl_due_report_statusFilter');
        try {
            return saved ? JSON.parse(saved) : ['ACTIVE', 'OVERDUE', 'DATE OVERDUE', 'CLOSED', 'PENDING'];
        } catch {
            return ['ACTIVE', 'OVERDUE', 'DATE OVERDUE', 'CLOSED', 'PENDING'];
        }
    });
    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(() => {
        return sessionStorage.getItem('jl_due_report_searchTerm') || '';
    });
    const [startDate, setStartDate] = useState(() => {
        return sessionStorage.getItem('jl_due_report_startDate') || '';
    });
    const [endDate, setEndDate] = useState(() => {
        return sessionStorage.getItem('jl_due_report_endDate') || '';
    });

    useEffect(() => {
        sessionStorage.setItem('jl_due_report_statusFilter', JSON.stringify(statusFilter));
    }, [statusFilter]);

    useEffect(() => {
        sessionStorage.setItem('jl_due_report_searchTerm', searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        sessionStorage.setItem('jl_due_report_startDate', startDate);
    }, [startDate]);

    useEffect(() => {
        sessionStorage.setItem('jl_due_report_endDate', endDate);
    }, [endDate]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [loanToDelete, setLoanToDelete] = useState(null);
    const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
    const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'loan_date', direction: 'desc' });
    const pageRef = useRef(null);
    const exportDropdownRef = useRef(null);
    const importDropdownRef = useRef(null);
    const accountDropdownRef = useRef(null);
    const fileInputRef = useRef(null);
    const dayBookInputRef = useRef(null);

    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarViewDate, setCalendarViewDate] = useState(() => {
        const initialDate = sessionStorage.getItem('jl_due_report_startDate') || '';
        return initialDate ? new Date(initialDate) : new Date();
    });
    const calendarRef = useRef(null);

    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const statusDropdownRef = useRef(null);

    const todayString = useMemo(() => {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }, []);

    const calendarDays = useMemo(() => {
        const year = calendarViewDate.getFullYear();
        const month = calendarViewDate.getMonth();

        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const prevTotalDays = new Date(year, month, 0).getDate();

        const cells = [];

        // Padding from previous month
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = prevTotalDays - i;
            const dateObj = new Date(year, month - 1, dayNum);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            cells.push({
                day: dayNum,
                date: dateObj,
                isCurrentMonth: false,
                dateString: `${y}-${m}-${d}`
            });
        }

        // Days of current month
        for (let i = 1; i <= totalDays; i++) {
            const dateObj = new Date(year, month, i);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            cells.push({
                day: i,
                date: dateObj,
                isCurrentMonth: true,
                dateString: `${y}-${m}-${d}`
            });
        }

        // Padding from next month
        const remaining = 42 - cells.length;
        for (let i = 1; i <= remaining; i++) {
            const dateObj = new Date(year, month + 1, i);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            cells.push({
                day: i,
                date: dateObj,
                isCurrentMonth: false,
                dateString: `${y}-${m}-${d}`
            });
        }

        return cells;
    }, [calendarViewDate]);

    const handleDayClick = (dateString) => {
        if (!startDate || (startDate && endDate)) {
            setStartDate(dateString);
            setEndDate('');
        } else {
            if (dateString < startDate) {
                setStartDate(dateString);
            } else {
                setEndDate(dateString);
            }
        }
        setCurrentPage(1);
    };

    const handlePrevMonth = () => {
        setCalendarViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCalendarViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const formatDisplayDateRange = () => {
        if (!startDate && !endDate) return "Select Date Range";
        
        const formatDateStr = (isoStr) => {
            if (!isoStr) return "";
            const parts = isoStr.split('-');
            const year = parts[0];
            const monthIdx = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return `${String(day).padStart(2, '0')} ${shortMonths[monthIdx]}, ${year}`;
        };

        if (startDate && !endDate) {
            return `${formatDateStr(startDate)} - Select End Date`;
        }
        
        return `${formatDateStr(startDate)} - ${formatDateStr(endDate)}`;
    };

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
    ];

    const ACCOUNT_OPTIONS = [
        { value: 'SCS', label: 'Surge Capital Solutions - SCS' },
        { value: 'GC', label: 'Growth Capital - GC' },
        { value: 'FC', label: 'Finova Capital - FC' },
        { value: 'AS', label: 'Ascend Solutions - AS' },
        { value: 'ASE', label: 'AS Enterprises - ASE' },
        { value: 'SCE', label: 'SC Enterprises - SCE' },
        { value: 'ASQ', label: 'A Square Enterprises - ASQ' },
        { value: 'SN', label: 'S Nirmala - SN' },
        { value: 'FE', label: 'Fortune Enterprises - FE' },
        { value: 'JC', label: 'Jubilant Capital - JC' },
        { value: 'RP', label: 'Raja Priya - RP' }
    ];


    // Handle click outside to close dropdowns
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
                setIsExportDropdownOpen(false);
            }
            if (importDropdownRef.current && !importDropdownRef.current.contains(event.target)) {
                setIsImportDropdownOpen(false);
            }
            if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target)) {
                setIsAccountDropdownOpen(false);
            }
            if (calendarRef.current && !calendarRef.current.contains(event.target)) {
                setIsCalendarOpen(false);
            }
            if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
                setIsStatusDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const processDayBookExcel = async (file, inputElement) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const headers = jsonData[0] || [];
                const sanitizedHeaders = headers.map(h => String(h || '').trim());

                const missingColumns = REQUIRED_DAY_BOOK_COLUMNS.filter(
                    col => !sanitizedHeaders.includes(col)
                );

                if (missingColumns.length > 0) {
                    setUploadError('The selected Excel file is not a valid Day Book. Missing columns: ' + missingColumns.join(', '));
                    console.error('Missing columns:', missingColumns);
                } else {
                    setIsSubmitting(true);
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        const response = await fetch('/api/upload-day-book', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();

                        if (response.ok && result.success) {
                            setSuccessMessage(result.message);
                            setUpdatedDetails(result.updated_details || []);
                            setSkippedDetails(result.skipped_details || []);
                            setShowSuccessPopup(true);
                            fetchLoans();
                        } else {
                            setUploadError(result.error || 'Failed to process Day Book');
                        }
                    } catch (uploadErr) {
                        setUploadError(uploadErr.message || 'Network error during upload');
                    } finally {
                        setIsSubmitting(false);
                    }
                }
            } catch (error) {
                console.error('Error reading excel file:', error);
                setUploadError('Failed to read Excel file. Please ensure it is a valid Day Book export.');
            }
            if (inputElement) inputElement.value = '';
        };
        reader.readAsArrayBuffer(file);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
        
        if (isExcel) {
            setUploadError('Excel files cannot be processed via the "New Loan" option. Please use the "Day Book" button to upload Day Book files.');
            e.target.value = '';
        } else {
            // Standard Docx/PDF behavior
            setSelectedFile(file);
            setAccounts([{ name: '', share: '' }]);
            setLoanRefId('');
            setUploadError('');
            setShowModal(true);
            e.target.value = '';
        }
    };

    const handleDayBookFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processDayBookExcel(file, e.target);
    };

    const handleAddAccount = () => setAccounts([...accounts, { name: '', share: '' }]);
    const handleRemoveAccount = (index) => setAccounts(accounts.filter((_, i) => i !== index));
    const handleAccountChange = (index, field, value) => {
        const newAccs = [...accounts];
        newAccs[index][field] = field === 'name' ? value.toUpperCase() : value;
        setAccounts(newAccs);
    };

    const handleSubmit = async () => {
        if (!selectedFile) return;
        const formattedAccounts = accounts
            .filter(a => a.name.trim() !== '' && a.share.toString().trim() !== '')
            .map(a => ({ name: a.name.trim().toUpperCase(), share: parseFloat(a.share) }));

        setIsSubmitting(true);
        setUploadError('');
        try {
            const formData = new FormData();
            formData.append('docx_file', selectedFile);
            formData.append('remaining_accounts', JSON.stringify(formattedAccounts));
            formData.append('loan_ref_id', loanRefId.trim());
            formData.append('employee_code', user?.employee_code || "");

            const endpoint = selectedFile.name.toLowerCase().endsWith('.pdf') ? '/api/upload-pdf' : '/api/upload-docx';
            const response = await fetch(endpoint, { method: 'POST', body: formData });
            const result = await response.json();

            if (response.ok) {
                setShowModal(false);
                setSelectedFile(null);
                setSuccessMessage('The document has been correctly extracted and all remaining accounts have been securely saved to the database.');
                setShowSuccessPopup(true);
                fetchLoans();
            } else {
                setUploadError(result.error || 'Failed to process document');
            }
        } catch (err) {
            setUploadError(err.message || 'Network Error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const [data, setData] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const activeAccountAcronyms = useMemo(() => {
        const acronymSet = new Set();
        data.forEach(loan => {
            if (loan.primary_account_name) {
                const acronym = getAcronym(loan.primary_account_name).toUpperCase();
                acronymSet.add(acronym);
            }
        });
        return acronymSet;
    }, [data]);

    const filteredAccountOptions = useMemo(() => {
        return ACCOUNT_OPTIONS.filter(opt => activeAccountAcronyms.has(opt.value.toUpperCase()));
    }, [activeAccountAcronyms]);

    const isAllAccountsSelected = useMemo(() => {
        if (adminAccountFilter.length === ACCOUNT_OPTIONS.length) return true;
        return filteredAccountOptions.length > 0 && filteredAccountOptions.every(opt => adminAccountFilter.includes(opt.value));
    }, [filteredAccountOptions, adminAccountFilter]);

    const handleDeleteClick = (loanId) => {
        setLoanToDelete(loanId);
    };

    const confirmDelete = async () => {
        if (!loanToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/loans/${loanToDelete}`, { method: 'DELETE' });
            const result = await res.json();
            if (res.ok && result.success) {
                setLoanToDelete(null);
                fetchLoans(); // Automatically refresh from server
            } else {
                setUploadError(result.error || "Failed to delete loan");
            }
        } catch (e) {
            console.error("Delete error:", e);
            setUploadError("Network error while deleting loan");
        } finally {
            setIsDeleting(false);
        }
    };

    // Pagination states
    const [currentPage, setCurrentPage] = useState(() => {
        const saved = sessionStorage.getItem('jl_due_report_page');
        return saved ? parseInt(saved, 10) : 1;
    });
    const itemsPerPage = 20;

    useEffect(() => {
        sessionStorage.setItem('jl_due_report_page', currentPage);
    }, [currentPage]);

    const fetchLoans = async () => {
        try {
            const res = await fetch('/api/loans');
            const result = await res.json();
            if (res.ok && result.success) {
                setData(result.loans || []);
            } else {
                console.error("Failed to fetch loans:", result.error);
            }
        } catch (e) {
            console.error("Network error:", e);
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        fetchLoans();

    }, []);



    const filteredData = useMemo(() => {
        let result = data;

        // Apply Permissions Filter: If not admin and doesn't have all permissions, show only which primary account acronym is in their list
        if (user?.role !== 'admin' && user?.permissions?.length < 10) {
            const userPerms = user?.permissions || [];
            result = result.filter(row => {
                const priAcronym = getAcronym(row.primary_account_name);
                if (userPerms.includes(priAcronym)) return true;

                // Check secondary accounts
                const secAccs = row.secondary_accounts || row.remaining_accounts || [];
                return secAccs.some(acc => userPerms.includes(getAcronym(acc.account_name)));
            });
        }

        if (user?.role === 'admin' && adminAccountFilter) {
            result = result.filter(row => {
                const acronym = getAcronym(row.primary_account_name).toUpperCase();
                return adminAccountFilter.includes(acronym);
            });
        } else if (accountFilter) {
            const term = accountFilter.toUpperCase();
            result = result.filter(row => {
                return getAcronym(row.primary_account_name).toUpperCase() === term;
            });
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(row => {
                const clientMatch = (row.client_name || '').toLowerCase().includes(term);
                const idMatch = (row.loan_ref_id || '').toLowerCase().includes(term);
                return clientMatch || idMatch;
            });
        }

        if (startDate || endDate) {
            result = result.filter(row => {
                const schedule = row.repayment_schedule || [];
                return schedule.some(entry => {
                    const scheduleDateStr = toYYYYMMDD(entry.date);
                    if (!scheduleDateStr || scheduleDateStr === '0000-00-00') return false;

                    if (startDate && scheduleDateStr < startDate) return false;
                    if (endDate && scheduleDateStr > endDate) return false;

                    // Logic to check if this specific entry has ANY outstanding balance across accounts
                    const targetTotal = parseINR(entry.amount);
                    const paidTotal = getSplitAmount(entry.splits, row.primary_account_name) +
                        getSplitTDS(entry.splits, row.primary_account_name) +
                        (row.secondary_accounts || []).reduce((s, acc) => s + getSplitAmount(entry.splits, acc.account_name) + getSplitTDS(entry.splits, acc.account_name), 0);

                    const hasNoReceivedDate = !entry.received_date || entry.received_date === '' || entry.received_date === '—' || entry.received_date === 'dd-mm-yyyy' || entry.received_date === '-';

                    const hasBalance = Math.round(paidTotal) < Math.round(targetTotal);
                    return hasNoReceivedDate && hasBalance;
                });
            });
        }

        if (statusFilter) {
            result = result.filter(row => {
                const statusInfo = getLoanStatus(row);
                return statusFilter.includes(statusInfo.label);
            });
        }

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                if (sortConfig.key === 'loan_date') {
                    const dateA = getDateKey(a.loan_date);
                    const dateB = getDateKey(b.loan_date);
                    if (dateA !== dateB) {
                        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                    }
                    const idA = parseInt(a.id) || 0;
                    const idB = parseInt(b.id) || 0;
                    return sortConfig.direction === 'asc' ? idA - idB : idB - idA;
                } else if (sortConfig.key === 'status') {
                    const getStatusWeight = (loan) => {
                        const statusInfo = getLoanStatus(loan);
                        if (statusInfo.label === 'DATE OVERDUE') return 1;
                        if (statusInfo.label === 'OVERDUE') return 2;
                        if (statusInfo.label === 'ACTIVE' && statusInfo.color.includes('emerald')) return 3;
                        if (statusInfo.label === 'CLOSED') return 4;
                        return 5;
                    };
                    const wA = getStatusWeight(a);
                    const wB = getStatusWeight(b);
                    if (wA !== wB) {
                        return sortConfig.direction === 'asc' ? wA - wB : wB - wA;
                    }
                    const dateA = getDateKey(a.loan_date);
                    const dateB = getDateKey(b.loan_date);
                    if (dateA !== dateB) {
                        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                    }
                    const idA = parseInt(a.id) || 0;
                    const idB = parseInt(b.id) || 0;
                    return sortConfig.direction === 'asc' ? idA - idB : idB - idA;
                } else if (sortConfig.key === 'primary_account') {
                    const acrA = getAcronym(a.primary_account_name).toUpperCase();
                    const acrB = getAcronym(b.primary_account_name).toUpperCase();
                    if (acrA !== acrB) {
                        return sortConfig.direction === 'asc' ? acrA.localeCompare(acrB) : acrB.localeCompare(acrA);
                    }
                    const dateA = getDateKey(a.loan_date);
                    const dateB = getDateKey(b.loan_date);
                    if (dateA !== dateB) {
                        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                    }
                    const idA = parseInt(a.id) || 0;
                    const idB = parseInt(b.id) || 0;
                    return sortConfig.direction === 'asc' ? idA - idB : idB - idA;
                }
                return 0;
            });
        }

        return result;
    }, [data, accountFilter, adminAccountFilter, user, searchTerm, startDate, endDate, statusFilter, sortConfig]);

    // Pagination calculations
    const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    const currentData = filteredData.slice(startIndex, endIndex);



    useEffect(() => {
        if (!isLoadingData && currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [filteredData, totalPages, currentPage, isLoadingData]);

    const TAG_COLORS = [
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
        'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50',
        'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50',
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50',
        'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800/50',
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
        'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50',
        'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800/50',
        'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800/50'
    ];

    const accountColorMap = useMemo(() => {
        const map = {};
        let colorIndex = 0;
        data.forEach(row => {
            const name = row.primary_account_name || 'Unknown';
            if (!map[name]) {
                map[name] = TAG_COLORS[colorIndex % TAG_COLORS.length];
                colorIndex++;
            }
        });
        return map;
    }, [data]);

    const getAccountTagStyles = (name) => {
        return accountColorMap[name || 'Unknown'] || TAG_COLORS[0];
    };

    const handleBendingExport = async () => {
        setIsExportDropdownOpen(false);
        // Filter out closed loans for the O/S report
        let osData = data.filter(loan => getLoanStatus(loan).label !== 'Closed');

        // If an account filter is active in the UI, respect it in the O/S report too
        if (user?.role === 'admin' && adminAccountFilter && adminAccountFilter.length > 0) {
            osData = osData.filter(row => {
                const priAcronym = getAcronym(row.primary_account_name).toUpperCase();
                return adminAccountFilter.some(term => priAcronym === term);
            });
        } else if (accountFilter) {
            const term = accountFilter.toUpperCase();
            osData = osData.filter(row => {
                return getAcronym(row.primary_account_name).toUpperCase() === term;
            });
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            osData = osData.filter(row => {
                const clientMatch = (row.client_name || '').toLowerCase().includes(term);
                const idMatch = (row.loan_ref_id || '').toLowerCase().includes(term);
                return clientMatch || idMatch;
            });
        }

        if (osData.length === 0) {
            setUploadError("No outstanding loans found for this selection.");
            return;
        }

        // Pass 'true' for isDetailed mode
        await handleExport('OS_Report', osData, true);
    };

    const handleExport = async (reportPrefix = 'JL_Report', exportData = filteredData, isDetailed = false) => {
        if (exportData.length === 0) return;

        const workbook = new ExcelJS.Workbook();
        const groups = new Map();
        exportData.forEach(loan => {
            const key = loan.primary_account_name || 'Unknown';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(loan);
        });

        const todayISO = endDate || startDate || new Date().toISOString().split('T')[0];
        const today = todayISO.split('-').reverse().join('-');

        // Shared Styles
        const thickBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        const headerBlueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8DB4E2' } };
        const darkBlueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203764' } };
        const partialFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
        if (isDetailed) {
            // DETAILED LAYOUT (O/S Report - Image 2 style)
            // Cols A-C: Loan date, Client name, Loan ref (merged vertically per loan)
            // Col D onwards: DATE | DUES | AMOUNT | priAcr | [SecAcr TDS]... | PARTIAL
            groups.forEach((loans, primaryAccName) => {
                const sheetName = getAcronym(primaryAccName).slice(0, 31);
                const worksheet = workbook.addWorksheet(sheetName);
                let cur = 1;

                const cutoffKey = getDateKey(endDate || startDate || new Date().toLocaleDateString('en-CA'));

                // --- First pass: find max secondary accounts for uniform column layout ---
                let maxSecAccs = 0;
                loans.forEach(loan => {
                    const schedule = loan.repayment_schedule || [];
                    const hasOS = schedule.some(e => {
                        const dKey = getDateKey(e.date);
                        return (dKey > 0 && dKey <= cutoffKey) && hasRowBalance(e, loan);
                    });
                    if (hasOS) {
                        maxSecAccs = Math.max(maxSecAccs, (loan.secondary_accounts || []).length);
                    }
                });

                // Column positions:
                // A=1(loan date), B=2(client), C=3(ref)
                // D=4(DATE), E=5(DUES), F=6(AMOUNT), G=7(priAcr)
                // then [secAcr, TDS] pairs starting col 8
                // PARTIAL = last col
                const DATA_START = 4; // col D
                const PRI_COL = DATA_START + 3; // col G = 7
                const PARTIAL_COL = PRI_COL + 1 + maxSecAccs * 2; // after all sec pairs
                const PAYABLE_COL = PARTIAL_COL + 1;

                // Set column widths
                worksheet.getColumn(1).width = 13;  // Loan Date
                worksheet.getColumn(2).width = 35;  // Client Name
                worksheet.getColumn(3).width = 12;  // Loan ID
                worksheet.getColumn(4).width = 13;  // DATE
                worksheet.getColumn(5).width = 8;   // DUES
                worksheet.getColumn(6).width = 12;  // AMOUNT
                worksheet.getColumn(7).width = 13;  // Primary Acr
                for (let s = 0; s < maxSecAccs; s++) {
                    worksheet.getColumn(8 + s * 2).width = 13;     // Sec Acr
                    worksheet.getColumn(8 + s * 2 + 1).width = 10; // TDS
                }
                worksheet.getColumn(PARTIAL_COL).width = 10; // PARTIAL
                worksheet.getColumn(PAYABLE_COL).width = 20; // PAYABLE



                // --- Second pass: render each loan block ---
                loans.forEach((loan) => {
                    const schedule = loan.repayment_schedule || [];
                    const secAccs = loan.secondary_accounts || [];
                    const systemSched = schedule.filter(s => s.type !== 'manual');
                    const interestRowId = systemSched[0]?.id;

                    const osInstallments = schedule.filter(e => {
                        const dKey = getDateKey(e.date);
                        return (dKey > 0 && dKey <= cutoffKey) && hasRowBalance(e, loan);
                    });

                    if (osInstallments.length === 0) return;

                    // --- Loan-wise Header Row ---
                    const loanAcr = getAcronym(loan.primary_account_name).toUpperCase();
                    const loanHeaders = ['LOAN DATE', 'CLIENT NAME', 'LOAN ID', 'DATE', 'DUES', 'AMOUNT', loanAcr];
                    for (let s = 0; s < maxSecAccs; s++) {
                        const acc = secAccs[s];
                        loanHeaders.push(acc ? getAcronym(acc.account_name).toUpperCase() : '');
                        loanHeaders.push(acc ? 'TDS' : '');
                    }
                    loanHeaders.push('PARTIAL', 'PAYABLE');

                    const headerRow = worksheet.getRow(cur);
                    headerRow.height = 25;
                    loanHeaders.forEach((val, idx) => {
                        const cell = headerRow.getCell(idx + 1);
                        cell.value = val;
                        cell.fill = darkBlueFill;
                        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Trebuchet MS' };
                        cell.border = thickBorder;
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    });
                    cur++;



                    // --- Amounts setup ---
                    const priLoanAmount = parseINR(loan.primary_account_amount) || 0;
                    const priInterestAmount = parseINR(loan.primary_account_interest) || 0;
                    const priRepayTotal = priLoanAmount + priInterestAmount;
                    const secPrincipalSum = secAccs.reduce((sum, acc) => sum + (parseINR(acc.share) || 0), 0);
                    const secInterestSum = secAccs.reduce((sum, acc) => sum + (parseINR(acc.interest_amount) || 0), 0);
                    const secRepayTotal = secPrincipalSum + secInterestSum;
                    const grandTotal = priRepayTotal + secRepayTotal;
                    const effectivePrimaryPercentage = grandTotal > 0 ? (priRepayTotal / grandTotal) * 100 : 0;

                    // --- Installment data rows ---
                    osInstallments.forEach(e => {
                        const dataRow = worksheet.getRow(cur);
                        const dueIdx = systemSched.findIndex(s => s.id === e.id) + 1;
                        const isIntRow = e.id === interestRowId;
                        const rawTarget = e.type === 'manual' ? 0 : parseINR(e.amount);

                        // Cols A-C: repeat loan info (no merging as per user request)
                        dataRow.getCell(1).value = loan.loan_date || '';
                        dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                        dataRow.getCell(1).border = thickBorder;

                        dataRow.getCell(2).value = loan.client_name?.toUpperCase() || '';
                        dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
                        dataRow.getCell(2).border = thickBorder;

                        dataRow.getCell(3).value = loan.loan_ref_id || '';
                        dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
                        dataRow.getCell(3).border = thickBorder;

                        // Col D: date, Col E: dues, Col F: amount
                        dataRow.getCell(4).value = e.date || '';
                        dataRow.getCell(5).value = `${dueIdx}/${systemSched.length}`;
                        dataRow.getCell(6).value = parseINR(e.amount);

                        // Col G: primary OS
                        const priTarget = rawTarget * (effectivePrimaryPercentage / 100);
                        const priPaid = getRowAccountPaid(e, loan.primary_account_name, priTarget, true, 0);
                        const priOS = Math.max(0, priTarget - priPaid);
                        const isPriPartial = priPaid > 0.99 && priOS > 0.99;
                        dataRow.getCell(7).value = priOS > 0.99 ? priOS : '';

                        let isAnyStakeholderPartial = isPriPartial;
                        const partialColIndices = isPriPartial ? [7] : [];

                        // Secondary account columns
                        for (let s = 0; s < maxSecAccs; s++) {
                            const acc = secAccs[s];
                            const secCol = 8 + s * 2;
                            const tdsCol = 8 + s * 2 + 1;

                            if (acc) {
                                const accTotal = (parseINR(acc.share) || 0) + (parseINR(acc.interest_amount) || 0);
                                const sPercentage = grandTotal > 0 ? (accTotal / grandTotal) * 100 : 0;
                                const sTarget = rawTarget * (sPercentage / 100);
                                const sExpectedTds = isIntRow ? (parseINR(acc.interest_amount) || 0) * 0.10 : 0;
                                const sPaid = getRowAccountPaid(e, acc.account_name, sTarget, false, sExpectedTds);
                                const sOS = Math.max(0, sTarget - sPaid);
                                const sHasDate = e.payment_date && e.payment_date !== '—' && e.payment_date !== 'dd-mm-yyyy' && e.payment_date !== '-' && e.payment_date !== '';
                                let sTdsOS = 0;
                                if (!sHasDate) {
                                    sTdsOS = Math.max(0, sExpectedTds - getSplitTDS(e.splits, acc.account_name));
                                }
                                const isSecPartial = sPaid > 0.99 && sOS > 0.99;
                                if (isSecPartial) {
                                    isAnyStakeholderPartial = true;
                                    partialColIndices.push(secCol);
                                }
                                dataRow.getCell(secCol).value = (sOS - sTdsOS) > 0.99 ? (sOS - sTdsOS) : '';
                                dataRow.getCell(tdsCol).value = sTdsOS > 0.99 ? sTdsOS : '';
                            } else {
                                dataRow.getCell(secCol).value = '';
                                dataRow.getCell(tdsCol).value = '';
                            }
                        }

                        // PARTIAL col
                        dataRow.getCell(PARTIAL_COL).value = isAnyStakeholderPartial ? 'Partial' : '';
                        
                        const payableStr = secAccs.map(acc => getAcronym(acc.account_name).toUpperCase()).join(', ');
                        dataRow.getCell(PAYABLE_COL).value = payableStr;

                        // Style all data columns (D to PAYABLE)
                        for (let col = DATA_START; col <= PAYABLE_COL; col++) {
                            const cell = dataRow.getCell(col);
                            cell.border = thickBorder;
                            if (partialColIndices.includes(col)) {
                                cell.fill = partialFill;
                            }
                            if (typeof cell.value === 'number') {
                                cell.numFmt = '#,##0';
                                cell.alignment = { horizontal: 'center' };
                            } else {
                                cell.alignment = { horizontal: 'center' };
                            }
                        }

                        cur++;
                    });

                    // Vertical merging removed as per user request

                    cur++; // Spacer row between loans
                });
            });


        } else {
            // STANDARD ROW-BASED LAYOUT (For JL Report)
            groups.forEach((loans, primaryAccName) => {
                const getStatusWeight = (loan) => {
                    const s = getLoanStatus(loan).label;
                    // Compute the effective excel status (same logic as the row builder)
                    const schedule = loan.repayment_schedule || [];
                    const secAccs2 = loan.secondary_accounts || [];
                    const systemSched2 = schedule.filter(x => x.type !== 'manual');
                    const interestRowId2 = systemSched2[0]?.id;
                    const cutoffKey2 = getDateKey(endDate || startDate || new Date().toLocaleDateString('en-CA'));
                    const grandTotal2 = (Number(loan.primary_account_amount) || 0) + (Number(loan.primary_account_interest) || 0)
                        + secAccs2.reduce((sum, a) => sum + (Number(a.share) || 0) + (Number(a.interest_amount) || 0), 0);
                    const effectivePriPct = grandTotal2 > 0 ? ((Number(loan.primary_account_amount) + Number(loan.primary_account_interest)) / grandTotal2) * 100 : 0;
                    const priOsCheck = Math.round(schedule.reduce((sum, e) => {
                        if (e.type === 'manual') return sum;
                        const dKey = getDateKey(e.date);
                        if (dKey > 0 && dKey <= cutoffKey2) {
                            const target = parseINR(e.amount) * (effectivePriPct / 100);
                            const isInt = e.id === interestRowId2;
                            return sum + Math.max(0, target - getRowAccountPaid(e, loan.primary_account_name, target, true, 0));
                        }
                        return sum;
                    }, 0));
                    const secOsCheck = secAccs2.reduce((sum, acc) => {
                        const accTotal2 = (Number(acc.share) || 0) + (Number(acc.interest_amount) || 0);
                        const sPct = grandTotal2 > 0 ? (accTotal2 / grandTotal2) * 100 : 0;
                        const sExpTds = (Number(acc.interest_amount) || 0) * 0.10;
                        return sum + Math.round(schedule.reduce((s2, e) => {
                            if (e.type === 'manual') return s2;
                            const dKey = getDateKey(e.date);
                            if (dKey > 0 && dKey <= cutoffKey2) {
                                const target = parseINR(e.amount) * (sPct / 100);
                                const isInt = e.id === interestRowId2;
                                const sTdsOS = Math.max(0, (isInt ? sExpTds : 0) - getSplitTDS(e.splits, acc.account_name));
                                return s2 + Math.max(0, target - getRowAccountPaid(e, acc.account_name, target, false, isInt ? sExpTds : 0) - sTdsOS);
                            }
                            return s2;
                        }, 0));
                    }, 0);
                    const effectiveLabel = (priOsCheck > 0 && secOsCheck <= 0) ? 'TDS' : s;
                    if (effectiveLabel === 'TDS') return 1;
                    if (effectiveLabel === 'DATE OVERDUE') return 2;
                    if (effectiveLabel === 'OVERDUE') return 3;
                    if (effectiveLabel === 'ACTIVE') return 4;
                    return 5; // CLOSED and others
                };

                const getSec1Acr = (loan) => {
                    const sec = (loan.secondary_accounts || [])[0];
                    return sec ? getAcronym(sec.account_name).toUpperCase() : '—';
                };

                const sortedLoans = [...loans].sort((a, b) => {
                    const acrA = getSec1Acr(a);
                    const acrB = getSec1Acr(b);
                    if (acrA !== acrB) return acrA.localeCompare(acrB);
                    return getStatusWeight(a) - getStatusWeight(b);
                });

                const maxSecAccsFound = Math.max(...sortedLoans.map(l => (l.secondary_accounts || []).length), 0);
                const maxTotalAccs = maxSecAccsFound + 1;

                const sheetName = getAcronym(primaryAccName).slice(0, 31);
                const worksheet = workbook.addWorksheet(sheetName);

                const headers = ['S.NO', 'DATE', 'LOAN NO', 'CLIENT NAME', 'PRIMARY'];
                for (let i = 1; i < maxTotalAccs; i++) headers.push(`SEC-${i}`);
                headers.push('LOAN AMOUNT', 'REPAYMENT', 'PRIMARY\nLOAN', 'PRIMARY\nREPAYMENT');
                for (let i = 1; i < maxTotalAccs; i++) headers.push(`SEC-${i}\nLOAN`, `SEC-${i}\nREPAYMENT`);
                headers.push('OVERALL\nRECEIVED', 'PRIMARY\nRECEIVED');
                for (let i = 1; i < maxTotalAccs; i++) headers.push(`SEC-${i}\nRECEIVED`);
                headers.push('OVERALL\nO/S', 'PRIMARY\nO/S');
                for (let i = 1; i < maxTotalAccs; i++) headers.push(`SEC-${i}\nO/S`);
                headers.push('TOTAL DUE', 'RECEIVED DUE', 'OVER DUE', 'Status');

                const headerRow = worksheet.getRow(1);
                headerRow.values = headers;
                headerRow.height = 35;
                for (let i = 1; i <= headers.length; i++) {
                    const cell = headerRow.getCell(i);
                    cell.fill = darkBlueFill;
                    cell.font = { name: 'Trebuchet MS', color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    cell.border = thickBorder;
                }

                // Apply grouping (hiding) for columns from "PRIMARY LOAN" to the column before "OVERALL RECEIVED"
                const hideStart = headers.indexOf('PRIMARY\nLOAN') + 1;
                const hideEnd = headers.indexOf('OVERALL\nRECEIVED');
                if (hideStart > 0 && hideEnd >= hideStart) {
                    for (let i = hideStart; i <= hideEnd; i++) {
                        const column = worksheet.getColumn(i);
                        column.outlineLevel = 1;
                        column.hidden = true;
                    }
                }

                // Apply grouping (hiding) for individual Received columns
                const recStart = headers.indexOf('PRIMARY\nRECEIVED') + 1;
                const recEnd = headers.indexOf('OVERALL\nO/S');
                if (recStart > 0 && recEnd >= recStart) {
                    for (let i = recStart; i <= recEnd; i++) {
                        const column = worksheet.getColumn(i);
                        column.outlineLevel = 1;
                        column.hidden = true;
                    }
                }

                worksheet.properties.outlineProperties = {
                    summaryDetailBelow: false,
                    summaryRight: false,
                };

                let curRow = 2; // Start after header row
                let lastSec1 = null;
                let snoCounter = 0;


                sortedLoans.forEach((loan) => {
                    const schedule = loan.repayment_schedule || [];
                    const systemSched = schedule.filter(s => s.type !== 'manual');
                    const interestRowId = systemSched[0]?.id;
                    const secAccs = loan.secondary_accounts || [];
                    const statusInfo = getLoanStatus(loan);

                    const sec1Acr = getSec1Acr(loan);

                    // Insert a 1-row gap when SEC-1 group changes
                    if (sec1Acr !== lastSec1) {
                        if (lastSec1 !== null) curRow++; // blank spacer between groups
                        lastSec1 = sec1Acr;
                    }

                    snoCounter++;
                    const rowData = [
                        snoCounter, loan.loan_date || '', loan.loan_ref_id || '', loan.client_name || '',
                        getAcronym(loan.primary_account_name)
                    ];
                    for (let i = 0; i < maxTotalAccs - 1; i++) rowData.push(secAccs[i] ? getAcronym(secAccs[i].account_name) : '');

                    const loanAmount = loan.loan_amount || 0;
                    const totalRepay = loan.repayment_amount || 0;
                    rowData.push(loanAmount, totalRepay);

                    const secPrincipalSum = secAccs.reduce((sum, acc) => sum + (Number(acc.share) || 0), 0);
                    const secInterestSum = secAccs.reduce((sum, acc) => sum + (Number(acc.interest_amount) || 0), 0);
                    const priLoan = Number(loan.primary_account_amount) || 0;
                    const priInterest = Number(loan.primary_account_interest) || 0;
                    const priRepayTotal = priLoan + priInterest;

                    rowData.push(priLoan, priRepayTotal);
                    for (let i = 0; i < maxTotalAccs - 1; i++) {
                        if (secAccs[i]) {
                            const sPrincipal = parseINR(secAccs[i].share) || 0;
                            const sInterest = parseINR(secAccs[i].interest_amount) || 0;
                            rowData.push(sPrincipal, sPrincipal + sInterest);
                        } else { rowData.push('', ''); }
                    }

                    const grandTotal = priRepayTotal + secPrincipalSum + secInterestSum;
                    const effectivePrimaryPercentage = grandTotal > 0 ? (priRepayTotal / grandTotal) * 100 : 0;

                    const secAccsComputed = secAccs.map(acc => {
                        const accTotal = (parseINR(acc.share) || 0) + (parseINR(acc.interest_amount) || 0);
                        return {
                            ...acc,
                            percentage: grandTotal > 0 ? (accTotal / grandTotal) * 100 : 0
                        };
                    });

                    const cutoffKey = getDateKey(endDate || startDate || new Date().toLocaleDateString('en-CA'));

                    const getPaidShare = (accName, percentage, isPrimary, expectedTdsPerEntry = 0) => {
                        return schedule.reduce((sum, e) => {
                            if (e.type === 'manual') return sum;

                            const dVal = isPrimary ? e.received_date : e.payment_date;
                            const rKey = getDateKey(dVal);
                            const inWindow = rKey > 0 && rKey <= cutoffKey;

                            if (inWindow) {
                                const isIntRow = e.id === interestRowId;
                                const currentExpectedTds = isIntRow ? expectedTdsPerEntry : 0;
                                const target = parseINR(e.amount) * (percentage / 100);
                                return sum + getRowAccountPaid(e, accName, target, isPrimary, currentExpectedTds);
                            }
                            return sum;
                        }, 0);
                    };

                    const getOsShare = (accName, percentage, isPrimary, expectedTdsPerEntry = 0) => {
                        return schedule.reduce((sum, e) => {
                            if (e.type === 'manual') return sum;
                            const dKey = getDateKey(e.date);

                            if (dKey > 0 && dKey <= cutoffKey) {
                                const isIntRow = e.id === interestRowId;
                                const currentExpectedTds = isIntRow ? expectedTdsPerEntry : 0;
                                const target = parseINR(e.amount) * (percentage / 100);

                                // For O/S calculation, we count it as paid only if the account's respective date is filled.
                                const paid = getRowAccountPaid(e, accName, target, isPrimary, currentExpectedTds);
                                const sTdsPaidFromSplits = e.splits ? getSplitTDS(e.splits, accName) : 0;
                                const remainingTds = Math.max(0, currentExpectedTds - sTdsPaidFromSplits);
                                return sum + Math.max(0, target - paid - remainingTds);
                            }
                            return sum;
                        }, 0);
                    };

                    const priReceived = getPaidShare(loan.primary_account_name, effectivePrimaryPercentage, true, 0);
                    let secReceivedArr = [];
                    for (let i = 0; i < maxTotalAccs - 1; i++) {
                        if (secAccsComputed[i]) {
                            const acc = secAccsComputed[i];
                            const sExpectedTds = (parseINR(acc.interest_amount) || 0) * 0.10;
                            secReceivedArr.push(getPaidShare(acc.account_name, acc.percentage || 0, false, sExpectedTds));
                        } else { secReceivedArr.push(''); }
                    }
                    const overallReceived = priReceived + secReceivedArr.reduce((s, a) => s + (parseINR(a) || 0), 0);
                    rowData.push(overallReceived, priReceived, ...secReceivedArr);

                    const priOsVal = Math.round(getOsShare(loan.primary_account_name, effectivePrimaryPercentage, true, 0));
                    let secOsArr = [];
                    let secOsValsSum = 0;
                    for (let i = 0; i < maxTotalAccs - 1; i++) {
                        if (secAccsComputed[i]) {
                            const acc = secAccsComputed[i];
                            const sExpectedTds = (parseINR(acc.interest_amount) || 0) * 0.10;
                            const val = Math.round(getOsShare(acc.account_name, acc.percentage || 0, false, sExpectedTds));
                            secOsArr.push(val);
                            secOsValsSum += val;
                        } else { secOsArr.push(''); }
                    }
                    const overallOs = priOsVal + secOsValsSum;
                    rowData.push(overallOs, priOsVal, ...secOsArr);

                    const currentOverdueCount = schedule.filter(e => {
                        const dKey = getDateKey(e.date);
                        const rKey = getDateKey(e.received_date);
                        const noDateByNow = rKey === 0 || rKey > cutoffKey;
                        return dKey > 0 && dKey <= cutoffKey && noDateByNow && parseINR(e.amount) > 0;
                    }).length;

                    const totalDueCount = schedule.filter(e => parseINR(e.amount) > 0).length;
                    const receivedDueCount = schedule.filter(e => parseINR(e.amount) > 0 && !hasRowBalance(e, loan)).length;

                    let finalExcelStatus = statusInfo.label;
                    if (priOsVal > 0 && secOsValsSum <= 0) {
                        finalExcelStatus = 'TDS';
                    }

                    rowData.push(totalDueCount, receivedDueCount, currentOverdueCount, finalExcelStatus);

                    const dataRow = worksheet.getRow(curRow);
                    curRow++;
                    dataRow.values = rowData;

                    const isRedRow = finalExcelStatus === 'DATE OVERDUE' || finalExcelStatus === 'OVERDUE';

                    for (let i = 1; i <= rowData.length; i++) {
                        const cell = dataRow.getCell(i);
                        cell.border = thickBorder;
                        cell.font = { name: 'Trebuchet MS', size: 10 };

                        const currentHeader = headers[i - 1];

                        // 1. Highlight Columns Styling (#C5D9F1 Light Blue)
                        if (['LOAN AMOUNT', 'REPAYMENT', 'OVERALL\nRECEIVED', 'OVERALL\nO/S'].includes(currentHeader)) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5D9F1' } };
                        }

                        // 2. Status Column Styling
                        if (currentHeader === 'Status') {
                            cell.font.bold = true;
                            if (finalExcelStatus === 'DATE OVERDUE') {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }; // Red
                                cell.font.color = { argb: 'FFFFFFFF' }; // White text
                            } else if (finalExcelStatus === 'OVERDUE') {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }; // Orange
                            } else if (finalExcelStatus === 'TDS') {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
                            } else if (finalExcelStatus === 'ACTIVE') {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; // Green
                            } else {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; // Default Green for others
                            }
                        }

                        if (typeof rowData[i - 1] === 'number') {
                            cell.numFmt = '#,##0';
                            if (['TOTAL DUE', 'RECEIVED DUE', 'OVER DUE'].includes(headers[i - 1])) {
                                cell.alignment = { horizontal: 'center' };
                            } else {
                                cell.alignment = { horizontal: 'right' };
                            }
                        } else {
                            const headerName = headers[i - 1] || '';
                            if (headerName === 'CLIENT NAME' || headerName === 'PRIMARY' || (headerName.startsWith('SEC-') && !headerName.includes('\n'))) {
                                cell.alignment = { horizontal: 'left' };
                            } else {
                                cell.alignment = { horizontal: 'center' };
                            }
                        }
                    }
                });


                worksheet.columns.forEach((column, i) => {
                    const header = headers[i];
                    if (header === 'S.NO') {
                        column.width = 6;
                    } else if (header === 'CLIENT NAME') {
                        column.width = 30; // Better for names
                    } else {
                        column.width = 13; // Decreased column width
                    }
                });
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const exportDate = endDate || startDate || new Date().toISOString().split('T')[0];
        const dateStr = `_${exportDate}`;
        
        const activeFilterStr = user?.role === 'admin' && adminAccountFilter.length > 0 
            ? adminAccountFilter.join('-') 
            : (accountFilter || 'All Accounts');
            
        const filenameFilter = activeFilterStr !== 'All Accounts' ? activeFilterStr : (searchTerm || 'All');
        anchor.download = `${reportPrefix}_${filenameFilter}${dateStr}.xlsx`;
        anchor.click();
        
        // Track the export in Google Sheets
        try {
            await fetch('/api/track-export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    report_type: reportPrefix.replace(/_/g, ' '),
                    filters: `${activeFilterStr} | Status: ${statusFilter.length === 5 ? 'All' : statusFilter.length > 0 ? statusFilter.join(', ') : 'None'} | Date: ${startDate || 'None'} to ${endDate || 'None'} | Search: ${searchTerm || 'None'}`,
                    total_entries: exportData.length,
                    sw_categorized: exportData.length,
                    remaining: 0
                })
            });
        } catch (e) {
            console.error('Failed to track export:', e);
        }

        window.URL.revokeObjectURL(url);
    };

    return (
        <div ref={pageRef} className="h-[calc(100vh-64px)] w-full flex flex-col overflow-hidden">
            <main className="mx-auto p-8 flex-1 flex flex-col w-full min-h-0">
                {/* Header Section */}
                <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white whitespace-nowrap">JL Due Report</h1>
                    
                    <div className="flex flex-row items-center gap-4">
                        {/* Search Bar */}
                        <div className="relative group">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm transition-colors group-focus-within:text-primary">search</span>
                            <input
                                type="text"
                                placeholder="Search Loan ID or Client..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white w-80 transition-all"
                            />
                        </div>

                        {(accountFilter || !isAllAccountsSelected || searchTerm || startDate || endDate || statusFilter.length < 5) && (
                            <button
                                onClick={() => {
                                    setAccountFilter('');
                                    setAdminAccountFilter(['SCS', 'GC', 'FC', 'AS', 'ASE', 'SCE', 'ASQ', 'SN', 'FE', 'JC', 'RP']);
                                    setSearchTerm('');
                                    setStartDate('');
                                    setEndDate('');
                                    setStatusFilter(['ACTIVE', 'OVERDUE', 'DATE OVERDUE', 'CLOSED', 'PENDING']);
                                    setCurrentPage(1);
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all flex items-center justify-center"
                                title="Clear All Filters"
                            >
                                <span className="material-symbols-outlined text-[20px]">filter_alt_off</span>
                            </button>
                        )}
                    </div>
                </div>
                    <div className="flex items-center gap-3 mb-5 justify-end">
                        {user?.role === 'admin' ? (
                            <div className="relative" ref={accountDropdownRef}>
                                <button
                                    onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                                    className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white w-56 flex items-center justify-between transition-all"
                                >
                                    <span className="truncate">
                                        {isAllAccountsSelected
                                            ? 'All Accounts'
                                            : adminAccountFilter.length === 0
                                                ? 'No Accounts'
                                                : adminAccountFilter.length === 1
                                                    ? filteredAccountOptions.find(o => o.value === adminAccountFilter[0])?.label || adminAccountFilter[0]
                                                    : `${adminAccountFilter.length} Accounts Selected`}
                                    </span>
                                    <span className="material-symbols-outlined text-slate-400 text-sm">expand_more</span>
                                </button>
                                
                                {isAccountDropdownOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-150">
                                        <div className="max-h-64 overflow-y-auto scrollbar-premium">
                                            <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllAccountsSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setAdminAccountFilter(['SCS', 'GC', 'FC', 'AS', 'ASE', 'SCE', 'ASQ', 'SN', 'FE', 'JC', 'RP']);
                                                        } else {
                                                            setAdminAccountFilter([]);
                                                        }
                                                        setCurrentPage(1);
                                                    }}
                                                    className="w-4 h-4 rounded text-primary focus:ring-primary/50 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                                                />
                                                <span className="text-sm text-slate-800 dark:text-slate-100 font-extrabold">All Accounts</span>
                                            </label>
                                            {filteredAccountOptions.map((opt) => (
                                                <label key={opt.value} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={adminAccountFilter.includes(opt.value)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setAdminAccountFilter([...adminAccountFilter, opt.value]);
                                                            } else {
                                                                setAdminAccountFilter(adminAccountFilter.filter(v => v !== opt.value));
                                                            }
                                                            setCurrentPage(1);
                                                        }}
                                                        className="w-4 h-4 rounded text-primary focus:ring-primary/50 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                                                    />
                                                    <span className="text-sm text-slate-700 dark:text-slate-300 font-semibold">{opt.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                        {adminAccountFilter.length > 0 && (
                                            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                                <button
                                                    onClick={() => {
                                                        setAdminAccountFilter([]);
                                                        setCurrentPage(1);
                                                    }}
                                                    className="w-full py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                                                >
                                                    Clear Selection
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative">
                                <select
                                    value={accountFilter}
                                    onChange={(e) => {
                                        setAccountFilter(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white w-56 appearance-none cursor-pointer pr-10"
                                >
                                    <option value="">All Accounts</option>
                                    {filteredAccountOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">expand_more</span>
                            </div>
                        )}
                        <div className="relative" ref={statusDropdownRef}>
                            <button
                                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-200 w-44 flex items-center justify-between transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm cursor-pointer select-none"
                            >
                                <span className="truncate">
                                    {statusFilter.length === 5
                                        ? 'All Statuses'
                                        : statusFilter.length === 0
                                            ? 'No Statuses'
                                            : statusFilter.length === 1
                                                ? statusFilter[0]
                                                : `${statusFilter.length} Statuses`}
                                </span>
                                <span className="material-symbols-outlined text-slate-400 text-sm leading-none">expand_more</span>
                            </button>

                            {isStatusDropdownOpen && (
                                <div className="absolute top-full left-0 mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[110] overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-150 select-none">
                                    <div className="max-h-60 overflow-y-auto scrollbar-premium">
                                        <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
                                            <input
                                                type="checkbox"
                                                checked={statusFilter.length === 5}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setStatusFilter(['ACTIVE', 'OVERDUE', 'DATE OVERDUE', 'CLOSED', 'PENDING']);
                                                    } else {
                                                        setStatusFilter([]);
                                                    }
                                                    setCurrentPage(1);
                                                }}
                                                className="w-4 h-4 rounded text-primary focus:ring-primary/50 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                                            />
                                            <span className="text-sm text-slate-800 dark:text-slate-100 font-extrabold">All Statuses</span>
                                        </label>
                                        {[
                                            { value: 'ACTIVE', label: 'ACTIVE' },
                                            { value: 'OVERDUE', label: 'OVERDUE' },
                                            { value: 'DATE OVERDUE', label: 'DATE OVERDUE' },
                                            { value: 'CLOSED', label: 'CLOSED' },
                                            { value: 'PENDING', label: 'PENDING' }
                                        ].map((opt) => (
                                            <label key={opt.value} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={statusFilter.includes(opt.value)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setStatusFilter([...statusFilter, opt.value]);
                                                        } else {
                                                            setStatusFilter(statusFilter.filter(v => v !== opt.value));
                                                        }
                                                        setCurrentPage(1);
                                                    }}
                                                    className="w-4 h-4 rounded text-primary focus:ring-primary/50 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                                                />
                                                <span className="text-sm text-slate-700 dark:text-slate-300 font-semibold">{opt.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {statusFilter.length > 0 && (
                                        <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                            <button
                                                onClick={() => {
                                                    setStatusFilter([]);
                                                    setCurrentPage(1);
                                                }}
                                                className="w-full py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                                            >
                                                Clear Selection
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="relative" ref={calendarRef}>
                            <button
                                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                                className="h-9 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-200 flex items-center gap-2 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm min-w-56 justify-between select-none"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-slate-400 text-lg leading-none">calendar_month</span>
                                    <span className="font-semibold text-[13px]">{formatDisplayDateRange()}</span>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 text-sm leading-none">expand_more</span>
                            </button>

                            {isCalendarOpen && (
                                <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 z-[120] w-[340px] animate-in fade-in slide-in-from-top-2 duration-150 select-none">
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-4">
                                        <button 
                                            onClick={handlePrevMonth}
                                            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-lg leading-none">chevron_left</span>
                                        </button>
                                        <h4 className="text-[14px] font-extrabold text-slate-800 dark:text-white">
                                            {MONTH_NAMES[calendarViewDate.getMonth()]} {calendarViewDate.getFullYear()}
                                        </h4>
                                        <button 
                                            onClick={handleNextMonth}
                                            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-lg leading-none">chevron_right</span>
                                        </button>
                                    </div>

                                    <hr className="border-slate-100 dark:border-slate-800 mb-4" />

                                    {/* Weekdays */}
                                    <div className="grid grid-cols-7 text-center mb-2">
                                        {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
                                            <span key={idx} className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                                {day}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Days grid */}
                                    <div className="grid grid-cols-7 gap-y-1">
                                        {calendarDays.map((cell, idx) => {
                                            const isStart = cell.dateString === startDate;
                                            const isEnd = cell.dateString === endDate;
                                            const isBetween = startDate && endDate && cell.dateString > startDate && cell.dateString < endDate;
                                            return (
                                                <div 
                                                    key={idx} 
                                                    onClick={() => handleDayClick(cell.dateString)}
                                                    className={`h-10 flex items-center justify-center relative select-none cursor-pointer ${
                                                        !cell.isCurrentMonth ? 'opacity-40 hover:opacity-75' : ''
                                                    }`}
                                                >
                                                    {/* Background range highlight layer */}
                                                    {(isStart && endDate) && (
                                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 h-8 bg-indigo-50 dark:bg-indigo-950/30 z-0 rounded-l-full" />
                                                    )}
                                                    {(isEnd && startDate) && (
                                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1/2 h-8 bg-indigo-50 dark:bg-indigo-950/30 z-0 rounded-r-full" />
                                                    )}
                                                    {isBetween && (
                                                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 bg-indigo-50 dark:bg-indigo-950/30 z-0" />
                                                    )}

                                                    {/* Day label wrapper */}
                                                    <div className={`w-8 h-8 flex flex-col items-center justify-center text-xs relative z-10 ${
                                                        (isStart || isEnd) 
                                                            ? 'rounded-full bg-primary text-white font-bold shadow-md shadow-primary/20' 
                                                            : isBetween 
                                                                ? 'text-primary font-semibold bg-transparent' 
                                                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full'
                                                    }`}>
                                                        {cell.day}
                                                        
                                                        {/* Today indicator dot */}
                                                        {cell.dateString === todayString && !(isStart || isEnd) && (
                                                            <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary" />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative" ref={importDropdownRef}>
                            <button
                                onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
                                className="h-9 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-2 text-sm"
                            >
                                <span className="material-symbols-outlined text-sm">upload_file</span>
                                Import
                                <span className="material-symbols-outlined text-sm">expand_more</span>
                            </button>

                            {isImportDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                                    <button
                                        onClick={() => {
                                            fileInputRef.current?.click();
                                            setIsImportDropdownOpen(false);
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
                                        New Loan
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Trigger Day Book Import
                                            dayBookInputRef.current?.click();
                                            setIsImportDropdownOpen(false);
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2 border-t border-slate-200/50 dark:border-slate-700/50"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-amber-500">book</span>
                                        Day Book
                                    </button>
                                </div>
                            )}

                            <input
                                type="file"
                                ref={fileInputRef}
                                accept=".docx,.pdf,.xlsx,.xls"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            <input
                                type="file"
                                ref={dayBookInputRef}
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={handleDayBookFileSelect}
                            />
                        </div>
                        <div className="relative" ref={exportDropdownRef}>
                            <button
                                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                                title="Export options"
                                className="h-9 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 text-sm"
                            >
                                <span className="material-symbols-outlined text-sm">download</span>
                                Export
                                <span className="material-symbols-outlined text-sm">expand_more</span>
                            </button>

                            {isExportDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                                    <button
                                        onClick={() => {
                                            handleExport('JL_Report');
                                            setIsExportDropdownOpen(false);
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                                        JL Report
                                    </button>
                                    <button
                                        onClick={() => {
                                            handleBendingExport();
                                            setIsExportDropdownOpen(false);
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2 border-t border-slate-200/50 dark:border-slate-700/50"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-amber-500">pending_actions</span>
                                        O/S Report
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                {/* Table Section */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
                    <div className="flex-1 flex flex-col min-h-0 scrollbar-premium">
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Fixed Header Table */}
                            <div className="shrink-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 [scrollbar-gutter:stable] overflow-y-hidden">
                                <table className="w-full text-left border-collapse table-fixed">
                                    <colgroup>
                                        <col style={{ width: '5%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '11%' }} />
                                        <col style={{ width: '25%' }} />
                                        <col style={{ width: '12%' }} />
                                        <col style={{ width: '12%' }} />
                                        <col style={{ width: '6%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '5%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th className="py-4 px-4 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">S.No</th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Loan ID</th>
                                            <th
                                                className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors select-none"
                                                onClick={() => setSortConfig(prev => ({ key: 'loan_date', direction: prev.key === 'loan_date' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                            >
                                                <div className="flex items-center gap-1">
                                                    Loan Date
                                                    <span className="material-symbols-outlined text-[14px] leading-none text-slate-400 group-hover:text-primary transition-colors">
                                                        {sortConfig.key === 'loan_date' ? (sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                    </span>
                                                </div>
                                            </th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Client Name</th>
                                            {user?.role === 'admin' ? (
                                                <th
                                                    className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors select-none"
                                                    onClick={() => setSortConfig(prev => ({ key: 'primary_account', direction: prev.key === 'primary_account' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        Pri Acc
                                                        <span className="material-symbols-outlined text-[14px] leading-none text-slate-400 group-hover:text-primary transition-colors">
                                                            {sortConfig.key === 'primary_account' ? (sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                        </span>
                                                    </div>
                                                </th>
                                            ) : (
                                                <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Pri Acc</th>
                                            )}
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Amount</th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Others</th>
                                            <th
                                                className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors select-none"
                                                onClick={() => setSortConfig(prev => ({ key: 'status', direction: prev.key === 'status' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                            >
                                                <div className="flex items-center gap-1">
                                                    Status
                                                    <span className="material-symbols-outlined text-[14px] leading-none text-slate-400 group-hover:text-primary transition-colors">
                                                        {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                    </span>
                                                </div>
                                            </th>
                                            <th className="py-4 px-2 text-center text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Actions</th>
                                        </tr>
                                    </thead>
                                </table>
                            </div>

                            {/* Scrollable Body Table */}
                            <div className="flex-1 overflow-y-auto scrollbar-premium [scrollbar-gutter:stable]">
                                <table className="w-full text-left border-collapse table-fixed">
                                    <colgroup>
                                        <col style={{ width: '5%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '11%' }} />
                                        <col style={{ width: '25%' }} />
                                        <col style={{ width: '12%' }} />
                                        <col style={{ width: '12%' }} />
                                        <col style={{ width: '6%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '5%' }} />
                                    </colgroup>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {isLoadingData ? (
                                            <tr>
                                                <td colSpan="9" className="py-12 bg-slate-50/50 dark:bg-slate-800/20 text-center">
                                                    <div className="flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                                                        <span className="material-symbols-outlined animate-spin text-[28px] mb-2 text-primary/70">progress_activity</span>
                                                        <span className="text-sm font-medium">Syncing database records...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : filteredData.length === 0 ? (
                                            <tr>
                                                <td colSpan="9" className="py-20 text-center bg-white dark:bg-slate-900/50 border-x border-slate-200/50 dark:border-slate-800/50">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 transition-transform hover:scale-110 duration-300">
                                                            <span className="material-symbols-outlined text-[32px] text-slate-400">search_off</span>
                                                        </div>
                                                        <p className="text-slate-900 dark:text-white text-lg font-bold mb-1">No Results Found</p>
                                                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto px-10">
                                                            {accountFilter || !isAllAccountsSelected || searchTerm || startDate || endDate || statusFilter.length < 5
                                                                ? "We couldn't find any loans matching your current search or date filters. Try adjusting your criteria."
                                                                : "There are no loan records to display based on your access level or account activity."}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : currentData.map((row, index) => (
                                            <tr
                                                key={row.id}
                                                onClick={() => {
                                                    navigate(`/jl-due-report/${row.id}`, { state: { filterDate: endDate || startDate } });
                                                }}
                                                title={row.approval_status === 'PENDING' ? 'Pending Approval - View only mode' : ''}
                                                className="transition-colors group hover:bg-slate-50 dark:hover:bg-slate-800/25 cursor-pointer"
                                            >
                                                <td className="py-2 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                    {startIndex + index + 1}
                                                </td>
                                                <td className="py-2 px-2 text-sm font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap truncate">
                                                    {row.loan_ref_id || '—'}
                                                </td>
                                                <td className="py-2 px-2 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                                    {row.loan_date}
                                                </td>
                                                <td className="py-2 px-2 text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                                    {row.client_name}
                                                </td>
                                                <td className="py-2 px-2 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border uppercase tracking-wider ${getAccountTagStyles(row.primary_account_name)}`}>
                                                        {getAcronym(row.primary_account_name)}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-2 text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap text-left">
                                                    ₹ {row.loan_amount.toLocaleString('en-IN')}
                                                </td>
                                                <td className="py-2 px-2 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-left">
                                                    {row.repayment_schedule?.some(e => e.type === 'manual') ? (
                                                        <span className="text-rose-600 dark:text-rose-400 font-bold border-transparent">Yes</span>
                                                    ) : (
                                                        <span className="text-slate-300 dark:text-slate-700 font-bold border-transparent">No</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2 text-sm whitespace-nowrap text-left">
                                                    {(() => {
                                                        const s = getLoanStatus(row);
                                                        return (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${s.color}`}>
                                                                {s.label}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="py-2 px-2 text-center text-sm">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteClick(row.id);
                                                        }}
                                                        className="p-1.5 text-slate-300 hover:text-rose-500 rounded-2xl transition-all"
                                                        title="Delete Loan"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    {/* Pagination Footer */}
                    {filteredData.length > 0 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/10 rounded-b-2xl">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{startIndex + 1}</span> to <span className="font-semibold text-slate-700 dark:text-slate-200">{endIndex}</span> of <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredData.length}</span> results
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>


            {/* Document Import Modal Placeholder */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Configure Remaining Accounts</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 custom-scrollbar">
                            <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                File selected: <strong className="text-slate-700 dark:text-slate-200">{selectedFile?.name}</strong>
                            </p>

                            {!(selectedFile?.name.toLowerCase().endsWith('.pdf')) && (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">tag</span> Loan ID
                                        <span className="ml-1 text-slate-400 normal-case font-normal">(max 11 characters)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={loanRefId}
                                        onChange={(e) => setLoanRefId(e.target.value.slice(0, 11))}
                                        maxLength={11}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:bg-white dark:focus:bg-slate-900 transition-colors text-sm text-slate-900 dark:text-white font-mono tracking-widest"
                                        placeholder="e.g. JL-2026-001"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1 text-right">{loanRefId.length}/11</p>
                                </div>
                            )}



                            <div className="pt-2">
                                <h4 className="font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-sm mb-3">Remaining Accounts Details</h4>

                                <div className="space-y-3">
                                    {accounts.map((acc, index) => (
                                        <div key={index} className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 relative bg-white dark:bg-slate-900 shadow-sm">
                                            <div className="flex-1 grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">badge</span> Account Name
                                                    </label>
                                                    <input type="text" value={acc.name} onChange={(e) => handleAccountChange(index, 'name', e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:bg-white dark:focus:bg-slate-900 transition-colors text-sm text-slate-900 dark:text-white" placeholder="e.g. SCS" />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">price_change</span> Amount Share
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={acc.share ? (acc.share.toString().includes('.') ? Number(acc.share.toString().split('.')[0]).toLocaleString('en-IN') + '.' + acc.share.toString().split('.')[1] : Number(acc.share).toLocaleString('en-IN')) : ''}
                                                        onChange={(e) => {
                                                            const rawVal = e.target.value.replace(/,/g, '');
                                                            if (rawVal === '' || (!isNaN(rawVal) && Number(rawVal) >= 0 && !rawVal.includes(' '))) {
                                                                handleAccountChange(index, 'share', rawVal);
                                                            }
                                                        }}
                                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/50 focus:bg-white dark:focus:bg-slate-900 transition-colors text-sm text-slate-900 dark:text-white"
                                                        placeholder="e.g. 10,00,000"
                                                    />
                                                </div>
                                            </div>
                                            {accounts.length > 1 && (
                                                <button onClick={() => handleRemoveAccount(index)} className="mt-5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors group" title="Remove account">
                                                    <span className="material-symbols-outlined transform group-hover:scale-110 transition-transform">delete</span>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <button onClick={handleAddAccount} className="mt-4 h-10 w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-600">
                                    <span className="material-symbols-outlined text-[18px]">add</span> Add New Account
                                </button>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center gap-2 disabled:opacity-70 disabled:shadow-none active:scale-95">
                                {isSubmitting ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                                        Upload & Save
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Processing Overlay */}
            {isSubmitting && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-10 flex flex-col items-center border border-white/20 transform transition-all animate-in zoom-in-95 duration-300">
                        <div className="relative mb-8">
                            <div className="w-20 h-20 border-4 border-slate-100 dark:border-slate-800 rounded-full"></div>
                            <div className="absolute inset-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-3xl animate-pulse">sync</span>
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Processing Day Book</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Please wait while we sync your records...</p>
                    </div>
                </div>
            )}

            {/* Error Popup Modal */}
            {uploadError && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center p-8 animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <span className="material-symbols-outlined text-[35px]">error</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Action Failed</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                            {uploadError}
                        </p>
                        <button
                            onClick={() => setUploadError('')}
                            className="w-full py-3 px-4 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Success Popup Modal */}
            {showSuccessPopup && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center p-8 animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <span className="material-symbols-outlined text-[35px]">check_circle</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Success!</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                            {successMessage}
                        </p>
                        
                        {updatedDetails && updatedDetails.length > 0 && (
                            <div className="w-full text-left mb-6">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Updated Records:</p>
                                <div className="max-h-32 overflow-y-auto pr-2 scrollbar-premium bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 p-3">
                                    <ul className="space-y-1.5">
                                        {[...updatedDetails].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map((detail, i) => (
                                            <li key={i} className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-start gap-2">
                                                <span className="material-symbols-outlined text-[14px] text-green-500 mt-0.5">check_circle</span>
                                                {detail}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setShowSuccessPopup(false);
                                setUpdatedDetails([]);
                                setSkippedDetails([]);
                            }}
                            className="w-full py-3 px-4 text-sm font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/50 dark:text-emerald-400 dark:hover:bg-emerald-900/60 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[18px]">done</span> Close
                        </button>
                    </div>
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {loanToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-rose-600 dark:text-rose-400 text-[28px]">warning</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Loan Record?</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                            Are you sure you want to delete this loan record? This action will hide the loan from all reports. This process cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setLoanToDelete(null)}
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                        Deleting...
                                    </>
                                ) : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JlDueReport;
