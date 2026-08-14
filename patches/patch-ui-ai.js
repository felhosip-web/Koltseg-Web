import fs from 'fs';
let content = fs.readFileSync('js/ui-controller.js', 'utf8');

// 1. Populate AI settings
const populatePatch = `    populateSettingsForm() {
        if (!this.app.config) return;

        const urlEl = document.getElementById('supabaseUrlInput');
        const keyEl = document.getElementById('supabaseKeyInput');
        const rateEl = document.getElementById('eurRateInput');
        const toggleEl = document.getElementById('supabaseToggle');
        const liveEurEl = document.getElementById('useLiveEurToggle');

        if (urlEl) urlEl.value = this.app.config.supabaseConfig?.url || '';
        if (keyEl) keyEl.value = this.app.config.supabaseConfig?.key || '';
        if (rateEl) rateEl.value = String(this.app.config.defaultEurRate || this.app.config.eurRate || 400);
        if (toggleEl) toggleEl.checked = Boolean(this.app.config.useSupabase);
        if (liveEurEl) liveEurEl.checked = this.app.config.useLiveEur !== false;

        // Populate AI settings
        const aiApiKeyEl = document.getElementById('aiApiKey');
        const aiModelEl = document.getElementById('aiModel');
        if (aiApiKeyEl) aiApiKeyEl.value = this.app.config.aiConfig?.apiKey || '';
        if (aiModelEl) aiModelEl.value = this.app.config.aiConfig?.model || 'gemini-3.5-flash';
`;

content = content.replace(/    populateSettingsForm\(\) \{[\s\S]*?if \(liveEurEl\) liveEurEl\.checked = this\.app\.config\.useLiveEur !== false;/, populatePatch);

// 2. Add event listener for btnSaveAiSettings
const evtPatch = `
        // AI Settings
        document.getElementById('btnSaveAiSettings')?.addEventListener('click', () => {
            const aiApiKey = document.getElementById('aiApiKey').value.trim();
            const aiModel = document.getElementById('aiModel').value;
            
            this.app.config.aiConfig = {
                apiKey: aiApiKey,
                model: aiModel
            };
            
            localStorage.setItem('ai_api_key', aiApiKey);
            localStorage.setItem('ai_model', aiModel);
            
            this.app.hmiNotif?.showToast('AI beállítások mentve!', 'success');
        });
`;

content = content.replace("document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {", evtPatch + "\n        document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {");

fs.writeFileSync('js/ui-controller.js', content);
