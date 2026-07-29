1. **Fix missing Modulok button on mobile**:
   Since `btn-modules-toggle` does not actually have `hidden md:flex` in its classes in the current `index.html` (it has `flex`), but the user specifically mentioned changing it or adding it to a mobile menu if it's hidden on mobile. I will check its visibility on small screens and ensure it is always visible or I will add a mobile specific toggle. Wait, the problem on mobile is actually that the header is horizontally scrolling or constrained. I will ensure `btn-modules-toggle` is properly styled.
   Wait, the user says "Change hidden md:flex -> flex". If it is not there, I will just add a mobile-specific button or ensure the existing one is fully visible. Looking at the user instructions, maybe they meant to add a button in the settings modal or a mobile-specific container. I will review `index.html` and add `btn-modules-toggle-mobile` to a suitable mobile location (e.g. mobile bottom nav or near the settings). I will add it to the mobile footer navigation.
2. **Implement `switchSettingsTab` in `js/ui-controller.js`**:
   - I will add a public `switchSettingsTab(tabName)` method to the `UIController` class.
   - It will encapsulate the logic to switch the tabs (hide all contents, remove active classes, show target, add active class).
   - I will update the inline click listeners in `bindEvents()` to use this new method.
3. **Update `module-manager.js` safety check**:
   - Wrap the call to `switchSettingsTab` with a `if (this.app.uiController && typeof this.app.uiController.switchSettingsTab === 'function')`.
4. **Pre-commit checks**:
   - Run verification and tests.
5. **Submit**: Submit with Hungarian summary.
