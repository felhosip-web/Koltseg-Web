// src/services/plugin/PluginManifestValidator.js
// Deterministic Manifest Contract Validator for PLG1

export const KNOWN_PERMISSIONS = new Set([
    'storage:private',
    'ui:toast',
    'expenses:read'
]);

export const SUPPORTED_API_VERSIONS = new Set(['1', 1]);

/**
 * Validates a declarative plugin manifest contract object deterministically.
 * @param {Object} manifest
 * @returns {boolean} true if valid
 * @throws {Error} Explicit error message detailing validation failure
 */
export function validatePluginManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('[PluginManifest] Manifest must be a valid non-null object.');
    }

    const requiredFields = ['id', 'name', 'version', 'apiVersion', 'permissions'];
    for (const field of requiredFields) {
        if (manifest[field] === undefined || manifest[field] === null) {
            throw new Error(`[PluginManifest] Missing required field: "${field}".`);
        }
    }

    // 1. ID Format
    if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
        throw new Error('[PluginManifest] Field "id" must be a non-empty string.');
    }
    const idRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!idRegex.test(manifest.id)) {
        throw new Error(`[PluginManifest] Invalid ID format: "${manifest.id}". Must contain only alphanumeric characters, dashes, dots, or underscores.`);
    }

    // 2. Non-empty Name
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
        throw new Error('[PluginManifest] Field "name" must be a non-empty string.');
    }

    // 3. Version Format
    if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
        throw new Error('[PluginManifest] Field "version" must be a non-empty string.');
    }
    const versionRegex = /^\d+(\.\d+)*$/;
    if (!versionRegex.test(manifest.version.trim())) {
        throw new Error(`[PluginManifest] Invalid version format: "${manifest.version}". Must be a valid numeric version string (e.g. "1.0.0").`);
    }

    // 4. API Version Support
    if (!SUPPORTED_API_VERSIONS.has(manifest.apiVersion) && !SUPPORTED_API_VERSIONS.has(String(manifest.apiVersion))) {
        throw new Error(`[PluginManifest] Unsupported apiVersion: "${manifest.apiVersion}". Supported versions: [1].`);
    }

    // 5. Permissions List Type
    if (!Array.isArray(manifest.permissions)) {
        throw new Error('[PluginManifest] Field "permissions" must be an array.');
    }

    // 6. Known Permissions Check (No implicit permission fallback)
    for (const perm of manifest.permissions) {
        if (typeof perm !== 'string' || !KNOWN_PERMISSIONS.has(perm)) {
            throw new Error(`[PluginManifest] Unknown or invalid permission: "${perm}".`);
        }
    }

    return true;
}
