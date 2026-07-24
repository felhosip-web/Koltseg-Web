import { GoogleDriveBackup } from './js/gdrive-backup.js';

global.window = {};
global.localStorage = { getItem: () => 'test-client-id' };
const mockApp = {
    settings: {
        get: (key) => key === 'gdriveClientId' ? 'test-client-id' : null
    }
};

const gb = new GoogleDriveBackup(mockApp);
console.log("Configured?", gb.isConfigured());
