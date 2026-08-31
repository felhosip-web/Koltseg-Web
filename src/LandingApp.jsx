import React, { useEffect, useState } from 'react';

/**
 * Landing screen component that allows users to choose between different app modules.
 * Provides options to launch the Cost Tracking app or Work Management app.
 * Manages visibility state and synchronizes with vanilla JavaScript module state.
 * @returns {JSX.Element|null} The landing screen or null if hidden
 */
export default function LandingApp() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Hide react wrapper if vanilla JS state implies we are already in a module
    const savedModule = localStorage.getItem('hmi_selected_module');
    if (savedModule === 'cost' || savedModule === 'work') {
      setIsVisible(false);
    }

    // Setup observer to watch for Vanilla JS showing us back
    const observer = new MutationObserver((mutations) => {
        const root = document.getElementById('appLandingScreenRoot');
        if (root && root.parentElement && !root.parentElement.classList.contains('hidden')) {
            // Usually Vanilla JS manipulates a wrapper, but we'll sync state
            const costView = document.getElementById('costAppView');
            const workView = document.getElementById('workAppView');

            if (costView?.classList.contains('hidden') && workView?.classList.contains('hidden')) {
               setIsVisible(true);
            }
        }
    });

    const costApp = document.getElementById('costAppView');
    const workApp = document.getElementById('workAppView');

    if (costApp) observer.observe(costApp, { attributes: true, attributeFilter: ['class'] });
    if (workApp) observer.observe(workApp, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  /**
   * Launches the cost tracking application module.
   * Hides the landing screen and shows the cost app view.
   */
  const handleLaunchCostApp = () => {
    setIsVisible(false);
    const costApp = document.getElementById('costAppView');
    if (costApp) {
        costApp.classList.remove('hidden');
    }
    localStorage.setItem('hmi_selected_module', 'cost');

    // We let Vanilla JS handle the rest by keeping window.app intact
    if (window.app?.renderer?.renderTable) {
        window.app.renderer.renderTable();
    }
  };

  /**
   * Launches the work management application module.
   * Hides the landing screen and shows the work app view.
   */
  const handleLaunchWorkApp = () => {
    setIsVisible(false);
    const workApp = document.getElementById('workAppView');
    if (workApp) {
        workApp.classList.remove('hidden');
    }
    localStorage.setItem('hmi_selected_module', 'work');

    if (window.app?.workLogRenderer?.render) {
        window.app.workLogRenderer.render();
    }
  };

  if (!isVisible) return null;

  return (
    <div id="appLandingScreen" className="fixed inset-0 z-[1400] bg-[#090f1d] text-slate-100 flex flex-col items-center justify-center p-6 overflow-y-auto select-none">
        <div className="max-w-4xl w-full text-center space-y-10 py-8">
            <div className="space-y-4 animate-fade-in">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-[#10b981] to-[#047857] shadow-xl shadow-emerald-950/40 border border-emerald-400/20 text-white text-4xl mb-2">
                    <i className="fas fa-layer-group"></i>
                </div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
                    MULTI-DASHBOARD <span className="app-version-label text-slate-400 text-sm">v7.0.14</span>
                </h1>
                <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto font-medium">
                    Üdvözöljük a megújult rendszerben! Válassza ki az indítani kívánt feladatkezelő vagy pénzügyi
                    nyilvántartó modult.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto pt-4">
                <button type="button" id="btnLaunchCostApp" onClick={handleLaunchCostApp}
                    className="group relative flex flex-col text-left p-8 rounded-[32px] bg-[#111d30] border-2 border-[#1e2e48] hover:border-[#10b981] hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all duration-300 transform hover:-translate-y-1">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                        <i className="fas fa-receipt"></i>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        Költségnyilvántartó
                        <i className="fas fa-arrow-right text-xs text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all"></i>
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        Személyes és családi pénzügyek, havi kiadások, bevételek, határidők és számlák részletes
                        mátrixos követése.
                    </p>
                    <div className="absolute bottom-4 right-6 text-[10px] text-slate-500 font-bold tracking-wider group-hover:text-emerald-400/80 transition-colors uppercase">
                        Megnyitás
                    </div>
                </button>

                <button type="button" id="btnLaunchWorkApp" onClick={handleLaunchWorkApp}
                    className="group relative flex flex-col text-left p-8 rounded-[32px] bg-[#111d30] border-2 border-[#1e2e48] hover:border-[#10b981] hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] transition-all duration-300 transform hover:-translate-y-1">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-[#34d399] rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                        <i className="fas fa-briefcase"></i>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        Munka Nyilvántartás
                        <i className="fas fa-arrow-right text-xs text-slate-500 group-hover:text-[#34d399] group-hover:translate-x-1 transition-all"></i>
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        Munkák, feladatok, helyszínek és időtartamok nyilvántartása. Állapotok és határidők vizuális
                        követése.
                    </p>
                    <div className="absolute bottom-4 right-6 text-[10px] text-slate-500 font-bold tracking-wider group-hover:text-[#34d399]/80 transition-colors uppercase">
                        Megnyitás
                    </div>
                </button>
            </div>

            <div className="text-[11px] text-slate-500 pt-6">
                <p className="font-semibold uppercase tracking-widest">HMI Rendszerplatform • Verzió <span className="app-version-label text-slate-500">v7.0.14</span></p>
                <p className="mt-1">Copyright © 2026. Minden jog fenntartva.</p>
            </div>
        </div>
    </div>
  );
}
