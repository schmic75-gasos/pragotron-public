(async () => {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!response.ok) {
            const next = `${location.pathname}${location.search}`;
            location.replace(`login.html?next=${encodeURIComponent(next)}`);
        }
    } catch {
        document.documentElement.classList.add('auth-server-unavailable');
    }
})();
