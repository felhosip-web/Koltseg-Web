// js/messages.js - Központosított üzenettár és lokalizációs szótár (v4.5.1)

export const MESSAGES = {
    // Rendszerszintű üzenetek
    system: {
        app_started: "Alkalmazás sikeresen elindult.",
        db_connected: "IndexedDB sikeresen csatlakoztatva.",
        db_connection_error: "Adatbázis kapcsolódási hiba, áttérés memóriabeli adatbázisra.",
        save_success: "Adatok sikeresen mentve",
        network_offline: "Nincs kapcsolat",
        network_online: "Hálózat aktív"
    },

    // Toasts (felugró értesítések)
    toast: {
        save_success: "✅ Mentés sikeres!",
        save_error: "❌ Hiba a mentés során!",
        delete_success: "✅ Sikeresen törölve!",
        delete_error: "❌ Hiba a törlés során!",
        update_success: "✅ Sikeresen módosítva!",
        
        // Tranzakciók / bejegyzések
        entry_added: "✅ Új rész-tétel rögzítve!",
        entry_updated: "✅ Rész-tétel frissítve!",
        entry_deleted: "✅ Rész-tétel törölve",
        entry_invalid_amount: "Érvénytelen összeg!",
        
        // Bevételek / bejövő utalások
        incoming_added: "✅ Bejövő utalás rögzítve!",
        incoming_updated: "✅ Bejövő utalás módosítva!",
        incoming_deleted: "✅ Bejövő utalás törölve!",
        incoming_invalid_sender: "Az utaló neve nem lehet üres!",
        
        // Határidők
        reminder_completed: "✅ Határidő teljesítve!",
        reminder_added: "✅ Új határidő rögzítve!",
        reminder_deleted: "✅ Határidő törölve!",
        
        // Kategóriák / Sablonok
        category_added: "✅ Új kategória hozzáadva!",
        category_deleted: "✅ Kategória törölve!",
        template_added: "✅ Sablon elmentve!",
        template_deleted: "✅ Sablon törölve!",
        
        // Egyéb
        purge_success: "✅ Hónap sikeresen kiürítve!",
        purge_canceled: "Kiürítés megszakítva."
    },

    // Megerősítő párbeszédpanelek (Confirm modals)
    confirm: {
        delete_entry_title: "Rész-tétel törlése",
        delete_entry_msg: "Biztosan törli ezt a rész-tételt?\n\n{info}",
        
        delete_incoming_title: "🗑️ Tétel törlése",
        delete_incoming_msg: "Biztosan törölni szeretnéd ezt a bejövő utalást? ({info} Ft)",
        
        purge_month_title: "⚠️ Hónap TELJES kiürítése",
        purge_month_msg: "BIZTOSAN TÖRÖLNI szeretnéd a(z) {month} hónap ÖSSZES rázögzített kiadását? Ez a művelet nem vonható vissza!",
        
        log_expense_title: "💸 Kiadás rögzítése?",
        log_expense_msg: "Szeretnéd a(z) \"{title}\" ({amount}) határidőt kiadásként is automatikusan rögzíteni a táblázatban?"
    }
};

/**
 * Szövegek dinamikus behelyettesítésére szolgáló segédfüggvény
 * @param {string} text - Az alap szöveg
 * @param {object} params - A behelyettesítendő paraméterek (pl. { month: '2026-07' })
 * @returns {string} - A behelyettesített szöveg
 */
export function formatMessage(text, params = {}) {
    if (!text) return '';
    let result = text;
    for (const key in params) {
        result = result.replace(new RegExp(`{${key}}`, 'g'), params[key]);
    }
    return result;
}
