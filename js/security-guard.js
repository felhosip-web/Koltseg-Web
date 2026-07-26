// js/security-guard.js - Alkalmazás Hozzáférés-zár és Felhasználói Szerepkörök Kezelése (Access Guard)

export class SecurityGuard {
    constructor(app) {
        this.app = app;
        
        // Alapértelmezett beállítások betöltése localStorage-ból
        this.enabled = localStorage.getItem('security_lock_enabled') === 'true';
        this.ownerPin = localStorage.getItem('security_owner_pin') || '';
        this.guestPin = localStorage.getItem('security_guest_pin') || '';
        this.autolockMinutes = parseInt(localStorage.getItem('security_autolock_minutes') || '5', 10);
        
        // Aktuális munkamenet állapota
        this.isLocked = false;
        this.currentUser = null; // 'owner' | 'guest' | null (ha zárolva van)
        this.lastActivityTime = Date.now();
        this.autolockIntervalId = null;
        
        // Billentyűzet állapot a PIN beíráshoz
        this.currentEnteredPin = '';
    }

    /**
     * Rendszer inicializálása
     */
    init() {
        console.log(`[SECURITY] Access Guard inicializálása (Aktív: ${this.enabled})`);
        
        // Eszköz alapértelmezett szerepkörének lekérése (tulajdonos, ha a biztonsági zár ki van kapcsolva)
        const isDeviceOwner = !this.enabled || localStorage.getItem('OWNER_MODE') === 'true';
        this.currentUser = isDeviceOwner ? 'owner' : 'guest';
        
        this._bindEvents();
        
        if (this.enabled) {
            // Ha a zárolás aktív, de nincsenek kódok beállítva, akkor automatikusan deaktiváljuk a kizárás elkerülésére
            if (!this.ownerPin && !this.guestPin) {
                console.warn('[SECURITY] A zár aktív lenne, de nincsenek kódok megadva. Vészhelyzeti feloldás...');
                this.enabled = false;
                localStorage.setItem('security_lock_enabled', 'false');
                this.isLocked = false;
                this._hideLockOverlay();
            } else {
                this.lock();
                this._startInactivityWatcher();
            }
        } else {
            this.isLocked = false;
            this._hideLockOverlay();
        }
        
        this.applyRestrictions();
    }

    /**
     * Alkalmazás azonnali lezárása
     */
    lock() {
        this.isLocked = true;
        this.currentUser = null;
        this.currentEnteredPin = '';
        this._updatePinDots();
        
        const overlay = document.getElementById('securityGuardOverlay');
        const input = document.getElementById('securityLockInput');
        const statusText = document.getElementById('securityLockStatus');
        const icon = document.getElementById('securityLockScreenIcon');
        
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }
        
        if (input) {
            input.value = '';
            input.focus();
        }
        
        if (statusText) {
            statusText.textContent = 'Írd be a PIN kódot vagy a jelszót';
            statusText.className = 'text-xs text-slate-400 font-semibold font-mono tracking-wide py-1';
        }
        
        if (icon) {
            icon.className = 'fas fa-lock text-2xl';
        }

        // Elrejtjük az esetleg nyitva lévő beállításokat/modalt a magánszféra védelmére
        document.getElementById('settingsPanel')?.classList.add('hidden');
        document.getElementById('debugPanel')?.classList.add('hidden');
        
        console.log('[SECURITY] 🔒 Az alkalmazás lezárva.');
    }

    /**
     * Mester jelszó ellenőrzése (Szerver API, offline fallback-kel)
     */
    async verifyRootPassword(password) {
        if (!password) return false;
        try {
            const response = await fetch('/api/security/verify-root', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            if (response.ok) {
                const data = await response.json();
                return data.success === true;
            }
        } catch (e) {
            console.error('[SECURITY] Szerveres jelszóellenőrzés sikertelen, offline fallback...', e);
        }
        // Ha a szerver offline vagy elérhetetlen, akkor a fallback mester jelszó:
        return password === '!!rootdevaccess!!';
    }

    /**
     * Feloldási kísérlet a megadott kóddal
     */
    async unlock(pin) {
        if (!pin) return;

        const trimmedPin = pin.trim();
        const statusText = document.getElementById('securityLockStatus');
        const icon = document.getElementById('securityLockScreenIcon');

        // 1. Ellenőrizzük a tulajdonosi PIN-t
        if (this.ownerPin && trimmedPin === this.ownerPin) {
            this.currentUser = 'owner';
            this.isLocked = false;
            localStorage.setItem('OWNER_MODE', 'true'); // Regisztráljuk az eszközt tulajdonosként
            this._hideLockOverlay();
            
            // Logolás
            this.app.logger?.log('auth', 'success', 'Sikeres bejelentkezés: Tulajdonos (Owner) feloldotta az alkalmazást.');
            this.app.hmiNotif?.showToast('🔓 Üdvözlünk, Tulajdonos! Teljes hozzáférés biztosítva.', 'success');
            
            this.applyRestrictions();
            this.resetInactivity();
            return;
        }

        // 2. Ellenőrizzük a vendég/user 2 PIN-t
        if (this.guestPin && trimmedPin === this.guestPin) {
            this.currentUser = 'guest';
            this.isLocked = false;
            localStorage.setItem('OWNER_MODE', 'false'); // Regisztráljuk az eszközt vendégként
            this._hideLockOverlay();
            
            // Logolás
            this.app.logger?.log('auth', 'info', 'Sikeres bejelentkezés: User 2 (Vendég) feloldotta az alkalmazást.');
            this.app.hmiNotif?.showToast('🔓 Üdvözlünk, Vendég! Korlátozott hozzáférés biztosítva.', 'info');
            
            this.applyRestrictions();
            this.resetInactivity();
            return;
        }

        // 3. Ellenőrizzük a Root Fejlesztői jelszót (Szerver + offline fallback)
        if (statusText) {
            statusText.textContent = 'Mester jelszó ellenőrzése...';
        }
        
        const isRoot = await this.verifyRootPassword(trimmedPin);
        if (isRoot) {
            this.currentUser = 'owner';
            this.isLocked = false;
            localStorage.setItem('OWNER_MODE', 'true'); // Regisztráljuk az eszközt tulajdonosként
            this._hideLockOverlay();
            
            // Logolás
            this.app.logger?.log('auth', 'success', 'Sikeres bejelentkezés: Tulajdonos jogok feloldva Fejlesztői Mester Jelszóval!');
            this.app.hmiNotif?.showToast('🔓 Tulajdonosi jogok feloldva Fejlesztői Mester Jelszóval!', 'success');
            
            this.applyRestrictions();
            this.resetInactivity();
            return;
        }

        // Hibás kód megadása esetén
        console.warn('[SECURITY] ❌ Hibás feloldási kód!');
        this.currentEnteredPin = '';
        this._updatePinDots();
        
        if (this.app.logger) {
            this.app.logger.log('auth', 'warn', `Sikertelen belépési kísérlet! Hibás kóddal próbálkoztak.`);
        }

        if (statusText) {
            statusText.textContent = '❌ Hibás kód! Kérjük próbáld újra.';
            statusText.className = 'text-xs text-red-500 font-bold font-mono tracking-wide py-1 animate-bounce';
        }

        if (icon) {
            icon.className = 'fas fa-shield-halved text-red-500 text-2xl';
        }

        // Visszajelzés vibrálással mobil eszközökön
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }

        const input = document.getElementById('securityLockInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    /**
     * Szerepkör alapú korlátozások alkalmazása
     */
    applyRestrictions() {
        const isGuest = this.currentUser === 'guest';
        console.log(`[SECURITY] Szerepkör alapú korlátozások alkalmazása (Vendég mód: ${isGuest})`);

        // Vendég jelző matrica a UI-on
        let guestBadge = document.getElementById('securityGuestModeBadge');
        if (isGuest) {
            if (!guestBadge) {
                guestBadge = document.createElement('span');
                guestBadge.id = 'securityGuestModeBadge';
                guestBadge.className = 'flex items-center gap-1 text-[10px] font-bold bg-amber-500 text-white px-2.5 py-1 rounded-md border border-amber-600 shadow-sm animate-pulse mr-2';
                guestBadge.innerHTML = '<i class="fas fa-user-tag"></i> Vendég mód';
                
                // Beillesztjük a felső fejlécbe a verziószám mellé
                const header = document.querySelector('header .flex.items-center.gap-2.shrink-0') || document.querySelector('header');
                if (header) {
                    header.insertBefore(guestBadge, header.firstChild);
                }
            }
        } else {
            guestBadge?.remove();
        }

        // Biztonsági fülek paneleinek láthatósága
        const upgradePanel = document.getElementById('securityGuestUpgradePanel');
        const ownerPanel = document.getElementById('securityOwnerSettingsPanel');

        if (isGuest) {
            upgradePanel?.classList.remove('hidden');
            ownerPanel?.classList.add('hidden');
        } else {
            upgradePanel?.classList.add('hidden');
            ownerPanel?.classList.remove('hidden');
        }

        // Zároljuk a kritikus gombokat és funkciókat vendég esetén
        const dbResetButton = document.getElementById('btnWipeSupabaseDatabase') || document.getElementById('btnResetDatabase');
        const settingsSaveBtn = document.getElementById('btnSaveSettings');
        const devPanelBtns = document.querySelectorAll('[id="debugToggleBtnContainer"]');
        const securityTabBtn = document.querySelector('[data-settings-tab="security"]');

        if (isGuest) {
            if (dbResetButton) {
                dbResetButton.classList.add('opacity-50', 'cursor-not-allowed');
                dbResetButton.setAttribute('disabled', 'true');
                dbResetButton.title = 'A felhő adatbázis törlése vendég módban le van tiltva.';
            }
            if (settingsSaveBtn) {
                settingsSaveBtn.classList.add('opacity-50', 'cursor-not-allowed');
                settingsSaveBtn.setAttribute('disabled', 'true');
            }
            if (devPanelBtns.length > 0) {
                devPanelBtns.forEach(btn => btn.classList.add('hidden'));
            }
            // Biztonság fület NEM rejtjük el teljesen, mert ott lehet feloldani a tulajdonosi jogokat!
            if (securityTabBtn) {
                securityTabBtn.classList.remove('hidden');
            }
        } else {
            if (dbResetButton) {
                dbResetButton.classList.remove('opacity-50', 'cursor-not-allowed');
                dbResetButton.removeAttribute('disabled');
                dbResetButton.title = '';
            }
            if (settingsSaveBtn) {
                settingsSaveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                settingsSaveBtn.removeAttribute('disabled');
            }
            if (devPanelBtns.length > 0) {
                devPanelBtns.forEach(btn => btn.classList.remove('hidden'));
            }
            if (securityTabBtn) {
                securityTabBtn.classList.remove('hidden');
            }
        }
    }

    /**
     * Inaktivitás számláló visszaállítása interakciókor
     */
    resetInactivity() {
        this.lastActivityTime = Date.now();
    }

    /**
     * Biztonsági beállítások űrlapjának feltöltése
     */
    populateForm() {
        const toggle = document.getElementById('securityLockToggle');
        const ownerInput = document.getElementById('securityOwnerPinInput');
        const guestInput = document.getElementById('securityGuestPinInput');
        const select = document.getElementById('securityAutolockSelect');

        if (toggle) toggle.checked = this.enabled;
        if (ownerInput) ownerInput.value = this.ownerPin;
        if (guestInput) guestInput.value = this.guestPin;
        if (select) select.value = String(this.autolockMinutes);
    }

    /**
     * Biztonsági beállítások mentése
     */
    saveSettingsFromUI() {
        const toggle = document.getElementById('securityLockToggle');
        const ownerInput = document.getElementById('securityOwnerPinInput');
        const guestInput = document.getElementById('securityGuestPinInput');
        const select = document.getElementById('securityAutolockSelect');

        const nextEnabled = toggle ? toggle.checked : this.enabled;
        const nextOwnerPin = ownerInput ? ownerInput.value.trim() : this.ownerPin;
        const nextGuestPin = guestInput ? guestInput.value.trim() : this.guestPin;
        const nextAutolock = select ? parseInt(select.value, 10) : this.autolockMinutes;

        // Validáció: ha be van kapcsolva a zár, akkor kötelező tulajdonosi PIN-t megadni!
        if (nextEnabled && !nextOwnerPin) {
            this.app.hmiNotif?.showToast('⚠️ A zár bekapcsolásához kötelező megadni a Tulajdonos kódját!', 'warning');
            ownerInput?.focus();
            return;
        }

        // Mentés
        this.enabled = nextEnabled;
        this.ownerPin = nextOwnerPin;
        this.guestPin = nextGuestPin;
        this.autolockMinutes = nextAutolock;

        localStorage.setItem('security_lock_enabled', this.enabled ? 'true' : 'false');
        localStorage.setItem('security_owner_pin', this.ownerPin);
        localStorage.setItem('security_guest_pin', this.guestPin);
        localStorage.setItem('security_autolock_minutes', String(this.autolockMinutes));

        this.app.logger?.log('auth', 'success', `Biztonsági zár beállításai frissítve. Állapot: ${this.enabled ? 'Aktív' : 'Inaktív'}, Autolock: ${this.autolockMinutes} perc.`);
        this.app.hmiNotif?.showToast('🔒 Biztonsági beállítások sikeresen elmentve!', 'success');

        // Watcher frissítése
        this._startInactivityWatcher();
    }

    // ==================== BELSŐ METÓDUSOK ====================

    _hideLockOverlay() {
        const overlay = document.getElementById('securityGuardOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
    }

    _updatePinDots() {
        const dots = document.querySelectorAll('#securityPinDotsContainer span');
        dots.forEach((dot, index) => {
            if (index < this.currentEnteredPin.length) {
                dot.className = 'w-3.5 h-3.5 rounded-full bg-indigo-500 border border-indigo-400 shadow shadow-indigo-500/50 scale-110 transition-all duration-150';
            } else {
                dot.className = 'w-3.5 h-3.5 rounded-full bg-slate-800 border border-slate-700 transition-all duration-150';
            }
        });
    }

    _startInactivityWatcher() {
        if (this.autolockIntervalId) {
            clearInterval(this.autolockIntervalId);
            this.autolockIntervalId = null;
        }

        if (!this.enabled || this.autolockMinutes <= 0) return;

        console.log(`[SECURITY] Inaktivitás figyelő elindítva: ${this.autolockMinutes} percre.`);
        this.autolockIntervalId = setInterval(() => {
            if (this.isLocked) return;
            const now = Date.now();
            const diffMs = now - this.lastActivityTime;
            const thresholdMs = this.autolockMinutes * 60 * 1000;

            if (diffMs >= thresholdMs) {
                console.log(`[SECURITY] Inaktivitás észlelve (${Math.round(diffMs/1000)}s), alkalmazás lezárása.`);
                this.app.logger?.log('auth', 'info', 'Automatikus lezárás inaktivitás miatt.');
                this.lock();
            }
        }, 10000); // 10 másodpercenként ellenőrzi
    }

    _bindEvents() {
        // --- 1. Felhasználói interakciók követése az inaktivitáshoz ---
        const resetActivity = () => this.resetInactivity();
        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(evt => {
            window.addEventListener(evt, resetActivity, { passive: true });
        });

        // --- 2. Záróképernyő beviteli mezők ---
        const input = document.getElementById('securityLockInput');
        if (input) {
            // Fizikai billentyűzet gépelés
            input.addEventListener('input', (e) => {
                this.currentEnteredPin = e.target.value;
                this._updatePinDots();
                
                // Ha pontosan megegyezik a hossza az egyik PIN-nel, automatikusan megpróbáljuk feloldani
                if (this.ownerPin && this.currentEnteredPin === this.ownerPin) {
                    this.unlock(this.currentEnteredPin);
                } else if (this.guestPin && this.currentEnteredPin === this.guestPin) {
                    this.unlock(this.currentEnteredPin);
                }
            });

            // Enter gombnyomásra feloldás kézzel is
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.unlock(this.currentEnteredPin);
                }
            });
        }

        // --- 3. Szem ikon a záróképernyő jelszó láthatóságához ---
        const toggleShowBtn = document.getElementById('btnToggleShowLockPassword');
        if (toggleShowBtn && input) {
            toggleShowBtn.addEventListener('click', () => {
                const icon = toggleShowBtn.querySelector('i');
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.className = 'fas fa-eye-slash text-sm text-indigo-400';
                } else {
                    input.type = 'password';
                    icon.className = 'fas fa-eye text-sm';
                }
            });
        }

        // --- 4. Numerikus Keypad gombok kezelése ---
        const keypadButtons = document.querySelectorAll('.keypad-btn');
        keypadButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute('data-value');
                const action = btn.getAttribute('data-action');

                if (val !== null) {
                    if (this.currentEnteredPin.length < 16) {
                        this.currentEnteredPin += val;
                        if (input) input.value = this.currentEnteredPin;
                        this._updatePinDots();

                        // Automatikus kísérlet ha 4 számjegyű kódok vannak beállítva
                        if (this.currentEnteredPin.length === 4) {
                            if (this.currentEnteredPin === this.ownerPin || this.currentEnteredPin === this.guestPin) {
                                setTimeout(() => this.unlock(this.currentEnteredPin), 100);
                            }
                        }
                    }
                } else if (action === 'clear') {
                    this.currentEnteredPin = '';
                    if (input) input.value = '';
                    this._updatePinDots();
                } else if (action === 'ok') {
                    this.unlock(this.currentEnteredPin);
                }
            });
        });

        // --- 5. Beállítások menü gombjai ---
        document.getElementById('btnSaveSecuritySettings')?.addEventListener('click', () => {
            this.saveSettingsFromUI();
        });

        document.getElementById('btnLockAppNow')?.addEventListener('click', () => {
            this.lock();
            this.app.hmiNotif?.showToast('🔒 Az alkalmazás manuálisan lezárva.', 'info');
        });

        // --- 6. Vendég upgrade panel kezelése (Mester Jelszó feloldás a Beállításokban) ---
        const upgradeBtn = document.getElementById('btnUpgradeToOwner');
        const rootInput = document.getElementById('securityRootPasswordInput');
        const toggleRootPassBtn = document.getElementById('btnToggleShowRootPassword');

        if (toggleRootPassBtn && rootInput) {
            toggleRootPassBtn.addEventListener('click', () => {
                const icon = toggleRootPassBtn.querySelector('i');
                if (rootInput.type === 'password') {
                    rootInput.type = 'text';
                    icon.className = 'fas fa-eye-slash text-xs text-indigo-500';
                } else {
                    rootInput.type = 'password';
                    icon.className = 'fas fa-eye text-xs';
                }
            });
        }

        if (upgradeBtn && rootInput) {
            upgradeBtn.addEventListener('click', async () => {
                const password = rootInput.value.trim();
                if (!password) {
                    this.app.hmiNotif?.showToast('⚠️ Kérlek, írd be a mester jelszót!', 'warning');
                    rootInput.focus();
                    return;
                }

                // UI loading állapot
                upgradeBtn.disabled = true;
                const origHtml = upgradeBtn.innerHTML;
                upgradeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ellenőrzés...';

                try {
                    const isRoot = await this.verifyRootPassword(password);
                    if (isRoot) {
                        this.currentUser = 'owner';
                        localStorage.setItem('OWNER_MODE', 'true');
                        rootInput.value = '';
                        
                        this.applyRestrictions();
                        this.populateForm();

                        // Log és értesítés
                        this.app.logger?.log('auth', 'success', 'Sikeres tulajdonosi jog feloldás a Beállítások felületen.');
                        this.app.hmiNotif?.showToast('🔓 Sikeres feloldás! Tulajdonosi jogok aktiválva.', 'success');
                    } else {
                        this.app.logger?.log('auth', 'warn', 'Sikertelen tulajdonosi jog feloldási kísérlet a Beállításoknál: Hibás jelszó.');
                        this.app.hmiNotif?.showToast('❌ Helytelen Fejlesztői Mester Jelszó!', 'error');
                        
                        // Shake effekt az inputon
                        rootInput.classList.add('border-red-500', 'animate-shake');
                        setTimeout(() => {
                            rootInput.classList.remove('border-red-500', 'animate-shake');
                        }, 1000);
                    }
                } catch (err) {
                    console.error('[SECURITY] Hiba a jogok feloldása közben:', err);
                    this.app.hmiNotif?.showToast('❌ Hálózati hiba a hitelesítés során!', 'error');
                } finally {
                    upgradeBtn.disabled = false;
                    upgradeBtn.innerHTML = origHtml;
                }
            });

            // Enter gombnyomásra feloldás a beviteli mezőben is
            rootInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    upgradeBtn.click();
                }
            });
        }
    }
}
