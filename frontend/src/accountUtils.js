/**
 * Utility to fetch and resolve accounts and acronyms dynamically from the database.
 * No hardcoded account names or acronyms.
 */

let cachedAccounts = [];
let fetchPromise = null;

// Initialize from localStorage if available so initial render has DB accounts
try {
    const saved = localStorage.getItem('cached_db_accounts');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
            cachedAccounts = parsed;
        }
    }
} catch (e) {
    // ignore
}

/**
 * Fetch accounts from /api/accounts-name and cache them.
 */
export const loadAccountsFromDb = async (forceRefresh = false) => {
    if (fetchPromise) {
        return fetchPromise;
    }

    fetchPromise = (async () => {
        try {
            const res = await fetch('/api/accounts-name');
            const data = await res.json();
            if (data && data.success && Array.isArray(data.accounts)) {
                cachedAccounts = data.accounts;
                try {
                    localStorage.setItem('cached_db_accounts', JSON.stringify(data.accounts));
                } catch (err) {}
            }
        } catch (err) {
            console.error('Failed to fetch accounts from DB:', err);
        } finally {
            fetchPromise = null;
        }
        return cachedAccounts;
    })();

    return fetchPromise;
};

/**
 * Resolve acronym dynamically from DB accounts.
 * @param {string} name - Account name or acronym to resolve
 * @param {Array} [accounts] - Optional list of accounts from DB
 * @returns {string} - Acronym in uppercase
 */
export const getAcronym = (name, accounts = cachedAccounts) => {
    if (!name) return '—';
    const raw = String(name).trim();
    if (!raw) return '—';
    const n = raw.toLowerCase();

    const list = Array.isArray(accounts) && accounts.length > 0 ? accounts : cachedAccounts;

    // 1. Exact match on acronym or name
    for (const acc of list) {
        const acr = (acc.acronym || '').trim().toUpperCase();
        const accName = (acc.name || '').trim().toLowerCase();
        if (acr.toLowerCase() === n || accName === n) {
            return acr;
        }
    }

    // 2. Alphanumeric normalized match (e.g. S.Sudhakar vs SSudhakar vs S Sudhakar)
    const cleanInput = n.replace(/[^a-z0-9]/g, '');
    for (const acc of list) {
        const acr = (acc.acronym || '').trim().toUpperCase();
        const accName = (acc.name || '').trim().toLowerCase();
        const cleanAcr = acr.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanName = accName.replace(/[^a-z0-9]/g, '');
        if (cleanInput && (cleanInput === cleanAcr || cleanInput === cleanName)) {
            return acr;
        }
    }

    // 3. Substring match
    for (const acc of list) {
        const acr = (acc.acronym || '').trim().toUpperCase();
        const accName = (acc.name || '').trim().toLowerCase();
        const cleanName = accName.replace(/[^a-z0-9]/g, '');
        if (cleanInput && cleanName && (cleanName.includes(cleanInput) || cleanInput.includes(cleanName))) {
            return acr;
        }
        if (accName && (accName.includes(n) || n.includes(accName))) {
            return acr;
        }
    }

    return raw.toUpperCase();
};

/**
 * Format an account object into a dropdown option { value, label, color }.
 */
export const formatAccountOption = (acc) => {
    const acr = (acc.acronym || '').trim().toUpperCase();
    let cleanName = (acc.name || '').trim();
    const suffixRegex = new RegExp(`\\s*-\\s*${acr}$`, 'i');
    cleanName = cleanName.replace(suffixRegex, '').trim();
    return {
        value: acr,
        label: cleanName ? `${cleanName} - ${acr}` : acr,
        color: acc.color || 'blue',
        name: cleanName || acr
    };
};

/**
 * Convert DB accounts list to options array.
 */
export const getAccountOptions = (accounts = cachedAccounts) => {
    const list = Array.isArray(accounts) && accounts.length > 0 ? accounts : cachedAccounts;
    return list.map(formatAccountOption);
};
