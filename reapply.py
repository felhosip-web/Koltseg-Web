import re
import codecs
import json

# version.json
with codecs.open('version.json', 'r', 'utf-8') as f:
    data = json.load(f)
data['version'] = '7.0.11'
data['changelog'].insert(0, {
    "version": "7.0.11",
    "date": "2026-08-29",
    "changes": [
        "React Phase 12: Reminders UI migrated to React",
        "Reminder save/load still uses existing vanilla / window.app handlers",
        "Changelog remains driven by version.json"
    ]
})
with codecs.open('version.json', 'w', 'utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# index.html
with codecs.open('index.html', 'r', 'utf-8') as f:
    content = f.read()

start_str = '<div id="tab-reminders" class="tab-pane hidden">'
end_str = '            <!-- 4. STATISZTIKA -->'
start_idx = content.find(start_str)
end_idx = content.find(end_str)
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx + len(start_str)] + '\n                <div id="costAppRemindersRoot"></div>\n            </div>\n\n' + content[end_idx:]

pattern = re.compile(r'<div id="editReminderModal".*?<!-- ===== SZINKRONIZÁCIÓS MODAL ===== -->', re.DOTALL)
content = pattern.sub('<!-- ===== SZINKRONIZÁCIÓS MODAL ===== -->', content)

with codecs.open('index.html', 'w', 'utf-8') as f:
    f.write(content)


# js/oop-reminders.js
with codecs.open('js/oop-reminders.js', 'r', 'utf-8') as f:
    oop = f.read()

old_new = """    async _handleNewReminder() {
        const title = document.getElementById('remTitleInput').value.trim();
        const amount = parseFloat(document.getElementById('remAmountInput').value);
        const currency = document.getElementById('remCurrencySelect').value;
        const due_date = document.getElementById('remDateInput').value;
        const frequency = document.getElementById('remFreqSelect').value;"""

new_new = """    async _handleNewReminder(data = null) {
        let title, amount, currency, due_date, frequency;
        if (data) {
            ({ title, amount, currency, due_date, frequency } = data);
        } else {
            title = document.getElementById('remTitleInput').value.trim();
            amount = parseFloat(document.getElementById('remAmountInput').value);
            currency = document.getElementById('remCurrencySelect').value;
            due_date = document.getElementById('remDateInput').value;
            frequency = document.getElementById('remFreqSelect').value;
        }"""

oop = oop.replace(old_new, new_new)

old_update = """    async _updateReminder() {
        const id = document.getElementById('editRemId').value; // UUID string
        const title = document.getElementById('editRemTitle').value.trim();
        const amount = parseFloat(document.getElementById('editRemAmount').value);
        const currency = document.getElementById('editRemCurrency').value;
        const due_date = document.getElementById('editRemDate').value;
        const frequency = document.getElementById('editRemFreq').value;"""

new_update = """    async _updateReminder(data = null) {
        let id, title, amount, currency, due_date, frequency;
        if (data) {
            ({ id, title, amount, currency, due_date, frequency } = data);
        } else {
            id = document.getElementById('editRemId').value; // UUID string
            title = document.getElementById('editRemTitle').value.trim();
            amount = parseFloat(document.getElementById('editRemAmount').value);
            currency = document.getElementById('editRemCurrency').value;
            due_date = document.getElementById('editRemDate').value;
            frequency = document.getElementById('editRemFreq').value;
        }"""

oop = oop.replace(old_update, new_update)

old_add_reset = """        document.getElementById('reminderForm').reset();
        this.renderer.renderList();"""
new_add_reset = """        if (document.getElementById('reminderForm')) {
            document.getElementById('reminderForm').reset();
        }
        if (this.renderer && this.renderer.renderList) {
            this.renderer.renderList();
        }"""
oop = oop.replace(old_add_reset, new_add_reset)

old_edit_reset = """        document.getElementById('editReminderModal').classList.add('hidden');
        this.renderer.renderList();"""
new_edit_reset = """        if (document.getElementById('editReminderModal')) {
            document.getElementById('editReminderModal').classList.add('hidden');
        }
        if (this.renderer && this.renderer.renderList) {
            this.renderer.renderList();
        }"""
oop = oop.replace(old_edit_reset, new_edit_reset)

class_def = "class RemindersApp {"
idx = oop.find(class_def)
if idx != -1:
    last_brace_idx = oop.rfind('}')

    methods = """
    async _handleCompleteReminder(id) {
        const rem = this.app.reminderManager.reminders.find(r => String(r.id) === String(id));
        if (!rem) return;

        // 1. Megjelölés teljesítettnek
        await this.app.reminderManager.markAsCompleted(id);
        if (this.renderer && this.renderer.renderList) this.renderer.renderList();
        this.app.updateReminderStatus?.();

        // 2. Intelligens Költség-rögzítés felajánlása
        const logAsExpense = await this.hmiNotif.showConfirm({
            title: '💸 Kiadás rögzítése?',
            message: `Szeretnéd a(z) "${rem.title}" (${rem.amount.toLocaleString('hu-HU')} ${rem.currency || 'HUF'}) határidőt kiadásként is automatikusan rögzíteni a táblázatban?`,
            type: 'success',
            confirmText: 'Igen, rögzítsük',
            cancelText: 'Nem szükséges'
        });

        if (logAsExpense) {
            const categories = this.app.items?.items || [];
            if (categories.length === 0) {
                this.hmiNotif.showToast('Nincsenek kategóriák rögzítve az adatlapon!', 'error');
                return;
            }

            // Kategóriaválasztó modal megjelenítése
            const categoryNames = categories.map(c => c.name);
            const selectedCatName = await this.hmiNotif.showSelectModal({
                title: 'Válaszd ki a kategóriát',
                options: categoryNames,
                placeholder: 'Kategória kiválasztása...'
            });

            if (selectedCatName) {
                const selectedCat = categories.find(c => c.name === selectedCatName);
                if (selectedCat) {
                    const month = rem.due_date.substring(0, 7); // Pl.: "2026-07"
                    const cellBaseKey = `${selectedCat.id}_${month}`;
                    const cellKey = `${cellBaseKey}_${Date.now()}`;

                    const entryData = {
                        cellKey,
                        itemId: selectedCat.id,
                        month: month,
                        amount: rem.amount,
                        currency: rem.currency || 'HUF',
                        paymentMethod: 'Kártya',
                        note: rem.title,
                        color: 'transparent',
                        timestamp: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    await this.app.entries.saveEntry(entryData);
                    await this.app.entries.load();

                    // Fő táblázat frissítése
                    if (this.app.renderer) {
                        this.app.renderer.renderTable();
                        this.app.renderer.renderSummary?.();
                        this.app.renderer.updateFooterStatus('Határidő teljesítve és kiadásként rögzítve!', false);
                    }
                    this.hmiNotif.showToast('Kiadás sikeresen rögzítve!', 'success');
                }
            }
        } else {
            this.hmiNotif.showToast('Határidő teljesítettnek jelölve!', 'success');
        }
    }

    async _handleDeleteReminder(id) {
        const rem = this.app.reminderManager.reminders.find(r => String(r.id) === String(id));
        if (!rem) return;

        const confirmed = await this.hmiNotif.showConfirm({
            title: 'Határidő törlése',
            message: `Biztosan törli a "${rem.title}" határidőt?`,
            type: 'warning',
            confirmText: 'Törlés'
        });

        if (confirmed) {
            await this.app.reminderManager.delete(id);
            if (this.renderer && this.renderer.renderList) this.renderer.renderList();
            this.app.updateReminderStatus?.();
        }
    }
"""
    oop = oop[:last_brace_idx] + methods + oop[last_brace_idx:]

with codecs.open('js/oop-reminders.js', 'w', 'utf-8') as f:
    f.write(oop)


# src/landing.jsx
with codecs.open('src/landing.jsx', 'r', 'utf-8') as f:
    landing = f.read()

import_statement = "import RemindersTab from './components/reminders/RemindersTab.jsx'\n"
if "RemindersTab" not in landing:
    landing = import_statement + landing
    render_code = """
const remindersRoot = document.getElementById('costAppRemindersRoot');
if (remindersRoot) {
    ReactDOM.createRoot(remindersRoot).render(
      <React.StrictMode>
        <RemindersTab />
      </React.StrictMode>,
    )
}
"""
    landing = landing + render_code
    with codecs.open('src/landing.jsx', 'w', 'utf-8') as f:
        f.write(landing)
