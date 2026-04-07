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

const parseINR = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return parseFloat(val.toString().replace(/,/g, '')) || 0;
};

const getSplitData = (splitsStr, targetKey) => {
    let sDict = {};
    try { sDict = splitsStr ? JSON.parse(splitsStr) : {}; } catch (err) { }
    const val = sDict[targetKey];
    if (val === undefined || val === null) return null;
    const objVal = (typeof val === 'object' && val !== null) ? val : { amount: Number(val) || 0, tds: '', remarks: '' };
    if (Array.isArray(objVal)) return objVal;
    return [objVal];
};

const getSplitAmount = (splitsStr, targetKey) => {
    const dataArray = getSplitData(splitsStr, targetKey);
    if (!dataArray || dataArray.length === 0) return 0;
    return dataArray.reduce((s, acc) => s + (Number(acc.amount) || 0), 0);
};

const getSplitTDS = (splitsStr, targetKey) => {
    const dataArray = getSplitData(splitsStr, targetKey);
    if (!dataArray || dataArray.length === 0) return 0;
    return dataArray.reduce((s, acc) => s + (Number(acc.tds) || 0), 0);
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

const getRowAccountPaid = (entry, accName, targetShare, isPrimary) => {
    const dataArray = entry.splits ? getSplitData(entry.splits, accName) : null;
    if (dataArray && dataArray.length > 0) {
        return dataArray.reduce((s, x) => s + (Number(x.amount) || 0) + (Number(x.tds) || 0), 0);
    }
    // Fallback to date column if no splits for this account
    const dVal = isPrimary ? entry.received_date : entry.payment_date;
    const hasDate = dVal && dVal !== '—' && dVal !== 'dd-mm-yyyy' && dVal !== '-';
    return hasDate ? targetShare : 0;
};

const getRowPaidTotalRaw = (entry, loan) => {
    const secAccs = loan.secondary_accounts || [];
    const secPercentagesSum = secAccs.reduce((sum, acc) => sum + (Number(acc.percentage) || 0), 0);
    const effectivePrimaryPercentage = isNaN(Number(loan.primary_account_share)) || Number(loan.primary_account_share) === 0
        ? Math.max(0, 100 - secPercentagesSum)
        : Number(loan.primary_account_share);

    const rawTarget = parseINR(entry.amount);

    // Primary Paid
    const priTarget = rawTarget * (effectivePrimaryPercentage / 100);
    const priPaid = getRowAccountPaid(entry, loan.primary_account_name, priTarget, true);

    // Secondaries Paid
    let secPaidTotal = 0;
    secAccs.forEach(acc => {
        const sTarget = rawTarget * ((acc.percentage || 0) / 100);
        secPaidTotal += getRowAccountPaid(entry, acc.account_name, sTarget, false);
    });

    return priPaid + secPaidTotal;
};

const hasRowBalance = (entry, loan) => {
    const target = parseINR(entry.amount);
    if (target === 0) return false;
    const paid = getRowPaidTotalRaw(entry, loan);
    return Math.round(paid) < Math.round(target);
};

const getLoanStatus = (loan) => {
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

    // Condition 1: OVERDUE (Red) - LAST due date crossed today (and not CLOSED)
    if (lastKey > 0 && lastKey < todayKey) {
        return { label: 'OVERDUE', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50' };
    }

    // Condition 3: ACTIVE (Red) - LAST due not crossed, but previous/current due (<= today) not fully received
    const hasPendingHistoricalDue = validDues.some(e => {
        const dKey = getDateKey(e.date);
        return dKey > 0 && dKey <= todayKey && hasRowBalance(e, loan);
    });

    if (hasPendingHistoricalDue) {
        return { label: 'ACTIVE', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50' };
    }

    // Condition 2: ACTIVE (Green) - LAST due NOT crossed AND all dues up to today already received
    return { label: 'ACTIVE', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' };
};

const JlDueReport = ({ user }) => {
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(false);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [accounts, setAccounts] = useState([{ name: '', share: '' }]);
    const [loanRefId, setLoanRefId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedLoanId, setSelectedLoanId] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [loanToDelete, setLoanToDelete] = useState(null);
    const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
    const pageRef = useRef(null);
    const exportDropdownRef = useRef(null);

    // Lock background scroll when panel is open
    useEffect(() => {
        const el = pageRef.current;
        if (!el) return;
        el.style.overflow = selectedLoanId ? 'hidden' : '';
        return () => { if (el) el.style.overflow = ''; };
    }, [selectedLoanId]);

    // Handle click outside to close export dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
                setIsExportDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
            setAccounts([{ name: '', share: '' }]);
            setLoanRefId('');
            setUploadError('');
            setShowModal(true);
        }
        e.target.value = null; // Reset file input so picking same file again works
    };

    const handleAddAccount = () => setAccounts([...accounts, { name: '', share: '' }]);
    const handleRemoveAccount = (index) => setAccounts(accounts.filter((_, i) => i !== index));
    const handleAccountChange = (index, field, value) => {
        const newAccs = [...accounts];
        newAccs[index][field] = value;
        setAccounts(newAccs);
    };

    const handleSubmit = async () => {
        if (!selectedFile) return;
        const formattedAccounts = accounts
            .filter(a => a.name.trim() !== '' && a.share.toString().trim() !== '')
            .map(a => ({ name: a.name.trim(), share: parseFloat(a.share) }));

        setIsSubmitting(true);
        setUploadError('');
        try {
            const formData = new FormData();
            formData.append('docx_file', selectedFile);
            formData.append('remaining_accounts', JSON.stringify(formattedAccounts));
            formData.append('loan_ref_id', loanRefId.trim());
            formData.append('employee_code', user?.employee_code || "");

            const response = await fetch('/api/upload-docx', { method: 'POST', body: formData });
            const result = await response.json();

            if (response.ok) {
                setShowModal(false);
                setSelectedFile(null);
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
                alert(result.error || "Failed to delete loan");
            }
        } catch (e) {
            console.error("Delete error:", e);
            alert("Network error while deleting loan");
        } finally {
            setIsDeleting(false);
        }
    };

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

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

    useEffect(() => {
        setCurrentPage(1);
    }, [data]);

    const filteredData = useMemo(() => {
        let result = data;

        // Apply Permissions Filter: If not admin and doesn't have all permissions, show only which primary account acronym is in their list
        if (user?.role !== 'admin' && user?.permissions?.length < 10) {
            const userPerms = user?.permissions || [];
            result = result.filter(row => {
                const acronym = getAcronym(row.primary_account_name);
                return userPerms.includes(acronym);
            });
        }

        if (searchTerm) {
            const term = searchTerm.toUpperCase();
            result = result.filter(row => {
                const priMatch = getAcronym(row.primary_account_name).toUpperCase() === term;
                const secMatch = (row.secondary_accounts || []).some(acc => getAcronym(acc.account_name).toUpperCase() === term);
                return priMatch || secMatch;
            });
        }

        if (selectedDate) {
            result = result.filter(row => {
                const schedule = row.repayment_schedule || [];
                return schedule.some(entry => {
                    const scheduleDateStr = toYYYYMMDD(entry.date);

                    // Logic to check if this specific entry has ANY outstanding balance across accounts
                    const targetTotal = parseINR(entry.amount);
                    const paidTotal = getSplitAmount(entry.splits, row.primary_account_name) +
                        getSplitTDS(entry.splits, row.primary_account_name) +
                        (row.secondary_accounts || []).reduce((s, acc) => s + getSplitAmount(entry.splits, acc.account_name) + getSplitTDS(entry.splits, acc.account_name), 0);

                    const hasNoReceivedDate = !entry.received_date || entry.received_date === '' || entry.received_date === '—' || entry.received_date === 'dd-mm-yyyy' || entry.received_date === '-';

                    const hasBalance = Math.round(paidTotal) < Math.round(targetTotal);
                    return scheduleDateStr && scheduleDateStr <= selectedDate && hasNoReceivedDate && hasBalance;
                });
            });
        }

        return result;
    }, [data, searchTerm, selectedDate]);

    // Pagination calculations
    const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    const currentData = filteredData.slice(startIndex, endIndex);

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
        if (searchTerm) {
            const term = searchTerm.toUpperCase();
            osData = osData.filter(row => {
                const priMatch = getAcronym(row.primary_account_name).toUpperCase() === term;
                const secMatch = (row.secondary_accounts || []).some(acc => getAcronym(acc.account_name).toUpperCase() === term);
                return priMatch || secMatch;
            });
        }

        if (osData.length === 0) {
            alert("No outstanding loans found for this selection.");
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

        const todayISO = selectedDate || new Date().toISOString().split('T')[0];
        const today = todayISO.split('-').reverse().join('-');

        // Shared Styles
        const thickBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        const lightBlueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
        const darkBlueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203764' } };

        if (isDetailed) {
            // DETAILED BLOCK-BASED LAYOUT (For O/S Report - Image 2 style)
            groups.forEach((loans, primaryAccName) => {
                const sheetName = getAcronym(primaryAccName).slice(0, 31);
                const worksheet = workbook.addWorksheet(sheetName);
                let cur = 1;

                const cutoffKey = getDateKey(selectedDate || new Date().toLocaleDateString('en-CA'));

                loans.forEach((loan) => {
                    const schedule = loan.repayment_schedule || [];
                    const secAccs = loan.secondary_accounts || [];

                    // Filter for Overdue / Pending installments (Any installment with a balance remaining)
                    const osInstallments = schedule.filter(e => {
                        const dKey = getDateKey(e.date);
                        const hasBalance = hasRowBalance(e, loan);
                        return (dKey > 0 && dKey <= cutoffKey) && hasBalance;
                    });

                    if (osInstallments.length === 0) return;

                    // Row 1: Header [PRIMARY - PARTY NAME] | [DATE]
                    const r1 = worksheet.getRow(cur);
                    r1.values = [`${getAcronym(loan.primary_account_name)} - ${loan.client_name?.toUpperCase()}`, '', '', '', '', '', '', today];
                    worksheet.mergeCells(cur, 1, cur, 4);
                    r1.getCell(1).font = { name: 'Trebuchet MS', bold: true, size: 12 };
                    r1.getCell(1).alignment = { horizontal: 'center' };
                    r1.getCell(1).fill = lightBlueFill;
                    r1.getCell(1).border = thickBorder;

                    r1.getCell(8).font = { name: 'Trebuchet MS', bold: true, color: { argb: 'FF000000' } };
                    r1.getCell(8).alignment = { horizontal: 'center' };
                    r1.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9966FF' } };
                    r1.getCell(8).border = thickBorder;
                    cur++;

                    // Row 2: Metadata Labels [DATE | PRIMARY | LOAN NO | PARTY NAME]
                    const r2 = worksheet.getRow(cur);
                    r2.values = ['DATE', 'PRIMARY', 'LOAN NO', 'PARTY NAME'];
                    for (let i = 1; i <= 4; i++) {
                        r2.getCell(i).style = { font: { name: 'Trebuchet MS', bold: true }, fill: lightBlueFill, border: thickBorder, alignment: { horizontal: 'center' } };
                    }
                    cur++;

                    // Row 3: Metadata Values
                    const r3 = worksheet.getRow(cur);
                    r3.values = [loan.loan_date || '', getAcronym(loan.primary_account_name).toUpperCase(), loan.loan_ref_id || '', loan.client_name?.toUpperCase() || ''];
                    for (let i = 1; i <= 4; i++) {
                        r3.getCell(i).style = { border: thickBorder, alignment: { horizontal: 'center' } };
                    }
                    cur++;

                    // Row 4: Schedule Table Headers
                    const r4 = worksheet.getRow(cur);
                    const sHeaders = ['DATE', 'AMOUNT', 'DATE'];
                    const priAcr = getAcronym(loan.primary_account_name).toUpperCase();
                    sHeaders.push(priAcr, 'TDS');
                    secAccs.forEach(acc => {
                        sHeaders.push('DATE', getAcronym(acc.account_name).toUpperCase(), 'TDS');
                    });
                    sHeaders.push('PARTIAL');

                    r4.values = sHeaders;
                    for (let i = 1; i <= sHeaders.length; i++) {
                        r4.getCell(i).style = { font: { name: 'Trebuchet MS', bold: true }, fill: lightBlueFill, border: thickBorder, alignment: { horizontal: 'center' } };
                    }
                    cur++;

                    // Installment Rows
                    const secPercentagesSum = secAccs.reduce((sum, acc) => sum + (Number(acc.percentage) || 0), 0);
                    const effectivePrimaryPercentage = isNaN(Number(loan.primary_account_share)) || Number(loan.primary_account_share) === 0
                        ? Math.max(0, 100 - secPercentagesSum)
                        : Number(loan.primary_account_share);

                    osInstallments.forEach(e => {
                        const rN = worksheet.getRow(cur);
                        const rowVals = [e.date || '', parseINR(e.amount), '']; // empty 'date' col as per image

                        // Primary O/S calculation (Balance owed for this row)
                        const rawTarget = parseINR(e.amount);
                        const priTarget = rawTarget * (effectivePrimaryPercentage / 100);
                        const priPaid = getRowAccountPaid(e, loan.primary_account_name, priTarget, true);
                        const priOS = Math.round(priTarget - priPaid) <= 0 ? 0 : (priTarget - priPaid);
                        const priTds = getSplitTDS(e.splits, loan.primary_account_name) || '';

                        rowVals.push(priOS || '', priTds);

                        // Secondary splits (O/S shares)
                        secAccs.forEach(acc => {
                            const sTarget = rawTarget * ((acc.percentage || 0) / 100);
                            const sPaid = getRowAccountPaid(e, acc.account_name, sTarget, false);
                            const sOS = Math.round(sTarget - sPaid) <= 0 ? 0 : (sTarget - sPaid);
                            const sTds = getSplitTDS(e.splits, acc.account_name) || '';
                            rowVals.push('', sOS || '', sTds);
                        });

                        const totalPaidInRow = getRowPaidTotalRaw(e, loan);
                        rowVals.push(totalPaidInRow > 0 ? 'Partial' : '');

                        rN.values = rowVals;
                        for (let i = 1; i <= rowVals.length; i++) {
                            const cell = rN.getCell(i);
                            cell.border = thickBorder;
                            if (typeof rowVals[i - 1] === 'number') {
                                cell.numFmt = '#,##0';
                                cell.alignment = { horizontal: 'right' };
                            } else {
                                cell.alignment = { horizontal: 'center' };
                            }
                        }
                        cur++;
                    });

                    cur += 1; // Spacer row
                });

                // Autofit detailed columns
                worksheet.columns.forEach(column => {
                    column.width = 15;
                });
            });

        } else {
            // STANDARD ROW-BASED LAYOUT (For JL Report)
            groups.forEach((loans, primaryAccName) => {
                const sortedLoans = [...loans].sort((a, b) => {
                    const sA = getLoanStatus(a).label;
                    const sB = getLoanStatus(b).label;
                    const getP = (s) => (s === 'Overdue' ? 0 : s === 'Active' ? 1 : 2);
                    return getP(sA) - getP(sB);
                });

                const maxSecAccsFound = Math.max(...sortedLoans.map(l => (l.secondary_accounts || []).length), 0);
                const maxTotalAccs = maxSecAccsFound + 1;

                const sheetName = getAcronym(primaryAccName).slice(0, 31);
                const worksheet = workbook.addWorksheet(sheetName);

                const headers = ['S.NO', 'DATE', 'LOAN NO', 'CLIENT NAME', 'PRIMARY'];
                for (let i = 1; i < maxTotalAccs; i++) headers.push(`SEC-${i}`);
                headers.push('LOAN AMOUNT', 'REPAYMENT', 'PRIMARY\nLOAN', 'PRIMARY\nREPAYMENT');
                for (let i = 1; i < maxTotalAccs; i++) headers.push(`SEC-${i}\nLOAN`, `SEC-${i}\nREPAYMENT`);
                headers.push('PRIMARY\nRECEIVED');
                for (let i = 1; i < maxTotalAccs; i++) headers.push(`SEC-${i}\nRECEIVED`);
                headers.push('PRIMARY\nO/S');
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

                sortedLoans.forEach((loan, idx) => {
                    const schedule = loan.repayment_schedule || [];
                    const secAccs = loan.secondary_accounts || [];
                    const statusInfo = getLoanStatus(loan);

                    const rowData = [
                        idx + 1, loan.loan_date || '', loan.loan_ref_id || '', loan.client_name || '',
                        getAcronym(loan.primary_account_name)
                    ];
                    for (let i = 0; i < maxTotalAccs - 1; i++) rowData.push(secAccs[i] ? getAcronym(secAccs[i].account_name) : '');

                    const loanAmount = loan.loan_amount || 0;
                    const totalRepay = loan.repayment_amount || 0;
                    rowData.push(loanAmount, totalRepay);

                    const secPrincipalSum = secAccs.reduce((sum, acc) => sum + (Number(acc.share) || 0), 0);
                    const secInterestSum = secAccs.reduce((sum, acc) => sum + (Number(acc.interest_amount) || 0), 0);
                    const priLoan = Number(loan.primary_account_amount) || (loanAmount - secPrincipalSum);
                    const priInterest = Number(loan.primary_account_interest) || ((totalRepay - loanAmount) - secInterestSum);
                    const priRepayTotal = priLoan + priInterest;

                    rowData.push(priLoan, priRepayTotal);
                    for (let i = 0; i < maxTotalAccs - 1; i++) {
                        if (secAccs[i]) {
                            const sPrincipal = Number(secAccs[i].share) || 0;
                            const sInterest = Number(secAccs[i].interest_amount) || 0;
                            rowData.push(sPrincipal, sPrincipal + sInterest);
                        } else { rowData.push('', ''); }
                    }

                    const secPercentagesSum = secAccs.reduce((sum, acc) => sum + (Number(acc.percentage) || 0), 0);
                    const effectivePrimaryPercentage = isNaN(Number(loan.primary_account_share)) || Number(loan.primary_account_share) === 0
                        ? Math.max(0, 100 - secPercentagesSum)
                        : Number(loan.primary_account_share);

                    const cutoffKey = getDateKey(selectedDate || new Date().toLocaleDateString('en-CA'));

                    const getPaidShare = (accName, percentage, isPrimary) => {
                        return schedule.reduce((sum, e) => {
                            const rDate = isPrimary ? e.received_date : e.payment_date;
                            const rKey = getDateKey(rDate);
                            const dKey = getDateKey(e.date);

                            // Received by now check:
                            // Primary: physically paid before cutoff.
                            // Secondary: marked paid AND due date has passed.
                            const filterKey = isPrimary ? rKey : dKey;
                            const hasDateMark = rKey > 0;
                            const inReportWindow = dKey > 0 && filterKey <= cutoffKey;

                            if (hasDateMark && inReportWindow) {
                                const dataArray = getSplitData(e.splits, accName);
                                if (dataArray !== null) {
                                    const overAmt = dataArray.reduce((s, item) => s + (Number(item.amount) || 0), 0);
                                    const overTDS = dataArray.reduce((s, item) => s + (Number(item.tds) || 0), 0);
                                    return sum + overAmt + overTDS;
                                } else {
                                    const grossTarget = parseINR(e.amount) * (percentage / 100);
                                    return sum + grossTarget;
                                }
                            }
                            return sum;
                        }, 0);
                    };

                    const getOsShare = (accName, percentage, isPrimary) => {
                        return schedule.reduce((sum, e) => {
                            const dKey = getDateKey(e.date);
                            if (dKey > 0 && dKey <= cutoffKey) {
                                const rDate = isPrimary ? e.received_date : e.payment_date;
                                const rKey = getDateKey(rDate);
                                const target = parseINR(e.amount) * (percentage / 100);

                                // Paid check: Was this specific payment received BY the report cutoff?
                                const paidByNow = rKey > 0 && (isPrimary ? rKey <= cutoffKey : true);

                                if (paidByNow) {
                                    const dataArray = getSplitData(e.splits, accName);
                                    if (dataArray !== null) {
                                        const paidAmt = dataArray.reduce((s, item) => s + (Number(item.amount) || 0) + (Number(item.tds) || 0), 0);
                                        return sum + Math.max(0, target - paidAmt);
                                    } else {
                                        return sum; // Fully received
                                    }
                                } else {
                                    return sum + target; // Not received yet
                                }
                            }
                            return sum;
                        }, 0);
                    };

                    rowData.push(getPaidShare(loan.primary_account_name, effectivePrimaryPercentage, true));
                    for (let i = 0; i < maxTotalAccs - 1; i++) {
                        if (secAccs[i]) {
                            rowData.push(getPaidShare(secAccs[i].account_name, secAccs[i].percentage || 0, false));
                        } else { rowData.push(''); }
                    }

                    rowData.push(getOsShare(loan.primary_account_name, effectivePrimaryPercentage, true));
                    for (let i = 0; i < maxTotalAccs - 1; i++) {
                        if (secAccs[i]) {
                            rowData.push(getOsShare(secAccs[i].account_name, secAccs[i].percentage || 0, false));
                        } else { rowData.push(''); }
                    }

                    const currentOverdueCount = schedule.filter(e => {
                        const dKey = getDateKey(e.date);
                        const rKey = getDateKey(e.received_date);
                        const noDateByNow = rKey === 0 || rKey > cutoffKey;
                        return dKey > 0 && dKey <= cutoffKey && noDateByNow && parseINR(e.amount) > 0;
                    }).length;

                    const totalDueCount = schedule.filter(e => parseINR(e.amount) > 0).length;
                    const receivedDueCount = schedule.filter(e => parseINR(e.amount) > 0 && !hasRowBalance(e, loan)).length;

                    rowData.push(totalDueCount, receivedDueCount, currentOverdueCount, statusInfo.label);

                    const dataRow = worksheet.getRow(idx + 2);
                    dataRow.values = rowData;
                    for (let i = 1; i <= rowData.length; i++) {
                        const cell = dataRow.getCell(i);
                        cell.border = thickBorder;
                        cell.font = { name: 'Trebuchet MS', size: 10 };
                        if (typeof rowData[i - 1] === 'number') {
                            cell.numFmt = '#,##0';
                            // Center align count columns, right align amount columns
                            if (['TOTAL DUE', 'RECEIVED DUE', 'OVER DUE'].includes(headers[i - 1])) {
                                cell.alignment = { horizontal: 'center' };
                            } else {
                                cell.alignment = { horizontal: 'right' };
                            }
                        } else {
                            cell.alignment = { horizontal: 'center' };
                        }
                        if (headers[i - 1] === 'Status') {
                            cell.font.bold = true;
                            if (statusInfo.label === 'Overdue') { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }; cell.font.color = { argb: 'FFFFFFFF' }; }
                            else if (statusInfo.label === 'Active') { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }; }
                            else { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; }
                        }
                    }
                });

                worksheet.columns.forEach(column => {
                    column.width = 18;
                });
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const dateStr = selectedDate ? `_${selectedDate}` : '';
        anchor.download = `${reportPrefix}_${searchTerm || 'All'}${dateStr}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div ref={pageRef} className="h-[calc(100vh-64px)] w-full flex flex-col overflow-hidden">
            <main className="mx-auto p-8 flex-1 flex flex-col w-full min-h-0">
                {/* Header Section */}
                <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">JL Due Report</h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                            Overview of all pending and overdue accounts for the current billing cycle.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <select
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white w-64 appearance-none cursor-pointer pr-10"
                            >
                                <option value="">All Accounts</option>
                                <option value="SCS">Surge Capital Solutions - SCS</option>
                                <option value="GC">Growth Capital - GC</option>
                                <option value="FC">Finova Capital - FC</option>
                                <option value="AS">Ascend Solutions - AS</option>
                                <option value="ASE">AS Enterprises - ASE</option>
                                <option value="SCE">SC Enterprises - SCE</option>
                                <option value="ASQ">A Square Enterprises - ASQ</option>
                                <option value="SN">S Nirmala - SN</option>
                                <option value="FE">Fortune Enterprises - FE</option>
                                <option value="JC">Jubilant Capital - JC</option>
                                <option value="RP">Raja Priya - RP</option>
                            </select>
                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">expand_more</span>
                        </div>
                        <div className="relative">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white w-40 cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                        {(searchTerm || selectedDate) && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedDate('');
                                }}
                                className="h-9 px-3 text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                                title="Clear Filters"
                            >
                                <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
                            </button>
                        )}
                        <label className="h-9 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="file"
                                accept=".docx"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            <span className="material-symbols-outlined text-sm">upload_file</span>
                            Import
                        </label>
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
                                        onClick={() => handleExport('JL_Report')}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                                        JL Report
                                    </button>
                                    <button
                                        onClick={handleBendingExport}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2 border-t border-slate-200/50 dark:border-slate-700/50"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-amber-500">pending_actions</span>
                                        O/S Report
                                    </button>
                                </div>
                            )}
                        </div>
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
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Loan Date</th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Client Name</th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Pri Acc</th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Amount</th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Others</th>
                                            <th className="py-4 px-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50">Status</th>
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
                                                            {searchTerm || selectedDate
                                                                ? "We couldn't find any loans matching your current search or date filters. Try adjusting your criteria."
                                                                : "There are no loan records to display based on your access level or account activity."}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : currentData.map((row) => (
                                            <tr
                                                key={row.id}
                                                onClick={() => {
                                                    if (searchTerm || selectedDate) {
                                                        setSelectedLoanId(row.id);
                                                    } else {
                                                        navigate(`/jl-due-report/${row.id}`);
                                                    }
                                                }}
                                                className="hover:bg-slate-50 dark:hover:bg-slate-800/25 transition-colors group cursor-pointer"
                                            >
                                                <td className="py-2 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                    {row.s_no}
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

            {/* Loan Detail Card Modal */}
            {selectedLoanId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setSelectedLoanId(null)}
                    />
                    {/* Card */}
                    <div className="relative w-[70%] max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col animate-in zoom-in-95 fade-in duration-200">
                        {/* Card Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                                Loan Detail
                            </span>
                            <button
                                onClick={() => setSelectedLoanId(null)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        {/* Card Content */}
                        <div className="flex-1 overflow-y-auto">
                            <LoanDetail loanId={selectedLoanId} onClose={() => setSelectedLoanId(null)} filterDate={selectedDate} />
                        </div>
                    </div>
                </div>
            )}

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

                            {uploadError && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-start gap-2 shadow-sm">
                                    <span className="material-symbols-outlined text-[20px]">error</span>
                                    <p className="font-medium pt-0.5">{uploadError}</p>
                                </div>
                            )}
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

            {/* Success Popup Modal */}
            {showSuccessPopup && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center p-8 animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <span className="material-symbols-outlined text-[40px]">check_circle</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Upload Successful!</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                            The document has been correctly extracted and all remaining accounts have been securely saved to the database.
                        </p>
                        <button
                            onClick={() => setShowSuccessPopup(false)}
                            className="w-full py-3 px-4 text-sm font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/50 dark:text-emerald-400 dark:hover:bg-emerald-900/60 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[18px]">done</span> Completed
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
