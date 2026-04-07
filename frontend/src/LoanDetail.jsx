import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';

const fmtINR = (val, showSymbol = true) =>
    val != null ? (showSymbol ? `₹ ${Number(val).toLocaleString('en-IN')}` : Number(val).toLocaleString('en-IN')) : '—';

const formatINRInput = (val) => {
    if (!val) return "";
    const clean = val.toString().replace(/[^0-9.]/g, "");
    if (!clean) return "";
    const parts = clean.split(".");
    const beforeDec = parts[0];
    const afterDec = parts[1] !== undefined ? "." + parts[1].slice(0, 2) : "";

    // Indian formatting logic for thousands
    let lastThree = beforeDec.substring(beforeDec.length - 3);
    let otherNumbers = beforeDec.substring(0, beforeDec.length - 3);
    if (otherNumbers !== "") lastThree = "," + lastThree;
    let res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree + afterDec;
    return res;
};

const parseINR = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    return Number(val.toString().replace(/,/g, "")) || 0;
};

const getAcronym = (name) => {
    if (!name) return '—';
    const n = name.trim().toLowerCase();
    if (n === 'surge capital solution' || n.includes('surge capital')) return 'SCS';
    if (n === 'growth capital' || n.includes('growth capital')) return 'GC';
    if (n === 'finova capital' || n.includes('finova capital')) return 'FC';
    if (n === 'ascend solutions' || n.includes('ascend solutions')) return 'AS';
    if (n === 'as enterprises' || n.includes('as enterprises')) return 'ASE';
    if (n === 'sc enterprises' || n.includes('sc enterprises')) return 'SCE';
    if (n === 'a square enterprises' || n.includes('square enterprises')) return 'ASQ';
    if (n === 's nirmala' || n.includes('nirmala')) return 'SN';
    return name;
};
const toDDMMYYYY = (val) => {
    if (!val || !val.includes('-')) return val;
    const parts = val.split('-');
    if (parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`; // yyyy-mm-dd -> dd-mm-yyyy
    return val;
};

const toYYYYMMDD = (val) => {
    if (!val || !val.includes('-')) return '';
    const parts = val.split('-');
    if (parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`; // dd-mm-yyyy -> yyyy-mm-dd
    return val;
};

const formatDateInput = (val) => {
    const digits = val.replace(/\D/g, '');
    let formatted = '';
    if (digits.length > 0) formatted += digits.slice(0, 2);
    if (digits.length > 2) formatted += '-' + digits.slice(2, 4);
    if (digits.length > 4) formatted += '-' + digits.slice(4, 8);
    return formatted;
};

const getSplitData = (splitsStr, targetKey) => {
    let sDict = {};
    try { sDict = splitsStr ? JSON.parse(splitsStr) : {}; } catch (err) { }
    const val = sDict[targetKey];
    if (val === undefined || val === null) return null;

    // Normalize string/float scalars to object format
    const objVal = (typeof val === 'object' && val !== null) ? val : { amount: Number(val) || 0, tds: '', remarks: '' };

    // Natively normalize everything into an Array matrix for chainable tracking
    if (Array.isArray(objVal)) return objVal;
    return [objVal];
};

const getSplitAmount = (splitsStr, targetKey) => {
    const dataArray = getSplitData(splitsStr, targetKey);
    if (!dataArray || dataArray.length === 0) return null;
    // Calculate the accumulative sum of all iterative slices
    return dataArray.reduce((s, acc) => s + (Number(acc.amount) || 0), 0);
};

const getSplitTDS = (splitsStr, targetKey) => {
    const dataArray = getSplitData(splitsStr, targetKey);
    if (!dataArray || dataArray.length === 0) return 0;
    return dataArray.reduce((s, acc) => s + (Number(acc.tds) || 0), 0);
};


const AccountTag = ({ label, color }) => (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${color}`}>
        {label}
    </span>
);

const SectionHeader = ({ title, icon, action }) => (
    <div className="flex items-center justify-between mb-4 first:mt-0">
        <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h2>
        </div>
        {action}
    </div>
);

// Custom component to prevent cursor jumping on formatted inputs
// Defined outside to preserve focus identity across parent renders
const FormattedInput = ({ value, onBlur, onChange, className, placeholder }) => {
    const [localVal, setLocalVal] = useState(value || '');
    const isFocused = useRef(false);

    useEffect(() => {
        if (!isFocused.current) {
            setLocalVal(value || '');
        }
    }, [value]);

    return (
        <input
            type="text"
            value={localVal}
            onChange={(e) => {
                setLocalVal(e.target.value);
                if (onChange) onChange(e.target.value);
            }}
            onFocus={() => { isFocused.current = true; }}
            onBlur={(e) => {
                isFocused.current = false;
                const formatted = formatINRInput(e.target.value);
                setLocalVal(formatted);
                if (onBlur) onBlur(formatted);
            }}
            className={className}
            placeholder={placeholder}
        />
    );
};
const RepaymentTable = ({
    data,
    title,
    icon,
    showAddButton = false,
    isManual = false,
    loan,
    setLoan,
    schedule,
    isPanel,
    handleScheduleUpdate,
    handleFieldChange,
    handleSplitChange,
    handleDeleteRow,
    handleAddRow,
    formatDateInput,
    formatINRInput,
    toYYYYMMDD,
    toDDMMYYYY,
    onEditAccountSplit
}) => {
    const hasAnyTDS = !isManual && data.some(entry => {
        // Check primary account
        if (getSplitTDS(entry.splits, loan?.primary_account_name) > 0) return true;
        // Check secondary accounts
        return (loan?.remaining_accounts || []).some(acc => getSplitTDS(entry.splits, acc.account_name) > 0);
    });

    const [expandedRows, setExpandedRows] = useState({});
    const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <div className="mb-10 last:mb-0">
            <SectionHeader title={title} icon={icon} />
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto scrollbar-premium">
                    <table className="min-w-full w-max border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-left w-20">S.No</th>
                                <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-left w-32">Date</th>
                                <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-left w-28">Chq No</th>
                                <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-left w-40">Amount</th>
                                {isManual && <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-left min-w-[200px]">Remarks</th>}
                                <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-left min-w-[100px]">Received Date</th>
                                <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-40">{getAcronym(loan.primary_account_name)}</th>
                                {!isManual && hasAnyTDS && (
                                    <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right text-red-500 w-20">TDS(10%)</th>
                                )}
                                <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-left min-w-[100px]">Due Date</th>
                                {(loan.remaining_accounts || []).map((acc, i) => (
                                    <React.Fragment key={i}>
                                        <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-40">{getAcronym(acc.account_name)}</th>
                                        {!isManual && <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right text-red-500 w-20">TDS(10%)</th>}
                                    </React.Fragment>
                                ))}
                                {isManual && <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {data.length > 0 ? (
                                data.map((entry, idx) => {
                                    const isInterestRow = schedule && entry.id === schedule[0]?.id;
                                    const primaryPercent = loan.primary_account_share || 0;
                                    const primaryShare = parseINR(entry.amount) * (primaryPercent / 100);

                                    const overridenDataArray = getSplitData(entry.splits, loan.primary_account_name);
                                    const hasPrimaryOverride = overridenDataArray !== null && overridenDataArray.length > 0;
                                    const totalOverridenAmount = getSplitAmount(entry.splits, loan.primary_account_name) || 0;
                                    const totalOverridenTDS = getSplitTDS(entry.splits, loan.primary_account_name) || 0;
                                    const balancePrimaryAmount = hasPrimaryOverride ? primaryShare - (totalOverridenAmount + totalOverridenTDS) : 0;

                                    // Secondary Account Overrides tracking
                                    const secondarySplits = (loan.remaining_accounts || []).map(acc => {
                                        const p = acc.percentage || 0;
                                        const grossShare = parseINR(entry.amount) * (p / 100);
                                        const tds = isInterestRow ? (acc.interest_amount || 0) * 0.10 : 0;
                                        const netShare = grossShare - tds;

                                        const splits = getSplitData(entry.splits, acc.account_name);
                                        const totalOverriden = getSplitAmount(entry.splits, acc.account_name) || 0;
                                        const totalOverridenTDS = getSplitTDS(entry.splits, acc.account_name) || 0;
                                        const hasOverride = splits !== null && splits.length > 0;
                                        const balance = hasOverride ? netShare - (totalOverriden + totalOverridenTDS) : 0;

                                        return { acc, splits, hasOverride, balance, netShare, tds };
                                    });

                                    const hasAnyOverride = hasPrimaryOverride || secondarySplits.some(s => s.hasOverride);
                                    const hasSubRows = !isManual && hasAnyOverride;
                                    const balancePrimaryIsClickable = !isManual && Math.round(balancePrimaryAmount * 100) / 100 > 0;

                                    // Find max partial payment depth across all accounts
                                    const maxSplits = Math.max(
                                        overridenDataArray?.length || 0,
                                        ...secondarySplits.map(s => s.splits?.length || 0)
                                    );

                                    return (
                                        <React.Fragment key={entry.id}>
                                            <tr
                                                className={`hover:bg-slate-50 dark:hover:bg-slate-800/25 transition-colors border-t border-slate-100 dark:border-slate-800 ${hasSubRows ? 'cursor-pointer' : ''}`}
                                                onClick={(e) => {
                                                    if (hasSubRows && !e.target.closest('input, textarea, button')) {
                                                        const closestPointer = e.target.closest('.cursor-pointer');
                                                        if (closestPointer && closestPointer !== e.currentTarget) return;
                                                        toggleRow(entry.id);
                                                    }
                                                }}
                                            >
                                                <td className="py-3 px-5 text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    <div className="flex items-center gap-1.5">
                                                        {hasSubRows ? (
                                                            <span className={`material-symbols-outlined text-[16px] text-indigo-500 transition-transform ${expandedRows[entry.id] ? 'rotate-90' : ''}`}>chevron_right</span>
                                                        ) : (
                                                            <span className="w-4"></span>
                                                        )}
                                                        {idx + 1}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-5 text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    {isManual ? (
                                                        <div className="flex items-center gap-2 group relative">
                                                            <input
                                                                type="text"
                                                                value={entry.date || ''}
                                                                onChange={(e) => handleScheduleUpdate(entry.id, 'date', formatDateInput(e.target.value))}
                                                                onBlur={(e) => handleFieldChange(entry.id, 'date', e.target.value)}
                                                                className="bg-transparent border-none text-left text-sm font-medium w-24 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 -ml-1 transition-all"
                                                                placeholder="dd-mm-yyyy"
                                                            />
                                                            <div className="relative">
                                                                <span className="material-symbols-outlined text-[16px] text-slate-400 hover:text-primary cursor-pointer transition-colors opacity-0 group-hover:opacity-100">calendar_month</span>
                                                                <input
                                                                    type="date"
                                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                                    value={toYYYYMMDD(entry.date)}
                                                                    onChange={(e) => {
                                                                        const val = toDDMMYYYY(e.target.value);
                                                                        handleScheduleUpdate(entry.id, 'date', val);
                                                                        handleFieldChange(entry.id, 'date', val);
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-900 dark:text-slate-100 font-bold">
                                                            {entry.date || '—'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-5 text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    {isManual ? (
                                                        <input
                                                            type="text"
                                                            value={entry.cheque_no || ''}
                                                            onChange={(e) => handleScheduleUpdate(entry.id, 'cheque_no', e.target.value)}
                                                            onBlur={(e) => handleFieldChange(entry.id, 'cheque_no', e.target.value)}
                                                            className="bg-transparent border-none text-left text-sm font-medium w-full focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 -ml-1 transition-all"
                                                            placeholder=""
                                                        />
                                                    ) : (
                                                        <span>{entry.cheque_no || '—'}</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-left">
                                                    {isManual ? (
                                                        <FormattedInput
                                                            value={formatINRInput(entry.amount)}
                                                            onChange={(val) => {
                                                                handleScheduleUpdate(entry.id, 'amount', val);
                                                            }}
                                                            onBlur={(val) => {
                                                                handleFieldChange(entry.id, 'amount', val);
                                                            }}
                                                            className="bg-transparent border-none text-left text-sm font-bold w-full focus:outline-none focus:ring-1 focus:ring-primary/30 rounded transition-all"
                                                            placeholder="0.00"
                                                        />
                                                    ) : (
                                                        <span>{formatINRInput(entry.amount) || '0'}</span>
                                                    )}
                                                </td>
                                                {isManual && (
                                                    <td className="py-3 px-5 text-sm text-slate-600 dark:text-slate-400">
                                                        <textarea
                                                            rows="1"
                                                            value={entry.remarks || ''}
                                                            onChange={(e) => handleScheduleUpdate(entry.id, 'remarks', e.target.value)}
                                                            onBlur={(e) => handleFieldChange(entry.id, 'remarks', e.target.value)}
                                                            className="bg-transparent border-none text-left text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 -ml-1 transition-all resize-none overflow-hidden"
                                                            placeholder="Add remarks..."
                                                            onInput={(e) => {
                                                                e.target.style.height = 'auto';
                                                                e.target.style.height = e.target.scrollHeight + 'px';
                                                            }}
                                                        />
                                                    </td>
                                                )}
                                                <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right group relative">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <input
                                                            type="text"
                                                            value={entry.received_date || ''}
                                                            onChange={(e) => handleScheduleUpdate(entry.id, 'received_date', formatDateInput(e.target.value))}
                                                            onBlur={(e) => handleFieldChange(entry.id, 'received_date', e.target.value)}
                                                            className="bg-transparent border-none text-left text-sm font-bold w-24 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded"
                                                            placeholder="dd-mm-yyyy"
                                                        />
                                                        <div className="relative h-5 w-5 flex justify-center items-center">
                                                            <span className="material-symbols-outlined text-[18px] text-slate-400 hover:text-primary cursor-pointer transition-colors opacity-0 group-hover:opacity-100">edit_calendar</span>
                                                            <input
                                                                type="date"
                                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                                value={toYYYYMMDD(entry.received_date)}
                                                                onChange={(e) => {
                                                                    const val = toDDMMYYYY(e.target.value);
                                                                    handleScheduleUpdate(entry.id, 'received_date', val);
                                                                    handleFieldChange(entry.id, 'received_date', val);
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right min-w-[150px]">
                                                    {entry.type === 'manual' ? (
                                                        <FormattedInput
                                                            value={entry.splits ? fmtINR(getSplitAmount(entry.splits, loan.primary_account_name), false) : '0'}
                                                            onChange={(val) => {
                                                                const entryIdx = loan.repayment_schedule.findIndex(s => s.id === entry.id);
                                                                const newSched = [...loan.repayment_schedule];
                                                                let sDict = {};
                                                                try { sDict = newSched[entryIdx].splits ? JSON.parse(newSched[entryIdx].splits) : {}; } catch (err) { }
                                                                sDict[loan.primary_account_name] = val.replace(/[^0-9.]/g, '');
                                                                newSched[entryIdx].splits = JSON.stringify(sDict);
                                                                setLoan({ ...loan, repayment_schedule: newSched });
                                                            }}
                                                            onBlur={(val) => handleSplitChange(entry.id, loan.primary_account_name, val)}
                                                            className="w-full bg-transparent text-right outline-none focus:bg-white dark:focus:bg-slate-800 rounded border border-transparent focus:border-indigo-500/50"
                                                        />
                                                    ) : (
                                                        <div
                                                            className={`rounded px-1 transition-colors group relative inline-flex items-center justify-end gap-1 ${!hasPrimaryOverride ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : 'cursor-default'}`}
                                                            title={hasPrimaryOverride ? "Override Applied. Edit payment details in sub-rows below." : "Click to override details"}
                                                            onClick={(e) => {
                                                                if (hasPrimaryOverride) return;
                                                                e.stopPropagation();
                                                                onEditAccountSplit && onEditAccountSplit(entry, loan.primary_account_name, primaryShare, false, 0);
                                                            }}
                                                        >
                                                            <span className={`${hasPrimaryOverride ? 'font-bold' : ''} ${Math.round(balancePrimaryAmount * 100) / 100 > 0 ? 'text-red-500' : (hasPrimaryOverride ? 'text-slate-900 dark:text-slate-100' : '')}`}>
                                                                {fmtINR(primaryShare, false)}
                                                            </span>
                                                            {hasPrimaryOverride && (
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 absolute -top-1 -right-1" title="Override Applied"></div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                {!isManual && hasAnyTDS && (
                                                    <td className="py-3 px-5 text-sm font-medium text-red-600 dark:text-red-400 text-right">
                                                        {getSplitTDS(entry.splits, loan.primary_account_name) > 0 ? fmtINR(getSplitTDS(entry.splits, loan.primary_account_name), false) : '—'}
                                                    </td>
                                                )}
                                                <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-left group relative">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <input
                                                            type="text"
                                                            value={entry.payment_date || ''}
                                                            onChange={(e) => handleScheduleUpdate(entry.id, 'payment_date', formatDateInput(e.target.value))}
                                                            onBlur={(e) => handleFieldChange(entry.id, 'payment_date', e.target.value)}
                                                            className="bg-transparent border-none text-left text-sm font-bold w-24 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded"
                                                            placeholder="dd-mm-yyyy"
                                                        />
                                                        <div className="relative h-5 w-5 flex justify-center items-center">
                                                            <span className="material-symbols-outlined text-[18px] text-slate-400 hover:text-primary cursor-pointer transition-colors opacity-0 group-hover:opacity-100">edit_calendar</span>
                                                            <input
                                                                type="date"
                                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                                value={toYYYYMMDD(entry.payment_date)}
                                                                onChange={(e) => {
                                                                    const val = toDDMMYYYY(e.target.value);
                                                                    handleScheduleUpdate(entry.id, 'payment_date', val);
                                                                    handleFieldChange(entry.id, 'payment_date', val);
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                {(loan.remaining_accounts || []).map((acc, i) => {
                                                    const s = secondarySplits[i];
                                                    const currentGrossSplitAmount = getSplitAmount(entry.splits, acc.account_name) ?? (entry.type === 'manual' ? 0 : s.netShare + s.tds);

                                                    return (
                                                        <React.Fragment key={i}>
                                                            <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                                                {entry.type === 'manual' ? (
                                                                    <FormattedInput
                                                                        value={fmtINR(currentGrossSplitAmount, false)}
                                                                        onChange={(val) => {
                                                                            const entryIdx = loan.repayment_schedule.findIndex(s => s.id === entry.id);
                                                                            const newSched = [...loan.repayment_schedule];
                                                                            let sDict = {};
                                                                            try { sDict = newSched[entryIdx].splits ? JSON.parse(newSched[entryIdx].splits) : {}; } catch (err) { }
                                                                            sDict[acc.account_name] = val.replace(/[^0-9.]/g, '');
                                                                            newSched[entryIdx].splits = JSON.stringify(sDict);
                                                                            setLoan({ ...loan, repayment_schedule: newSched });
                                                                        }}
                                                                        onBlur={(val) => handleSplitChange(entry.id, acc.account_name, val)}
                                                                        className="w-full bg-transparent text-right outline-none focus:bg-white dark:focus:bg-slate-800 rounded border border-transparent focus:border-indigo-500/50"
                                                                    />
                                                                ) : (
                                                                    <div
                                                                        className={`rounded px-1 transition-colors group relative inline-flex items-center justify-end gap-1 ${!s.hasOverride ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : 'cursor-default'}`}
                                                                        title={s.hasOverride ? "Override Applied. Edit payment details in sub-rows below." : "Click to override details"}
                                                                        onClick={(e) => {
                                                                            if (s.hasOverride) return;
                                                                            e.stopPropagation();
                                                                            onEditAccountSplit && onEditAccountSplit(entry, acc.account_name, s.netShare, false, 0);
                                                                        }}
                                                                    >
                                                                        <span className={`${s.hasOverride ? 'font-bold' : ''} ${Math.round(s.balance * 100) / 100 > 0 ? 'text-red-500' : (s.hasOverride ? 'text-slate-900 dark:text-slate-100' : '')}`}>
                                                                            {fmtINR(s.netShare, false)}
                                                                        </span>
                                                                        {s.hasOverride && (
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 absolute -top-1 -right-1" title="Override Applied"></div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {!isManual && (
                                                                <td className="py-3 px-5 text-sm font-medium text-red-600 dark:text-red-400 text-right">
                                                                    {s.hasOverride ? fmtINR(getSplitTDS(entry.splits, acc.account_name), false) : (isInterestRow ? fmtINR(s.tds, false) : '—')}
                                                                </td>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                {isManual && (
                                                    <td className="py-3 px-5 text-center">
                                                        <button
                                                            onClick={() => handleDeleteRow(entry.id)}
                                                            className="inline-flex items-center justify-center h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                            title="Delete Row"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>

                                            {hasSubRows && expandedRows[entry.id] && (
                                                Array.from({ length: maxSplits }).map((_, pIdx) => {
                                                    const actualIndex = pIdx;
                                                    const primaryPartial = overridenDataArray && overridenDataArray[actualIndex];
                                                    // Ensure we only render a row if at least one account has a split at this index
                                                    if (!primaryPartial && !secondarySplits.some(s => s.splits && s.splits[actualIndex])) return null;

                                                    return (
                                                        <tr key={`partial-${actualIndex}`} className="bg-indigo-50/20 dark:bg-indigo-900/10 border-indigo-100/50 dark:border-indigo-900/20 border-b last:border-b-0">
                                                            <td colSpan={isManual ? 6 : 5} className={`p-0 border-l-[3px] transition-colors duration-300 rounded-bl-sm border-indigo-300/50 dark:border-indigo-700/50`}>
                                                                <div className="flex justify-end items-center max-h-12 py-2.5 px-5 opacity-100 gap-5 select-none font-medium">
                                                                    {(() => {
                                                                        const remarksList = [
                                                                            primaryPartial?.remarks,
                                                                            ...(secondarySplits.map(s => s.splits?.[actualIndex]?.remarks))
                                                                        ].filter(Boolean);
                                                                        if (remarksList.length === 0) return null;
                                                                        return (
                                                                            <span className="text-[12px] text-slate-500 dark:text-slate-400 truncate max-w-[400px] border-r border-slate-300 dark:border-slate-700 pr-3 mr-1" title={remarksList.join(" | ")}>
                                                                                {remarksList.join(" | ")}
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">↳ Payment #{actualIndex + 1}:</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-0">
                                                                <div className="flex flex-col justify-end items-end py-2.5 px-5 h-full">
                                                                    {primaryPartial ? (
                                                                        <div className="flex flex-col items-end py-2.5 px-1.5 h-full select-none">
                                                                            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 leading-none transition-colors">
                                                                                {fmtINR(primaryPartial.amount, false)}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-sm font-bold text-slate-300 dark:text-slate-700 px-1.5">—</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            {!isManual && hasAnyTDS && (
                                                                <td className="p-0">
                                                                    <div className="flex justify-end items-center py-2.5 px-5 h-full">
                                                                        {primaryPartial?.tds ? (
                                                                            <span className="text-sm font-medium text-red-600 dark:text-red-400 text-right w-full">
                                                                                {fmtINR(primaryPartial.tds, false)}
                                                                            </span>
                                                                        ) : (
                                                                            primaryPartial ? <span className="text-sm font-medium text-slate-300 dark:text-slate-700 px-1.5 text-right w-full">—</span> : null
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            )}
                                                            <td className="p-0"></td>
                                                            {(loan.remaining_accounts || []).map((acc, accountIdx) => {
                                                                const s = secondarySplits[accountIdx];
                                                                const partial = s.splits && s.splits[actualIndex];
                                                                return (
                                                                    <React.Fragment key={accountIdx}>
                                                                        <td className="p-0">
                                                                            <div className="flex flex-col justify-end items-end py-2.5 px-5 h-full">
                                                                                {partial ? (
                                                                                    <div className="flex flex-col items-end py-2.5 px-1.5 h-full select-none">
                                                                                        <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 leading-none transition-colors">
                                                                                            {fmtINR(partial.amount, false)}
                                                                                        </span>
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="text-sm font-bold text-slate-300 dark:text-slate-700 px-1.5">—</span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="p-0">
                                                                            <div className="flex justify-end items-center py-2.5 px-5 h-full">
                                                                                {partial?.tds ? (
                                                                                    <span className="text-sm font-medium text-red-600 dark:text-red-400 px-1.5 text-right w-full">
                                                                                        {fmtINR(partial.tds, false)}
                                                                                    </span>
                                                                                ) : (
                                                                                    partial ? <span className="text-sm font-medium text-slate-300 dark:text-slate-700 px-1.5 text-right w-full">—</span> : null
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })
                                            )}

                                            {hasSubRows && expandedRows[entry.id] && (
                                                <tr className="bg-indigo-50/40 dark:bg-indigo-900/20">
                                                    <td colSpan={isManual ? 6 : 5} className="p-0 border-l-[3px] border-indigo-400 dark:border-indigo-500 rounded-bl-sm">
                                                        <div className="transition-all duration-300 ease-in-out overflow-hidden flex justify-end items-center gap-5 max-h-12 py-2.5 px-5 opacity-100">
                                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">↳ Balance Remaining:</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-0">
                                                        <div className={`transition-all duration-300 ease-in-out overflow-hidden flex justify-end items-center ${expandedRows[entry.id] ? 'max-h-12 py-2.5 px-5 opacity-100' : 'max-h-0 py-0 px-5 opacity-0'}`}>
                                                            {balancePrimaryIsClickable ? (
                                                                <div
                                                                    className="cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded px-1.5 py-0.5 transition-colors group relative inline-flex items-center gap-1"
                                                                    title="Click to add partial payment"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onEditAccountSplit && onEditAccountSplit(entry, loan.primary_account_name, balancePrimaryAmount, true, -1);
                                                                    }}
                                                                >
                                                                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 group-hover:text-indigo-800 dark:group-hover:text-indigo-300 transition-colors">
                                                                        {Number(balancePrimaryAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-sm font-bold text-slate-400 dark:text-slate-500 px-1.5">
                                                                    {Number(balancePrimaryAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {!isManual && hasAnyTDS && <td className="p-0"></td>}
                                                    <td className="p-0"></td>
                                                    {(loan.remaining_accounts || []).map((acc, i) => {
                                                        const s = secondarySplits[i];
                                                        const clickable = s.hasOverride && Math.round(s.balance * 100) / 100 > 0;
                                                        return (
                                                            <React.Fragment key={i}>
                                                                <td className="p-0">
                                                                    <div className={`transition-all duration-300 ease-in-out overflow-hidden flex justify-end items-center ${expandedRows[entry.id] ? 'max-h-12 py-2.5 px-5 opacity-100' : 'max-h-0 py-0 px-5 opacity-0'}`}>
                                                                        {clickable ? (
                                                                            <div
                                                                                className="cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded px-1.5 py-0.5 transition-colors group relative inline-flex items-center gap-1"
                                                                                title="Click to add partial payment"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    onEditAccountSplit && onEditAccountSplit(entry, acc.account_name, s.balance, true, -1);
                                                                                }}
                                                                            >
                                                                                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 group-hover:text-indigo-800 dark:group-hover:text-indigo-300 transition-colors">
                                                                                    {Number(s.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-sm font-bold text-slate-400 dark:text-slate-500 px-1.5">
                                                                                {Number(s.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="p-0"></td>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={isManual ? 8 + (loan.remaining_accounts?.length || 0) : 8 + (loan.remaining_accounts?.length || 0) * 2} className="py-8 text-center text-slate-500 text-sm">No data available.</td>
                                </tr>
                            )}
                        </tbody>
                        {data.length > 0 && !isPanel && (
                            <tfoot>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
                                    <td colSpan="3" className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total</td>
                                    <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-left">
                                        {fmtINR(data.reduce((s, e) => s + parseINR(e.amount), 0), false)}
                                    </td>
                                    {isManual && <td className="py-3 px-5"></td>}
                                    <td className="py-3 px-5"></td>
                                    <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right min-w-[150px]">
                                        {fmtINR(data.reduce((s, e) => {
                                            const pShareAmount = getSplitAmount(e.splits, loan.primary_account_name) ?? (e.type === 'manual' ? 0 : parseINR(e.amount) * ((loan.primary_account_share || 0) / 100));
                                            return s + pShareAmount;
                                        }, 0), false)}
                                    </td>
                                    {!isManual && hasAnyTDS && (
                                        <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                            {fmtINR(data.reduce((s, e) => {
                                                const overridenTDS = getSplitTDS(e.splits, loan.primary_account_name);
                                                return s + (overridenTDS !== null ? overridenTDS : 0);
                                            }, 0), false)}
                                        </td>
                                    )}
                                    <td className="py-3 px-5 text-right font-bold text-slate-400 dark:text-slate-500">—</td>
                                    {(loan.remaining_accounts || []).map((acc, i) => {
                                        return (
                                            <React.Fragment key={i}>
                                                <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                                    {fmtINR(data.reduce((s, e) => {
                                                        const isInterest = schedule && e.id === schedule[0]?.id;
                                                        const p = acc.percentage || 0;
                                                        const defaultGross = parseINR(e.amount) * (p / 100);
                                                        const defaultTDS = isInterest ? (acc.interest_amount || 0) * 0.10 : 0;
                                                        const defaultNet = defaultGross - defaultTDS;

                                                        const overridenAmount = getSplitAmount(e.splits, acc.account_name);
                                                        return s + (overridenAmount !== null ? overridenAmount : (e.type === 'manual' ? 0 : defaultNet));
                                                    }, 0), false)}
                                                </td>
                                                {!isManual && (
                                                    <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                                        {fmtINR(data.reduce((s, e) => {
                                                            const isInterest = schedule && e.id === schedule[0]?.id;
                                                            const overridenTDS = getSplitTDS(e.splits, acc.account_name);
                                                            if (overridenTDS !== null) return s + overridenTDS;
                                                            return s + (isInterest ? (acc.interest_amount || 0) * 0.10 : 0);
                                                        }, 0), false)}
                                                    </td>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {isManual && <td className="py-3 px-5"></td>}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
            {showAddButton && (
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handleAddRow}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-200 dark:shadow-none active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">add_box</span>
                        Add Row
                    </button>
                </div>
            )}
        </div>
    );
};







const EditAccountSplitModal = ({ isOpen, onClose, entry, loanData, accountName, currentShare, isEditingBalance, editIndex, onSave }) => {
    const [amount, setAmount] = useState('');
    const [tds, setTds] = useState('');
    const [remarks, setRemarks] = useState('');
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (isOpen && entry && loanData && accountName) {
            const dataArray = getSplitData(entry.splits, accountName);

            // editIndex -1 = appending new payment to balance
            if (isEditingBalance || editIndex === -1) {
                setAmount('');
                setTds('');
                setRemarks('');
            } else {
                // Load the specific index from the array for editing
                const item = dataArray && dataArray[editIndex];
                if (item) {
                    setAmount(item.amount !== undefined ? item.amount : '');
                    setTds(item.tds || '');
                    setRemarks(item.remarks || '');
                } else {
                    // First-time override - default to system-calculated share
                    setAmount(currentShare ?? '');
                    setTds('');
                    setRemarks('');
                }
            }
            setSaving(false);
            setErrorMsg('');
        }
    }, [isOpen, entry, loanData, accountName, currentShare, isEditingBalance, editIndex]);

    const handleSave = async () => {
        let numericAmount = parseINR(amount);
        const numericTds = parseINR(tds);
        const totalEntry = numericAmount + numericTds;
        const numericCurrentShare = parseINR(currentShare);

        if (totalEntry > numericCurrentShare) {
            setErrorMsg(`Amount + TDS (${fmtINR(totalEntry, false)}) cannot exceed the limit (${fmtINR(numericCurrentShare, false)})`);
            return;
        }

        setErrorMsg('');
        setSaving(true);
        try {
            const idx = (isEditingBalance || editIndex === -1) ? -1 : (editIndex ?? 0);
            await onSave(entry.id, accountName, numericAmount.toString(), tds, remarks, idx);
        } finally {
            setSaving(false);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">edit_note</span>
                        {isEditingBalance ? "Edit Balance details" : `Override ${getAcronym(accountName)} details`}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                        <input
                            type="text"
                            value={formatINRInput(amount)}
                            onChange={e => {
                                const val = formatINRInput(e.target.value);
                                setAmount(val);
                                const numAmt = parseINR(val);
                                const numTds = parseINR(tds);
                                const limit = parseINR(currentShare);
                                if (numAmt + numTds > limit) {
                                    setErrorMsg(`Amount + TDS (${fmtINR(numAmt + numTds, false)}) cannot exceed the limit (${fmtINR(limit, false)})`);
                                } else {
                                    setErrorMsg('');
                                }
                            }}
                            className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 ${errorMsg ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {errorMsg && (
                            <div className="text-red-500 font-medium text-xs mt-1.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">error</span>
                                {errorMsg}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">TDS (₹) - Optional</label>
                        <input
                            type="text"
                            value={formatINRInput(tds)}
                            onChange={e => setTds(formatINRInput(e.target.value))}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Remarks</label>
                        <textarea
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            rows="2"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                            placeholder="Add overriding remarks..."
                        />
                    </div>

                </div>
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2"
                    >
                        {saving ? (
                            <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Saving...</>
                        ) : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const EditAccountsModal = ({ isOpen, onClose, loanData, onSave }) => {
    const [formData, setFormData] = useState(null);
    const [savingStatus, setSavingStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'
    const [targetTotalInterest, setTargetTotalInterest] = useState(0);

    useEffect(() => {
        if (loanData && isOpen && !formData) {
            const initialTotal = (loanData.primary_account_interest || 0) +
                (loanData.remaining_accounts || []).reduce((s, acc) => s + (acc.interest_amount || 0), 0);

            setTargetTotalInterest(initialTotal);
            setFormData({
                loanRefId: loanData.loan_ref_id || '',
                primary: {
                    name: loanData.primary_account_name,
                    amount: loanData.primary_account_amount,
                    interest: loanData.primary_account_interest,
                    locked: false
                },
                secondary: (loanData.remaining_accounts || []).map(acc => ({
                    id: acc.id,
                    name: acc.account_name,
                    amount: acc.share,
                    interest: acc.interest_amount,
                    locked: false
                }))
            });
        }
    }, [loanData, isOpen, formData]);

    useEffect(() => {
        if (!isOpen) {
            setFormData(null);
            setSavingStatus('idle');
        }
    }, [isOpen]);

    const handleSave = async () => {
        if (!formData) return;
        setSavingStatus('saving');
        try {
            await onSave(formData);
            setSavingStatus('saved');
            setTimeout(() => {
                onClose();
            }, 600);
        } catch (err) {
            setSavingStatus('error');
        }
    };

    if (!isOpen || !formData) return null;

    const totalInterest = (Number(formData.primary.interest) || 0) +
        formData.secondary.reduce((s, acc) => s + (Number(acc.interest) || 0), 0);

    const handleLockChange = (idx) => {
        if (idx === -1) {
            setFormData({ ...formData, primary: { ...formData.primary, locked: !formData.primary.locked } });
        } else {
            const newSec = [...formData.secondary];
            newSec[idx].locked = !newSec[idx].locked;
            setFormData({ ...formData, secondary: newSec });
        }
    };

    const getPercent = (amount) => {
        if (targetTotalInterest <= 0) return 0;
        const p = (Number(amount) / targetTotalInterest) * 100;
        return Math.round(p * 100) / 100;
    };

    const handleInterestChange = (idx, val) => {
        if (idx === -1 && formData.primary.locked) return;
        if (idx !== -1 && formData.secondary[idx].locked) return;

        const cleanVal = val.replace(/,/g, '');
        let newInterest = Math.max(0, Number(cleanVal) || 0);

        let sumOthers = 0;
        if (idx !== -1) sumOthers += Number(formData.primary.interest || 0);
        formData.secondary.forEach((acc, sIdx) => {
            if (sIdx !== idx) sumOthers += Number(acc.interest || 0);
        });

        if (newInterest + sumOthers > targetTotalInterest) {
            newInterest = Math.max(0, targetTotalInterest - sumOthers);
        }

        const v = newInterest.toString();

        if (idx === -1) {
            setFormData({ ...formData, primary: { ...formData.primary, interest: v } });
        } else {
            const newSec = [...formData.secondary];
            newSec[idx].interest = v;
            setFormData({ ...formData, secondary: newSec });
        }
    };

    const handlePercentChange = (idx, percent) => {
        if (idx === -1 && formData.primary.locked) return;
        if (idx !== -1 && formData.secondary[idx].locked) return;

        const p = Math.max(0, Math.min(100, Number(percent) || 0));
        const tip = totalInterest;
        if (tip <= 0) return;

        const targetAmount = (p / 100) * tip;
        const otherUnlocked = [];
        let fixedAmount = 0;

        if (idx !== -1) {
            if (formData.primary.locked) fixedAmount += Number(formData.primary.interest);
            else otherUnlocked.push({ type: 'primary', interest: Number(formData.primary.interest) });
        }
        formData.secondary.forEach((acc, sIdx) => {
            if (sIdx !== idx) {
                if (acc.locked) fixedAmount += Number(acc.interest);
                else otherUnlocked.push({ type: 'secondary', idx: sIdx, interest: Number(acc.interest) });
            }
        });

        const maxPossible = Math.max(0, tip - fixedAmount);
        const finalAmountIdx = Math.min(targetAmount, maxPossible);
        const currentAmountIdx = idx === -1 ? Number(formData.primary.interest) : Number(formData.secondary[idx].interest);
        const delta = currentAmountIdx - finalAmountIdx;

        let updatedPrimary = { ...formData.primary };
        let updatedSecondary = [...formData.secondary];

        if (idx === -1) updatedPrimary.interest = finalAmountIdx.toString();
        else updatedSecondary[idx].interest = finalAmountIdx.toString();

        if (otherUnlocked.length > 0) {
            const otherUnlockedSum = otherUnlocked.reduce((s, a) => s + a.interest, 0);
            otherUnlocked.forEach(acc => {
                const share = otherUnlockedSum > 0 ? (acc.interest / otherUnlockedSum) : (1 / otherUnlocked.length);
                const newVal = Math.max(0, acc.interest + (delta * share)).toString();
                if (acc.type === 'primary') updatedPrimary.interest = newVal;
                else updatedSecondary[acc.idx].interest = newVal;
            });
        }

        setFormData({ ...formData, primary: updatedPrimary, secondary: updatedSecondary });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">edit_note</span>
                        Edit Account Details
                    </h3>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-premium">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">tag</span>
                                Loan ID
                                <span className="ml-1 text-slate-400 normal-case font-normal">(max 11 characters)</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={formData.loanRefId}
                                    onChange={(e) => setFormData({ ...formData, loanRefId: e.target.value.slice(0, 11) })}
                                    maxLength={11}
                                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all font-mono tracking-widest text-slate-900 dark:text-white"
                                    placeholder="e.g. JL-2026-001"
                                />
                                <span className="text-[10px] text-slate-400 whitespace-nowrap">{formData.loanRefId.length}/11</span>
                            </div>
                        </div>

                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            Primary Account: {formData.primary.name}
                        </h4>
                        <div className="grid grid-cols-[1fr,1fr,1fr,auto] gap-4 bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800 items-end">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Principal</label>
                                <input
                                    type="text"
                                    readOnly
                                    className="w-full px-3 py-2 text-sm bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg outline-none cursor-not-allowed text-slate-500"
                                    value={fmtINR(formData.primary.amount)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Interest</label>
                                <input
                                    type="text"
                                    readOnly={formData.primary.locked}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 outline-none transition-all ${formData.primary.locked ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed border-slate-200 dark:border-slate-700 text-slate-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-primary/20 focus:border-primary'}`}
                                    value={Number(formData.primary.interest || 0).toLocaleString('en-IN')}
                                    onFocus={e => { e.target.value = formData.primary.interest || ''; }}
                                    onChange={e => handleInterestChange(-1, e.target.value)}
                                    onBlur={e => { e.target.value = Number(formData.primary.interest || 0).toLocaleString('en-IN'); }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-500 uppercase text-indigo-500">Interest %</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="any"
                                        readOnly={formData.primary.locked}
                                        onWheel={(e) => e.target.blur()}
                                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 outline-none transition-all pr-8 ${formData.primary.locked ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed border-indigo-100 dark:border-indigo-900/20 text-slate-500' : 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-900/30 focus:ring-indigo-500/20 focus:border-indigo-500'}`}
                                        value={getPercent(formData.primary.interest)}
                                        onChange={e => handlePercentChange(-1, e.target.value)}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-400">%</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); handleLockChange(-1); }}
                                className={`p-2 rounded-lg transition-colors ${formData.primary.locked ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                title={formData.primary.locked ? "Unlock Interest" : "Lock Interest"}
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {formData.primary.locked ? 'lock' : 'lock_open'}
                                </span>
                            </button>
                        </div>

                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            Secondary Accounts
                        </h4>
                        <div className="space-y-3">
                            {formData.secondary.map((acc, idx) => (
                                <div key={acc.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900 border-l-primary/30">
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{acc.name}</p>
                                    <div className="grid grid-cols-[1fr,1fr,1fr,auto] gap-4 items-end">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase">Principal</label>
                                            <input
                                                type="text"
                                                readOnly
                                                className="w-full px-3 py-2 text-sm bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-lg outline-none cursor-not-allowed text-slate-500"
                                                value={fmtINR(acc.amount)}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase">Interest</label>
                                            <input
                                                type="text"
                                                readOnly={acc.locked}
                                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 outline-none transition-all ${acc.locked ? 'bg-slate-100 dark:bg-slate-800/80 cursor-not-allowed border-slate-200 dark:border-slate-700 text-slate-500' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:ring-primary/20 focus:border-primary'}`}
                                                value={Number(acc.interest || 0).toLocaleString('en-IN')}
                                                onFocus={e => { e.target.value = acc.interest || ''; }}
                                                onChange={e => handleInterestChange(idx, e.target.value)}
                                                onBlur={e => { e.target.value = Number(acc.interest || 0).toLocaleString('en-IN'); }}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase text-indigo-500">Interest %</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="any"
                                                    readOnly={acc.locked}
                                                    onWheel={(e) => e.target.blur()}
                                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 outline-none transition-all pr-8 ${acc.locked ? 'bg-slate-100 dark:bg-slate-800/80 cursor-not-allowed border-indigo-100 dark:border-indigo-900/20 text-slate-500' : 'bg-slate-50 dark:bg-slate-800/50 border-indigo-100 dark:border-indigo-900/20 focus:ring-indigo-500/20 focus:border-indigo-500'}`}
                                                    value={getPercent(acc.interest)}
                                                    onChange={e => handlePercentChange(idx, e.target.value)}
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-400">%</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); handleLockChange(idx); }}
                                            className={`p-2 rounded-lg transition-colors ${acc.locked ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                            title={acc.locked ? "Unlock Interest" : "Lock Interest"}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">
                                                {acc.locked ? 'lock' : 'lock_open'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        {savingStatus === 'saving' && (
                            <div className="flex items-center gap-2 text-primary font-bold text-xs animate-pulse">
                                <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                                Saving changes...
                            </div>
                        )}
                        {savingStatus === 'saved' && (
                            <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs">
                                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                All changes saved
                            </div>
                        )}
                        {savingStatus === 'error' && (
                            <div className="flex items-center gap-2 text-rose-500 font-bold text-xs">
                                <span className="material-symbols-outlined text-[18px]">error</span>
                                Save failed
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={savingStatus === 'saving'}
                        className={`px-8 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg transition-all ${savingStatus === 'saving' ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary/90 shadow-primary/20'}`}
                    >
                        {savingStatus === 'saving' ? 'Saving...' : 'Done'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-8 text-center">
                    <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                        <span className="material-symbols-outlined text-[40px]">warning</span>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Delete Payment Entry?</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 px-4">
                        Are you sure you want to delete this payment entry? This action cannot be undone and will update your balances instantly.
                    </p>
                    <div className="flex gap-4">
                        <button
                            onClick={onClose}
                            className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-xl shadow-red-200 dark:shadow-none transition-all active:scale-95"
                        >
                            Delete Now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LoanDetail = ({ loanId: propLoanId, onClose, filterDate } = {}) => {
    const params = useParams();
    const id = propLoanId ?? params.id;
    const navigate = useNavigate();
    const scrollContainerRef = useRef(null);
    const [loan, setLoan] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [splitModalData, setSplitModalData] = useState(null);
    const isPanel = Boolean(onClose);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        if (isEditModalOpen) {
            el.style.overflow = 'hidden';
        } else {
            el.style.overflow = '';
        }
        return () => { el.style.overflow = ''; };
    }, [isEditModalOpen]);

    useEffect(() => {
        const fetchLoan = async () => {
            try {
                setIsLoading(true);
                const res = await fetch(`/api/loans/${id}`);
                const result = await res.json();
                if (res.ok && result.success) {
                    setLoan(result.loan);
                } else {
                    setError(result.error || 'Failed to load loan data.');
                }
            } catch (e) {
                setError('Network error while fetching loan details.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLoan();
    }, [id]);


    const handleFieldChange = async (scheduleId, field, finalValue) => {
        try {
            // Clean amount if it's the amount field
            let val = finalValue;
            if (field === 'amount' && typeof val === 'string') {
                val = val.replace(/,/g, '');
            }

            const res = await fetch(`/api/repayment-schedule/${scheduleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: val })
            });
            const result = await res.json();
            if (res.ok && result.success) {
                // local state is already updated optimistically in the inputs
            } else {
                console.error(result.error || 'Failed to update field');
            }
        } catch (e) {
            console.error('Error updating field:', e);
        }
    };

    const handleAddRow = async () => {
        try {
            const res = await fetch(`/api/loans/${id}/repayment-schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: '',
                    amount: 0,
                    remarks: '',
                    cheque_no: '',
                    type: 'manual'
                })
            });
            if (res.ok) {
                // Refresh data
                const refreshRes = await fetch(`/api/loans/${id}`);
                const refreshResult = await refreshRes.json();
                if (refreshRes.ok && refreshResult.success) {
                    setLoan(refreshResult.loan);
                }
            }
        } catch (error) {
            console.error('Error adding row:', error);
        }
    };

    const handleDeleteRow = (id) => {
        setItemToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            const res = await fetch(`/api/repayment-schedule/${itemToDelete}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setLoan(prev => ({
                    ...prev,
                    repayment_schedule: prev.repayment_schedule.filter(s => s.id !== itemToDelete)
                }));
            }
        } catch (error) {
            console.error("Error deleting row:", error);
        } finally {
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    const handleSplitChange = (scheduleId, accName, newVal) => {
        const entry = loan.repayment_schedule.find(s => s.id === scheduleId);
        let currentSplits = {};
        try {
            currentSplits = entry.splits ? JSON.parse(entry.splits) : {};
        } catch (e) { currentSplits = {}; }

        const val = parseFloat(newVal.replace(/,/g, '')) || 0;
        currentSplits[accName] = val;

        setLoan(prev => ({
            ...prev,
            repayment_schedule: prev.repayment_schedule.map(s =>
                s.id === scheduleId ? { ...s, splits: JSON.stringify(currentSplits) } : s
            )
        }));

        handleFieldChange(scheduleId, 'splits', JSON.stringify(currentSplits));
    };


    // Helper for optimistic schedule updates
    const handleScheduleUpdate = (scheduleId, field, value) => {
        setLoan(prev => ({
            ...prev,
            repayment_schedule: prev.repayment_schedule.map(s =>
                s.id === scheduleId ? { ...s, [field]: value } : s
            )
        }));
    };

    const handleAccountSplitSave = async (scheduleId, accountName, amount, tds, remarks, editIdx = 0) => {
        const entry = loan.repayment_schedule.find(s => s.id === scheduleId);
        let currentSplits = {};
        try { currentSplits = entry.splits ? JSON.parse(entry.splits) : {}; } catch (e) { }

        const parsedAmt = parseINR(amount);
        const parsedTds = parseINR(tds);
        const cleanRemarks = remarks.trim();

        // Always work with an array for the target account
        let arr = [];
        const existing = currentSplits[accountName];
        if (existing !== undefined && existing !== null) {
            if (Array.isArray(existing)) {
                arr = [...existing];
            } else if (typeof existing === 'object') {
                arr = [existing];
            } else {
                arr = [{ amount: Number(existing) || 0, tds: 0, remarks: '' }];
            }
        }

        const newEntry = { amount: parsedAmt, tds: parsedTds, remarks: cleanRemarks };

        if (editIdx === -1) {
            // Append new partial payment
            arr.push(newEntry);
        } else {
            if (parsedAmt === 0 && parsedTds === 0 && cleanRemarks === '') {
                // Delete this index
                arr.splice(editIdx, 1);
            } else {
                arr[editIdx] = newEntry;
            }
        }

        if (arr.length === 0) {
            delete currentSplits[accountName];
        } else if (arr.length === 1) {
            // Store as single object for backwards compatibility
            currentSplits[accountName] = arr[0];
        } else {
            currentSplits[accountName] = arr;
        }

        const splitsJson = Object.keys(currentSplits).length > 0 ? JSON.stringify(currentSplits) : null;

        handleScheduleUpdate(scheduleId, 'splits', splitsJson);
        await handleFieldChange(scheduleId, 'splits', splitsJson);
    };

    const handleDownloadExcel = async () => {
        if (!loan) return;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Loan Report');

        // Styles
        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF538DD5' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const thickBorder = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };

        const currencyFmt = '#,##0';

        // Title Section
        worksheet.mergeCells('A1:F1');
        const mainTitle = worksheet.getCell('A1');
        mainTitle.value = `LOAN REPORT: ${loan.client_name.toUpperCase()}`;
        mainTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        mainTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF538DD5' } };
        mainTitle.alignment = { horizontal: 'center', vertical: 'middle' };
        mainTitle.border = thickBorder;

        // Metadata Grid
        worksheet.addRow([]);
        const infoRow1 = ['Loan ID:', loan.loan_ref_id || '—', 'Loan Date:', loan.loan_date, 'Total Amount:', loan.loan_amount];
        const r1 = worksheet.addRow(infoRow1);
        r1.eachCell(cell => {
            cell.border = thickBorder;
            if (cell.value === loan.loan_amount) cell.numFmt = currencyFmt;
        });
        ['A', 'C', 'E'].forEach(col => r1.getCell(col).font = { bold: true });
        
        worksheet.addRow([]); // Gap
        
        // Account Details Table
        const accTitleRow = worksheet.addRow(['ACCOUNT DETAILS']);
        const accTitle = accTitleRow.getCell(1);
        accTitle.value = 'ACCOUNT DETAILS';
        accTitle.font = { bold: true, size: 12 };
        accTitle.border = thickBorder;

        const accHeaders = ['ACCOUNT NAME', 'PRINCIPAL', 'INTEREST', 'INTEREST %', 'REPAYMENT AMOUNT'];
        const accHeadRow = worksheet.addRow(accHeaders);
        accHeadRow.eachCell(cell => cell.style = headerStyle);

        const totalInterest = (loan.primary_account_interest || 0) + (loan.remaining_accounts || []).reduce((s, a) => s + (a.interest_amount || 0), 0);

        // Primary Row
        const pTotalRepay = (loan.primary_account_amount || 0) + (loan.primary_account_interest || 0);
        const pIntPercent = totalInterest > 0 ? (loan.primary_account_interest / totalInterest * 100) : 0;
        const pAccRow = worksheet.addRow([
            loan.primary_account_name,
            loan.primary_account_amount,
            loan.primary_account_interest,
            pIntPercent.toFixed(2) + '%',
            pTotalRepay
        ]);
        pAccRow.eachCell((cell, colIdx) => {
            cell.border = thickBorder;
            if (colIdx === 2 || colIdx === 3 || colIdx === 5) cell.numFmt = currencyFmt;
        });

        // Secondary Rows
        (loan.remaining_accounts || []).forEach(acc => {
            const sTotalRepay = (acc.share || 0) + (acc.interest_amount || 0);
            const sIntPercent = totalInterest > 0 ? (acc.interest_amount / totalInterest * 100) : 0;
            const sAccRow = worksheet.addRow([
                acc.account_name,
                acc.share,
                acc.interest_amount,
                sIntPercent.toFixed(2) + '%',
                sTotalRepay
            ]);
            sAccRow.eachCell((cell, colIdx) => {
                cell.border = thickBorder;
                if (colIdx === 2 || colIdx === 3 || colIdx === 5) cell.numFmt = currencyFmt;
            });
        });

        worksheet.addRow([]); // Gap
        worksheet.addRow([]); // Gap

        // Repayment Schedule Table
        // Pre-check for TDS columns
        const systemData = (loan.repayment_schedule || []).filter(s => s.type !== 'manual');
        const hasAnyTDS = systemData.some(entry => {
            if (getSplitTDS(entry.splits, loan.primary_account_name) > 0) return true;
            return (loan.remaining_accounts || []).some(acc => getSplitTDS(entry.splits, acc.account_name) > 0);
        });

        const headers = ['S.NO', 'DATE', 'CHQ NO', 'AMOUNT', 'RECEIVED DATE', getAcronym(loan.primary_account_name)];
        if (hasAnyTDS) headers.push('TDS(10%)');
        headers.push('DUE DATE');
        
        (loan.remaining_accounts || []).forEach(acc => {
            headers.push(getAcronym(acc.account_name));
            if (hasAnyTDS) headers.push('TDS(10%)');
        });

        const schedTitleRow = worksheet.addRow(['REPAYMENT SCHEDULE']);
        const scheduleTitle = schedTitleRow.getCell(1);
        scheduleTitle.font = { bold: true, size: 12 };
        scheduleTitle.border = thickBorder;

        const headRow = worksheet.addRow(headers);
        headRow.eachCell(cell => cell.style = headerStyle);

        systemData.forEach((entry, idx) => {
            const isInterestRow = entry.id === systemData[0]?.id;
            const primaryPercent = loan.primary_account_share || 0;
            const primaryGross = parseINR(entry.amount) * (primaryPercent / 100);
            
            const pOverrideAmt = getSplitAmount(entry.splits, loan.primary_account_name);
            const pOverrideTDS = getSplitTDS(entry.splits, loan.primary_account_name);
            
            let pVal, pTdsVal;
            if (pOverrideAmt !== null) {
                pVal = pOverrideAmt;
                pTdsVal = pOverrideTDS;
            } else {
                pTdsVal = isInterestRow ? (loan.primary_account_interest || 0) * 0.10 : 0;
                pVal = primaryGross - pTdsVal;
            }

            const rowData = [
                idx + 1,
                entry.date || '—',
                entry.cheque_no || '—',
                parseINR(entry.amount),
                entry.received_date || '—',
                pVal
            ];
            if (hasAnyTDS) rowData.push(pTdsVal);
            rowData.push(entry.payment_date || '—');

            (loan.remaining_accounts || []).forEach(acc => {
                const sGross = parseINR(entry.amount) * ((acc.percentage || 0) / 100);
                const sOverrideAmt = getSplitAmount(entry.splits, acc.account_name);
                const sOverrideTDS = getSplitTDS(entry.splits, acc.account_name);
                
                let sVal, sTdsVal;
                if (sOverrideAmt !== null) {
                    sVal = sOverrideAmt;
                    sTdsVal = sOverrideTDS;
                } else {
                    sTdsVal = isInterestRow ? (acc.interest_amount || 0) * 0.10 : 0;
                    sVal = sGross - sTdsVal;
                }
                rowData.push(sVal);
                if (hasAnyTDS) rowData.push(sTdsVal);
            });

            const r = worksheet.addRow(rowData);
            r.eachCell((cell, colIdx) => {
                cell.border = thickBorder;
                if (typeof cell.value === 'number') cell.numFmt = currencyFmt;
            });
        });

        // Manual Payments Table
        const manualData = (loan.repayment_schedule || []).filter(s => s.type === 'manual');
        if (manualData.length > 0) {
            worksheet.addRow([]); // Gap
            const mTitleRow = worksheet.addRow(['ADDITIONAL OVERRIDES / MANUAL PAYMENTS']);
            const manualTitle = mTitleRow.getCell(1);
            manualTitle.font = { bold: true, size: 12 };
            manualTitle.border = thickBorder;

            const mHeaders = ['S.NO', 'DATE', 'CHQ NO', 'AMOUNT', 'REMARKS', 'RECEIVED DATE', getAcronym(loan.primary_account_name)];
            mHeaders.push('DUE DATE');
            (loan.remaining_accounts || []).forEach(acc => mHeaders.push(getAcronym(acc.account_name)));

            const mHeadRow = worksheet.addRow(mHeaders);
            mHeadRow.eachCell(cell => cell.style = headerStyle);

            manualData.forEach((entry, idx) => {
                const rowData = [
                    idx + 1,
                    entry.date || '—',
                    entry.cheque_no || '—',
                    parseINR(entry.amount),
                    entry.remarks || '—',
                    entry.received_date || '—',
                    getSplitAmount(entry.splits, loan.primary_account_name) || 0,
                    entry.payment_date || '—'
                ];
                (loan.remaining_accounts || []).forEach(acc => {
                    rowData.push(getSplitAmount(entry.splits, acc.account_name) || 0);
                });

                const r = worksheet.addRow(rowData);
                r.eachCell((cell, colIdx) => {
                    cell.border = thickBorder;
                    if (typeof cell.value === 'number') cell.numFmt = currencyFmt;
                });
            });
        }

        // Finalize
        worksheet.columns.forEach(column => column.width = 18);
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const namePart = loan.client_name.replace(/\s+/g, '_');
        const idPart = loan.loan_ref_id ? `_${loan.loan_ref_id.replace(/\s+/g, '_')}` : '';
        a.download = `${namePart}${idPart}_SCHEDULE.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSaveAccounts = async (updatedData) => {
        try {
            const res = await fetch(`/api/loans/${id}/accounts`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...updatedData,
                    loan_ref_id: updatedData.loanRefId ?? undefined
                })
            });
            const result = await res.json();
            if (res.ok && result.success) {
                // Refresh data
                const refreshRes = await fetch(`/api/loans/${id}`);
                const refreshResult = await refreshRes.json();
                if (refreshRes.ok && refreshResult.success) {
                    setLoan(refreshResult.loan);
                }
            } else {
                console.error(result.error || 'Failed to update accounts');
                throw new Error(result.error || 'Failed to update accounts');
            }
        } catch (e) {
            console.error('Error updating accounts:', e);
            throw e;
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center text-slate-500 dark:text-slate-400">
                    <span className="material-symbols-outlined animate-spin text-[36px] mb-3 text-primary/70">progress_activity</span>
                    <span className="text-sm font-medium">Loading loan details...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center text-center max-w-sm">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-[32px] text-red-500">error</span>
                    </div>
                    <p className="font-bold text-slate-900 dark:text-white mb-1">Something went wrong</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error}</p>
                    <button
                        onClick={() => navigate(-1)}
                        className="px-5 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const secondaryAccounts = loan.remaining_accounts || [];
    const schedule = loan.repayment_schedule || [];
    const systemSchedule = schedule.filter(s => s.type !== 'manual');
    const manualSchedule = schedule.filter(s => s.type === 'manual');

    // When opened from a filtered view, only show overdue unpaid entries
    const displayedSystemSchedule = filterDate
        ? systemSchedule.filter(entry => {
            const raw = entry.date || '';
            // Convert dd-mm-yyyy to yyyy-mm-dd for comparison
            const parts = raw.split('-');
            const entryDateISO = parts.length === 3 && parts[0].length === 2
                ? `${parts[2]}-${parts[1]}-${parts[0]}`
                : raw;
            return entryDateISO <= filterDate && !entry.received_date;
        })
        : systemSchedule;



    return (
        <div ref={scrollContainerRef} className={isPanel ? 'flex flex-col h-full' : 'flex-1 overflow-y-auto w-full flex flex-col'}>
            <main className="mx-auto p-8 flex-1 flex flex-col w-full">
                {/* Header */}
                <div className="mb-8">
                    {!isPanel && (
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors mb-4 group"
                        >
                            <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                            Back to JL Due Report
                        </button>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                            {loan.client_name}
                        </h1>
                        {loan.loan_ref_id && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:border-primary/30 tracking-widest">
                                <span className="material-symbols-outlined text-[13px]">tag</span>
                                {loan.loan_ref_id}
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                            {loan.loan_date}
                        </span>
                    </div>
                </div>

                {/* Accounts Section */}
                <SectionHeader
                    title="Account Details"
                    icon="account_balance"
                    action={!isPanel && (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-200 dark:shadow-none active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                Edit Accounts
                            </button>
                            <button
                                onClick={handleDownloadExcel}
                                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-200 dark:shadow-none active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[18px]">download</span>
                                Download
                            </button>
                        </div>
                    )}
                />



                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm mb-6">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                    <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Account Name</th>
                                    <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Principal</th>
                                    <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Interest</th>
                                    <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Interest %</th>
                                    <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Repayment Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.keys(loan).length > 0 && (() => {
                                    const totalInterest = (loan.primary_account_interest || 0) + secondaryAccounts.reduce((s, a) => s + (a.interest_amount || 0), 0);
                                    const primaryIntPercent = totalInterest > 0 ? (loan.primary_account_interest / totalInterest * 100) : 0;

                                    return (
                                        <>
                                            {/* Primary account row */}
                                            <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/25 transition-colors">
                                                <td className="py-4 px-5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                            {loan.primary_account_name || '—'}
                                                        </span>
                                                        <AccountTag label="Primary" color="bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:border-primary/30" />
                                                    </div>
                                                </td>
                                                <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                    {fmtINR(loan.primary_account_amount)}
                                                </td>
                                                <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                    {fmtINR(loan.primary_account_interest)}
                                                </td>
                                                <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                    {`${primaryIntPercent.toFixed(2)}%`}
                                                </td>
                                                <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                    {fmtINR((loan.primary_account_amount || 0) + (loan.primary_account_interest || 0))}
                                                </td>
                                            </tr>

                                            {/* Secondary account rows */}
                                            {secondaryAccounts.map((acc, i) => (
                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/25 transition-colors border-t border-slate-100 dark:border-slate-800">
                                                    <td className="py-4 px-5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                                {acc.account_name || '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                        {fmtINR(acc.share)}
                                                    </td>
                                                    <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                        {fmtINR(acc.interest_amount)}
                                                    </td>
                                                    <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                        {acc.interest_percentage != null ? `${Number(acc.interest_percentage).toFixed(2)}%` : '—'}
                                                    </td>
                                                    <td className="py-4 px-5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                                                        {fmtINR((acc.share || 0) + (acc.interest_amount || 0))}
                                                    </td>
                                                </tr>
                                            ))}
                                        </>
                                    );
                                })()}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
                                    <td className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</td>
                                    <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                        {fmtINR(
                                            (loan.primary_account_amount || 0) +
                                            secondaryAccounts.reduce((s, a) => s + (a.share || 0), 0)
                                        )}
                                    </td>
                                    <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                        {fmtINR(
                                            (loan.primary_account_interest || 0) +
                                            secondaryAccounts.reduce((s, a) => s + (a.interest_amount || 0), 0)
                                        )}
                                    </td>
                                    <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                        100.00%
                                    </td>
                                    <td className="py-3 px-5 text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                                        {fmtINR(
                                            (loan.primary_account_amount || 0) + (loan.primary_account_interest || 0) +
                                            secondaryAccounts.reduce((s, a) => s + (a.share || 0) + (a.interest_amount || 0), 0)
                                        )}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <RepaymentTable
                    data={displayedSystemSchedule}
                    title="Repayment Schedule"
                    icon="calendar_month"
                    isManual={false}
                    loan={loan}
                    setLoan={setLoan}
                    schedule={schedule}
                    isPanel={isPanel}
                    handleScheduleUpdate={handleScheduleUpdate}
                    handleFieldChange={handleFieldChange}
                    handleSplitChange={handleSplitChange}
                    handleDeleteRow={handleDeleteRow}
                    handleAddRow={handleAddRow}
                    formatDateInput={formatDateInput}
                    formatINRInput={formatINRInput}
                    toYYYYMMDD={toYYYYMMDD}
                    toDDMMYYYY={toDDMMYYYY}
                    onEditAccountSplit={(entry, accountName, currentShare, isEditingBalance, editIndex) => setSplitModalData({ entry, accountName, currentShare, isEditingBalance, editIndex })}
                />

                <RepaymentTable
                    data={manualSchedule}
                    title="Manual Payments"
                    icon="payments"
                    showAddButton={true}
                    isManual={true}
                    loan={loan}
                    setLoan={setLoan}
                    schedule={schedule}
                    isPanel={isPanel}
                    handleScheduleUpdate={handleScheduleUpdate}
                    handleFieldChange={handleFieldChange}
                    handleSplitChange={handleSplitChange}
                    handleDeleteRow={handleDeleteRow}
                    handleAddRow={handleAddRow}
                    formatDateInput={formatDateInput}
                    formatINRInput={formatINRInput}
                    toYYYYMMDD={toYYYYMMDD}
                    toDDMMYYYY={toDDMMYYYY}
                    onEditAccountSplit={(entry, accountName, currentShare, isEditingBalance, editIndex) => setSplitModalData({ entry, accountName, currentShare, isEditingBalance, editIndex })}
                />

                <EditAccountsModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    loanData={loan}
                    onSave={handleSaveAccounts}
                />

                <EditAccountSplitModal
                    isOpen={!!splitModalData}
                    onClose={() => setSplitModalData(null)}
                    entry={splitModalData?.entry}
                    accountName={splitModalData?.accountName}
                    currentShare={splitModalData?.currentShare}
                    isEditingBalance={splitModalData?.isEditingBalance}
                    editIndex={splitModalData?.editIndex ?? 0}
                    loanData={loan}
                    onSave={async (scheduleId, accountName, amount, tds, remarks, editIdx) => {
                        await handleAccountSplitSave(scheduleId, accountName, amount, tds, remarks, editIdx);
                        setSplitModalData(null);
                    }}
                />

                <DeleteConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                />
            </main>
        </div>
    );
};

export default LoanDetail;
