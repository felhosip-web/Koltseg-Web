// js/utils/work-validation.js - Centralized Work Log Domain Validator
// Enforces domain integrity, duration bounds, date format, and safe record structure.

/**
 * Upper boundary for work duration in days.
 * 3650 days (~10 years) represents a realistic upper limit for any single project / work item
 * in this domain, while preventing integer overflows and accidental input errors.
 */
export const MAX_WORK_DURATION = 3650;

export const VALID_WORK_STATUSES = Object.freeze(['folyamatban', 'elvégzett', 'meghiúsult']);

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates strict calendar date format (YYYY-MM-DD) and calendar limits.
 * Rejects leap year errors (e.g. 2026-02-29), impossible days/months, and malformed strings.
 *
 * @param {*} dateStr
 * @returns {boolean}
 */
export function isValidCalendarDate(dateStr) {
    if (typeof dateStr !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) return false;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const dateObj = new Date(year, month - 1, day);
    return dateObj.getFullYear() === year &&
           dateObj.getMonth() === month - 1 &&
           dateObj.getDate() === day;
}

/**
 * Validates strict ISO-8601 timestamp string format with calendar and time limits.
 *
 * @param {*} ts
 * @returns {boolean}
 */
export function isValidStrictIso8601(ts) {
    if (typeof ts !== 'string' || ts.trim() === '') return false;
    const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
    if (!match) return false;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6], 10);
    if (month < 1 || month > 12) return false;
    if (hour > 23 || minute > 59 || second > 59) return false;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) return false;
    const d = new Date(ts);
    return !isNaN(d.getTime());
}

/**
 * Validates manually entered work duration.
 * Must be a positive finite integer between 1 and MAX_WORK_DURATION.
 * Rejects zero, negative, fractional, NaN, Infinity, strings, and non-numeric inputs.
 *
 * @param {*} duration
 * @param {Object} [options]
 * @param {boolean} [options.allowNumericString=false] Whether numeric strings (e.g. "5") should be parsed
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
export function validateWorkDuration(duration, options = {}) {
    let val = duration;
    if (options.allowNumericString && typeof val === 'string' && val.trim() !== '') {
        val = Number(val);
    }

    if (typeof val !== 'number' || !Number.isFinite(val) || isNaN(val)) {
        return { valid: false, error: 'Az időtartamnak számnak kell lennie.' };
    }

    if (!Number.isInteger(val)) {
        return { valid: false, error: 'Az időtartamnak egész számnak kell lennie (napokban).' };
    }

    if (val < 1) {
        return { valid: false, error: 'Az időtartamnak legalább 1 napnak kell lennie.' };
    }

    if (val > MAX_WORK_DURATION) {
        return { valid: false, error: `Az időtartam nem haladhatja meg a(z) ${MAX_WORK_DURATION} napot.` };
    }

    return { valid: true, value: val };
}

/**
 * Validates a Work Log domain record.
 *
 * @param {*} work
 * @param {Object} [options]
 * @param {boolean} [options.allowNumericStringDuration=false]
 * @returns {{ valid: boolean, error?: string, sanitizedRecord?: Object }}
 */
export function validateWorkRecord(work, options = {}) {
    if (!work || typeof work !== 'object' || Array.isArray(work)) {
        return { valid: false, error: 'Érvénytelen munka bejegyzés adat: objektum szükséges.' };
    }

    const requireComplete = Boolean(options.requireComplete);

    // Check prototype pollution keys (check own properties including non-enumerable or JSON parsed __proto__)
    for (const key of Object.keys(work)) {
        if (DANGEROUS_KEYS.has(key)) {
            return { valid: false, error: `Tiltott objektum kulcs: ${key}` };
        }
    }
    if (Object.prototype.hasOwnProperty.call(work, '__proto__') ||
        Object.prototype.hasOwnProperty.call(work, 'constructor') ||
        Object.prototype.hasOwnProperty.call(work, 'prototype')) {
        return { valid: false, error: 'Tiltott objektum kulcs: prototípus tulajdonság észlelve.' };
    }

    // 1. Optional created_at (checked first to preserve strict ISO timestamp error precedence)
    if ('created_at' in work && work.created_at !== undefined) {
        if (!isValidStrictIso8601(work.created_at)) {
            return { valid: false, error: 'Érvénytelen created_at időbélyeg formátum.' };
        }
    }

    // 2. Optional updated_at
    if ('updated_at' in work && work.updated_at !== undefined) {
        if (!isValidStrictIso8601(work.updated_at)) {
            return { valid: false, error: 'Érvénytelen updated_at időbélyeg formátum.' };
        }
    }

    // 3. Work Name
    if (typeof work.name !== 'string' || work.name.trim() === '') {
        return { valid: false, error: 'A munka neve kötelező és nem lehet üres.' };
    }

    // 4. Work Date:
    // If requireComplete is true, date MUST be present, non-null, and a valid calendar date string.
    // If requireComplete is false:
    //   - Explicit null or empty string is rejected (prevent silent overwrite in atomic merge).
    //   - If defined, must be a valid calendar date string.
    if (requireComplete) {
        if (work.date === undefined || work.date === null) {
            return { valid: false, error: 'A munka dátuma kötelező (ÉÉÉÉ-HH-NN).' };
        }
        if (!isValidCalendarDate(work.date)) {
            return { valid: false, error: 'Érvénytelen dátum formátum (ÉÉÉÉ-HH-NN szükséges).' };
        }
    } else {
        if ('date' in work) {
            if (work.date === null || work.date === undefined || !isValidCalendarDate(work.date)) {
                return { valid: false, error: 'Érvénytelen dátum formátum (ÉÉÉÉ-HH-NN szükséges).' };
            }
        }
    }

    // 5. Work Duration:
    // If requireComplete is true, duration MUST be present, non-null, and a valid positive integer <= MAX_WORK_DURATION.
    // If requireComplete is false:
    //   - Explicit null or undefined (when key is present) is rejected.
    //   - If defined, must be valid positive integer <= MAX_WORK_DURATION.
    //   - If creating new entry without duration, defaults to 1.
    let durVal = work.duration;
    if (requireComplete) {
        if (work.duration === undefined || work.duration === null) {
            return { valid: false, error: 'Az időtartam kötelező.' };
        }
        const durRes = validateWorkDuration(work.duration, options);
        if (!durRes.valid) {
            return { valid: false, error: durRes.error };
        }
        durVal = durRes.value;
    } else {
        if ('duration' in work) {
            if (work.duration === null || work.duration === undefined) {
                return { valid: false, error: 'Az időtartamnak számnak kell lennie.' };
            }
            const durRes = validateWorkDuration(work.duration, options);
            if (!durRes.valid) {
                return { valid: false, error: durRes.error };
            }
            durVal = durRes.value;
        } else if (!work.id) {
            durVal = 1;
        }
    }

    // 6. Status:
    // In complete records, status must be explicitly provided or strictly in VALID_WORK_STATUSES.
    if (requireComplete && (work.status === undefined || work.status === null || String(work.status).trim() === '')) {
        return { valid: false, error: 'A munka státusza kötelező.' };
    }
    const status = work.status !== undefined && work.status !== null ? String(work.status).trim() : 'folyamatban';
    if (!VALID_WORK_STATUSES.includes(status)) {
        return { valid: false, error: `Érvénytelen státusz: "${status}". Megengedett: ${VALID_WORK_STATUSES.join(', ')}.` };
    }

    const sanitizedRecord = {
        ...work,
        name: work.name.trim(),
        description: typeof work.description === 'string' ? work.description.trim() : (work.description !== undefined ? work.description : ''),
        location: typeof work.location === 'string' ? work.location.trim() : (work.location !== undefined ? work.location : ''),
        status: status
    };
    if (work.date !== undefined && work.date !== null) {
        sanitizedRecord.date = work.date;
    } else if (!work.id && !requireComplete) {
        sanitizedRecord.date = new Date().toISOString().split('T')[0];
    }
    if (durVal !== undefined) sanitizedRecord.duration = durVal;

    return { valid: true, sanitizedRecord };
}
