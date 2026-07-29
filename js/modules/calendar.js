export const calendarModuleScript = `
return {
    id: 'plugin_calendar',
    name: 'Naptár Modul',
    version: '1.0.0',
    category: 'productivity',
    author: 'Rendszer',
    description: 'Naptár nézet a bejegyzésekhez és határidőkhöz.',
    icon: 'fas fa-calendar-alt text-blue-500',
    hasTab: true,
    tabConfig: {
        id: 'tab_plugin_calendar',
        title: 'Naptár',
        icon: 'fas fa-calendar-alt',
        render: (app) => {
            const view = document.getElementById('moduleView_tab_plugin_calendar');
            if (view) {
                view.innerHTML = '<div class="p-4 bg-blue-50 text-blue-700 rounded-xl font-bold"><i class="fas fa-calendar-check"></i> Modul betöltve (Naptár)</div>';
            }
        }
    }
};
`;
