/**
 * Project: Accounts Team
 * Component: ShortLoan
 * Author: Dhinakaran Sekar
 * Email: dhinakaran.s@jubilantenterprises.in
 * Date: 2026-06-13
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';

const FOLLOWERS = ['ANAND', 'CHANDRU', 'GOWTHAM', 'JAYASEELAN', 'KOUSHIK', 'MANIKANDAN', 'SUDHAKAR', 'VEERAPPAN'];
const ACCOUNTS = ['AS', 'ASQ', 'JC', 'NEXUS', 'RE', 'SCS', 'SENTHIL VADIVEL', 'SN'];

const calculateDaysRecd = (dateStr, closeDateStr) => {
    if (!dateStr) return 0;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 0;
    const loanDate = new Date(parts[0], parts[1] - 1, parts[2]);
    loanDate.setHours(0, 0, 0, 0);

    let endDate = new Date();
    if (closeDateStr) {
        const closeParts = closeDateStr.split('-');
        if (closeParts.length === 3) {
            endDate = new Date(closeParts[0], closeParts[1] - 1, closeParts[2]);
        }
    }
    endDate.setHours(0, 0, 0, 0);

    const diffTime = endDate.getTime() - loanDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
};

const getLastRenewalDate = (loan) => {
    if (!loan || !loan.renew_history) return loan?.loan_date || '';
    try {
        const history = JSON.parse(loan.renew_history);
        if (!Array.isArray(history) || history.length === 0) return loan.loan_date;
        const lastLog = history[history.length - 1];
        const match = lastLog.match(/to\s+(\d{2}-\d{2}-\d{4})/i);
        if (match && match[1]) {
            const parts = match[1].split('-');
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return loan.loan_date;
    } catch (e) {
        return loan.loan_date;
    }
};

const calculateInterestReceived = (renewHistory) => {
    if (!renewHistory) return 0;
    try {
        const history = JSON.parse(renewHistory);
        if (!Array.isArray(history)) return 0;
        let total = 0;
        for (const log of history) {
            if (log.includes("Loan Closed")) continue;
            // Avoid matching dates like 24-06-2026 by ensuring the dash is followed by rupee symbol (₹)
            const match = log.match(/-\s*(?:Paid\s*)?₹\s*([\d,.]+)/);
            if (match && match[1]) {
                const val = parseFloat(match[1].replace(/,/g, ''));
                if (!isNaN(val)) {
                    total += val;
                }
            }
        }
        return total;
    } catch (e) {
        return 0;
    }
};

const getTDSDetails = (renewHistory) => {
    let tdsAmount = 0;
    let tdsPercent = 0;
    if (renewHistory) {
        try {
            const history = JSON.parse(renewHistory);
            if (Array.isArray(history)) {
                for (let i = history.length - 1; i >= 0; i--) {
                    const entry = history[i];
                    const match = entry.match(/TDS\s*₹?\s*([\d,.]+)\s*\[([\d.]+)%\]\s*deducted/i);
                    if (match) {
                        tdsAmount = Math.round(parseFloat(match[1].replace(/,/g, '')));
                        tdsPercent = parseFloat(match[2]);
                        break;
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }
    return { tdsAmount, tdsPercent };
};

const getMonthsLabelRange = (startDateStr, endDateStr) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!startDateStr) {
        const now = new Date();
        return `${months[now.getMonth()]}-${String(now.getFullYear()).slice(-2)}`;
    }
    const endLimit = endDateStr || startDateStr;
    try {
        const start = new Date(startDateStr);
        const end = new Date(endLimit);
        let current = new Date(start.getFullYear(), start.getMonth(), 1);
        const last = new Date(end.getFullYear(), end.getMonth(), 1);
        const labelList = [];
        while (current <= last) {
            const mName = months[current.getMonth()];
            const yName = String(current.getFullYear()).slice(-2);
            labelList.push(`${mName}-${yName}`);
            current.setMonth(current.getMonth() + 1);
        }
        if (labelList.length > 0) {
            return labelList.join(', ');
        }
    } catch (e) {
        // ignore
    }
    const dObj = new Date(startDateStr);
    return `${months[dObj.getMonth()]}-${String(dObj.getFullYear()).slice(-2)}`;
};

const getInterestDaysIfOnlyInterest = (renewHistory) => {
    if (!renewHistory) return null;
    try {
        const history = JSON.parse(renewHistory);
        if (!Array.isArray(history) || history.length === 0) return null;
        let total = 0;
        for (const log of history) {
            const match = log.match(/(\d+)\s+days/i);
            if (!match) {
                // If any log doesn't specify days (e.g. partial principal), don't show days at all
                return null;
            }
            const val = parseInt(match[1], 10);
            if (!isNaN(val)) {
                total += val;
            }
        }
        return total;
    } catch (e) {
        return null;
    }
};

const calculateDailyInterest = (intPerDayPerLakh, loanAmount) => {
    if (!intPerDayPerLakh || !loanAmount) return 0;
    const cleanInt = Number(String(intPerDayPerLakh).replace(/,/g, ''));
    const cleanAmount = Number(String(loanAmount).replace(/,/g, ''));
    if (!cleanInt || !cleanAmount) return 0;
    return (cleanAmount / 100000) * cleanInt;
};

const addDaysToDate = (dateStr, days) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + days);
    
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const getLastInterestReceivedDate = (renewHistory) => {
    if (!renewHistory) return null;
    try {
        const history = JSON.parse(renewHistory);
        if (!Array.isArray(history)) return null;
        let lastDate = null;
        for (const log of history) {
            if (log.includes('Loan Closed')) continue;
            // Match "to DD-MM-YYYY" in interest-related entries
            const toMatch = log.match(/\bto\s+(\d{2}-\d{2}-\d{4})/i);
            if (toMatch && toMatch[1]) {
                const parts = toMatch[1].split('-');
                const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                if (!lastDate || isoDate > lastDate) {
                    lastDate = isoDate;
                }
            }
        }
        return lastDate;
    } catch (e) {
        return null;
    }
};

// Delay Days = days from max(tenureEndDate, lastInterestDate) to today.
// Closed loans always return 0.
const calculateDelayDays = (loanDate, tenureDays, renewHistory, closeDate, status) => {
    if (status === 'CLOSED') return 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const tenureEndDate = addDaysToDate(loanDate, Number(tenureDays || 0));
    const lastInterestDate = getLastInterestReceivedDate(renewHistory);
    // Start counting delay from whichever is later: tenure end OR last paid date
    const delayStart = (lastInterestDate && lastInterestDate > tenureEndDate)
        ? lastInterestDate
        : tenureEndDate;
    if (delayStart >= todayStr) return 0;
    return calculateDaysRecd(delayStart, todayStr);
};

const getPrincipalPayments = (renewHistory) => {
    const payments = [];
    if (!renewHistory) return payments;
    try {
        const history = JSON.parse(renewHistory);
        if (!Array.isArray(history)) return payments;
        for (const log of history) {
            if (log.includes("Loan Closed")) continue;
            if (log.includes('Partial Payment Received') || log.includes('Partial Principal Received')) {
                const dateMatch = log.match(/on\s+(\d{2}-\d{2}-\d{4})/i);
                const amountMatch = log.match(/-\s*₹\s*([\d,.]+)/);
                if (dateMatch && amountMatch) {
                    const parts = dateMatch[1].split('-');
                    const dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                    if (!isNaN(amount)) {
                        payments.push({ dateStr, amount });
                    }
                }
            }
        }
    } catch (e) {
        // ignore
    }
    payments.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    return payments;
};

const getRemainingPrincipal = (loanAmount, renewHistory) => {
    const payments = getPrincipalPayments(renewHistory);
    let principal = Number(String(loanAmount || 0).replace(/,/g, ''));
    for (const p of payments) {
        principal -= p.amount;
    }
    return Math.max(0, principal);
};

const calculateActualInterestReceived = (renewHistory) => {
    if (!renewHistory) return 0;
    try {
        const history = JSON.parse(renewHistory);
        if (!Array.isArray(history)) return 0;
        let total = 0;
        for (const log of history) {
            if (log.includes("Loan Closed")) continue;
            if (log.includes('Partial Payment Received') || log.includes('Partial Principal Received')) {
                continue;
            }
            const match = log.match(/-\s*(?:Paid\s*)?₹\s*([\d,.]+)/);
            if (match && match[1]) {
                const val = parseFloat(match[1].replace(/,/g, ''));
                if (!isNaN(val)) {
                    total += val;
                }
            }
        }
        return total;
    } catch (e) {
        return 0;
    }
};

const calculateShortLoanInterestDetails = (loanAmount, intPerDay, loanDate, closeDateStr, renewHistory) => {
    const grossDays = calculateDaysRecd(loanDate, closeDateStr);
    
    const upfrontMatch = renewHistory ? renewHistory.match(/Interest Collected Upfront.*?\s+(\d+)\s+days/i) : null;
    const upfrontDays = upfrontMatch ? parseInt(upfrontMatch[1], 10) : 0;
    
    const payments = getPrincipalPayments(renewHistory);
    
    const todayStr = new Date().toISOString().split('T')[0];
    let adjustedEndDateStr = closeDateStr || todayStr;
    if (grossDays < upfrontDays) {
        adjustedEndDateStr = addDaysToDate(loanDate, upfrontDays);
    }
    
    const segments = [];
    let currentDate = loanDate;
    let currentPrincipal = Number(String(loanAmount || 0).replace(/,/g, ''));
    
    for (const payment of payments) {
        if (payment.dateStr > currentDate && payment.dateStr < adjustedEndDateStr) {
            const days = calculateDaysRecd(currentDate, payment.dateStr);
            segments.push({
                startDate: currentDate,
                endDate: payment.dateStr,
                principal: currentPrincipal,
                days: days
            });
            currentPrincipal = Math.max(0, currentPrincipal - payment.amount);
            currentDate = payment.dateStr;
        }
    }
    
    const finalDays = calculateDaysRecd(currentDate, adjustedEndDateStr);
    segments.push({
        startDate: currentDate,
        endDate: adjustedEndDateStr,
        principal: currentPrincipal,
        days: finalDays
    });
    
    let grossInterest = 0;
    for (const seg of segments) {
        if (seg.days > 0 && seg.principal > 0) {
            grossInterest += seg.days * calculateDailyInterest(intPerDay, seg.principal);
        }
    }
    
    let remainingUpfront = upfrontDays;
    let accruedInterest = 0;
    for (const seg of segments) {
        let activeDays = seg.days;
        if (remainingUpfront > 0) {
            if (activeDays <= remainingUpfront) {
                remainingUpfront -= activeDays;
                activeDays = 0;
            } else {
                activeDays -= remainingUpfront;
                remainingUpfront = 0;
            }
        }
        if (activeDays > 0 && seg.principal > 0) {
            accruedInterest += activeDays * calculateDailyInterest(intPerDay, seg.principal);
        }
    }
    
    return { grossInterest, accruedInterest };
};

const calculateAccruedInterest = (loanAmount, intPerDay, loanDate, closeDateStr, renewHistory) => {
    const { accruedInterest } = calculateShortLoanInterestDetails(loanAmount, intPerDay, loanDate, closeDateStr, renewHistory);
    return accruedInterest;
};

const calculateGrossInterest = (loanAmount, intPerDay, loanDate, closeDateStr, renewHistory) => {
    const { grossInterest } = calculateShortLoanInterestDetails(loanAmount, intPerDay, loanDate, closeDateStr, renewHistory);
    return grossInterest;
};


const calculateTotalRepayable = (loanAmount, intPerDay, loanDate, closeDateStr, renewHistory, status) => {
    if (status === 'CLOSED') return 0;
    const { grossInterest } = calculateShortLoanInterestDetails(loanAmount, intPerDay, loanDate, closeDateStr, renewHistory);
    const interestReceivedVal = calculateInterestReceived(renewHistory);
    return Math.max(0, (Number(String(loanAmount || 0).replace(/,/g, '')) + grossInterest) - interestReceivedVal);
};

const ShortLoan = ({ user }) => {
    const [loans, setLoans] = useState([]);
    const userPermissions = useMemo(() => {
        if (!user) return [];
        let perms = user.permissions;
        if (typeof perms === 'string') {
            try {
                perms = JSON.parse(perms);
            } catch (e) {
                perms = [];
            }
        }
        return Array.isArray(perms) ? perms : [];
    }, [user]);

    const allowedAccounts = useMemo(() => {
        if (user?.role === 'admin') return ACCOUNTS;
        return ACCOUNTS.filter(acc => userPermissions.some(p => p.toUpperCase().trim() === acc.toUpperCase().trim()));
    }, [user, userPermissions]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
    const [followerFilter, setFollowerFilter] = useState('ALL');
    const [isFollowerFilterDropdownOpen, setIsFollowerFilterDropdownOpen] = useState(false);
    const [accountFilter, setAccountFilter] = useState('ALL');
    const [isAccountFilterDropdownOpen, setIsAccountFilterDropdownOpen] = useState(false);
    const [tdsFilter, setTdsFilter] = useState('ALL');
    const [isTdsFilterDropdownOpen, setIsTdsFilterDropdownOpen] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarViewDate, setCalendarViewDate] = useState(new Date());
    const calendarRef = useRef(null);
    const exportDropdownRef = useRef(null);
    const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [selectedLoan, setSelectedLoan] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'loan_date', direction: 'desc' });
    const [editFormData, setEditFormData] = useState({});
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [isCreateFollowerDropdownOpen, setIsCreateFollowerDropdownOpen] = useState(false);
    const [isCreateAccountDropdownOpen, setIsCreateAccountDropdownOpen] = useState(false);
    const [isEditFollowerDropdownOpen, setIsEditFollowerDropdownOpen] = useState(false);
    const [isEditAccountDropdownOpen, setIsEditAccountDropdownOpen] = useState(false);
    const [openRowDropdownId, setOpenRowDropdownId] = useState(null);
    const [showCloseConfirm, setShowCloseConfirm] = useState(null);
    const [closeDate, setCloseDate] = useState('');
    const [deductTDS, setDeductTDS] = useState(false);
    const [tdsPercentage, setTdsPercentage] = useState('');
    const [closeModalError, setCloseModalError] = useState(null);
    const [showRenewConfirm, setShowRenewConfirm] = useState(null);
    const [renewDate, setRenewDate] = useState('');
    const [renewAmount, setRenewAmount] = useState('');
    const [renewType, setRenewType] = useState('INTEREST');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
    const [formData, setFormData] = useState({
        loan_id: '',
        client_name: '',
        loan_amount: '',
        int_per_day: '',
        loan_date: '',
        days: '',
        days_received: '',
        remarks: '',
        follower: '',
        account: '',
        interest_collected: false
    });
    const itemsPerPage = 10;

    const API_URL = '/api';

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
    ];

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

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (calendarRef.current && !calendarRef.current.contains(event.target)) {
                setIsCalendarOpen(false);
            }
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
                setIsExportDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        fetchLoans();
    }, []);

    const fetchLoans = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/short-loans`);
            const data = await res.json();
            if (data.success) {
                const enriched = (data.loans || []).map(loan => {
                    const os = calculateDaysRecd(loan.loan_date) - Number(loan.days || 0);
                    const raw_status = loan.status || 'ACTIVE';
                    if (loan.status !== 'CLOSED' && os > 0) {
                        return { ...loan, raw_status, status: 'OVERDUE' };
                    }
                    return { ...loan, raw_status };
                });
                setLoans(enriched);
            }
        } catch (err) {
            console.error('Error fetching short loans:', err);
            setError('Failed to load short loans.');
        } finally {
            setLoading(false);
        }
    };

    const parseHistoryLog = (log) => {
        const pipeIdx = log.lastIndexOf(' | ');
        const text = pipeIdx !== -1 ? log.slice(0, pipeIdx) : log;
        const timestamp = pipeIdx !== -1 ? log.slice(pipeIdx + 3) : '';
        
        let type = 'Payment';
        let periodOrDate = '';
        let amount = 0;
        
        const matchAmt = log.match(/-\s*(?:Paid\s*)?₹?\s*([\d,.]+)(?:\s*\|.*)?$/);
        if (matchAmt && matchAmt[1]) {
            amount = parseFloat(matchAmt[1].replace(/,/g, '')) || 0;
        }
        
        if (log.includes('Interest Collected Upfront')) {
            type = 'Upfront Interest';
            const periodMatch = log.match(/from\s+(\d{2}-\d{2}-\d{4})\s+to\s+(\d{2}-\d{2}-\d{4})/i);
            const daysMatch = log.match(/(\d+)\s+days/i);
            if (periodMatch) {
                periodOrDate = `${periodMatch[1]} to ${periodMatch[2]}${daysMatch ? ` (${daysMatch[1]} days)` : ''}`;
            } else {
                periodOrDate = daysMatch ? `${daysMatch[1]} days` : '';
            }
        } else if (log.includes('Loan Created')) {
            type = 'Loan Creation';
            periodOrDate = '';
        } else if (log.includes('Partial Interest Received')) {
            type = 'Partial Interest';
            const periodMatch = log.match(/from\s+(\d{2}-\d{2}-\d{4})\s+to\s+(\d{2}-\d{2}-\d{4})/i);
            if (periodMatch) {
                periodOrDate = `${periodMatch[1]} to ${periodMatch[2]}`;
            }
        } else if (log.includes('Interest Received')) {
            type = 'Interest Renewal';
            const periodMatch = log.match(/from\s+(\d{2}-\d{2}-\d{4})\s+to\s+(\d{2}-\d{2}-\d{4})/i);
            const daysMatch = log.match(/(\d+)\s+days/i);
            if (periodMatch) {
                periodOrDate = `${periodMatch[1]} to ${periodMatch[2]}${daysMatch ? ` (${daysMatch[1]} days)` : ''}`;
            } else {
                periodOrDate = daysMatch ? `${daysMatch[1]} days` : '';
            }
        } else if (log.includes('Partial Payment Received') || log.includes('Partial Principal Received')) {
            type = 'Partial Principal';
            const dateMatch = log.match(/on\s+(\d{2}-\d{2}-\d{4})/i);
            periodOrDate = dateMatch ? dateMatch[1] : '';
        } else if (log.includes('Loan Closed')) {
            type = 'Loan Closure';
            const dateMatch = log.match(/on\s+(\d{2}-\d{2}-\d{4})/i);
            periodOrDate = dateMatch ? dateMatch[1] : '';
        } else {
            periodOrDate = text;
        }
        
        return { type, periodOrDate, amount, timestamp };
    };

    const handleExportPayments = async () => {
        setIsExportDropdownOpen(false);
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Payment List');
            
            // Predefined list of standard accounts in ascending order
            const accountSet = new Set(['AS', 'ASE', 'ASQ', 'JC', 'NEXUS', 'RE', 'SCE', 'SCS', 'SENTHIL VADIVEL', 'SN']);
            
            let exportLoans = [...filteredLoans];
            if (!startDate) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const startOfCurrentMonth = `${year}-${month}-01`;
                const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
                const endOfCurrentMonth = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                
                exportLoans = filteredLoans.filter(loan => {
                    return loan.loan_date && loan.loan_date >= startOfCurrentMonth && loan.loan_date <= endOfCurrentMonth;
                });
            }

            exportLoans.forEach(loan => {
                if (loan.account) {
                    accountSet.add(loan.account.toUpperCase().trim());
                }
            });

            // Since we want to merge ASQ and RE into JC, delete them from accountSet
            accountSet.delete('ASQ');
            accountSet.delete('RE');
            // Merge ASE into AS, delete ASE from accountSet
            accountSet.delete('ASE');
            // Merge SCE into SCS, delete SCE from accountSet
            accountSet.delete('SCE');

            // Sort all collected account names ascending alphabetically
            const sortedAccounts = Array.from(accountSet).sort((a, b) => a.localeCompare(b));

            // Set column definitions dynamically
            const worksheetColumns = [
                { key: 'sno', width: 8 },
                { key: 'date', width: 15 },
                { key: 'loan_id', width: 18 },
                { key: 'client', width: 35 },
                { key: 'follower', width: 20 }
            ];
            sortedAccounts.forEach(acc => {
                worksheetColumns.push({ key: acc.toLowerCase(), width: 15 });
            });
            worksheet.columns = worksheetColumns;

            const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            const mediumBorder = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
            const headerGrayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };

            const monthLabel = getMonthsLabelRange(startDate, endDate);

            const titleRow = worksheet.getRow(1);
            titleRow.height = 30;

            const titleCell = worksheet.getCell('C1');
            titleCell.value = monthLabel;
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
            titleCell.font = { color: { argb: 'FFFF0000' }, bold: true, name: 'Trebuchet MS', size: 10 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.border = thinBorder;

            worksheet.getRow(2).height = 15;

            const headerRow = worksheet.getRow(3);
            headerRow.height = 24;
            const headers = ['S.No', 'DATE', 'LOAN ID', 'CLIENT', 'FOLLOWER', ...sortedAccounts];
            headers.forEach((h, idx) => {
                const cell = headerRow.getCell(idx + 1);
                cell.value = h;
                cell.fill = headerGrayFill;
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Trebuchet MS', size: 10 };
                cell.border = thinBorder;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            const groups = {};
            exportLoans.forEach(loan => {
                const dateStr = loan.loan_date ? loan.loan_date.split('-').reverse().join('-') : '';
                const client = (loan.client_name || '').toUpperCase().trim();
                const key = `${dateStr}_${client}`;
                if (!groups[key]) {
                    groups[key] = {
                        date: dateStr,
                        loan_ids: [],
                        client: client,
                        follower: (loan.follower || '').toUpperCase().trim(),
                        amounts: {}
                    };
                    sortedAccounts.forEach(acc => {
                        groups[key].amounts[acc] = 0;
                    });
                }
                if (loan.loan_id && !groups[key].loan_ids.includes(loan.loan_id)) {
                    groups[key].loan_ids.push(loan.loan_id);
                }
                let acc = (loan.account || '').toUpperCase().trim();
                if (acc === 'ASQ' || acc === 'RE') {
                    acc = 'JC';
                } else if (acc === 'ASE') {
                    acc = 'AS';
                } else if (acc === 'SCE') {
                    acc = 'SCS';
                }
                const amt = Number(loan.loan_amount || 0);
                
                let matchedAcc = sortedAccounts.find(a => acc === a);
                if (!matchedAcc) {
                    matchedAcc = sortedAccounts.find(a => a.includes(acc) || acc.includes(a));
                }
                if (!matchedAcc) {
                    matchedAcc = 'AS';
                }
                if (!groups[key].amounts[matchedAcc]) {
                    groups[key].amounts[matchedAcc] = 0;
                }
                groups[key].amounts[matchedAcc] += amt;
            });

            const parseDateDMY = (dStr) => {
                if (!dStr) return 0;
                const parts = dStr.split('-');
                if (parts.length === 3) {
                    return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
                }
                return 0;
            };

            const sortedGroups = Object.values(groups).sort((a, b) => {
                const timeA = parseDateDMY(a.date);
                const timeB = parseDateDMY(b.date);
                if (timeA !== timeB) return timeA - timeB;
                return a.client.localeCompare(b.client);
            });

            let listCount = 0;
            let currentExcelRow = 4;

            sortedGroups.forEach((g) => {
                listCount++;
                const row = worksheet.getRow(currentExcelRow);
                row.height = 20;

                const rowValues = [
                    listCount,
                    g.date,
                    g.loan_ids.join(', ') || '—',
                    g.client,
                    g.follower
                ];
                sortedAccounts.forEach(acc => {
                    rowValues.push(g.amounts[acc] || null);
                });

                rowValues.forEach((val, idx) => {
                    const cell = row.getCell(idx + 1);
                    cell.value = val;
                    cell.border = thinBorder;
                    cell.font = { name: 'Trebuchet MS', size: 10 };
                    if (idx === 0 || idx === 1 || idx === 2) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else if (idx === 3 || idx === 4) {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    } else if (idx >= 5) {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                        if (val !== null) {
                            cell.numFmt = '#,##0';
                        }
                    }
                });

                currentExcelRow++;
            });

            const totalRow = worksheet.getRow(currentExcelRow);
            totalRow.height = 22;

            worksheet.mergeCells(`A${currentExcelRow}:E${currentExcelRow}`);
            const totalLabelCell = worksheet.getCell(`A${currentExcelRow}`);
            totalLabelCell.value = 'TOTAL';
            totalLabelCell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
            totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

            worksheet.getCell(`A${currentExcelRow}`).border = thinBorder;
            worksheet.getCell(`B${currentExcelRow}`).border = thinBorder;
            worksheet.getCell(`C${currentExcelRow}`).border = thinBorder;
            worksheet.getCell(`D${currentExcelRow}`).border = thinBorder;
            worksheet.getCell(`E${currentExcelRow}`).border = thinBorder;

            const getColLetter = (colIdx) => {
                let temp = colIdx;
                let letter = '';
                while (temp > 0) {
                    let modulo = (temp - 1) % 26;
                    letter = String.fromCharCode(65 + modulo) + letter;
                    temp = Math.floor((temp - modulo) / 26);
                }
                return letter;
            };

            const lastDataRow = currentExcelRow > 4 ? currentExcelRow - 1 : 4;
            for (let i = 0; i < sortedAccounts.length; i++) {
                const colIdx = 6 + i;
                const colLetter = getColLetter(colIdx);
                const cell = totalRow.getCell(colIdx);
                cell.value = { formula: `=SUM(${colLetter}4:${colLetter}${lastDataRow})` };
                cell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.numFmt = '#,##0';
                cell.border = thinBorder;
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const dateStr = new Date().toISOString().split('T')[0].split('-').reverse().join('-');
            anchor.download = `Short_Loans_Payment_List_${dateStr}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export Payments Error:", error);
            setError("Failed to export Payments List.");
        }
    };

    const handleExportBending = async () => {
        setIsExportDropdownOpen(false);
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Pending List');
            
            let exportLoans = loans.filter(loan => {
                if (user?.role !== 'admin') {
                    const loanAcc = (loan.account || '').toUpperCase().trim();
                    const hasPerm = userPermissions.some(p => p.toUpperCase().trim() === loanAcc);
                    if (!hasPerm) return false;
                }
                let matchesSearch = true;
                if (searchTerm) {
                    const term = searchTerm.toLowerCase();
                    matchesSearch = (
                        (loan.client_name || loan.borrower_name || '').toLowerCase().includes(term) ||
                        String(loan.loan_amount || '').includes(term)
                    );
                }
                let matchesStatus = loan.status === 'OVERDUE';
                let matchesFollower = followerFilter !== 'ALL' ? (loan.follower || '').toUpperCase() === followerFilter.toUpperCase() : true;
                let matchesAccount = accountFilter !== 'ALL' ? (loan.account || '').toUpperCase() === accountFilter.toUpperCase() : true;
                let matchesDateRange = true;
                if (startDate || endDate) {
                    if (!loan.loan_date) matchesDateRange = false;
                    else {
                        if (startDate && loan.loan_date < startDate) matchesDateRange = false;
                        if (endDate && loan.loan_date > endDate) matchesDateRange = false;
                    }
                }
                return matchesSearch && matchesStatus && matchesFollower && matchesAccount && matchesDateRange;
            });

            if (exportLoans.length === 0) {
                setError("No pending loans for the selected month");
                return;
            }

            const accountSet = new Set(['AS', 'ASE', 'ASQ', 'JC', 'NEXUS', 'RE', 'SCE', 'SCS', 'SENTHIL VADIVEL', 'SN']);
            exportLoans.forEach(loan => { if (loan.account) accountSet.add(loan.account.toUpperCase().trim()); });

            accountSet.delete('ASQ'); accountSet.delete('RE');
            accountSet.delete('ASE'); accountSet.delete('SCE');

            const sortedAccounts = Array.from(accountSet).sort((a, b) => a.localeCompare(b));

            const worksheetColumns = [
                { key: 'sno', width: 8 },
                { key: 'date', width: 15 },
                { key: 'loan_id', width: 18 },
                { key: 'client', width: 35 },
                { key: 'follower', width: 20 },
                { key: 'loan_amount', width: 15 },
                { key: 'tenure_days', width: 15 },
                { key: 'actual_days', width: 15 },
                { key: 'delay_days', width: 15 }
            ];
            sortedAccounts.forEach(acc => worksheetColumns.push({ key: acc.toLowerCase(), width: 15 }));
            worksheet.columns = worksheetColumns;

            const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            const headerGrayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };

            const monthLabel = getMonthsLabelRange(startDate, endDate);

            const titleRow = worksheet.getRow(1);
            titleRow.height = 30;
            const titleCell = worksheet.getCell('C1');
            titleCell.value = monthLabel;
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
            titleCell.font = { color: { argb: 'FFFF0000' }, bold: true, name: 'Trebuchet MS', size: 10 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.border = thinBorder;

            worksheet.getRow(2).height = 15;
            const headerRow = worksheet.getRow(3);
            headerRow.height = 24;
            const headers = ['S.No', 'DATE', 'LOAN ID', 'CLIENT', 'FOLLOWER', 'LOAN AMOUNT', 'TENURE DAYS', 'ACTUAL DAYS', 'DELAY DAYS', ...sortedAccounts];
            headers.forEach((h, idx) => {
                const cell = headerRow.getCell(idx + 1);
                cell.value = h;
                cell.fill = headerGrayFill;
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Trebuchet MS', size: 10 };
                cell.border = thinBorder;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            const groups = {};
            exportLoans.forEach(loan => {
                const dateStr = loan.loan_date ? loan.loan_date.split('-').reverse().join('-') : '';
                const key = loan.id;
                if (!groups[key]) {
                    groups[key] = {
                        date: dateStr,
                        loan_id: loan.loan_id || '—',
                        client: (loan.client_name || '').toUpperCase().trim(),
                        follower: (loan.follower || '').toUpperCase().trim(),
                        loanAmount: Number(loan.loan_amount || 0),
                        tenureDays: Number(loan.days || 0),
                        actualDays: calculateDaysRecd(loan.loan_date, null),
                        delayDays: calculateDelayDays(loan.loan_date, loan.days, loan.renew_history, loan.close_date, loan.status),
                        amounts: {}
                    };
                    sortedAccounts.forEach(acc => { groups[key].amounts[acc] = 0; });
                }
                let acc = (loan.account || '').toUpperCase().trim();
                if (acc === 'ASQ' || acc === 'RE') acc = 'JC';
                else if (acc === 'ASE') acc = 'AS';
                else if (acc === 'SCE') acc = 'SCS';
                const amt = Number(loan.loan_amount || 0);
                let matchedAcc = sortedAccounts.find(a => acc === a) || sortedAccounts.find(a => a.includes(acc) || acc.includes(a)) || 'AS';
                groups[key].amounts[matchedAcc] = (groups[key].amounts[matchedAcc] || 0) + amt;
            });

            const sortedGroups = Object.values(groups).sort((a, b) => a.client.localeCompare(b.client));
            let listCount = 0;
            let currentExcelRow = 4;
            sortedGroups.forEach((g) => {
                listCount++;
                const row = worksheet.getRow(currentExcelRow);
                row.height = 20;
                const rowValues = [listCount, g.date, g.loan_id, g.client, g.follower, g.loanAmount, g.tenureDays, g.actualDays, g.delayDays, ...sortedAccounts.map(acc => g.amounts[acc] || null)];
                rowValues.forEach((val, idx) => {
                    const cell = row.getCell(idx + 1);
                    cell.value = val;
                    cell.border = thinBorder;
                    cell.font = { name: 'Trebuchet MS', size: 10 };
                    if ([0, 1, 2, 6, 7, 8].includes(idx)) cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    else if ([3, 4].includes(idx)) cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    else {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                        if (val !== null) cell.numFmt = '#,##0';
                    }
                });
                currentExcelRow++;
            });

            const totalRow = worksheet.getRow(currentExcelRow);
            totalRow.height = 22;
            worksheet.mergeCells(`A${currentExcelRow}:E${currentExcelRow}`);
            const totalLabelCell = worksheet.getCell(`A${currentExcelRow}`);
            totalLabelCell.value = 'TOTAL';
            totalLabelCell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
            totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
            ['A', 'B', 'C', 'D', 'E'].forEach(col => worksheet.getCell(`${col}${currentExcelRow}`).border = thinBorder);
            
            const getColLetter = (colIdx) => {
                let temp = colIdx, letter = '';
                while (temp > 0) {
                    let modulo = (temp - 1) % 26;
                    letter = String.fromCharCode(65 + modulo) + letter;
                    temp = Math.floor((temp - modulo) / 26);
                }
                return letter;
            };

            const lastDataRow = currentExcelRow - 1;
            // Total for LOAN AMOUNT (col 6)
            const loanAmtTotalCell = totalRow.getCell(6);
            loanAmtTotalCell.value = { formula: `=SUM(F4:F${lastDataRow})` };
            loanAmtTotalCell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
            loanAmtTotalCell.alignment = { horizontal: 'right', vertical: 'middle' };
            loanAmtTotalCell.numFmt = '#,##0';
            loanAmtTotalCell.border = thinBorder;

            // Empty cells for tenure, actual and delay days with borders
            totalRow.getCell(7).border = thinBorder;
            totalRow.getCell(8).border = thinBorder;
            totalRow.getCell(9).border = thinBorder;

            // Total for each account column (starting at col 10)
            for (let i = 0; i < sortedAccounts.length; i++) {
                const colIdx = 10 + i;
                const colLetter = getColLetter(colIdx);
                const cell = totalRow.getCell(colIdx);
                cell.value = { formula: `=SUM(${colLetter}4:${colLetter}${lastDataRow})` };
                cell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.numFmt = '#,##0';
                cell.border = thinBorder;
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `Pending_List_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
        } catch (error) {
            console.error("Export Pending Error:", error);
            setError("Failed to export Pending List.");
        }
    };

    const handleExportTDS = async () => {
        setIsExportDropdownOpen(false);
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('TDS List');

            let exportLoans = [...filteredLoans];
            let startLimit = startDate;
            let endLimit = endDate;
            if (!startLimit) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                startLimit = `${year}-${month}-01`;
                const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
                endLimit = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
            }

            exportLoans = exportLoans.filter(loan => {
                if (loan.status !== 'CLOSED' || !loan.close_date) return false;
                if (loan.close_date < startLimit || loan.close_date > endLimit) return false;
                const { tdsAmount } = getTDSDetails(loan.renew_history);
                return tdsAmount > 0;
            });

            if (exportLoans.length === 0) {
                setError("No TDS records found for the selected month");
                return;
            }

            worksheet.columns = [
                { key: 'sno', width: 8 },
                { key: 'date', width: 15 },
                { key: 'loan_id', width: 18 },
                { key: 'client', width: 30 },
                { key: 'follower', width: 20 },
                { key: 'acc', width: 10 },
                { key: 'principal', width: 18 },
                { key: 'interest', width: 18 },
                { key: 'repayment', width: 18 },
                { key: 'received', width: 18 },
                { key: 'tds', width: 18 }
            ];

            const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            const headerGrayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };

            const monthLabel = getMonthsLabelRange(startDate, endDate);

            const titleRow = worksheet.getRow(1);
            titleRow.height = 30;

            worksheet.mergeCells('C1:D1');
            const titleCell = worksheet.getCell('C1');
            titleCell.value = monthLabel;
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
            titleCell.font = { color: { argb: 'FFFF0000' }, bold: true, name: 'Trebuchet MS', size: 10 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.border = thinBorder;

            worksheet.getRow(2).height = 15;

            const headerRow = worksheet.getRow(3);
            headerRow.height = 24;
            const headers = ['S.No', 'DATE', 'LOAN ID', 'CLIENT', 'FOLLOWER', 'ACC', 'PRINCIPAL', 'INTEREST', 'REPAYMENT', 'RECEIVED', 'TDS'];
            headers.forEach((h, idx) => {
                const cell = headerRow.getCell(idx + 1);
                cell.value = h;
                cell.fill = headerGrayFill;
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Trebuchet MS', size: 10 };
                cell.border = thinBorder;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            // Sort loans by close date ascending
            const sortedLoans = [...exportLoans].sort((a, b) => a.close_date.localeCompare(b.close_date));

            let listCount = 0;
            let currentExcelRow = 4;

            sortedLoans.forEach((loan) => {
                listCount++;
                const row = worksheet.getRow(currentExcelRow);
                row.height = 20;

                const closeDateStr = loan.close_date ? loan.close_date.split('-').reverse().join('-') : '';
                const { tdsAmount } = getTDSDetails(loan.renew_history);
                const principal = Number(loan.loan_amount || 0);
                const interest = calculateGrossInterest(loan.loan_amount, loan.int_per_day, loan.loan_date, loan.close_date, loan.renew_history);
                const repayment = principal + interest;
                const received = repayment - tdsAmount;

                const rowValues = [
                     listCount,
                     closeDateStr,
                     loan.loan_id || '—',
                     (loan.client_name || '').toUpperCase().trim(),
                     (loan.follower || '').toUpperCase().trim(),
                     (loan.account || '').toUpperCase().trim(),
                     principal,
                     interest,
                     repayment,
                     received,
                     tdsAmount
                 ];
 
                 rowValues.forEach((val, idx) => {
                     const cell = row.getCell(idx + 1);
                     cell.value = val;
                     cell.border = thinBorder;
                     cell.font = { name: 'Trebuchet MS', size: 10 };
                     if (idx >= 0 && idx <= 2) {
                         cell.alignment = { horizontal: 'center', vertical: 'middle' };
                     } else if (idx >= 3 && idx <= 4) {
                         cell.alignment = { horizontal: 'left', vertical: 'middle' };
                     } else if (idx === 5) {
                         cell.alignment = { horizontal: 'center', vertical: 'middle' };
                     } else if (idx >= 6) {
                         cell.alignment = { horizontal: 'right', vertical: 'middle' };
                         cell.numFmt = '#,##0';
                     }
                 });
 
                currentExcelRow++;
            });

            // Add TOTAL Row
            const totalRow = worksheet.getRow(currentExcelRow);
            totalRow.height = 22;

            worksheet.mergeCells(`A${currentExcelRow}:F${currentExcelRow}`);
            const totalLabelCell = worksheet.getCell(`A${currentExcelRow}`);
            totalLabelCell.value = 'TOTAL';
            totalLabelCell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
            totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

            for (let c = 1; c <= 6; c++) {
                totalRow.getCell(c).border = thinBorder;
            }

            const getColLetter = (colIdx) => {
                let temp = colIdx;
                let letter = '';
                while (temp > 0) {
                    let modulo = (temp - 1) % 26;
                    letter = String.fromCharCode(65 + modulo) + letter;
                    temp = Math.floor((temp - modulo) / 26);
                }
                return letter;
            };

            // Formulas for numeric columns G, H, I, J, K (7 to 11)
            for (let c = 7; c <= 11; c++) {
                const colLetter = getColLetter(c);
                const cell = totalRow.getCell(c);
                cell.value = { formula: `=SUM(${colLetter}4:${colLetter}${currentExcelRow - 1})` };
                cell.border = thinBorder;
                cell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.numFmt = '#,##0';
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const dateStr = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
            anchor.download = `Short_Loans_TDS_Report_${dateStr}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            setError("Failed to export TDS Report.");
        }
    };

    const handleExportInterestPending = async () => {
        setIsExportDropdownOpen(false);
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Interest Pending List');
            
            let exportLoans = loans.filter(loan => {
                if (user?.role !== 'admin') {
                    const loanAcc = (loan.account || '').toUpperCase().trim();
                    const hasPerm = userPermissions.some(p => p.toUpperCase().trim() === loanAcc);
                    if (!hasPerm) return false;
                }
                let matchesSearch = true;
                if (searchTerm) {
                    const term = searchTerm.toLowerCase();
                    matchesSearch = (
                        (loan.client_name || loan.borrower_name || '').toLowerCase().includes(term) ||
                        String(loan.loan_amount || '').includes(term)
                    );
                }

                let matchesStatus = loan.status !== 'CLOSED';

                let matchesFollower = true;
                if (followerFilter !== 'ALL') {
                    matchesFollower = (loan.follower || '').toUpperCase() === followerFilter.toUpperCase();
                }

                let matchesAccount = true;
                if (accountFilter !== 'ALL') {
                    matchesAccount = (loan.account || '').toUpperCase() === accountFilter.toUpperCase();
                }

                let matchesDateRange = true;
                if (startDate || endDate) {
                    if (!loan.loan_date) {
                        matchesDateRange = false;
                    } else {
                        if (startDate && loan.loan_date < startDate) matchesDateRange = false;
                        if (endDate && loan.loan_date > endDate) matchesDateRange = false;
                    }
                }

                const pendingInterest = Math.max(0, calculateAccruedInterest(loan.loan_amount, loan.int_per_day, loan.loan_date, null, loan.renew_history) - calculateActualInterestReceived(loan.renew_history));
                const hasPendingInterest = Math.round(pendingInterest) > 0;

                return matchesSearch && matchesStatus && matchesFollower && matchesAccount && matchesDateRange && hasPendingInterest;
            });

            if (exportLoans.length === 0) {
                setError("No pending interest records found");
                return;
            }

            const accountSet = new Set(['AS', 'ASE', 'ASQ', 'JC', 'NEXUS', 'RE', 'SCE', 'SCS', 'SENTHIL VADIVEL', 'SN']);
            
            exportLoans.forEach(loan => {
                if (loan.account) {
                    accountSet.add(loan.account.toUpperCase().trim());
                }
            });

            accountSet.delete('ASQ');
            accountSet.delete('RE');
            accountSet.delete('ASE');
            accountSet.delete('SCE');

            const sortedAccounts = Array.from(accountSet).sort((a, b) => a.localeCompare(b));

            const worksheetColumns = [
                { key: 'sno', width: 8 },
                { key: 'date', width: 15 },
                { key: 'loan_id', width: 18 },
                { key: 'client', width: 35 },
                { key: 'follower', width: 20 },
                { key: 'loan_amount', width: 15 },
                { key: 'tenure_days', width: 15 },
                { key: 'actual_days', width: 15 },
                { key: 'delay_days', width: 15 }
            ];
            sortedAccounts.forEach(acc => {
                worksheetColumns.push({ key: acc.toLowerCase(), width: 15 });
            });
            worksheet.columns = worksheetColumns;

            const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            const headerGrayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };

            const monthLabel = getMonthsLabelRange(startDate, endDate);

            const titleRow = worksheet.getRow(1);
            titleRow.height = 30;

            const titleCell = worksheet.getCell('C1');
            titleCell.value = monthLabel;
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
            titleCell.font = { color: { argb: 'FFFF0000' }, bold: true, name: 'Trebuchet MS', size: 10 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.border = thinBorder;

            worksheet.getRow(2).height = 15;

            const headerRow = worksheet.getRow(3);
            headerRow.height = 24;
            const headers = ['S.No', 'DATE', 'LOAN ID', 'CLIENT', 'FOLLOWER', 'LOAN AMOUNT', 'TENURE DAYS', 'ACTUAL DAYS', 'DELAY DAYS', ...sortedAccounts];
            headers.forEach((h, idx) => {
                const cell = headerRow.getCell(idx + 1);
                cell.value = h;
                cell.fill = headerGrayFill;
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Trebuchet MS', size: 10 };
                cell.border = thinBorder;
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            const groups = {};
            exportLoans.forEach(loan => {
                const dateStr = loan.loan_date ? loan.loan_date.split('-').reverse().join('-') : '';
                const client = (loan.client_name || '').toUpperCase().trim();
                const key = loan.id;
                if (!groups[key]) {
                    groups[key] = {
                        date: dateStr,
                        loan_id: loan.loan_id || '—',
                        client: client,
                        follower: (loan.follower || '').toUpperCase().trim(),
                        loanAmount: Number(loan.loan_amount || 0),
                        tenureDays: Number(loan.days || 0),
                        actualDays: calculateDaysRecd(loan.loan_date, null),
                        delayDays: calculateDelayDays(loan.loan_date, loan.days, loan.renew_history, loan.close_date, loan.status),
                        amounts: {}
                    };
                    sortedAccounts.forEach(acc => {
                        groups[key].amounts[acc] = 0;
                    });
                }
                let acc = (loan.account || '').toUpperCase().trim();
                if (acc === 'ASQ' || acc === 'RE') {
                    acc = 'JC';
                } else if (acc === 'ASE') {
                    acc = 'AS';
                } else if (acc === 'SCE') {
                    acc = 'SCS';
                }
                
                const pendingInterest = Math.max(0, calculateAccruedInterest(loan.loan_amount, loan.int_per_day, loan.loan_date, null, loan.renew_history) - calculateActualInterestReceived(loan.renew_history));

                let matchedAcc = sortedAccounts.find(a => acc === a);
                if (!matchedAcc) {
                    matchedAcc = sortedAccounts.find(a => a.includes(acc) || acc.includes(a));
                }
                if (!matchedAcc) {
                    matchedAcc = 'AS';
                }
                if (!groups[key].amounts[matchedAcc]) {
                    groups[key].amounts[matchedAcc] = 0;
                }
                groups[key].amounts[matchedAcc] += Math.round(pendingInterest);
            });

            const parseDateDMY = (dStr) => {
                if (!dStr) return 0;
                const parts = dStr.split('-');
                if (parts.length === 3) {
                    return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
                }
                return 0;
            };

            const sortedGroups = Object.values(groups).sort((a, b) => {
                const timeA = parseDateDMY(a.date);
                const timeB = parseDateDMY(b.date);
                if (timeA !== timeB) return timeA - timeB;
                return a.client.localeCompare(b.client);
            });

            let listCount = 0;
            let currentExcelRow = 4;

            sortedGroups.forEach((g) => {
                listCount++;
                const row = worksheet.getRow(currentExcelRow);
                row.height = 20;

                const rowValues = [
                    listCount,
                    g.date,
                    g.loan_id,
                    g.client,
                    g.follower,
                    g.loanAmount,
                    g.tenureDays,
                    g.actualDays,
                    g.delayDays
                ];
                sortedAccounts.forEach(acc => {
                    rowValues.push(g.amounts[acc] || null);
                });

                rowValues.forEach((val, idx) => {
                    const cell = row.getCell(idx + 1);
                    cell.value = val;
                    cell.border = thinBorder;
                    cell.font = { name: 'Trebuchet MS', size: 10 };
                    if (idx === 0 || idx === 1 || idx === 2 || idx === 6 || idx === 7 || idx === 8) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else if (idx === 3 || idx === 4) {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    } else if (idx === 5 || idx >= 9) {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                        if (val !== null) {
                            cell.numFmt = '#,##0';
                        }
                    }
                });

                currentExcelRow++;
            });

            const totalRow = worksheet.getRow(currentExcelRow);
            totalRow.height = 22;

            worksheet.mergeCells(`A${currentExcelRow}:E${currentExcelRow}`);
            const totalLabelCell = worksheet.getCell(`A${currentExcelRow}`);
            totalLabelCell.value = 'TOTAL';
            totalLabelCell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
            totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

            for (let c = 1; c <= 5; c++) {
                totalRow.getCell(c).border = thinBorder;
            }

            const getColLetter = (colIdx) => {
                let temp = colIdx;
                let letter = '';
                while (temp > 0) {
                    let modulo = (temp - 1) % 26;
                    letter = String.fromCharCode(65 + modulo) + letter;
                    temp = Math.floor((temp - modulo) / 26);
                }
                return letter;
            };

            const lastDataRow = currentExcelRow > 4 ? currentExcelRow - 1 : 4;
            // Total for LOAN AMOUNT (col 6)
            const loanAmtTotalCell = totalRow.getCell(6);
            loanAmtTotalCell.value = { formula: `=SUM(F4:F${lastDataRow})` };
            loanAmtTotalCell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
            loanAmtTotalCell.alignment = { horizontal: 'right', vertical: 'middle' };
            loanAmtTotalCell.numFmt = '#,##0';
            loanAmtTotalCell.border = thinBorder;

            // Empty cells for tenure, actual and delay days with borders
            totalRow.getCell(7).border = thinBorder;
            totalRow.getCell(8).border = thinBorder;
            totalRow.getCell(9).border = thinBorder;

            // Total for each account column (starting at col 10)
            for (let i = 0; i < sortedAccounts.length; i++) {
                const colIdx = 10 + i;
                const colLetter = getColLetter(colIdx);
                const cell = totalRow.getCell(colIdx);
                cell.value = { formula: `=SUM(${colLetter}4:${colLetter}${lastDataRow})` };
                cell.font = { bold: true, name: 'Trebuchet MS', size: 10 };
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.numFmt = '#,##0';
                cell.border = thinBorder;
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const dateStr = new Date().toISOString().split('T')[0].split('-').reverse().join('-');
            anchor.download = `Short_Loans_Interest_Pending_List_${dateStr}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export Interest Pending Error:", error);
            setError("Failed to export Interest Pending List.");
        }
    };

    const handleCreateLoan = async (e) => {
        e.preventDefault();
        try {
            setError(null);
            if (!formData.follower || formData.follower.trim() === '') {
                setError('Follower is required.');
                return;
            }
            if (!formData.account || formData.account.trim() === '') {
                setError('Account is required.');
                return;
            }
            const payload = {
                ...formData,
                loan_id: formData.loan_id ? formData.loan_id.trim() : null,
                loan_amount: String(formData.loan_amount).replace(/,/g, ''),
                int_per_day: String(formData.int_per_day).replace(/,/g, ''),
                created_by: user?.name || 'Unknown'
            };

            const cleanAmount = Number(payload.loan_amount) || 0;
            const now = new Date();
            const updatedAt = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
            const creationLog = `Loan Created with Principal ₹ ${cleanAmount.toLocaleString('en-IN')} | ${updatedAt}`;
            let historyList = [creationLog];

            if (formData.interest_collected) {
                const cleanInt = Number(payload.int_per_day) || 0;
                const diffDays = Number(formData.days) || 0;
                const dailyInt = (cleanAmount / 100000) * cleanInt;
                const amount = diffDays * dailyInt;

                payload.days_received = diffDays;

                if (formData.loan_date) {
                    const dateParts = formData.loan_date.split('-');
                    const loanDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                    const toDateObj = new Date(loanDate);
                    toDateObj.setDate(toDateObj.getDate() + diffDays);

                    const formatDate = (dObj) => {
                        const y = dObj.getFullYear();
                        const m = String(dObj.getMonth() + 1).padStart(2, '0');
                        const d = String(dObj.getDate()).padStart(2, '0');
                        return `${d}-${m}-${y}`;
                    };

                    const formattedFrom = formatDate(loanDate);
                    const formattedTo = formatDate(toDateObj);

                    const netPaid = cleanAmount - Math.round(amount);
                    const newLog = `Interest Collected Upfront (Net Disbursed: ₹ ${netPaid.toLocaleString('en-IN')} deducted from ₹ ${cleanAmount.toLocaleString('en-IN')} Principal) from ${formattedFrom} to ${formattedTo} ${diffDays} days - ₹ ${Math.round(amount).toLocaleString('en-IN')} | ${updatedAt}`;
                    historyList.push(newLog);
                }
            }

            payload.renew_history = JSON.stringify(historyList);

            delete payload.interest_collected;

            const res = await fetch(`${API_URL}/short-loans`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                fetchLoans();
                setSuccess('Short loan created successfully!');
                handleCloseModal();
            } else {
                setError(data.message || 'Failed to create short loan.');
            }
        } catch (err) {
            setError('Failed to create short loan.');
        }
    };

    const handleUpdateLoan = async (e) => {
        e.preventDefault();
        try {
            setError(null);
            
            const cleanAmount = Number(String(editFormData.loan_amount || '').replace(/,/g, '')) || 0;
            const cleanInt = Number(String(editFormData.int_per_day || '').replace(/,/g, '')) || 0;
            const diffDays = Number(editFormData.days) || 0;
            
            let historyList = [];
            if (editFormData.renew_history) {
                try {
                    historyList = JSON.parse(editFormData.renew_history);
                } catch (err) {
                    historyList = [];
                }
            }
            
            if (Array.isArray(historyList)) {
                historyList = historyList.map(log => {
                    const pipeIdx = log.lastIndexOf(' | ');
                    const text = pipeIdx !== -1 ? log.slice(0, pipeIdx) : log;
                    const timestamp = pipeIdx !== -1 ? log.slice(pipeIdx + 3) : '';
                    
                    if (text.includes('Loan Created with Principal')) {
                        return `Loan Created with Principal ₹ ${cleanAmount.toLocaleString('en-IN')} | ${timestamp}`;
                    }
                    
                    if (text.includes('Interest Collected Upfront')) {
                        const dailyInt = (cleanAmount / 100000) * cleanInt;
                        const upfrontInterestAmount = diffDays * dailyInt;
                        const netPaid = cleanAmount - Math.round(upfrontInterestAmount);
                        
                        let formattedFrom = '';
                        let formattedTo = '';
                        if (editFormData.loan_date) {
                            const dateParts = editFormData.loan_date.split('-');
                            const loanDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                            const toDateObj = new Date(loanDate);
                            toDateObj.setDate(toDateObj.getDate() + diffDays);

                            const formatDate = (dObj) => {
                                const y = dObj.getFullYear();
                                const m = String(dObj.getMonth() + 1).padStart(2, '0');
                                const d = String(dObj.getDate()).padStart(2, '0');
                                return `${d}-${m}-${y}`;
                            };

                            formattedFrom = formatDate(loanDate);
                            formattedTo = formatDate(toDateObj);
                        }
                        
                        return `Interest Collected Upfront (Net Disbursed: ₹ ${netPaid.toLocaleString('en-IN')} deducted from ₹ ${cleanAmount.toLocaleString('en-IN')} Principal) from ${formattedFrom} to ${formattedTo} ${diffDays} days - ₹ ${Math.round(upfrontInterestAmount).toLocaleString('en-IN')} | ${timestamp}`;
                    }
                    
                    return log;
                });
            }

            const payload = {
                ...editFormData,
                loan_amount: String(cleanAmount),
                int_per_day: String(cleanInt),
                renew_history: JSON.stringify(historyList)
            };

            const hasUpfront = historyList.some(log => log.includes('Interest Collected Upfront'));
            if (hasUpfront) {
                payload.days_received = diffDays;
            }

            const res = await fetch(`${API_URL}/short-loans/${selectedLoan.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                fetchLoans();
                setSuccess('Short loan updated successfully!');
                setSelectedLoan(null);
                setIsEditMode(false);
            } else {
                setError(data.message || 'Failed to update short loan.');
            }
        } catch (err) {
            setError('Failed to update short loan.');
        }
    };

    const handleCloseModalDismiss = () => {
        setShowCloseConfirm(null);
        setDeductTDS(false);
        setTdsPercentage('');
        setCloseModalError(null);
    };

    const handleStatusChange = async (id, status, closeDate, customAmount, isPartialPrincipal, tdsAmount, tdsPercent) => {
        try {
            const payload = { status };
            if (status === 'CLOSED' && closeDate) {
                payload.close_date = closeDate;
                // Calculate days between loan_date and close_date
                const loan = loans.find(l => l.id === id);
                if (loan && loan.loan_date) {
                    const loanDateParts = loan.loan_date.split('-');
                    const closeDateParts = closeDate.split('-');
                    const loanDate = new Date(loanDateParts[0], loanDateParts[1] - 1, loanDateParts[2]);
                    const closeDateObj = new Date(closeDateParts[0], closeDateParts[1] - 1, closeDateParts[2]);
                    loanDate.setHours(0, 0, 0, 0);
                    closeDateObj.setHours(0, 0, 0, 0);
                    const diffDays = Math.max(0, Math.floor((closeDateObj - loanDate) / (1000 * 60 * 60 * 24)));
                    payload.days_received = diffDays;

                    // Add close history log
                    const formattedCloseDate = closeDate.split('-').reverse().join('-');
                    const grossRepayable = calculateTotalRepayable(loan.loan_amount, loan.int_per_day, loan.loan_date, closeDate, loan.renew_history);
                    const tdsVal = Number(tdsAmount) || 0;
                    const netRepayable = Math.max(0, grossRepayable - tdsVal);
                    const now = new Date();
                    const updatedAt = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                    
                    let logText = `Loan Closed on ${formattedCloseDate} - Paid ₹ ${netRepayable.toLocaleString('en-IN')}`;
                    if (tdsVal > 0) {
                        logText += ` (TDS ₹ ${tdsVal.toLocaleString('en-IN')} [${tdsPercent}%] deducted)`;
                    }
                    const newLog = `${logText} | ${updatedAt}`;
                    
                    let historyList = [];
                    if (loan.renew_history) {
                        try {
                            historyList = JSON.parse(loan.renew_history);
                        } catch (e) {
                            historyList = [];
                        }
                    }
                    historyList.push(newLog);
                    payload.renew_history = JSON.stringify(historyList);
                }
            } else if (status === 'RENEW' && closeDate) {
                const loan = loans.find(l => l.id === id);
                if (loan && loan.loan_date) {
                    const lastRenewDate = getLastRenewalDate(loan);
                    const diffDays = calculateDaysRecd(lastRenewDate, closeDate);
                    const dailyInt = calculateDailyInterest(loan.int_per_day, loan.loan_amount);
                    const amount = diffDays * dailyInt;
                    
                    const formattedFrom = lastRenewDate.split('-').reverse().join('-');
                    const formattedTo = closeDate.split('-').reverse().join('-');
                    
                    let newLog;
                    const now = new Date();
                    const updatedAt = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                    if (isPartialPrincipal) {
                        const finalAmount = customAmount !== undefined ? Number(customAmount) : 0;
                        newLog = `Partial Principal Received on ${formattedTo} - ₹ ${finalAmount.toLocaleString('en-IN')} | ${updatedAt}`;
                    } else {
                        const isPartial = customAmount !== undefined && Math.round(Number(customAmount)) !== Math.round(amount);
                        const finalAmount = customAmount !== undefined ? Number(customAmount) : amount;
                        newLog = isPartial
                            ? `Partial Interest Received from ${formattedFrom} to ${formattedTo} - ₹ ${finalAmount.toLocaleString('en-IN')} | ${updatedAt}`
                            : `Interest Received from ${formattedFrom} to ${formattedTo} ${diffDays} days - ₹ ${finalAmount.toLocaleString('en-IN')} | ${updatedAt}`;
                    }
                    
                    let historyList = [];
                    if (loan.renew_history) {
                        try {
                            historyList = JSON.parse(loan.renew_history);
                        } catch (e) {
                            historyList = [];
                        }
                    }
                    historyList.push(newLog);
                    payload.renew_history = JSON.stringify(historyList);
                }
            }
            const res = await fetch(`${API_URL}/short-loans/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                fetchLoans();
                setSuccess(`Loan marked as ${status.toLowerCase()}!`);
                if (selectedLoan?.id === id) {
                    const os = calculateDaysRecd(selectedLoan.loan_date) - Number(selectedLoan.days || 0);
                    const computedStatus = (status !== 'CLOSED' && os > 0) ? 'OVERDUE' : status;
                    const updatedFields = { ...selectedLoan, raw_status: status, status: computedStatus };
                    if (status === 'CLOSED') {
                        updatedFields.close_date = closeDate;
                        if (selectedLoan.loan_date) {
                            const loanDateParts = selectedLoan.loan_date.split('-');
                            const closeDateParts = closeDate.split('-');
                            const loanDate = new Date(loanDateParts[0], loanDateParts[1] - 1, loanDateParts[2]);
                            const closeDateObj = new Date(closeDateParts[0], closeDateParts[1] - 1, closeDateParts[2]);
                            loanDate.setHours(0, 0, 0, 0);
                            closeDateObj.setHours(0, 0, 0, 0);
                            const diffDays = Math.max(0, Math.floor((closeDateObj - loanDate) / (1000 * 60 * 60 * 24)));
                            updatedFields.days_received = diffDays;
                        }
                        const formattedCloseDate = closeDate.split('-').reverse().join('-');
                        const grossRepayable = calculateTotalRepayable(selectedLoan.loan_amount, selectedLoan.int_per_day, selectedLoan.loan_date, closeDate, selectedLoan.renew_history);
                        const tdsVal = Number(tdsAmount) || 0;
                        const netRepayable = Math.max(0, grossRepayable - tdsVal);
                        const now = new Date();
                        const updatedAt = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                        
                        let logText = `Loan Closed on ${formattedCloseDate} - Paid ₹ ${netRepayable.toLocaleString('en-IN')}`;
                        if (tdsVal > 0) {
                            logText += ` (TDS ₹ ${tdsVal.toLocaleString('en-IN')} [${tdsPercent}%] deducted)`;
                        }
                        const newLog = `${logText} | ${updatedAt}`;
                        
                        let historyList = [];
                        if (selectedLoan.renew_history) {
                            try {
                                historyList = JSON.parse(selectedLoan.renew_history);
                            } catch (e) {
                                historyList = [];
                            }
                        }
                        historyList.push(newLog);
                        updatedFields.renew_history = JSON.stringify(historyList);
                    } else if (status === 'RENEW') {
                        const lastRenewDate = getLastRenewalDate(selectedLoan);
                        const diffDays = calculateDaysRecd(lastRenewDate, closeDate);
                        const dailyInt = calculateDailyInterest(selectedLoan.int_per_day, selectedLoan.loan_amount);
                        const amount = diffDays * dailyInt;
                        const formattedFrom = lastRenewDate.split('-').reverse().join('-');
                        const formattedTo = closeDate.split('-').reverse().join('-');
                        
                        let newLog;
                        const now2 = new Date();
                        const updatedAt2 = now2.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                        if (isPartialPrincipal) {
                            const finalAmount = customAmount !== undefined ? Number(customAmount) : 0;
                            newLog = `Partial Principal Received on ${formattedTo} - ₹ ${finalAmount.toLocaleString('en-IN')} | ${updatedAt2}`;
                        } else {
                            const isPartial = customAmount !== undefined && Math.round(Number(customAmount)) !== Math.round(amount);
                            const finalAmount = customAmount !== undefined ? Number(customAmount) : amount;
                            newLog = isPartial
                                ? `Partial Interest Received from ${formattedFrom} to ${formattedTo} - ₹ ${finalAmount.toLocaleString('en-IN')} | ${updatedAt2}`
                                : `Interest Received from ${formattedFrom} to ${formattedTo} ${diffDays} days - ₹ ${finalAmount.toLocaleString('en-IN')} | ${updatedAt2}`;
                        }
                        
                        let historyList = [];
                        if (selectedLoan.renew_history) {
                            try {
                                historyList = JSON.parse(selectedLoan.renew_history);
                            } catch (e) {
                                historyList = [];
                            }
                        }
                        historyList.push(newLog);
                        updatedFields.renew_history = JSON.stringify(historyList);
                    }
                    setSelectedLoan(updatedFields);
                }
            } else {
                setError(data.message || 'Failed to update status.');
            }
        } catch (err) {
            setError('Failed to update status.');
        }
    };

    const handleRenewDateChange = (newDate) => {
        setRenewDate(newDate);
        if (showRenewConfirm) {
            const lastRenewDate = getLastRenewalDate(showRenewConfirm);
            const diffDays = calculateDaysRecd(lastRenewDate, newDate);
            const dailyInt = calculateDailyInterest(showRenewConfirm.int_per_day, showRenewConfirm.loan_amount);
            setRenewAmount(String(Math.round(diffDays * dailyInt)));
        }
    };

    const handleDeleteLoan = async (id) => {
        try {
            const res = await fetch(`${API_URL}/short-loans/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                fetchLoans();
                setSuccess('Loan deleted successfully!');
                if (selectedLoan?.id === id) {
                    setSelectedLoan(null);
                }
            } else {
                setError(data.message || 'Failed to delete loan.');
            }
        } catch (err) {
            setError('Failed to delete loan.');
        }
    };

    const handleCloseModal = () => {
        setShowCreateModal(false);
        setFormData({
            client_name: '',
            loan_amount: '',
            int_per_day: '',
            loan_date: '',
            days: '',
            days_received: '',
            remarks: '',
            follower: '',
            account: '',
            interest_collected: false
        });
        setError(null);
    };

    // Filter loans based on search, status, and date range
    const filteredLoans = loans.filter(loan => {
        if (user?.role !== 'admin') {
            const loanAcc = (loan.account || '').toUpperCase().trim();
            const hasPerm = userPermissions.some(p => p.toUpperCase().trim() === loanAcc);
            if (!hasPerm) return false;
        }
        let matchesSearch = true;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            matchesSearch = (
                (loan.client_name || loan.borrower_name || '').toLowerCase().includes(term) ||
                String(loan.loan_amount || '').includes(term)
            );
        }

        let matchesStatus = true;
        if (statusFilter !== 'ALL') {
            const currentStatus = loan.status || 'ACTIVE';
            matchesStatus = currentStatus === statusFilter;
        }

        let matchesFollower = true;
        if (followerFilter !== 'ALL') {
            matchesFollower = (loan.follower || '').toUpperCase() === followerFilter.toUpperCase();
        }

        let matchesAccount = true;
        if (accountFilter !== 'ALL') {
            matchesAccount = (loan.account || '').toUpperCase() === accountFilter.toUpperCase();
        }

        let matchesTds = true;
        if (tdsFilter !== 'ALL') {
            const { tdsAmount } = getTDSDetails(loan.renew_history);
            const hasTDS = tdsAmount > 0;
            matchesTds = tdsFilter === 'YES' ? hasTDS : !hasTDS;
        }

        let matchesDateRange = true;
        if (startDate || endDate) {
            if (!loan.loan_date) {
                matchesDateRange = false;
            } else {
                if (startDate && loan.loan_date < startDate) matchesDateRange = false;
                if (endDate && loan.loan_date > endDate) matchesDateRange = false;
            }
        }

        return matchesSearch && matchesStatus && matchesFollower && matchesAccount && matchesTds && matchesDateRange;
    });

    // Sort loans based on sortConfig
    const sortedLoans = React.useMemo(() => {
        if (!sortConfig) return filteredLoans;
        const { key, direction } = sortConfig;
        
        return [...filteredLoans].sort((a, b) => {
            let valA, valB;
            
            switch (key) {
                case 's_no':
                    valA = a.id || 0;
                    valB = b.id || 0;
                    break;
                case 'loan_id':
                    valA = (a.loan_id || '').toLowerCase();
                    valB = (b.loan_id || '').toLowerCase();
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'loan_date':
                    valA = a.loan_date ? new Date(a.loan_date).getTime() : 0;
                    valB = b.loan_date ? new Date(b.loan_date).getTime() : 0;
                    break;
                case 'client_name':
                    valA = (a.client_name || a.borrower_name || '').toLowerCase();
                    valB = (b.client_name || b.borrower_name || '').toLowerCase();
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'follower':
                    valA = (a.follower || '').toLowerCase();
                    valB = (b.follower || '').toLowerCase();
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'account':
                    valA = (a.account || '').toLowerCase();
                    valB = (b.account || '').toLowerCase();
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'status':
                    valA = (a.status || 'ACTIVE').toLowerCase();
                    valB = (b.status || 'ACTIVE').toLowerCase();
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'loan_amount':
                    valA = Number(a.loan_amount || 0);
                    valB = Number(b.loan_amount || 0);
                    break;
                case 'int_per_day':
                    valA = Number(a.int_per_day || 0);
                    valB = Number(b.int_per_day || 0);
                    break;
                case 'days':
                    valA = Number(a.days || 0);
                    valB = Number(b.days || 0);
                    break;
                case 'actual_days':
                    valA = calculateDaysRecd(a.loan_date, a.status === 'CLOSED' ? a.close_date : null);
                    valB = calculateDaysRecd(b.loan_date, b.status === 'CLOSED' ? b.close_date : null);
                    break;
                case 'delay_days':
                    valA = calculateDelayDays(a.loan_date, a.days, a.renew_history, a.close_date, a.status);
                    valB = calculateDelayDays(b.loan_date, b.days, b.renew_history, b.close_date, b.status);
                    break;
                case 'tds_status': {
                    const getTdsVal = (l) => {
                        const { tdsAmount } = getTDSDetails(l.renew_history);
                        return tdsAmount > 0 ? 1 : 0;
                    };
                    valA = getTdsVal(a);
                    valB = getTdsVal(b);
                    break;
                }
                case 'recd_amount': {
                    const getRecdVal = (l) => {
                        if (l.status === 'CLOSED') {
                            const gross = calculateAccruedInterest(l.loan_amount, l.int_per_day, l.loan_date, l.close_date, l.renew_history);
                            const { tdsAmount } = getTDSDetails(l.renew_history);
                            return Number(l.loan_amount || 0) + gross - tdsAmount;
                        }
                        return calculateInterestReceived(l.renew_history);
                    };
                    valA = getRecdVal(a);
                    valB = getRecdVal(b);
                    break;
                }
                case 'balance': {
                    const grossInterestA = calculateAccruedInterest(a.loan_amount, a.int_per_day, a.loan_date, a.status === 'CLOSED' ? a.close_date : null, a.renew_history);
                    const recdA = a.status === 'CLOSED' ? grossInterestA : calculateInterestReceived(a.renew_history);
                    valA = Math.max(0, grossInterestA - recdA);

                    const grossInterestB = calculateAccruedInterest(b.loan_amount, b.int_per_day, b.loan_date, b.status === 'CLOSED' ? b.close_date : null, b.renew_history);
                    const recdB = b.status === 'CLOSED' ? grossInterestB : calculateInterestReceived(b.renew_history);
                    valB = Math.max(0, grossInterestB - recdB);
                    break;
                }
                case 'total': {
                    valA = calculateTotalRepayable(a.loan_amount, a.int_per_day, a.loan_date, a.status === 'CLOSED' ? a.close_date : null, a.renew_history, a.status);
                    valB = calculateTotalRepayable(b.loan_amount, b.int_per_day, b.loan_date, b.status === 'CLOSED' ? b.close_date : null, b.renew_history, b.status);
                    break;
                }
                default:
                    return 0;
            }
            
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredLoans, sortConfig]);

    const totalPages = Math.ceil(sortedLoans.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, sortedLoans.length);
    const currentData = sortedLoans.slice(startIndex, endIndex);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-64px)] w-full flex flex-col overflow-hidden">
            <div className="p-8 flex-1 flex flex-col w-full min-h-0 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-1">
                        Short Loan
                    </h1>
                </div>
                <div className="relative group">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm transition-colors group-focus-within:text-primary">search</span>
                    <input
                        type="text"
                        placeholder="Search by borrower, amount..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="pl-10 pr-4 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white w-80 transition-all"
                    />
                </div>
            </div>

            {/* Success Popup */}
            {success && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/20 p-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-6 mx-auto">
                            <span className="material-symbols-outlined text-emerald-500 text-3xl">check_circle</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight uppercase">Success!</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8 leading-relaxed px-4">
                            {success}
                        </p>
                        <button
                            onClick={() => setSuccess(null)}
                            className="w-full h-10 bg-emerald-500 text-white text-[12px] font-black rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 uppercase tracking-widest transition-all"
                        >
                            Got it
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* Error Popup */}
            {error && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/20 p-8 text-center animate-in fade-in zoom-in duration-200">
                        <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-6 mx-auto">
                            <span className="material-symbols-outlined text-rose-500 text-3xl">error</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight uppercase">Error</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8 leading-relaxed px-4">
                            {error}
                        </p>
                        <button
                            onClick={() => setError(null)}
                            className="w-full h-10 bg-rose-500 text-white text-[12px] font-black rounded-xl hover:bg-rose-600 shadow-lg shadow-rose-500/20 uppercase tracking-widest transition-all"
                        >
                            Got it
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* Filters */}
            <div className="flex items-center gap-4 !mt-5 justify-end">

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                        className="h-10 min-w-[130px] pl-4 pr-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
                    >
                        <span>
                            {statusFilter === 'ALL' ? 'All Statuses' : 
                             statusFilter === 'ACTIVE' ? 'Active' : 
                             statusFilter === 'OVERDUE' ? 'Overdue' : 'Closed'}
                        </span>
                        <span className={`material-symbols-outlined text-slate-400 text-[18px] transition-transform duration-200 absolute right-4 ${isFilterDropdownOpen ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {isFilterDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsFilterDropdownOpen(false)}></div>
                            <div className="absolute top-[calc(100%+6px)] left-0 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1">
                                {[
                                    { value: 'ALL', label: 'All Statuses' },
                                    { value: 'ACTIVE', label: 'Active' },
                                    { value: 'OVERDUE', label: 'Overdue' },
                                    { value: 'CLOSED', label: 'Closed' }
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setStatusFilter(option.value);
                                            setIsFilterDropdownOpen(false);
                                            setCurrentPage(1);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                            statusFilter === option.value
                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white'
                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsFollowerFilterDropdownOpen(!isFollowerFilterDropdownOpen)}
                        className="h-10 min-w-[150px] pl-4 pr-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
                    >
                        <span>
                            {followerFilter === 'ALL' ? 'All Followers' : followerFilter}
                        </span>
                        <span className={`material-symbols-outlined text-slate-400 text-[18px] transition-transform duration-200 absolute right-4 ${isFollowerFilterDropdownOpen ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {isFollowerFilterDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsFollowerFilterDropdownOpen(false)}></div>
                            <div className="absolute top-[calc(100%+6px)] left-0 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-150">
                                {[
                                    { value: 'ALL', label: 'All Followers' },
                                    ...FOLLOWERS.map(f => ({ value: f, label: f }))
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setFollowerFilter(option.value);
                                            setIsFollowerFilterDropdownOpen(false);
                                            setCurrentPage(1);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                            followerFilter === option.value
                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white'
                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsAccountFilterDropdownOpen(!isAccountFilterDropdownOpen)}
                        className="h-10 min-w-[130px] pl-4 pr-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
                    >
                        <span>
                            {accountFilter === 'ALL' ? 'All Accounts' : accountFilter}
                        </span>
                        <span className={`material-symbols-outlined text-slate-400 text-[18px] transition-transform duration-200 absolute right-4 ${isAccountFilterDropdownOpen ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {isAccountFilterDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsAccountFilterDropdownOpen(false)}></div>
                            <div className="absolute top-[calc(100%+6px)] left-0 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-150">
                                {[
                                    { value: 'ALL', label: 'All Accounts' },
                                    ...allowedAccounts.map(a => ({ value: a, label: a }))
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setAccountFilter(option.value);
                                            setIsAccountFilterDropdownOpen(false);
                                            setCurrentPage(1);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                            accountFilter === option.value
                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white'
                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsTdsFilterDropdownOpen(!isTdsFilterDropdownOpen)}
                        className="h-10 min-w-[110px] pl-4 pr-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
                    >
                        <span>
                            {tdsFilter === 'ALL' ? 'TDS' : 
                             tdsFilter === 'YES' ? 'Yes' : 'No'}
                        </span>
                        <span className={`material-symbols-outlined text-slate-400 text-[18px] transition-transform duration-200 absolute right-4 ${isTdsFilterDropdownOpen ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {isTdsFilterDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsTdsFilterDropdownOpen(false)}></div>
                            <div className="absolute top-[calc(100%+6px)] left-0 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                                {[
                                    { value: 'ALL', label: 'All' },
                                    { value: 'YES', label: 'Yes' },
                                    { value: 'NO', label: 'No' }
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setTdsFilter(option.value);
                                            setIsTdsFilterDropdownOpen(false);
                                            setCurrentPage(1);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                            tdsFilter === option.value
                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white'
                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="relative" ref={calendarRef}>
                    <button
                        type="button"
                        onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                        className="h-10 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-200 flex items-center gap-2 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm min-w-[12rem] justify-between select-none"
                    >
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-400 text-lg leading-none">calendar_month</span>
                            <span className="font-semibold text-[13px]">{formatDisplayDateRange()}</span>
                        </div>
                        <span className="material-symbols-outlined text-slate-400 text-sm leading-none">expand_more</span>
                    </button>

                    {isCalendarOpen && (
                        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 z-[120] w-[340px] animate-in fade-in slide-in-from-top-2 duration-150 select-none">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <button 
                                    type="button"
                                    onClick={handlePrevMonth}
                                    className="h-10 w-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg leading-none">chevron_left</span>
                                </button>
                                <h4 className="text-[14px] font-extrabold text-slate-800 dark:text-white">
                                    {MONTH_NAMES[calendarViewDate.getMonth()]} {calendarViewDate.getFullYear()}
                                </h4>
                                <button 
                                    type="button"
                                    onClick={handleNextMonth}
                                    className="h-10 w-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
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

                <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 h-10 bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20 whitespace-nowrap cursor-pointer hover:bg-emerald-600 border border-transparent"
                >
                    <span className="material-symbols-outlined text-lg">add_circle</span>
                    Create New
                </button>

                <div className="relative" ref={exportDropdownRef}>
                    <button
                        type="button"
                        disabled={loans.length === 0}
                        onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                        className="h-10 px-4 bg-primary text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 flex items-center gap-2 transition-all hover:bg-primary/90 shadow-lg shadow-primary/20 justify-between select-none font-bold cursor-pointer border border-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary disabled:shadow-none"
                    >
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-white text-[18px] leading-none">file_download</span>
                            <span className="text-[13px]">Export</span>
                        </div>
                        <span className="material-symbols-outlined text-white text-[18px] leading-none transition-transform duration-200" style={{ transform: isExportDropdownOpen ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                    </button>

                    {isExportDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsExportDropdownOpen(false)}></div>
                            <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 w-[14rem] space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                                <button
                                    type="button"
                                    onClick={handleExportPayments}
                                    className="w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                >
                                    Payment Report
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportBending}
                                    className="w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                >
                                    Overall Pending Report
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportInterestPending}
                                    className="w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                >
                                    Interest Pending Report
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportTDS}
                                    className="w-full px-3 py-2 text-left text-xs font-bold rounded-lg transition-colors cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                >
                                    TDS Report
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {(searchTerm || statusFilter !== 'ALL' || followerFilter !== 'ALL' || accountFilter !== 'ALL' || tdsFilter !== 'ALL' || startDate || endDate) && (
                    <button
                        onClick={() => {
                            setSearchTerm('');
                            setStatusFilter('ALL');
                            setFollowerFilter('ALL');
                            setAccountFilter('ALL');
                            setTdsFilter('ALL');
                            setStartDate('');
                            setEndDate('');
                            setIsFilterDropdownOpen(false);
                            setIsFollowerFilterDropdownOpen(false);
                            setIsAccountFilterDropdownOpen(false);
                            setIsTdsFilterDropdownOpen(false);
                            setCurrentPage(1);
                        }}
                        className="h-10 w-10 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all flex items-center justify-center"
                        title="Clear Filters"
                    >
                        <span className="material-symbols-outlined text-[20px]">filter_alt_off</span>
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-[#101822] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col flex-1 min-h-0 !mt-5">
                <div className="flex-1 overflow-x-auto scrollbar-premium">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <th 
                                    style={{minWidth:'70px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 's_no', direction: prev.key === 's_no' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        S.No
                                        {sortConfig.key === 's_no' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'140px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'loan_id', direction: prev.key === 'loan_id' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-left justify-start gap-1">
                                        Loan ID
                                        {sortConfig.key === 'loan_id' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'220px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'client_name', direction: prev.key === 'client_name' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-start gap-1">
                                        Client Name
                                        {sortConfig.key === 'client_name' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'200px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'follower', direction: prev.key === 'follower' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-start">
                                        Follower
                                        {sortConfig.key === 'follower' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'180px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'account', direction: prev.key === 'account' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-start">
                                        Acc
                                        {sortConfig.key === 'account' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'140px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'loan_amount', direction: prev.key === 'loan_amount' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Loan Amount
                                        {sortConfig.key === 'loan_amount' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'110px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'int_per_day', direction: prev.key === 'int_per_day' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Int/Day
                                        {sortConfig.key === 'int_per_day' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'120px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'loan_date', direction: prev.key === 'loan_date' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Loan Date
                                        {sortConfig.key === 'loan_date' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'120px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'days', direction: prev.key === 'days' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Tenure Days
                                        {sortConfig.key === 'days' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'120px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'actual_days', direction: prev.key === 'actual_days' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Actual Days
                                        {sortConfig.key === 'actual_days' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'120px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'delay_days', direction: prev.key === 'delay_days' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Delay Days
                                        {sortConfig.key === 'delay_days' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'100px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'tds_status', direction: prev.key === 'tds_status' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        TDS
                                        {sortConfig.key === 'tds_status' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'160px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'total', direction: prev.key === 'total' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Total Repayable
                                        {sortConfig.key === 'total' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'160px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'recd_amount', direction: prev.key === 'recd_amount' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Amount Recd
                                        {sortConfig.key === 'recd_amount' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th 
                                    style={{minWidth:'130px'}} 
                                    className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                    onClick={() => setSortConfig(prev => ({ key: 'status', direction: prev.key === 'status' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Status
                                        {sortConfig.key === 'status' && (
                                            <span className="material-symbols-outlined text-[14px]">
                                                {sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th style={{minWidth:'50px'}} className="px-2 py-5"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                             {currentData.length > 0 ? (
                                 currentData.map((loan, index) => (
                                     <tr key={loan.id} onClick={() => { setSelectedLoan(loan); setIsEditMode(false); }} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group cursor-pointer">
                                        <td className="px-4 py-2 text-center">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                                {(currentPage - 1) * itemsPerPage + index + 1}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-left">
                                            <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
                                                {loan.loan_id || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className="text-sm font-medium text-slate-900 dark:text-white tracking-tight uppercase">
                                                {loan.client_name || loan.borrower_name || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-left">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                                {loan.follower || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-left">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-400">
                                                {loan.account || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                {loan.loan_amount ? `₹ ${Number(loan.loan_amount).toLocaleString('en-IN')}` : '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-400">
                                                {loan.int_per_day ? `₹ ${Number(loan.int_per_day).toLocaleString('en-IN')}` : '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-400">
                                                {loan.loan_date ? loan.loan_date.split('-').reverse().join('-') : '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-400">
                                                {loan.days || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-400">
                                                {calculateDaysRecd(loan.loan_date, loan.status === 'CLOSED' ? loan.close_date : null)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-400">
                                                {calculateDelayDays(loan.loan_date, loan.days, loan.renew_history, loan.close_date, loan.status)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            {(() => {
                                                const { tdsAmount } = getTDSDetails(loan.renew_history);
                                                const hasTDS = tdsAmount > 0;
                                                return (
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                                        hasTDS 
                                                            ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 border-indigo-100 dark:border-indigo-800'
                                                            : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-slate-200 dark:border-slate-700'
                                                    }`}>
                                                        {hasTDS ? 'Yes' : 'No'}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                            {(() => {
                                                const grossInterest = calculateAccruedInterest(loan.loan_amount, loan.int_per_day, loan.loan_date, loan.status === 'CLOSED' ? loan.close_date : null, loan.renew_history);
                                                const interestReceivedVal = calculateInterestReceived(loan.renew_history);
                                                const balanceInterest = Math.max(0, grossInterest - interestReceivedVal);
                                                const totalRepayable = calculateTotalRepayable(loan.loan_amount, loan.int_per_day, loan.loan_date, loan.status === 'CLOSED' ? loan.close_date : null, loan.renew_history, loan.status);
                                                return (
                                                    <td className="px-4 py-2 text-right">
                                                        <span className="text-sm font-semibold text-primary">
                                                            ₹ {totalRepayable.toLocaleString('en-IN')}
                                                        </span>
                                                    </td>
                                                );
                                            })()}
                                        <td className="px-4 py-2 text-right">
                                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                                ₹ {(() => {
                                                    if (loan.status === 'CLOSED') {
                                                        const grossInterest = calculateAccruedInterest(loan.loan_amount, loan.int_per_day, loan.loan_date, loan.close_date, loan.renew_history);
                                                        const { tdsAmount } = getTDSDetails(loan.renew_history);
                                                        return (Number(loan.loan_amount || 0) + grossInterest - tdsAmount);
                                                    }
                                                    return calculateInterestReceived(loan.renew_history);
                                                })().toLocaleString('en-IN')}
                                            </span>
                                        </td>
                                         <td className="px-4 py-2 text-center">
                                             <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                                 (!loan.status || loan.status === 'ACTIVE') ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 border-emerald-100 dark:border-emerald-800'
                                                 : loan.status === 'OVERDUE' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 border-rose-100 dark:border-rose-800'
                                                 : loan.status === 'CLOSED' ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-slate-200 dark:border-slate-700'
                                                 : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-100 dark:border-amber-800'
                                             }`}>
                                                 {loan.status || 'ACTIVE'}
                                             </span>
                                         </td>
                                        <td className="px-2 py-2 text-center relative">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenRowDropdownId(openRowDropdownId === loan.id ? null : loan.id);
                                                }}
                                                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">more_vert</span>
                                            </button>
 
                                            {openRowDropdownId === loan.id && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpenRowDropdownId(null); }}></div>
                                                    <div className="absolute right-8 top-10 w-44 bg-white dark:bg-[#1a2332] rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden">
                                                        {loan.status !== 'CLOSED' && (
                                                        <>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const today = new Date();
                                                                const yyyy = today.getFullYear();
                                                                const mm = String(today.getMonth() + 1).padStart(2, '0');
                                                                const dd = String(today.getDate()).padStart(2, '0');
                                                                const rDate = `${yyyy}-${mm}-${dd}`;
                                                                setRenewDate(rDate);
                                                                setRenewType('INTEREST');
                                                                const lastRenewDate = getLastRenewalDate(loan);
                                                                const diffDays = calculateDaysRecd(lastRenewDate, rDate);
                                                                const dailyInt = calculateDailyInterest(loan.int_per_day, loan.loan_amount);
                                                                setRenewAmount(String(Math.round(diffDays * dailyInt)));
                                                                setShowRenewConfirm(loan);
                                                                setOpenRowDropdownId(null);
                                                            }}
                                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-2"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">autorenew</span>
                                                            Mark as Renew
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const today = new Date();
                                                                const yyyy = today.getFullYear();
                                                                const mm = String(today.getMonth() + 1).padStart(2, '0');
                                                                const dd = String(today.getDate()).padStart(2, '0');
                                                                setCloseDate(`${yyyy}-${mm}-${dd}`);
                                                                setShowCloseConfirm(loan);
                                                                setOpenRowDropdownId(null);
                                                            }}
                                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-2"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                            Mark as Closed
                                                        </button>
                                                        </>)}
                                                        <div className="mx-3 border-t border-slate-100 dark:border-slate-700"></div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowDeleteConfirm(loan);
                                                                setOpenRowDropdownId(null);
                                                            }}
                                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center gap-2"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">delete</span>
                                                            Delete
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="15" className="px-8 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="material-symbols-outlined text-slate-300 dark:text-slate-700 text-[48px]">
                                                account_balance_wallet
                                            </span>
                                            <p className="text-sm font-bold text-slate-400 dark:text-slate-500">
                                                {(searchTerm || statusFilter !== 'ALL' || followerFilter !== 'ALL' || accountFilter !== 'ALL' || tdsFilter !== 'ALL' || startDate || endDate) ? 'No matching records found.' : 'No short loans yet. Click "Create New" to add one.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/10 rounded-b-2xl">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredLoans.length > 0 ? startIndex + 1 : 0}</span> to <span className="font-semibold text-slate-700 dark:text-slate-200">{endIndex}</span> of <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredLoans.length}</span> results
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1 || filteredLoans.length === 0}
                            className="h-9 w-9 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages || filteredLoans.length === 0}
                            className="h-9 w-9 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

            {/* Create New Modal */}
            {showCreateModal && createPortal(
                <div className="fixed top-0 left-0 w-full h-full z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-white/20 max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="p-6 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 relative">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                                Create Short Loan
                            </h3>
                            <button
                                onClick={handleCloseModal}
                                className="absolute w-10 h-10 top-5 right-5 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-700/40 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-all"
                                title="Close"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <form onSubmit={handleCreateLoan} className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2 col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Loan ID <span className="text-slate-400 normal-case">(Leave blank to auto-generate)</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white uppercase"
                                            placeholder="Enter loan ID (e.g., ST.56)"
                                            value={formData.loan_id || ''}
                                            onChange={(e) => setFormData({ ...formData, loan_id: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2 col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Client Name <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white uppercase"
                                            placeholder="Enter client name"
                                            value={formData.client_name}
                                            onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Loan Date <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            value={formData.loan_date}
                                            onChange={(e) => setFormData({ ...formData, loan_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Loan Amount <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            placeholder="₹ 0.00"
                                            value={formData.loan_amount}
                                            onChange={(e) => {
                                                const rawValue = e.target.value.replace(/[^0-9.]/g, '');
                                                const parts = rawValue.split('.');
                                                if (parts[0]) {
                                                    parts[0] = Number(parts[0]).toLocaleString('en-IN');
                                                }
                                                setFormData({ ...formData, loan_amount: parts.join('.') });
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Int/Day <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            placeholder="₹ 0.00"
                                            value={formData.int_per_day}
                                            onChange={(e) => {
                                                const rawValue = e.target.value.replace(/[^0-9.]/g, '');
                                                const parts = rawValue.split('.');
                                                if (parts[0]) {
                                                    parts[0] = Number(parts[0]).toLocaleString('en-IN');
                                                }
                                                setFormData({ ...formData, int_per_day: parts.join('.') });
                                            }}
                                        />
                                        {formData.int_per_day && formData.loan_amount && (() => {
                                            const dailyInt = calculateDailyInterest(formData.int_per_day, formData.loan_amount);
                                            return dailyInt ? (
                                                <p className="text-[10px] font-bold text-slate-400 mt-1 px-1">
                                                    Total Daily Interest: ₹ {dailyInt.toLocaleString('en-IN')} / day
                                                </p>
                                            ) : null;
                                        })()}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Tenure Days <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            required
                                            onWheel={(e) => e.target.blur()}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            placeholder="No. of days"
                                            value={formData.days}
                                            onChange={(e) => setFormData({ ...formData, days: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2 relative">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Follower <span className="text-rose-500">*</span>
                                        </label>
                                        <div 
                                            onClick={(e) => {
                                                setIsCreateFollowerDropdownOpen(!isCreateFollowerDropdownOpen);
                                            }}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 flex items-center justify-between text-sm font-bold cursor-pointer dark:text-white"
                                        >
                                            {formData.follower || 'Select Follower'}
                                            <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform duration-200 ${isCreateFollowerDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>
                                        
                                        {isCreateFollowerDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[999]" onClick={() => setIsCreateFollowerDropdownOpen(false)}></div>
                                                <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl z-[1000] overflow-hidden max-h-40 overflow-y-auto custom-scrollbar">
                                                    <div 
                                                        onClick={() => {
                                                            setFormData({...formData, follower: ''});
                                                            setIsCreateFollowerDropdownOpen(false);
                                                        }}
                                                        className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                            !formData.follower 
                                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                        }`}
                                                    >
                                                        Select Follower
                                                    </div>
                                                    {FOLLOWERS.map((f) => (
                                                        <div 
                                                            key={f}
                                                            onClick={() => {
                                                                setFormData({...formData, follower: f});
                                                                setIsCreateFollowerDropdownOpen(false);
                                                            }}
                                                            className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                                formData.follower === f 
                                                                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                            }`}
                                                        >
                                                            {f}
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="space-y-2 relative">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Account <span className="text-rose-500">*</span>
                                        </label>
                                        <div 
                                            onClick={(e) => {
                                                setIsCreateAccountDropdownOpen(!isCreateAccountDropdownOpen);
                                            }}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 flex items-center justify-between text-sm font-bold cursor-pointer dark:text-white"
                                        >
                                            {formData.account || 'Select Account'}
                                            <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform duration-200 ${isCreateAccountDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>
                                        
                                        {isCreateAccountDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[999]" onClick={() => setIsCreateAccountDropdownOpen(false)}></div>
                                                <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl z-[1000] overflow-hidden max-h-40 overflow-y-auto custom-scrollbar">
                                                    <div 
                                                        onClick={() => {
                                                            setFormData({...formData, account: ''});
                                                            setIsCreateAccountDropdownOpen(false);
                                                        }}
                                                        className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                            !formData.account 
                                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                        }`}
                                                    >
                                                        Select Account
                                                    </div>
                                                    {allowedAccounts.map((a) => (
                                                        <div 
                                                            key={a}
                                                            onClick={() => {
                                                                setFormData({...formData, account: a});
                                                                setIsCreateAccountDropdownOpen(false);
                                                            }}
                                                            className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                                formData.account === a 
                                                                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                            }`}
                                                        >
                                                            {a}
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800/50 mt-[1rem]">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            Interest collected
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, interest_collected: !formData.interest_collected })}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                formData.interest_collected ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'
                                            }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    formData.interest_collected ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>

                                    {formData.interest_collected && (() => {
                                        const dailyInt = calculateDailyInterest(formData.int_per_day, formData.loan_amount) || 0;
                                        const diffDays = Number(formData.days) || 0;
                                        const totalIntAmount = diffDays * dailyInt;
                                        return (
                                            <div className="flex items-center justify-between py-3 px-4 bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/10 dark:border-primary/20 mt-[1rem]">
                                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                                                    {diffDays} Days Interest
                                                </span>
                                                <span className="text-sm font-bold text-primary font-mono">
                                                    ₹ {Math.round(totalIntAmount || 0).toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                        );
                                    })()}

                                    <div className="space-y-2 col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Remarks</label>
                                        <textarea
                                            className="w-full h-24 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white resize-none"
                                            placeholder="Optional notes..."
                                            value={formData.remarks}
                                            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={handleCloseModal}
                                        className="h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded-2xl hover:bg-slate-200 uppercase tracking-widest"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="h-12 bg-primary text-white text-[10px] font-black rounded-2xl shadow-lg shadow-primary/20 uppercase tracking-widest"
                                    >
                                        Create Loan
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Details Modal */}
            {selectedLoan && createPortal(
                <div className="fixed top-0 left-0 w-full h-full z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden relative my-[20px] max-h-[80vh]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">description</span>
                                Loan Details {selectedLoan.loan_id ? ` - ${selectedLoan.loan_id}` : ''}
                            </h3>
                            <div className="flex items-center gap-2">
                                {!isEditMode && selectedLoan.status !== 'CLOSED' && (
                                    <button
                                        onClick={() => {
                                            setIsEditMode(true);
                                            setEditFormData({
                                                ...selectedLoan,
                                                loan_amount: selectedLoan.loan_amount ? Number(selectedLoan.loan_amount).toLocaleString('en-IN') : '',
                                                int_per_day: selectedLoan.int_per_day ? Number(selectedLoan.int_per_day).toLocaleString('en-IN') : '',
                                            });
                                            setFormData({
                                                loan_id: '',
                                                client_name: '',
                                                loan_amount: '',
                                                int_per_day: '',
                                                loan_date: '',
                                                days: '',
                                                days_received: '',
                                                remarks: '',
                                                follower: '',
                                                account: '',
                                                interest_collected: false
                                            });
                                        }}
                                        className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-primary bg-slate-100 dark:bg-slate-800 hover:bg-primary/10 rounded-full transition-all"
                                        title="Edit"
                                    >
                                        <span className="material-symbols-outlined text-sm">edit</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedLoan(null)}
                                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-all"
                                    title="Close"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isEditMode ? (
                            <form onSubmit={handleUpdateLoan} className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                    <div className="space-y-2 col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Client Name <span className="text-rose-500">*</span></label>
                                        <input type="text" required value={editFormData.client_name || ''} onChange={e => setEditFormData({...editFormData, client_name: e.target.value})} className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white uppercase" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Loan Amount <span className="text-rose-500">*</span></label>
                                        <input type="text" required value={editFormData.loan_amount || ''} onChange={e => {
                                            const rawValue = e.target.value.replace(/[^0-9.]/g, '');
                                            const parts = rawValue.split('.');
                                            if (parts[0]) parts[0] = Number(parts[0]).toLocaleString('en-IN');
                                            setEditFormData({...editFormData, loan_amount: parts.join('.')});
                                        }} className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Int/Day <span className="text-rose-500">*</span></label>
                                        <input type="text" required value={editFormData.int_per_day || ''} onChange={e => {
                                            const rawValue = e.target.value.replace(/[^0-9.]/g, '');
                                            const parts = rawValue.split('.');
                                            if (parts[0]) parts[0] = Number(parts[0]).toLocaleString('en-IN');
                                            setEditFormData({...editFormData, int_per_day: parts.join('.')});
                                        }} className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white" />
                                        {editFormData.int_per_day && editFormData.loan_amount && (() => {
                                            const dailyInt = calculateDailyInterest(editFormData.int_per_day, editFormData.loan_amount);
                                            return dailyInt ? (
                                                <p className="text-[10px] font-bold text-slate-400 mt-1 px-1">
                                                    Total Daily Interest: ₹ {dailyInt.toLocaleString('en-IN')} / day
                                                </p>
                                            ) : null;
                                        })()}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Loan Date <span className="text-rose-500">*</span></label>
                                        <input type="date" required value={editFormData.loan_date || ''} onChange={e => setEditFormData({...editFormData, loan_date: e.target.value})} className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tenure Days <span className="text-rose-500">*</span></label>
                                        <input type="number" min="0" required onWheel={(e) => e.target.blur()} value={editFormData.days || ''} onChange={e => setEditFormData({...editFormData, days: e.target.value})} className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Actual Days</label>
                                        <div className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold flex items-center dark:text-slate-300 text-slate-500 cursor-not-allowed">
                                            {calculateDaysRecd(editFormData.loan_date)}
                                        </div>
                                    </div>
                                    <div className="space-y-2 relative">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Status</label>
                                        <div 
                                            onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 flex items-center justify-between text-sm font-bold cursor-pointer dark:text-white"
                                        >
                                            {editFormData.status || 'ACTIVE'}
                                            <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>
                                        
                                        {isStatusDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[999]" onClick={() => setIsStatusDropdownOpen(false)}></div>
                                                <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl z-[1000] overflow-hidden">
                                                    {['ACTIVE', 'OVERDUE', 'CLOSED'].map((statusOption) => (
                                                        <div 
                                                            key={statusOption}
                                                            onClick={() => {
                                                                setEditFormData({...editFormData, status: statusOption});
                                                                setIsStatusDropdownOpen(false);
                                                            }}
                                                            className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                                (editFormData.status || 'ACTIVE') === statusOption 
                                                                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                            }`}
                                                        >
                                                            {statusOption}
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="space-y-2 relative">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Follower</label>
                                        <div 
                                            onClick={(e) => {
                                                setIsEditFollowerDropdownOpen(!isEditFollowerDropdownOpen);
                                            }}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 flex items-center justify-between text-sm font-bold cursor-pointer dark:text-white"
                                        >
                                            {editFormData.follower || 'Select Follower'}
                                            <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform duration-200 ${isEditFollowerDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>
                                        
                                        {isEditFollowerDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[999]" onClick={() => setIsEditFollowerDropdownOpen(false)}></div>
                                                <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl z-[1000] overflow-hidden py-2 max-h-60 overflow-y-auto custom-scrollbar">
                                                    <div 
                                                        onClick={() => {
                                                            setEditFormData({...editFormData, follower: ''});
                                                            setIsEditFollowerDropdownOpen(false);
                                                        }}
                                                        className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                            !editFormData.follower 
                                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                        }`}
                                                    >
                                                        Select Follower
                                                    </div>
                                                    {FOLLOWERS.map((f) => (
                                                        <div 
                                                            key={f}
                                                            onClick={() => {
                                                                setEditFormData({...editFormData, follower: f});
                                                                setIsEditFollowerDropdownOpen(false);
                                                            }}
                                                            className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                                editFormData.follower === f 
                                                                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                            }`}
                                                        >
                                                            {f}
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="space-y-2 relative">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Acc</label>
                                        <div 
                                            onClick={(e) => {
                                                setIsEditAccountDropdownOpen(!isEditAccountDropdownOpen);
                                            }}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 flex items-center justify-between text-sm font-bold cursor-pointer dark:text-white"
                                        >
                                            {editFormData.account || 'Select Account'}
                                            <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform duration-200 ${isEditAccountDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>
                                        
                                        {isEditAccountDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[999]" onClick={() => setIsEditAccountDropdownOpen(false)}></div>
                                                <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl z-[1000] overflow-hidden py-2 max-h-60 overflow-y-auto custom-scrollbar">
                                                    <div 
                                                        onClick={() => {
                                                            setEditFormData({...editFormData, account: ''});
                                                            setIsEditAccountDropdownOpen(false);
                                                        }}
                                                        className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                            !editFormData.account 
                                                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                        }`}
                                                    >
                                                        Select Account
                                                    </div>
                                                    {allowedAccounts.map((a) => (
                                                        <div 
                                                            key={a}
                                                            onClick={() => {
                                                                setEditFormData({...editFormData, account: a});
                                                                setIsEditAccountDropdownOpen(false);
                                                            }}
                                                            className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${
                                                                editFormData.account === a 
                                                                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-white' 
                                                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                            }`}
                                                        >
                                                            {a}
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2 pt-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Remarks</label>
                                    <textarea value={editFormData.remarks || ''} onChange={e => setEditFormData({...editFormData, remarks: e.target.value})} className="w-full h-24 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white resize-none" placeholder="Optional notes..." />
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <button type="button" onClick={() => setIsEditMode(false)} className="h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded-2xl hover:bg-slate-200 uppercase tracking-widest">Cancel</button>
                                    <button type="submit" className="h-12 bg-primary text-white text-[10px] font-black rounded-2xl shadow-lg shadow-primary/20 uppercase tracking-widest">Save Changes</button>
                                </div>
                            </form>
                        ) : (
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Client Name</p>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white uppercase">{selectedLoan.client_name || selectedLoan.borrower_name || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Int/Day</p>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                            {selectedLoan.int_per_day ? `₹ ${Number(selectedLoan.int_per_day).toLocaleString('en-IN')}` : '—'}
                                            {selectedLoan.int_per_day && selectedLoan.loan_amount && (() => {
                                                const dailyInt = (Number(selectedLoan.loan_amount) / 100000) * Number(selectedLoan.int_per_day);
                                                return dailyInt ? (
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1.5">
                                                        (₹ {dailyInt.toLocaleString('en-IN')} / Day)
                                                    </span>
                                                ) : null;
                                            })()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Loan Date</p>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{selectedLoan.loan_date ? selectedLoan.loan_date.split('-').reverse().join('-') : '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tenure Days</p>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{selectedLoan.days || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Actual Days</p>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{calculateDaysRecd(selectedLoan.loan_date, selectedLoan.status === 'CLOSED' ? selectedLoan.close_date : null)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Delay Days</p>
                                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                            {calculateDelayDays(selectedLoan.loan_date, selectedLoan.days, selectedLoan.renew_history, selectedLoan.close_date, selectedLoan.status)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Follower</p>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedLoan.follower || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Acc</p>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedLoan.account || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                                (!selectedLoan.status || selectedLoan.status === 'ACTIVE') ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 border-emerald-100 dark:border-emerald-800'
                                                : selectedLoan.status === 'OVERDUE' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 border-rose-100 dark:border-rose-800'
                                                : selectedLoan.status === 'CLOSED' ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-slate-200 dark:border-slate-700'
                                                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-100 dark:border-emerald-800'
                                            }`}>
                                                {selectedLoan.status || 'ACTIVE'}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">TDS</p>
                                        {(() => {
                                            const { tdsAmount, tdsPercent } = getTDSDetails(selectedLoan.renew_history);
                                            const hasTDS = tdsAmount > 0;
                                            return (
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                                    hasTDS 
                                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 border-indigo-100 dark:border-indigo-800'
                                                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-slate-200 dark:border-slate-700'
                                                }`}>
                                                    {hasTDS ? `Yes (${tdsPercent}%)` : 'No'}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    {selectedLoan.status === 'CLOSED' && (
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Close Date</p>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{selectedLoan.close_date ? selectedLoan.close_date.split('-').reverse().join('-') : '—'}</p>
                                    </div>
                                    )}
                                </div>

                                <div className="mt-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Financial Summary</h4>
                                    {(() => {
                                        const isClosed = selectedLoan.status === 'CLOSED';
                                        const grossInterest = calculateGrossInterest(selectedLoan.loan_amount, selectedLoan.int_per_day, selectedLoan.loan_date, isClosed ? selectedLoan.close_date : null, selectedLoan.renew_history);
                                        const { tdsAmount, tdsPercent } = getTDSDetails(selectedLoan.renew_history);
                                        const netRepayableVal = calculateTotalRepayable(selectedLoan.loan_amount, selectedLoan.int_per_day, selectedLoan.loan_date, selectedLoan.status === 'CLOSED' ? selectedLoan.close_date : null, selectedLoan.renew_history, selectedLoan.status);
                                        const remainingPrincipal = getRemainingPrincipal(selectedLoan.loan_amount, selectedLoan.renew_history);
                                        const loanAmountNum = Number(String(selectedLoan.loan_amount || 0).replace(/,/g, ''));
                                        // For closed loans: entire principal was received at close; interest = full grossInterest
                                        const recdAmount = isClosed ? loanAmountNum : (loanAmountNum - remainingPrincipal);
                                        const balanceAmount = isClosed ? 0 : remainingPrincipal;
                                        const recdInterest = isClosed ? grossInterest : calculateActualInterestReceived(selectedLoan.renew_history);
                                        const balanceInterest = isClosed ? 0 : Math.max(0, grossInterest - calculateActualInterestReceived(selectedLoan.renew_history));
                                        const totalRecd = recdAmount + recdInterest - tdsAmount;

                                        let recdInterestDays = 0;
                                        if (selectedLoan.renew_history) {
                                            try {
                                                const history = JSON.parse(selectedLoan.renew_history);
                                                if (Array.isArray(history)) {
                                                    for (const log of history) {
                                                        if (log.includes('Interest Collected Upfront') || log.includes('Interest Received')) {
                                                            const match = log.match(/(\d+)\s+days/i);
                                                            if (match) {
                                                                recdInterestDays += parseInt(match[1], 10);
                                                            }
                                                        }
                                                    }
                                                }
                                            } catch (e) {}
                                        }
                                        const baseDays = calculateDaysRecd(selectedLoan.loan_date, isClosed ? selectedLoan.close_date : new Date().toISOString().split('T')[0]);
                                        let totalDays = Math.max(baseDays, recdInterestDays);
                                        let balanceInterestDays = 0;
                                        
                                        if (isClosed) {
                                            recdInterestDays = totalDays;
                                        } else {
                                            balanceInterestDays = Math.max(0, totalDays - recdInterestDays);
                                        }

                                        return (
                                            <div className="space-y-3">
                                                <div className="bg-white dark:bg-slate-900/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800 space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Loan Amount</span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                                            ₹ {loanAmountNum.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Recd Amount</span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                                            ₹ {recdAmount.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Balance Amount</span>
                                                        <span className="text-sm font-bold text-amber-500 dark:text-amber-400 font-mono">
                                                            ₹ {balanceAmount.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="bg-white dark:bg-slate-900/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800 space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Interest <span className="text-xs text-slate-400 dark:text-slate-500">({totalDays} days)</span></span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                                            ₹ {grossInterest.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Recd Interest <span className="text-xs text-slate-400 dark:text-slate-500">({recdInterestDays} days)</span></span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                                            ₹ {recdInterest.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Balance Interest <span className="text-xs text-slate-400 dark:text-slate-500">({balanceInterestDays} days)</span></span>
                                                        <span className="text-sm font-bold text-amber-500 dark:text-amber-400 font-mono">
                                                            ₹ {balanceInterest.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                </div>

                                                {tdsAmount > 0 && (
                                                    <div className="bg-rose-50/40 dark:bg-rose-950/10 rounded-xl p-3 border border-rose-100/50 dark:border-rose-900/20 flex justify-between items-center text-rose-500">
                                                        <span className="text-sm font-medium">TDS Deducted ({tdsPercent}%)</span>
                                                        <span className="text-sm font-bold font-mono">
                                                            - ₹ {tdsAmount.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center px-3">
                                                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Recd</span>
                                                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                                        ₹ {totalRecd.toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                                <div className="pt-3 border-t border-slate-200 dark:border-slate-700/50 flex justify-between items-center px-3">
                                                    <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Total Repayable</span>
                                                    <span className="text-lg font-black text-primary font-mono">
                                                        ₹ {netRepayableVal.toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                {selectedLoan.renew_history && (() => {
                                    try {
                                        const history = JSON.parse(selectedLoan.renew_history);
                                        if (history && history.length > 0) {
                                            return (
                                                <div className="mt-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
                                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">History</h4>
                                                    <ul className="space-y-3">
                                                        {history.map((log, i) => {
                                                            const pipeIdx = log.lastIndexOf(' | ');
                                                            const text = pipeIdx !== -1 ? log.slice(0, pipeIdx) : log;
                                                            const timestamp = pipeIdx !== -1 ? log.slice(pipeIdx + 3) : null;
                                                            return (
                                                                <li key={i} className="flex flex-col gap-0.5">
                                                                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                                                        <span className="material-symbols-outlined text-primary text-sm shrink-0">history</span>
                                                                        <span>{text}</span>
                                                                    </div>
                                                                    {timestamp && (
                                                                        <div className="flex items-center gap-1 pl-6">
                                                                            <span className="material-symbols-outlined text-slate-400 text-[11px]">schedule</span>
                                                                            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{timestamp}</span>
                                                                        </div>
                                                                    )}
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            );
                                        }
                                    } catch (e) {
                                        return null;
                                    }
                                    return null;
                                })()}
                                {selectedLoan.remarks && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Remarks</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl whitespace-pre-wrap">{selectedLoan.remarks}</p>
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Close Confirmation Popup */}
            {showCloseConfirm && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-white/20 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="py-4 px-6 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 relative">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-amber-500 text-xl">warning</span>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Close Loan</h3>
                            </div>
                            <button
                                onClick={handleCloseModalDismiss}
                                className="absolute w-10 h-10 top-4 right-4 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-700/40 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-all"
                                title="Close"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="px-10 py-6 space-y-5 overflow-y-auto custom-scrollbar">
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                Are you sure you want to mark this loan as <span className="font-black text-slate-900 dark:text-white">CLOSED</span>?
                            </p>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white uppercase">{showCloseConfirm.client_name || showCloseConfirm.borrower_name || '—'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loan Amount</span>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                        ₹ {Number(showCloseConfirm.loan_amount || 0).toLocaleString('en-IN')}
                                    </span>
                                </div>
                                {(() => {
                                    const diffDays = calculateDaysRecd(showCloseConfirm.loan_date, closeDate);
                                    const grossInterest = calculateGrossInterest(showCloseConfirm.loan_amount, showCloseConfirm.int_per_day, showCloseConfirm.loan_date, closeDate, showCloseConfirm.renew_history);
                                    const grossRepayable = calculateTotalRepayable(showCloseConfirm.loan_amount, showCloseConfirm.int_per_day, showCloseConfirm.loan_date, closeDate, showCloseConfirm.renew_history);
                                    
                                    const pct = deductTDS ? (parseFloat(tdsPercentage) || 0) : 0;
                                    const tdsAmount = Math.round((grossInterest * pct) / 100);
                                    const netRepayable = Math.max(0, grossRepayable - tdsAmount);

                                    return (
                                        <>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Days Accrued</span>
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                                    {diffDays} days
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Interest</span>
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                                    ₹ {grossInterest.toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                            {deductTDS && (
                                                <div className="flex justify-between items-center text-rose-500">
                                                    <span className="text-[10px] font-black uppercase tracking-widest">TDS ({pct}%)</span>
                                                    <span className="text-sm font-bold font-mono">
                                                        - ₹ {tdsAmount.toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Total Repayable</span>
                                                <span className="text-base font-black text-primary font-mono">
                                                    ₹ {netRepayable.toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="grid grid-cols-2 gap-4 items-start">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                        Loan Close Date <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                        value={closeDate}
                                        onChange={(e) => setCloseDate(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 select-none">
                                    </label>
                                    <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/50 rounded-2xl px-4 h-12 flex items-center justify-between">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest select-none">
                                            Deduct TDS
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {deductTDS && (
                                                <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                                                    <input
                                                        type="number"
                                                        required
                                                        min="0"
                                                        max="100"
                                                        step="0.01"
                                                        className="w-20 h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                                        value={tdsPercentage}
                                                        onChange={(e) => {
                                                            setTdsPercentage(e.target.value);
                                                            setCloseModalError(null);
                                                        }}
                                                        placeholder="10"
                                                    />
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">%</span>
                                                </div>
                                            )}
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={deductTDS}
                                                    onChange={(e) => {
                                                        setDeductTDS(e.target.checked);
                                                        setCloseModalError(null);
                                                        if (e.target.checked) {
                                                            setTdsPercentage('10');
                                                        } else {
                                                            setTdsPercentage('');
                                                        }
                                                    }}
                                                />
                                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {closeModalError && (
                                <div className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-4 py-2.5 rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-2 animate-in fade-in duration-200">
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    <span>{closeModalError}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={handleCloseModalDismiss}
                                    className="h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!closeDate) return;
                                        if (deductTDS) {
                                            const val = parseFloat(tdsPercentage);
                                            if (isNaN(val) || val <= 0) {
                                                setCloseModalError("TDS percentage must be greater than 0% when enabled.");
                                                return;
                                            }
                                        }
                                        const grossInterest = calculateGrossInterest(showCloseConfirm.loan_amount, showCloseConfirm.int_per_day, showCloseConfirm.loan_date, closeDate, showCloseConfirm.renew_history);
                                        const pct = deductTDS ? (parseFloat(tdsPercentage) || 0) : 0;
                                        const tdsAmount = Math.round((grossInterest * pct) / 100);

                                        handleStatusChange(showCloseConfirm.id, 'CLOSED', closeDate, undefined, false, tdsAmount, pct);
                                        handleCloseModalDismiss();
                                    }}
                                    className="h-12 bg-rose-500 text-white text-[10px] font-black rounded-2xl shadow-lg shadow-rose-500/20 hover:bg-rose-600 uppercase tracking-widest transition-all"
                                >
                                    Confirm Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Renew Confirmation Popup */}
            {showRenewConfirm && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-white/20 max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="py-4 px-6 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 relative">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-amber-500 text-xl">autorenew</span>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Renew Loan</h3>
                            </div>
                            <button
                                onClick={() => setShowRenewConfirm(null)}
                                className="absolute w-10 h-10 top-4 right-4 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-700/40 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-all"
                                title="Close"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="px-10 py-6 space-y-5 overflow-y-auto custom-scrollbar">
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                Are you sure you want to mark this loan as <span className="font-black text-slate-900 dark:text-white">RENEWED</span>?
                            </p>

                            {/* Option Selector */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                    Payment Mode <span className="text-rose-500">*</span>
                                </label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/50 dark:border-slate-750">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRenewType('INTEREST');
                                            const lastRenewDate = getLastRenewalDate(showRenewConfirm);
                                            const diffDays = calculateDaysRecd(lastRenewDate, renewDate);
                                            const dailyInt = calculateDailyInterest(showRenewConfirm.int_per_day, showRenewConfirm.loan_amount);
                                            setRenewAmount(String(Math.round(diffDays * dailyInt)));
                                        }}
                                        className={`h-10 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${
                                            renewType === 'INTEREST'
                                                ? 'bg-white dark:bg-slate-750 text-primary shadow-sm border border-slate-200/30'
                                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        Partial Interest
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRenewType('PARTIAL');
                                            setRenewAmount('');
                                        }}
                                        className={`h-10 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${
                                            renewType === 'PARTIAL'
                                                ? 'bg-white dark:bg-slate-750 text-primary shadow-sm border border-slate-200/30'
                                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        Partial Principal
                                    </button>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white uppercase">{showRenewConfirm.client_name || showRenewConfirm.borrower_name || '—'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loan Amount</span>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                        ₹ {Number(showRenewConfirm.loan_amount || 0).toLocaleString('en-IN')}
                                    </span>
                                </div>
                                {(() => {
                                    const grossInterest = calculateAccruedInterest(showRenewConfirm.loan_amount, showRenewConfirm.int_per_day, showRenewConfirm.loan_date, null, showRenewConfirm.renew_history);
                                    const totalRepayable = calculateTotalRepayable(showRenewConfirm.loan_amount, showRenewConfirm.int_per_day, showRenewConfirm.loan_date, null, showRenewConfirm.renew_history);
                                    return (
                                        <>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Interest</span>
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                                                    ₹ {grossInterest.toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Total Repayable</span>
                                                <span className="text-sm font-black text-primary font-mono">
                                                    ₹ {totalRepayable.toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>


                            {/* Conditional Inputs */}
                            {renewType === 'INTEREST' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                                Interest Period Days
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                                value={renewDate ? calculateDaysRecd(getLastRenewalDate(showRenewConfirm), renewDate) : ''}
                                                onChange={(e) => {
                                                    const days = parseInt(e.target.value, 10);
                                                    if (!isNaN(days) && days >= 0) {
                                                        const newDate = addDaysToDate(getLastRenewalDate(showRenewConfirm), days);
                                                        handleRenewDateChange(newDate);
                                                    } else if (e.target.value === '') {
                                                        setRenewDate('');
                                                        setRenewAmount('');
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                                Interest Amount (₹) <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                disabled
                                                className="w-full h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 text-sm font-bold outline-none cursor-not-allowed font-mono"
                                                placeholder="₹ 0"
                                                value={renewAmount ? Number(String(renewAmount).replace(/,/g, '')).toLocaleString('en-IN') : ''}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Interest Received Till Date <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            value={renewDate}
                                            onChange={(e) => handleRenewDateChange(e.target.value)}
                                        />
                                    </div>
                                </div>
                            ) : (() => {
                                    const maxRepayable = Math.round(calculateTotalRepayable(showRenewConfirm.loan_amount, showRenewConfirm.int_per_day, showRenewConfirm.loan_date, null, showRenewConfirm.renew_history));
                                    const enteredAmount = Number(String(renewAmount).replace(/,/g, '')) || 0;
                                    const isExceeded = enteredAmount > maxRepayable;
                                    return (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                                    Payment Date <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    required
                                                    className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                                    value={renewDate}
                                                    onChange={(e) => setRenewDate(e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                                    Partial Amount (₹) <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    className={`w-full h-12 bg-slate-50 dark:bg-slate-800/50 border rounded-2xl px-4 text-sm font-bold focus:ring-2 outline-none font-mono transition-all ${
                                                        isExceeded
                                                            ? 'border-rose-400 dark:border-rose-500 focus:ring-rose-400/20 text-rose-500'
                                                            : 'border-slate-100 dark:border-slate-800 focus:ring-primary/20 dark:text-white'
                                                    }`}
                                                    placeholder="₹ 0"
                                                    value={renewAmount ? Number(String(renewAmount).replace(/,/g, '')).toLocaleString('en-IN') : ''}
                                                    onChange={(e) => {
                                                        const rawValue = e.target.value.replace(/[^0-9]/g, '');
                                                        setRenewAmount(rawValue);
                                                    }}
                                                />
                                                {isExceeded ? (
                                                    <p className="text-[10px] font-bold text-rose-500 px-1 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[13px]">error</span>
                                                        Max: ₹ {maxRepayable.toLocaleString('en-IN')}
                                                    </p>
                                                ) : (
                                                    <p className="text-[10px] font-semibold text-slate-400 px-1">
                                                        Max: ₹ {maxRepayable.toLocaleString('en-IN')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowRenewConfirm(null)}
                                    className="h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!renewDate || !renewAmount || (() => {
                                        if (renewType !== 'PARTIAL') return false;
                                        const maxRepayable = Math.round(calculateTotalRepayable(showRenewConfirm.loan_amount, showRenewConfirm.int_per_day, showRenewConfirm.loan_date, null, showRenewConfirm.renew_history));
                                        return Number(String(renewAmount).replace(/,/g, '')) > maxRepayable;
                                    })()}
                                    onClick={() => {
                                        if (!renewDate || !renewAmount) return;
                                        const cleanAmount = String(renewAmount).replace(/,/g, '');
                                        handleStatusChange(showRenewConfirm.id, 'RENEW', renewDate, cleanAmount, renewType === 'PARTIAL');
                                        setShowRenewConfirm(null);
                                    }}
                                    className="h-12 text-[10px] font-black rounded-2xl uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:bg-slate-400 disabled:dark:bg-slate-600"
                                >
                                    Confirm Renew
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation Popup */}
            {showDeleteConfirm && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-6 mx-auto">
                                <span className="material-symbols-outlined text-rose-500 text-3xl">delete_forever</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight uppercase">Delete Loan</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-6 leading-relaxed px-4">
                                Are you sure you want to delete <span className="font-black text-slate-900 dark:text-white">{showDeleteConfirm.client_name || showDeleteConfirm.borrower_name || '—'}</span> loan?
                            </p>
                            <p className="text-rose-500 text-xs font-bold mb-6">This action cannot be undone.</p>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(null)}
                                    className="h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleDeleteLoan(showDeleteConfirm.id);
                                        setShowDeleteConfirm(null);
                                    }}
                                    className="h-12 bg-rose-500 text-white text-[10px] font-black rounded-2xl shadow-lg shadow-rose-500/20 hover:bg-rose-600 uppercase tracking-widest transition-all"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default ShortLoan;
