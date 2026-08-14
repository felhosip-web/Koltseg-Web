import fs from 'fs';

let content = fs.readFileSync('index.html', 'utf8');

const aiTabContent = `                <!-- AI Asszisztens tartalom -->
                <div id="settingsContentAi" class="settings-tab-content hidden space-y-6 animate-fade-in">
                    <div class="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100/60 mb-6">
                        <div class="flex items-center gap-4 mb-3">
                            <div class="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm shrink-0">
                                <i class="fas fa-robot"></i>
                            </div>
                            <div>
                                <h4 class="text-sm font-black text-indigo-900 uppercase tracking-wider mb-1">AI Gyorsfelvitel (Gemini)</h4>
                                <p class="text-[11px] text-indigo-700/80 leading-relaxed max-w-xl">
                                    Az AI modell segítségével a mondatként beírt kiadásokat és bevételeket a rendszer automatikusan szétszedi (összeg, dátum, kategória, megjegyzés). A funkció használatához <strong>Google Gemini API kulcs</strong> szükséges!
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100/80 space-y-5">
                        <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                            <i class="fas fa-key text-indigo-500"></i> API Kulcs & Modell beállítás
                        </h4>

                        <div class="space-y-4">
                            <div>
                                <label for="aiApiKey" class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">
                                    Gemini API Kulcs
                                </label>
                                <div class="relative">
                                    <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <i class="fas fa-key text-gray-400"></i>
                                    </div>
                                    <input type="password" id="aiApiKey" placeholder="AI Studio (Google) API kulcs"
                                        class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all shadow-inner" />
                                </div>
                                <p class="text-[10px] text-gray-400 mt-1.5 ml-1">Ha üresen hagyod, az alapértelmezett, szerveren konfigurált kulcsot használja (ha van).</p>
                            </div>

                            <div>
                                <label for="aiModel" class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">
                                    Gemini Modell
                                </label>
                                <div class="relative">
                                    <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <i class="fas fa-brain text-gray-400"></i>
                                    </div>
                                    <select id="aiModel" class="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all appearance-none">
                                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Gyors, Alapértelmezett)</option>
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Okosabb)</option>
                                    </select>
                                    <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500">
                                        <i class="fas fa-chevron-down text-xs"></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-6 pt-5 border-t border-slate-100 flex justify-end">
                            <button type="button" id="btnSaveAiSettings"
                                class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-200 active:scale-95">
                                <i class="fas fa-save"></i> AI Beállítások Mentése
                            </button>
                        </div>
                    </div>
                </div>`;

const searchStrRegex = /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div id="cellEditorModal"/;

content = content.replace(searchStrRegex, aiTabContent + '\n                    </div>\n                </div>\n            </div>\n        </div>\n\n    <div id="cellEditorModal"');
fs.writeFileSync('index.html', content);
