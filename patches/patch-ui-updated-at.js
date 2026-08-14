import fs from 'fs';
let content = fs.readFileSync('js/ui-controller.js', 'utf8');

// In _handleSettingsSave
content = content.replace("            this.app.hmiNotif?.showToast('Beállítások sikeresen rögzítve!', 'success');", "            localStorage.setItem('settings_updated_at', new Date().toISOString());\n            this.app.hmiNotif?.showToast('Beállítások sikeresen rögzítve!', 'success');");

// In btnSaveAiSettings
content = content.replace("localStorage.setItem('ai_model', aiModel);", "localStorage.setItem('ai_model', aiModel);\n            localStorage.setItem('settings_updated_at', new Date().toISOString());");

// In appearance_bg_theme (theme update loop in applyAppearanceSettings?) Wait, let's just find where it sets it.
content = content.replace(/localStorage\.setItem\('appearance_bg_theme', theme\);/g, "localStorage.setItem('appearance_bg_theme', theme); localStorage.setItem('settings_updated_at', new Date().toISOString());");
content = content.replace(/localStorage\.setItem\('appearance_dark_mode', String\(isDark\)\);/g, "localStorage.setItem('appearance_dark_mode', String(isDark)); localStorage.setItem('settings_updated_at', new Date().toISOString());");
content = content.replace(/localStorage\.setItem\('appearance_dark_mode', 'false'\);/g, "localStorage.setItem('appearance_dark_mode', 'false'); localStorage.setItem('settings_updated_at', new Date().toISOString());");
content = content.replace(/localStorage\.setItem\('appearance_bg_theme', 'white'\);/g, "localStorage.setItem('appearance_bg_theme', 'white'); localStorage.setItem('settings_updated_at', new Date().toISOString());");

fs.writeFileSync('js/ui-controller.js', content);
