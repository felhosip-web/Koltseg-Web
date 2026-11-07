import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/currency-utils.js';
import { useAppStore } from '../store/useAppStore.js';

export const CURRENCY_CONVERTER_MANIFEST = Object.freeze({
    id: 'firstparty.currency.converter',
    name: 'Valutaváltó',
    version: '1.0.0',
    apiVersion: '1',
    description: 'Első féltől származó HUF / EUR valutaváltó bővítmény',
    permissions: ['currency:read']
});

/**
 * Setup function executed during PLG1 initialize() with restricted PluginContext.
 * @param {Object} ctx
 */
export async function currencyConverterPluginSetup(ctx) {
    if (!ctx?.currency) {
        throw new Error('[CurrencyConverter] Missing currency capability.');
    }
}

/**
 * Human-readable status mapping and badge styles.
 * @param {string} status
 * @returns {{ label: string, badgeClass: string, icon: string }}
 */
function getStatusMeta(status) {
    switch (status) {
        case 'live':
            return {
                label: 'Élő árfolyam',
                badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                icon: 'fa-check-circle'
            };
        case 'live_cache':
        case 'stale':
            return {
                label: 'Lejárt / Offline cache',
                badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
                icon: 'fa-clock'
            };
        case 'manual':
            return {
                label: 'Kézi beállítás',
                badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
                icon: 'fa-sliders-h'
            };
        case 'fallback':
            return {
                label: 'Biztonsági fallback',
                badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
                icon: 'fa-shield-alt'
            };
        default:
            return {
                label: status || 'Ismeretlen',
                badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
                icon: 'fa-info-circle'
            };
    }
}

/**
 * React UI Component entry point for the Currency Converter plugin.
 * Receives ONLY the restricted PluginContext.
 * @param {Object} props
 * @param {Object} props.context - Restricted PluginContext
 */
export function CurrencyConverterComponent({ context }) {
    const currencyCap = context?.currency;

    const [amountStr, setAmountStr] = useState('1000');
    const [fromCurrency, setFromCurrency] = useState('HUF');
    const [toCurrency, setToCurrency] = useState('EUR');

    // Reactive exchange rate state from capability
    const [rateState, setRateState] = useState(() => ({
        rate: currencyCap?.getRate?.() ?? null,
        status: currencyCap?.getStatus?.() ?? 'fallback'
    }));

    // Subscribe to capability updates for live/stale/manual/fallback rate changes
    useEffect(() => {
        if (!currencyCap || typeof currencyCap.subscribe !== 'function') return;

        // Sync initial state
        setRateState({
            rate: currencyCap.getRate(),
            status: currencyCap.getStatus()
        });

        const unsubscribe = currencyCap.subscribe((updated) => {
            setRateState({
                rate: updated.rate,
                status: updated.status
            });
        });

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [currencyCap]);

    // Reactive store subscription for primaryCurrency
    const storePrimaryCurrency = useAppStore(state => state.primaryCurrency);
    const primaryCurrency = storePrimaryCurrency || currencyCap?.getPrimaryCurrency?.() || 'HUF';

    if (!currencyCap) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <i className="fas fa-exclamation-triangle mr-1.5 text-red-500"></i>
                A valutaváltó nem rendelkezik a szükséges jogosultsággal (currency:read).
            </div>
        );
    }

    const currentRate = rateState.rate;
    const currentStatus = rateState.status;

    const isRateValid = typeof currentRate === 'number' && Number.isFinite(currentRate) && currentRate > 0;
    const statusMeta = getStatusMeta(currentStatus);

    const handleSwap = () => {
        setFromCurrency(toCurrency);
        setToCurrency(fromCurrency);
    };

    // Amount validation
    const parsedAmount = parseFloat(amountStr.replace(/\s+/g, '').replace(',', '.'));
    const isAmountProvided = amountStr.trim() !== '';
    const isAmountValid = isAmountProvided && Number.isFinite(parsedAmount);

    let convertedValue = null;
    let calculationError = null;

    if (!isRateValid) {
        calculationError = 'Az árfolyam nem érhető el vagy érvénytelen. Az átváltás szünetel.';
    } else if (!isAmountProvided) {
        convertedValue = null;
    } else if (!isAmountValid) {
        calculationError = 'Kérjük, érvényes számot adjon meg összegként.';
    } else {
        convertedValue = currencyCap.convert(parsedAmount, fromCurrency, toCurrency);
    }

    return (
        <div className="space-y-4 max-w-xl mx-auto py-2">
            {/* Header info bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                <div className="flex items-center gap-2">
                    <span className="font-semibold">Aktuális árfolyam:</span>
                    {isRateValid ? (
                        <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                            1 EUR = {currentRate.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} Ft
                        </span>
                    ) : (
                        <span className="text-red-600 font-semibold italic">Nem elérhető</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${statusMeta.badgeClass}`}>
                        <i className={`fas ${statusMeta.icon} text-[10px]`}></i>
                        {statusMeta.label}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full font-mono">
                        Elsődleges: {primaryCurrency}
                    </span>
                </div>
            </div>

            {/* Converter Form */}
            <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-3 items-end">
                    {/* Amount & From */}
                    <div className="space-y-1.5">
                        <label htmlFor="currencyConverterAmountInput" className="block text-xs font-semibold text-gray-700">
                            Összeg és forrásdeviza
                        </label>
                        <div className="flex rounded-xl border border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent overflow-hidden">
                            <input
                                id="currencyConverterAmountInput"
                                type="text"
                                inputMode="decimal"
                                value={amountStr}
                                onChange={(e) => setAmountStr(e.target.value)}
                                placeholder="0"
                                className="w-full text-sm font-semibold p-2.5 outline-none text-gray-800"
                            />
                            <select
                                id="currencyConverterFromSelect"
                                value={fromCurrency}
                                onChange={(e) => setFromCurrency(e.target.value)}
                                aria-label="Forrásdeviza kiválasztása"
                                className="bg-gray-50 border-l border-gray-300 text-xs font-bold text-gray-700 px-3 outline-none cursor-pointer hover:bg-gray-100 transition-colors">
                                <option value="HUF">HUF (Ft)</option>
                                <option value="EUR">EUR (€)</option>
                            </select>
                        </div>
                    </div>

                    {/* Swap button */}
                    <div className="flex justify-center pb-0.5">
                        <button
                            type="button"
                            onClick={handleSwap}
                            title="Irány megfordítása"
                            aria-label="Irány megfordítása"
                            className="p-2.5 rounded-xl border border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 text-gray-500 transition-all shadow-sm">
                            <i className="fas fa-exchange-alt"></i>
                        </button>
                    </div>

                    {/* Target currency */}
                    <div className="space-y-1.5">
                        <label htmlFor="currencyConverterToSelect" className="block text-xs font-semibold text-gray-700">
                            Céldeviza
                        </label>
                        <select
                            id="currencyConverterToSelect"
                            value={toCurrency}
                            onChange={(e) => setToCurrency(e.target.value)}
                            aria-label="Céldeviza kiválasztása"
                            className="w-full text-xs font-bold text-gray-700 p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
                            <option value="HUF">HUF (Ft)</option>
                            <option value="EUR">EUR (€)</option>
                        </select>
                    </div>
                </div>

                {/* Calculation Message or Result Display */}
                {calculationError ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                        <i className="fas fa-exclamation-circle text-amber-500 text-sm shrink-0"></i>
                        <span>{calculationError}</span>
                    </div>
                ) : convertedValue !== null ? (
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl flex items-center justify-between">
                        <div>
                            <span className="block text-[11px] font-semibold text-blue-600 uppercase tracking-wide">
                                Átváltott összeg
                            </span>
                            <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                                {formatCurrency(convertedValue, toCurrency)}
                            </span>
                        </div>
                        <div className="text-right text-[11px] text-slate-500 font-mono">
                            {formatCurrency(parsedAmount, fromCurrency)} =
                        </div>
                    </div>
                ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500 text-center italic">
                        Adjon meg egy összeget az átváltáshoz.
                    </div>
                )}
            </div>

            <div className="text-[11px] text-slate-400 text-center leading-relaxed">
                A valutaváltó a rendszer központi árfolyamát használja. A művelet nem módosít egyetlen rögzített kiadást sem.
            </div>
        </div>
    );
}

/**
 * Helper function to register Currency Converter plugin in both PLG1 PluginRegistry and PLG2 PluginUIRegistry.
 * @param {Object} registry - PLG1 PluginRegistry instance
 * @param {Object} [uiReg] - PLG2 PluginUIRegistry instance
 */
export function registerCurrencyConverterPlugin(registry, uiReg = null) {
    if (!registry) return;

    if (!registry.has(CURRENCY_CONVERTER_MANIFEST.id)) {
        registry.register(CURRENCY_CONVERTER_MANIFEST, currencyConverterPluginSetup);
    }

    if (uiReg && !uiReg.getUI(CURRENCY_CONVERTER_MANIFEST.id)) {
        uiReg.registerUI({
            pluginId: CURRENCY_CONVERTER_MANIFEST.id,
            title: CURRENCY_CONVERTER_MANIFEST.name,
            icon: 'fas fa-exchange-alt',
            category: 'tools',
            hasUI: true,
            component: CurrencyConverterComponent
        });
    }
}
