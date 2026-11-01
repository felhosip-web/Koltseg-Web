/**
 * Utility functions for handling cellKeys in the application.
 * A cellKey usually represents the combination of an itemId and a month, often appended with a timestamp.
 */

/**
 * Validates whether a month string matches strict YYYY-MM format with a real calendar month (01-12).
 * @param {any} month
 * @returns {boolean}
 */
export function isValidMonth(month) {
    if (typeof month !== 'string') return false;
    return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month);
}

/**
 * Validates whether an itemId is a non-empty string.
 * @param {any} itemId
 * @returns {boolean}
 */
export function isValidItemId(itemId) {
    return typeof itemId === 'string' && itemId.trim().length > 0;
}

/**
 * Parses a cellKey or an entry object to extract the itemId and month.
 * It prioritizes explicit itemId and month fields if they exist and are valid.
 * An invalid or missing explicit coordinate falls back to a valid parsed coordinate.
 *
 * Supported cellKey formats:
 * 1. `{itemId}_{month}`
 * 2. `{itemId}_{month}_{timestamp}`
 * 3. `{month}_{itemId}_{timestamp}` (legacy fallback)
 *
 * @param {Object|string} entryOrCellKey - The entry object or the cellKey string.
 * @returns {{itemId: string|null, month: string|null}}
 */
export function parseCellKey(entryOrCellKey) {
    if (!entryOrCellKey) return { itemId: null, month: null };

    // If it's an object, validate explicit fields and fall back to parsed key components
    if (typeof entryOrCellKey === 'object') {
        const parsed = (typeof entryOrCellKey.cellKey === 'string')
            ? parseCellKeyString(entryOrCellKey.cellKey)
            : { itemId: null, month: null };

        const explicitItemValid = isValidItemId(entryOrCellKey.itemId);
        const explicitMonthValid = isValidMonth(entryOrCellKey.month);

        return {
            itemId: explicitItemValid ? entryOrCellKey.itemId : (parsed.itemId || null),
            month: explicitMonthValid ? entryOrCellKey.month : (parsed.month || null)
        };
    }

    // If it's a string, parse it
    if (typeof entryOrCellKey === 'string') {
        return parseCellKeyString(entryOrCellKey);
    }

    return { itemId: null, month: null };
}

/**
 * Parses a cellKey string to extract itemId and month components.
 * Handles both standard and legacy formats.
 * @param {string} cellKey - The cellKey string to parse
 * @returns {{itemId: string|null, month: string|null}}
 */
function parseCellKeyString(cellKey) {
    if (typeof cellKey !== 'string') return { itemId: null, month: null };

    const parts = cellKey.split('_');
    if (parts.length < 2) return { itemId: null, month: null };

    // 1. Legacy format: YYYY-MM_itemId or YYYY-MM_itemId_timestamp
    if (isValidMonth(parts[0])) {
        const month = parts[0];
        if (parts.length > 2 && /^[0-9]+$/.test(parts[parts.length - 1])) {
            const itemId = parts.slice(1, -1).join('_');
            return { itemId: itemId || null, month };
        } else {
            const itemId = parts.slice(1).join('_');
            return { itemId: itemId || null, month };
        }
    }

    // 2. Standard format: itemId_YYYY-MM or itemId_YYYY-MM_timestamp (supporting itemIds containing underscores or date-like substrings)
    // To avoid picking an embedded YYYY-MM substring from itemId (e.g., archive_2025-01_misc_2026-08),
    // we search for the month segment from right-to-left, taking optional timestamp into account.
    let monthIdx = -1;
    for (let i = parts.length - 1; i >= 1; i--) {
        if (isValidMonth(parts[i])) {
            // Check if this could be the month token. If it's at the end, or the only segment after it is a numeric timestamp
            const isAtEnd = (i === parts.length - 1);
            const isTimestampAfter = (i === parts.length - 2 && /^[0-9]+$/.test(parts[parts.length - 1]));
            if (isAtEnd || isTimestampAfter) {
                monthIdx = i;
                break;
            }
        }
    }

    // Fallback if not matched at end/pre-timestamp: search right-to-left for any valid month token after index 0
    if (monthIdx === -1) {
        for (let i = parts.length - 1; i >= 1; i--) {
            if (isValidMonth(parts[i])) {
                monthIdx = i;
                break;
            }
        }
    }

    if (monthIdx !== -1) {
        const month = parts[monthIdx];
        const itemId = parts.slice(0, monthIdx).join('_');
        return { itemId: isValidItemId(itemId) ? itemId : null, month: isValidMonth(month) ? month : null };
    }

    const fallbackItemId = isValidItemId(parts[0]) ? parts[0] : null;
    const fallbackMonth = isValidMonth(parts[1]) ? parts[1] : null;
    return { itemId: fallbackItemId, month: fallbackMonth };
}

/**
 * Builds a cellKey string from an itemId, month, and optional timestamp.
 *
 * @param {string} itemId
 * @param {string} month
 * @param {string|number} [timestamp] - Optional. Defaults to current Date.now() if not provided but a unique key is implied, though usually we want to explicitely pass it if needed.
 * @returns {string} The constructed cellKey
 */
export function buildCellKey(itemId, month, timestamp) {
    if (timestamp) {
        return `${itemId}_${month}_${timestamp}`;
    }
    return `${itemId}_${month}`;
}
