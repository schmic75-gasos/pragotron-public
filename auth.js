const jsonRequest = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Požadavek se nepodařil.');
    return payload;
};

const formData = (form) => Object.fromEntries(new FormData(form).entries());
const loginForm = document.querySelector('#loginForm');
const registerForm = document.querySelector('#registerForm');

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#loginError');
    error.textContent = '';
    try {
        await jsonRequest('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(formData(loginForm)) });
        const next = new URLSearchParams(location.search).get('next');
        location.href = next || 'dashboard.html';
    } catch (reason) { error.textContent = reason.message; }
});

registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#registerError');
    const values = formData(registerForm);
    error.textContent = '';
    if (values.password !== values.confirm) { error.textContent = 'Hesla se neshodují.'; return; }
    try {
        await jsonRequest('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(values) });
        location.href = 'dashboard.html';
    } catch (reason) { error.textContent = reason.message; }
});
