import React from 'react';
import CostAppHeader from './CostAppHeader.jsx';
import CostAppTabs from './CostAppTabs.jsx';
import CostAppFooter from './CostAppFooter.jsx';

/**
 * Shell component that wraps the main structure of the cost tracking application.
 * Composes the header, tabs, and footer components into the app layout.
 * @returns {JSX.Element} The cost app shell structure
 */
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
