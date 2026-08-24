import React from 'react';

export default function CostAppTabs() {


    return (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1" id="reactCostTabs">
            <button
                className="tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-blue-600 text-white shadow-md"
                data-tab="dashboard">
                <i className="fas fa-chart-pie mr-1"></i> Áttekintés
            </button>
            <button
                className="tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                data-tab="table">
                <i className="fas fa-table mr-1"></i> Táblázat
            </button>
            <button
                className="tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                data-tab="time">
                <i className="fas fa-stopwatch mr-1"></i> Idő
            </button>
            <button
                className="tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                data-tab="charts">
                <i className="fas fa-chart-line mr-1"></i> Kimutatások
            </button>
            <button
                className="tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                data-tab="reminders">
                <i className="fas fa-clock mr-1"></i> Határidők
            </button>
            <button
                className="tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                data-tab="incoming">
                <i className="fas fa-arrow-down text-emerald-500 mr-1"></i> Bejövő utalás
            </button>
            <button
                className="tab-btn px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                data-tab="stats">
                <i className="fas fa-calculator mr-1"></i> Részletek
            </button>
        </div>
    );
}
