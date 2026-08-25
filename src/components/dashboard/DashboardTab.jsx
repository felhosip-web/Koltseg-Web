import React, { useEffect, useState, useRef } from 'react';

// A minimal port of the dashboard rendering logic using React state

export default function DashboardTab() {
    const [stats, setStats] = useState(null);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    const [weatherData, setWeatherData] = useState({ icon: 'fa-cloud', color: 'text-sky-400', temp: '--', city: 'Betöltés...' });
    const [timeTrackerStats, setTimeTrackerStats] = useState({ hours: '--', minutes: '--', earnings: '--' });

    useEffect(() => {
        const loadData = () => {
            if (!window.app || !window.app.entries || !window.app.items || !window.app.months) {
                return;
            }

            const app = window.app;
            const dayjs = window.dayjs;

            const entries = (app.entries.entries || []).filter(e => !e.isStorno);
            const items = app.items.items || [];
            const months = app.months.months || [];
            const incomings = (app.incomingManager?.incomings || []).filter(e => !e.isStorno);
            const eurRate = app.config.eurRate || 400;

            // KIADÁSOK
            let total = 0;
            let monthlyTotal = 0;
            let topCategory = { name: '-', amount: 0 };
            const categoryTotals = {};

            const now = dayjs ? dayjs() : new Date();
            const currentMonth = dayjs ? now.format('YYYY-MM') : `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

            entries.forEach(e => {
                const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                total += amount;

                let entryMonth = '';
                if (e.cellKey) {
                   entryMonth = e.cellKey.substring(0, 7); // Fallback parseCellKey logic if import is tricky
                   const parts = e.cellKey.split('_');
                   if (parts.length > 1) {
                        entryMonth = parts[1];
                   }
                }

                if (entryMonth === currentMonth) {
                    monthlyTotal += amount;
                }

                const itemName = items.find(i => i.id === e.itemId)?.name || 'Ismeretlen';
                if (!categoryTotals[itemName]) categoryTotals[itemName] = 0;
                categoryTotals[itemName] += amount;
            });

            for (const [name, amount] of Object.entries(categoryTotals)) {
                if (amount > topCategory.amount) {
                    topCategory = { name, amount };
                }
            }

            // BEJÖVŐ
            let incomingTotal = 0;
            let currentMonthIncoming = 0;
            incomings.forEach(e => {
                const amount = e.amount || 0;
                incomingTotal += amount;
                let incMonth = '';
                if(e.date) {
                    incMonth = e.date.substring(0, 7);
                }
                if (incMonth === currentMonth) {
                    currentMonthIncoming += amount;
                }
            });

            const balance = incomingTotal - total;
            const monthlyBalance = currentMonthIncoming - monthlyTotal;

            // HAVI ÁTLAG
            const monthlyData = {};
            entries.forEach(e => {
                let month = '';
                if (e.cellKey) {
                   const parts = e.cellKey.split('_');
                   if (parts.length > 1) month = parts[1];
                }
                if (!month) return;
                const amount = e.currency === 'EUR' ? e.amount * eurRate : e.amount;
                if (!monthlyData[month]) monthlyData[month] = 0;
                monthlyData[month] += amount;
            });
            const recordedMonths = Object.keys(monthlyData);
            const avgTotal = Object.values(monthlyData).reduce((a, b) => a + b, 0);
            const monthlyAvg = recordedMonths.length > 0 ? Math.round(avgTotal / recordedMonths.length) : 0;

            // TOP 5
            const top5 = Object.entries(categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // ÉRTESÍTÉSEK
            const notifications = [];
            const reminders = app.reminderManager?.reminders || [];

            const todayStr = dayjs ? dayjs().format('YYYY-MM-DD') : now.toISOString().split('T')[0];
            const overdue = reminders.filter(r => r.due_date < todayStr);
            if (overdue.length > 0) {
                notifications.push({ type: 'danger', icon: '⚠️', text: `${overdue.length} határidő lejárt!` });
            }

            const soon = reminders.filter(r => {
                if (!dayjs) return false;
                const diff = dayjs(r.due_date).diff(now, 'day');
                return diff > 0 && diff <= 7;
            });
            if (soon.length > 0) {
                notifications.push({ type: 'warning', icon: '⏰', text: `${soon.length} határidő közeledik (7 napon belül)` });
            }

            if (monthlyAvg > 0 && monthlyTotal > monthlyAvg * 1.3) {
                notifications.push({ type: 'warning', icon: '📈', text: `Havi kiadás ${Math.round((monthlyTotal / monthlyAvg - 1) * 100)}%-kal magasabb az átlagnál` });
            }

            const savedRate = parseFloat(localStorage.getItem('last_eur_rate')) || eurRate;
            if (savedRate !== eurRate && savedRate > 0) {
                const change = ((eurRate - savedRate) / savedRate * 100);
                if (Math.abs(change) > 2) {
                    notifications.push({ type: 'info', icon: '💶', text: `EUR árfolyam ${change > 0 ? '↗︎' : '↘︎'} ${Math.abs(change).toFixed(1)}% (${savedRate} → ${eurRate} Ft)` });
                }
                localStorage.setItem('last_eur_rate', eurRate.toString());
            }

            // TODAY FOCUS
            const notes = app.notepadNotes || (JSON.parse(localStorage.getItem('plugin_notepad_notes')) || []);
            let calendarEvents = app.calendarEvents || (JSON.parse(localStorage.getItem('plugin_calendar_events')) || []);
            if (!calendarEvents || calendarEvents.length === 0) {
                calendarEvents = JSON.parse(localStorage.getItem('calendar_events')) || [];
            }
            const shoppingItems = app.shoppingItems || (JSON.parse(localStorage.getItem('plugin_shopping_list_items')) || []);
            const kmEntries = app.fuelLogs || (JSON.parse(localStorage.getItem('plugin_fuel_logs')) || []);

            const urgentItems = [];
            const todayStrISO = now.toISOString ? now.toISOString().split('T')[0] : todayStr;

            if (Array.isArray(notes)) {
                notes.forEach(note => {
                    if (note.reminderTime && !note.completed) {
                        const rDate = new Date(note.reminderTime).toISOString().split('T')[0];
                        if (rDate <= todayStrISO) {
                            urgentItems.push({ type: 'note', icon: 'fa-sticky-note', color: 'text-amber-500', bg: 'bg-amber-50', text: note.content.substring(0, 40) + (note.content.length > 40 ? '...' : ''), title: 'Jegyzet emlékeztető' });
                        }
                    }
                });
            }

            if (Array.isArray(calendarEvents)) {
                calendarEvents.forEach(ev => {
                    if (ev.date === todayStrISO) {
                        urgentItems.push({ type: 'calendar', icon: 'fa-calendar-day', color: 'text-blue-500', bg: 'bg-blue-50', text: ev.title, title: 'Mai esemény' });
                    }
                });
            }

            if (Array.isArray(shoppingItems)) {
                const pendingShop = shoppingItems.filter(i => !i.checked);
                if (pendingShop.length > 0) {
                    urgentItems.push({ type: 'shopping', icon: 'fa-shopping-cart', color: 'text-indigo-500', bg: 'bg-indigo-50', text: `${pendingShop.length} termék a listán`, title: 'Bevásárlás' });
                }
            }

            setStats({
                entriesCount: entries.length,
                monthsCount: months.length,
                itemsCount: items.length,
                total,
                monthlyTotal,
                topCategory,
                incomingTotal,
                currentMonthIncoming,
                balance,
                monthlyBalance,
                monthlyAvg,
                monthlyData, // For chart
                top5,
                notifications,
                urgentItems,
                eurRate
            });
        };

        const handleUpdate = () => {
            loadData();
        };

        // Initial load
        if (window.app && window.app.isBooted) {
             loadData();
        }

        window.addEventListener('app-data-updated', handleUpdate);
        return () => window.removeEventListener('app-data-updated', handleUpdate);
    }, []);

    useEffect(() => {
        // Fetch weather
        const fetchWeather = async () => {
            if (!window.app) return;
            const weatherCity = window.app.config?.weatherCity || 'Budapest';

            const now = Date.now();
            const cacheDuration = 15 * 60 * 1000;
            if (window.app.weatherCache &&
                window.app.weatherCache.city.toLowerCase() === weatherCity.toLowerCase() &&
                (now - window.app.weatherCache.timestamp < cacheDuration)) {
                applyWeatherData(window.app.weatherCache);
                return;
            }

            try {
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(weatherCity)}&count=1&language=hu&format=json`);
                if (!geoRes.ok) throw new Error('Geocoding failed');
                const geoData = await geoRes.json();

                let lat = 47.4979, lon = 19.0402, displayName = weatherCity;
                if (geoData.results && geoData.results.length > 0) {
                    lat = geoData.results[0].latitude;
                    lon = geoData.results[0].longitude;
                    displayName = geoData.results[0].name;
                }

                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`);
                if (!weatherRes.ok) throw new Error('Weather forecast failed');
                const wData = await weatherRes.json();

                if (wData.current) {
                    const temp = Math.round(wData.current.temperature_2m);
                    const code = wData.current.weather_code;
                    const isDay = wData.current.is_day !== 0;

                    const cacheEntry = { temp, code, isDay, city: displayName, timestamp: now };
                    window.app.weatherCache = cacheEntry;
                    applyWeatherData(cacheEntry);
                }
            } catch (err) {
                console.error('[WEATHER ERR]', err);
                setWeatherData({ icon: 'fa-cloud', color: 'text-slate-400', temp: 'Nincs adat', city: weatherCity });
            }
        };

        const applyWeatherData = (data) => {
            let iconClass = 'fa-cloud';
            let colorClass = 'text-slate-500';
            const { code, isDay, temp, city } = data;

            if (code === 0) {
                iconClass = isDay ? 'fa-sun' : 'fa-moon';
                colorClass = isDay ? 'text-amber-500' : 'text-indigo-400';
            } else if (code >= 1 && code <= 3) {
                iconClass = isDay ? 'fa-cloud-sun' : 'fa-cloud-moon';
                colorClass = isDay ? 'text-blue-400' : 'text-indigo-300';
            } else if (code === 45 || code === 48) {
                iconClass = 'fa-smog';
                colorClass = 'text-slate-400';
            } else if ((code >= 51 && code <= 55) || (code >= 56 && code <= 57)) {
                iconClass = 'fa-cloud-rain';
                colorClass = 'text-blue-400';
            } else if ((code >= 61 && code <= 65) || (code >= 66 && code <= 67)) {
                iconClass = 'fa-cloud-showers-heavy';
                colorClass = 'text-indigo-500';
            } else if (code >= 71 && code <= 77) {
                iconClass = 'fa-snowflake';
                colorClass = 'text-sky-300';
            } else if (code >= 80 && code <= 82) {
                iconClass = 'fa-cloud-showers-water';
                colorClass = 'text-blue-500';
            } else if (code >= 85 && code <= 86) {
                iconClass = 'fa-snowflake';
                colorClass = 'text-sky-400';
            } else if (code >= 95 && code <= 99) {
                iconClass = 'fa-cloud-bolt';
                colorClass = 'text-amber-600';
            }

            setWeatherData({ icon: iconClass, color: colorClass, temp, city });
        };

        fetchWeather();
    }, []);

    useEffect(() => {
        // Fetch Time Tracker Data async
        if (window.app && window.app.timeTracker && window.dayjs && window.db) {
            const startOfWeek = window.dayjs().startOf('week').format('YYYY-MM-DD');
            const endOfWeek = window.dayjs().endOf('week').format('YYYY-MM-DD');

            window.db.timeEntries.where('date').between(startOfWeek, endOfWeek, true, true).toArray().then(weekEntries => {
                let weekMinutes = 0;
                let weekEarnings = 0;
                weekEntries.forEach(e => {
                    weekMinutes += e.durationMin;
                    weekEarnings += e.earnings;
                });

                const h = Math.floor(weekMinutes / 60);
                const m = weekMinutes % 60;
                setTimeTrackerStats({
                    hours: h > 0 ? `${h}ó` : '',
                    minutes: `${m}p`,
                    earnings: weekEarnings.toLocaleString('hu-HU')
                });
            }).catch(e => console.error(e));
        }
    }, []);

    useEffect(() => {
        if (!stats || !stats.monthlyData || !chartRef.current) return;
        if (!window.Chart) return; // Wait for Chart.js to load

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const sortedMonths = Object.keys(stats.monthlyData).sort();
        const last6Months = sortedMonths.slice(-6);
        const labels = last6Months.map(m => {
            const [year, month] = m.split('-');
            return `${month}.${year.slice(2)}`;
        });
        const data = last6Months.map(m => stats.monthlyData[m] || 0);

        if (data.length === 0) {
            const ctx = chartRef.current.getContext('2d');
            ctx.clearRect(0, 0, chartRef.current.width, chartRef.current.height);
            ctx.fillStyle = '#9ca3af';
            ctx.font = '14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('Nincs elég adat a trend megjelenítéséhez', chartRef.current.width / 2, chartRef.current.height / 2);
            return;
        }

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Havi kiadás (Ft)',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ctx.parsed.y.toLocaleString('hu-HU') + ' Ft'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => (value / 1000).toFixed(0) + 'k'
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });

    }, [stats]);


    if (!stats) return <div className="p-4 text-gray-500">Adatok betöltése...</div>;

    const navigateTo = (mod) => {
        if (mod === 'cost') {
            window.app?.switchTab('table');
        } else {
            if (window.app?.moduleManager) {
                let modId = mod;
                if (modId === 'fuel_log') modId = 'fuel';
                window.app.moduleManager.launchModule(modId);
            }
        }
    };

    const triggerAction = (action) => {
        if (action === 'new_cost') {
            document.getElementById('btnNewItem')?.click();
        } else if (action === 'new_note') {
            navigateTo('notepad');
            setTimeout(() => {
                document.getElementById('btnQuickNoteTrigger')?.click();
            }, 300);
        } else if (action === 'new_km') {
            navigateTo('fuel_log');
        } else if (action === 'new_shopping') {
            navigateTo('shopping_list');
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">

            {/* HERO CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

                {/* 1. Havi Keret / Egyenleg Card */}
                <div className="md:col-span-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <i className="fas fa-wallet text-9xl"></i>
                    </div>

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-blue-100 font-medium tracking-wide text-sm uppercase">Aktuális Havi Egyenleg</h2>
                                <p className="text-4xl md:text-5xl font-black mt-2 tracking-tight">
                                    {stats.monthlyBalance.toLocaleString('hu-HU')} <span className="text-2xl text-blue-200">Ft</span>
                                </p>
                            </div>
                            <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-sm font-bold shadow-sm">
                                {window.dayjs ? window.dayjs().format('MMMM').toUpperCase() : 'HÓNAP'}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-white/20">
                            <div>
                                <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">
                                    <i className="fas fa-arrow-up text-emerald-400 mr-1"></i> Bevételek
                                </p>
                                <p className="text-xl font-bold">{stats.currentMonthIncoming.toLocaleString('hu-HU')} Ft</p>
                            </div>
                            <div>
                                <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">
                                    <i className="fas fa-arrow-down text-rose-400 mr-1"></i> Kiadások
                                </p>
                                <p className="text-xl font-bold">{stats.monthlyTotal.toLocaleString('hu-HU')} Ft</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Today Focus / Időjárás */}
                <div className="md:col-span-4 flex flex-col gap-6">

                    {/* WEATHER (Statisztikus Placeholder vagy Vanilla Fetcher) */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex items-center justify-between group cursor-pointer hover:shadow-md transition">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center`}>
                                <i className={`fas ${weatherData.icon} ${weatherData.color} text-2xl transition-all duration-300`}></i>
                            </div>
                            <div>
                                <p className="text-2xl font-black text-gray-800">{weatherData.temp !== '--' && weatherData.temp !== 'Nincs adat' ? `${weatherData.temp} °C` : weatherData.temp}</p>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{weatherData.city}</p>
                            </div>
                        </div>
                        <i className="fas fa-chevron-right text-gray-300 group-hover:text-sky-500 transition"></i>
                    </div>

                    {/* FOCUS LIST */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Napi Fókusz</h3>
                            <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{stats.urgentItems.length} aktív</span>
                        </div>

                        <div className="flex-1 flex flex-col justify-center space-y-3">
                            {stats.urgentItems.length === 0 ? (
                                <div className="text-center py-4">
                                    <div className="w-10 h-10 mx-auto bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-2">
                                        <i className="fas fa-check"></i>
                                    </div>
                                    <p className="text-sm font-medium text-gray-500">Minden feladat kész!</p>
                                </div>
                            ) : (
                                stats.urgentItems.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full ${item.bg} ${item.color} flex items-center justify-center shrink-0`}>
                                            <i className={`fas ${item.icon} text-sm`}></i>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-800 truncate">{item.text}</p>
                                            <p className="text-[10px] text-gray-400">{item.title}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN STATS GRID */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Havi Kiadás</p>
                        <i className="fas fa-chart-line text-blue-500 bg-blue-50 p-2 rounded-xl"></i>
                    </div>
                    <p className="text-2xl font-black text-gray-800">{stats.monthlyTotal.toLocaleString('hu-HU')} <span className="text-sm text-gray-400">Ft</span></p>

                    {(() => {
                        const diff = stats.monthlyAvg > 0 ? ((stats.monthlyTotal - stats.monthlyAvg) / stats.monthlyAvg) * 100 : 0;
                        if (stats.monthlyAvg > 0 && Math.abs(diff) > 5) {
                            return <p className={`text-xs ${diff > 0 ? 'text-rose-500' : 'text-emerald-500'} mt-1`}>
                                {diff > 0 ? '↗︎' : '↘︎'} {Math.abs(diff).toFixed(1)}% az átlaghoz képest
                            </p>;
                        }
                        return <p className="text-xs text-gray-400 mt-1">↔️ Az átlagos szinten</p>;
                    })()}
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Összes Kiadás</p>
                        <i className="fas fa-coins text-amber-500 bg-amber-50 p-2 rounded-xl"></i>
                    </div>
                    <p className="text-2xl font-black text-gray-800">{stats.total.toLocaleString('hu-HU')} <span className="text-sm text-gray-400">Ft</span></p>
                    <p className="text-xs text-gray-400 mt-1">A teljes időszak alatt</p>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Top Kategória</p>
                        <i className="fas fa-crown text-purple-500 bg-purple-50 p-2 rounded-xl"></i>
                    </div>
                    <p className="text-xl font-black text-gray-800 truncate" title={stats.topCategory.name}>{stats.topCategory.name}</p>
                    <p className="text-xs text-gray-500 font-semibold mt-1">{stats.topCategory.amount.toLocaleString('hu-HU')} Ft</p>
                </div>

                <div
                    className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between cursor-pointer hover:shadow-md transition"
                    onClick={() => { if(window.app?.showView) window.app.showView('time'); }}
                >
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Időmérő (Heti)</p>
                            <i className="fas fa-stopwatch text-rose-500 bg-rose-50 p-2 rounded-xl"></i>
                        </div>
                        <p className="text-2xl font-black text-gray-800">{timeTrackerStats.hours} {timeTrackerStats.minutes}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100 w-max">
                        <i className="fas fa-money-bill-wave text-emerald-500 text-[10px]"></i>
                        <span className="text-xs font-bold text-gray-700">{timeTrackerStats.earnings !== '--' ? `${timeTrackerStats.earnings} Ft` : '-- Ft'}</span>
                    </div>
                </div>
            </div>

            {/* BOTTOM SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* BAL OSZLOP: TREND & NOTIFIKÁCIÓK */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <i className="fas fa-chart-bar text-indigo-500"></i> Kiadási Trend (Félév)
                            </h3>
                        </div>
                        <div className="relative h-48">
                            <canvas ref={chartRef}></canvas>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <i className="fas fa-bell text-amber-500"></i> Értesítések & Figyelmeztetések
                        </h3>
                        <div className="space-y-2">
                            {stats.notifications.length === 0 ? (
                                <div className="flex items-center gap-2 text-emerald-600 text-sm">
                                    <span>✅</span> Minden rendben
                                </div>
                            ) : (
                                stats.notifications.map((n, idx) => (
                                    <div key={idx} className={`flex items-center gap-3 text-sm p-2 rounded-xl ${n.type === 'danger' ? 'bg-red-50 text-red-700' : n.type === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                                        <span>{n.icon}</span>
                                        <span>{n.text}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* JOBB OSZLOP: TOP 5 & GYORS MŰVELETEK */}
                <div className="space-y-6">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <i className="fas fa-trophy text-yellow-500"></i> Top 5 Kategória
                        </h3>
                        <div className="space-y-3">
                            {stats.top5.length === 0 ? (
                                <div className="text-center text-gray-400 text-sm py-4">Nincs elég adat</div>
                            ) : (
                                stats.top5.map(([name, amount], index) => {
                                    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
                                    const icons = ['🏠', '🛒', '💡', '📱', '🚗'];
                                    return (
                                        <div key={index} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="text-lg flex-shrink-0">{icons[index] || '📌'}</span>
                                                <span className="text-sm font-medium text-gray-700 truncate">{name}</span>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <span className="text-sm font-bold text-gray-800">{amount.toLocaleString('hu-HU')} Ft</span>
                                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: colors[index]}}></span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <i className="fas fa-bolt text-rose-500"></i> Gyors Műveletek
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => triggerAction('new_cost')} className="bg-gray-50 hover:bg-gray-100 p-3 rounded-2xl transition flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><i className="fas fa-plus"></i></div>
                                <span className="text-xs font-bold text-gray-700 text-left">Kiadás</span>
                            </button>
                            <button onClick={() => triggerAction('new_note')} className="bg-gray-50 hover:bg-gray-100 p-3 rounded-2xl transition flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><i className="fas fa-plus"></i></div>
                                <span className="text-xs font-bold text-gray-700 text-left">Jegyzet</span>
                            </button>
                            <button onClick={() => triggerAction('new_km')} className="bg-gray-50 hover:bg-gray-100 p-3 rounded-2xl transition flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><i className="fas fa-plus"></i></div>
                                <span className="text-xs font-bold text-gray-700 text-left">Tankolás</span>
                            </button>
                            <button onClick={() => triggerAction('new_shopping')} className="bg-gray-50 hover:bg-gray-100 p-3 rounded-2xl transition flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><i className="fas fa-plus"></i></div>
                                <span className="text-xs font-bold text-gray-700 text-left">Bevásárlás</span>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
