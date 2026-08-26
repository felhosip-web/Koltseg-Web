/**
 * Utility functions for handling cellKeys in the application.
 * A cellKey usually represents the combination of an itemId and a month, often appended with a timestamp.
 */

/**
 * Parses a cellKey or an entry object to extract the itemId and month.
 * It prioritizes explicit itemId and month fields if they exist.
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

    // If it's an object, prioritize explicit fields but allow fallback for missing ones
    if (typeof entryOrCellKey === 'object') {
        const parsed = (typeof entryOrCellKey.cellKey === 'string')
            ? parseCellKeyString(entryOrCellKey.cellKey)
            : { itemId: null, month: null };
        return {
            itemId: entryOrCellKey.itemId || parsed.itemId,
            month: entryOrCellKey.month || parsed.month
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

    let itemId = parts[0];
    let month = parts[1];

    // Check for legacy format: YYYY-MM_itemId...
    if (!/^[0-9]+$/.test(itemId) && /^[0-9]{4}-[0-9]{2}$/.test(parts[0])) {
        month = parts[0];
        itemId = parts[1];
    }

    return { itemId, month };
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
