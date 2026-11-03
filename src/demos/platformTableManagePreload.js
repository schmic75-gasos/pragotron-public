(() => {
    const STORAGE_KEY = 'pragotron.platformTable.state.v2';
    const LEGACY_STORAGE_KEY = 'pragotron.platformTable.state.v1';
    const workspace = (() => {
        const value = new URLSearchParams(window.location.search)
            .get('workspace') || 'default';
        return /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(value)
            ? value
            : 'default';
    })();
    const scopedKey = (key) => `${key}::workspace:${workspace}`;

    try {
        const parse = (value) => {
            try {
                return value ? JSON.parse(value) : null;
            } catch {
                return null;
            }
        };
        const currentState = parse(
            window.localStorage.getItem(scopedKey(STORAGE_KEY))
        );
        const legacyState = currentState
            ? null
            : parse(window.localStorage.getItem(scopedKey(LEGACY_STORAGE_KEY)));
        const state = currentState || legacyState;
        if (!currentState && legacyState) {
            window.localStorage.setItem(
                scopedKey(STORAGE_KEY),
                JSON.stringify({ ...legacyState, version: 2 })
            );
        }
        const settings = state?.settings || state;
        if (settings?.nightMode === true) {
            document.body.classList.add('manage-night-mode');
        }
        if (window.localStorage.getItem(scopedKey('pragotron.manage.layout.v1'))) {
            document.documentElement.classList.add('manage-layout-pending');
            window.setTimeout(() => {
                document.documentElement.classList.remove('manage-layout-pending');
            }, 4000);
        }
    } catch {
        // A corrupted or unavailable preference must not block the form.
    }
})();
