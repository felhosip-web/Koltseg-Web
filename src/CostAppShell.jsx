import React from 'react';
import CostAppHeader from './CostAppHeader.jsx';
import CostAppTabs from './CostAppTabs.jsx';
import CostAppFooter from './CostAppFooter.jsx';

export default function CostAppShell() {
    return (
        <>
            <div id="costAppHeaderRoot">
                <CostAppHeader />
            </div>

            <div id="costAppTabsRoot">
                <CostAppTabs />
            </div>

            <div id="costAppFooterRoot">
                <CostAppFooter />
            </div>
        </>
    );
}
