import fs from 'fs';
let content = fs.readFileSync('js/sync-service.js', 'utf8');

const appSettingsLogic = `
            // === 5.5. APP_SETTINGS SZINKRONIZÁCIÓ ===
            console.log('[SYNC] ⚙️ Beállítások szinkronizálása...');
            try {
                // Helyi beállítások JSON
                const localSettings = {
                    appearance_dark_mode: localStorage.getItem('appearance_dark_mode') || 'false',
                    appearance_bg_theme: localStorage.getItem('appearance_bg_theme') || 'white',
                    ai_api_key: localStorage.getItem('ai_api_key') || '',
                    ai_model: localStorage.getItem('ai_model') || 'gemini-3.5-flash',
                    default_eur_rate: localStorage.getItem('default_eur_rate') || '400',
                    use_live_eur: localStorage.getItem('use_live_eur') || 'true',
                    settings_updated_at: localStorage.getItem('settings_updated_at') || '1970-01-01T00:00:00.000Z'
                };
                
                const cloudSettingsData = await this.cloud.pull('app_settings');
                const cloudSettingsRow = cloudSettingsData && cloudSettingsData.find(s => s.id === 'user_settings');
                
                let shouldPush = false;
                if (!cloudSettingsRow) {
                    shouldPush = true;
                } else {
                    const cloudSettings = cloudSettingsRow.settings_json || {};
                    const localTime = new Date(localSettings.settings_updated_at).getTime();
                    const cloudTime = new Date(cloudSettingsRow.updated_at).getTime();
                    
                    if (cloudTime > localTime) {
                        console.log('[SYNC] ☁️ Felhő beállítások frissebbek, helyi felülírása...');
                        if (cloudSettings.appearance_dark_mode !== undefined) localStorage.setItem('appearance_dark_mode', cloudSettings.appearance_dark_mode);
                        if (cloudSettings.appearance_bg_theme !== undefined) localStorage.setItem('appearance_bg_theme', cloudSettings.appearance_bg_theme);
                        if (cloudSettings.ai_api_key !== undefined) localStorage.setItem('ai_api_key', cloudSettings.ai_api_key);
                        if (cloudSettings.ai_model !== undefined) localStorage.setItem('ai_model', cloudSettings.ai_model);
                        if (cloudSettings.default_eur_rate !== undefined) localStorage.setItem('default_eur_rate', String(cloudSettings.default_eur_rate));
                        if (cloudSettings.use_live_eur !== undefined) localStorage.setItem('use_live_eur', String(cloudSettings.use_live_eur));
                        localStorage.setItem('settings_updated_at', cloudSettingsRow.updated_at);
                        
                        // Frissítjük az aktív konfigurációkat
                        const app = this._getApp();
                        if (app && app.config) {
                            app.config.aiConfig = {
                                apiKey: cloudSettings.ai_api_key || '',
                                model: cloudSettings.ai_model || 'gemini-3.5-flash'
                            };
                            app.config.defaultEurRate = parseFloat(cloudSettings.default_eur_rate) || 400;
                            app.config.useLiveEur = cloudSettings.use_live_eur !== 'false';
                        }
                        
                        // Kényszerítsük az UI frissítését, ha a dark mode / bg theme változott
                        if (app && app.ui) {
                            app.ui.initAppearanceSettings(); // Ez újra beállítja a sötét módot és témát
                            app.ui.populateSettingsForm(); // Formok frissítése
                        }
                    } else if (localTime > cloudTime) {
                        console.log('[SYNC] 📱 Helyi beállítások frissebbek, felhő felülírása...');
                        shouldPush = true;
                    }
                }
                
                if (shouldPush) {
                    await this.cloud.upsert('app_settings', {
                        id: 'user_settings',
                        settings_json: localSettings,
                        updated_at: localSettings.settings_updated_at === '1970-01-01T00:00:00.000Z' ? new Date().toISOString() : localSettings.settings_updated_at
                    }, 'id');
                }
                
            } catch (err) {
                console.warn('[SYNC] ⚠️ Beállítások szinkronizálása sikertelen (lehet, hogy az app_settings tábla nem létezik még?):', err);
            }
`;

content = content.replace("            // === 6. VÉGLEGESÍTÉS ÉS MENTÉS ===\r\n            console.log('[SYNC] 💾 Merge utáni mentés...');", appSettingsLogic + "\n            // === 6. VÉGLEGESÍTÉS ÉS MENTÉS ===\r\n            console.log('[SYNC] 💾 Merge utáni mentés...');");
content = content.replace("            // === 6. VÉGLEGESÍTÉS ÉS MENTÉS ===\n            console.log('[SYNC] 💾 Merge utáni mentés...');", appSettingsLogic + "\n            // === 6. VÉGLEGESÍTÉS ÉS MENTÉS ===\n            console.log('[SYNC] 💾 Merge utáni mentés...');");

fs.writeFileSync('js/sync-service.js', content);
