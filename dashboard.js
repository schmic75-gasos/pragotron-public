const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { location.href = 'login.html'; throw new Error('Přihlášení vypršelo.'); }
    if (!response.ok) throw new Error(payload.error || 'Požadavek se nepodařil.');
    return payload;
};
const list = document.querySelector('#workspaceList');
const render = (workspaces) => {
    list.replaceChildren(...workspaces.map((workspace) => {
        const card = document.createElement('article'); card.className = 'workspace-card';
        const title = document.createElement('h3'); title.textContent = workspace.name;
        const id = document.createElement('p'); id.textContent = `ID: ${workspace.id}`;
        const workspaceActions = document.createElement('div');
        workspaceActions.className = 'workspace-links';
        workspaceActions.innerHTML = `<button class="auth-button auth-secondary" data-action="rename" data-workspace="${workspace.id}">Přejmenovat</button><button class="auth-button auth-secondary" data-action="delete-workspace" data-workspace="${workspace.id}">Smazat</button><button class="auth-button auth-secondary" data-action="share" data-workspace="${workspace.id}">Vytvořit sdílení</button>`;
        const links = document.createElement('div'); links.className = 'workspace-links';
        const urls = [
            ['Správce', `platformTableManage.html?workspace=${encodeURIComponent(workspace.id)}`],
            ['Odjezdová tabule', `departureBoard.html?workspace=${encodeURIComponent(workspace.id)}`],
            ['Nástupištní tabule', `platformTable.html?workspace=${encodeURIComponent(workspace.id)}&platform=1&track=1`]
        ];
        urls.forEach(([label, href]) => { const a=document.createElement('a'); a.href=href; a.textContent=label; links.append(a); });
        workspace.stations?.forEach((station) => {
            const a = document.createElement('a');
            a.href = `platformTableManage.html?workspace=${encodeURIComponent(workspace.id)}&station=${encodeURIComponent(station.id)}`;
            a.textContent = `Správce: ${station.name}`;
            links.append(a);
        });
        card.append(title, id, workspaceActions, links);
        if (workspace.stations?.length) {
            const station = document.createElement('p'); station.textContent = `Stanice: ${workspace.stations.map((item) => item.name).join(', ')}`; card.append(station);
            workspace.stations.forEach((item) => {
                const remove = document.createElement('button'); remove.className = 'auth-button auth-secondary'; remove.textContent = `Odebrat ${item.name}`; remove.dataset.action = 'delete-station'; remove.dataset.workspace = workspace.id; remove.dataset.station = item.id; card.append(remove);
            });
        }
        const stationForm = document.createElement('form');
        stationForm.className = 'auth-grid station-form';
        stationForm.dataset.workspace = workspace.id;
        stationForm.innerHTML = '<label>Stanice <input name="name" placeholder="Brno hlavní nádraží" required></label><label>URL tabule SŽ <input name="sourceUrl" placeholder="https://provoz.spravazeleznic.cz/Tabule/Pages/StationTable.aspx?Key=455" type="url" required></label><button class="auth-button" type="submit">Přidat stanici</button>';
        card.append(stationForm);
        const memberForm = document.createElement('form');
        memberForm.className = 'auth-grid member-form';
        memberForm.dataset.workspace = workspace.id;
        memberForm.innerHTML = '<label>Přidat uživatele <input name="username" placeholder="jméno" required></label><label>Role <select name="role"><option value="viewer">Pozorovatel</option><option value="editor">Editor</option></select></label><button class="auth-button" type="submit">Přidat člena</button>';
        card.append(memberForm);
        return card;
    }));
};
const load = async () => { const result = await request('/api/workspaces'); render(result.workspaces); };
list.addEventListener('submit', async (event) => {
    if (event.target.matches('.member-form')) {
        event.preventDefault();
        try { await request(`/api/workspaces/${encodeURIComponent(event.target.dataset.workspace)}/members`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.target)))}); event.target.reset(); await load(); } catch (error) { window.alert(error.message); }
        return;
    }
    if (!event.target.matches('.station-form')) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    try {
        await request(`/api/workspaces/${encodeURIComponent(event.target.dataset.workspace)}/stations`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(values) });
        await load();
    } catch (reason) { window.alert(reason.message); }
});
list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const workspace = button.dataset.workspace;
    try {
        if (button.dataset.action === 'rename') {
            const name = window.prompt('Nový název workspace:');
            if (name) await request(`/api/workspaces/${encodeURIComponent(workspace)}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
        } else if (button.dataset.action === 'delete-workspace') {
            if (window.confirm('Opravdu workspace smazat?')) await request(`/api/workspaces/${encodeURIComponent(workspace)}`, {method:'DELETE'});
        } else if (button.dataset.action === 'delete-station') {
            if (window.confirm('Opravdu stanici odebrat?')) await request(`/api/workspaces/${encodeURIComponent(workspace)}/stations/${encodeURIComponent(button.dataset.station)}`, {method:'DELETE'});
        } else if (button.dataset.action === 'share') {
            const result = await request(`/api/workspaces/${encodeURIComponent(workspace)}/shares`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'viewer',days:30})});
            window.prompt('Sdílecí token (přidej ?share=TOKEN k odkazu tabule):', result.share.token);
        }
        await load();
    } catch (reason) { window.alert(reason.message); }
});
document.querySelector('#workspaceForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const error=document.querySelector('#workspaceError'); error.textContent='';
    try { const values=Object.fromEntries(new FormData(event.currentTarget)); await request('/api/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)}); event.currentTarget.reset(); await load(); } catch (reason) { error.textContent=reason.message; }
});
document.querySelector('#logout').addEventListener('click', async () => { await request('/api/auth/logout',{method:'POST'}); location.href='login.html'; });
request('/api/auth/me').then(({user}) => { document.querySelector('#userLabel').textContent=`Přihlášený uživatel: ${user.username} (${user.role})`; document.querySelector('[name="username"]').value=user.username; return load(); }).catch(() => {});
document.querySelector('#profileForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await request('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}); document.querySelector('#profileMessage').textContent='Profil uložen.'; } catch (error) { document.querySelector('#profileMessage').textContent=error.message; } });
document.querySelector('#passwordForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await request('/api/profile/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}); event.currentTarget.reset(); document.querySelector('#profileMessage').textContent='Heslo změněno.'; } catch (error) { document.querySelector('#profileMessage').textContent=error.message; } });
document.querySelector('#importFile').addEventListener('change', async (event) => { const file=event.target.files[0]; if (!file) return; try { await request('/api/data/import',{method:'POST',headers:{'Content-Type':'application/json'},body:await file.text()}); await load(); } catch (error) { window.alert(error.message); } });
document.querySelector('#historyButton').addEventListener('click', async () => { const result=await request('/api/history'); document.querySelector('#historyOutput').textContent=JSON.stringify(result.history,null,2); });
document.querySelector('#backupButton').addEventListener('click', async () => { try { await request('/api/admin/backup',{method:'POST'}); window.alert('Záloha vytvořena.'); } catch (error) { window.alert(error.message); } });
