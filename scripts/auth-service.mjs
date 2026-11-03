import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/;
const WORKSPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/;
const SESSION_COOKIE = 'pragotron_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const cleanUsername = (value) => String(value || '').trim().toLowerCase();
const cleanWorkspaceId = (value) => String(value || '').trim().toLowerCase();
const json = (value) => JSON.stringify(value, null, 2);

const hashPassword = async (password, salt = randomBytes(16)) => {
    const derived = await scrypt(String(password), salt, 64, {
        N: 16_384,
        r: 8,
        p: 1
    });
    return `${salt.toString('base64')}:${Buffer.from(derived).toString('base64')}`;
};

const verifyPassword = async (password, encoded) => {
    try {
        const [saltText, hashText] = String(encoded).split(':');
        const salt = Buffer.from(saltText, 'base64');
        const expected = Buffer.from(hashText, 'base64');
        const actual = Buffer.from(await scrypt(String(password), salt, expected.length, {
            N: 16_384,
            r: 8,
            p: 1
        }));
        return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
};

const publicUser = (user) => ({
    id: user.id,
    username: user.username,
    role: user.role || 'user',
    createdAt: user.createdAt
});

export const createAuthService = ({ dataFile }) => {
    let state = { users: [], workspaces: [], shares: [], history: [] };
    let loaded = false;
    let writeChain = Promise.resolve();
    const sessions = new Map();

    const load = async () => {
        if (loaded) return;
        try {
            state = JSON.parse(await readFile(dataFile, 'utf8'));
        } catch {
            state = { users: [], workspaces: [] };
        }
        state.users = Array.isArray(state.users) ? state.users : [];
        state.workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
        state.shares = Array.isArray(state.shares) ? state.shares : [];
        state.history = Array.isArray(state.history) ? state.history : [];
        state.users.forEach((user, index) => {
            user.role ||= index === 0 ? 'admin' : 'user';
        });
        state.workspaces.forEach((workspace) => {
            workspace.members ||= [{ userId: workspace.ownerId, role: 'owner' }];
            workspace.stations ||= [];
        });
        loaded = true;
    };

    const save = async (event = null) => {
        if (event) {
            state.history.unshift({ ...event, at: new Date().toISOString() });
            state.history = state.history.slice(0, 500);
        }
        writeChain = writeChain.then(async () => {
            await mkdir(dataFile.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
            const temporary = `${dataFile}.${process.pid}.tmp`;
            await writeFile(temporary, json(state), 'utf8');
            await rename(temporary, dataFile);
        });
        return writeChain;
    };

    const findUser = (username) => state.users.find(
        (user) => user.username === cleanUsername(username)
    );

    const findWorkspace = (workspaceId) => state.workspaces.find(
        (item) => item.id === cleanWorkspaceId(workspaceId)
    );

    const access = (userId, workspaceId) => {
        const workspace = findWorkspace(workspaceId);
        if (!workspace) return null;
        const member = workspace.members?.find((item) => item.userId === userId);
        return member ? { workspace, role: member.role } : null;
    };

    return {
        async register(username, password) {
            await load();
            const normalized = cleanUsername(username);
            if (!USERNAME_PATTERN.test(normalized)) {
                throw new Error('Uživatelské jméno musí mít 3–32 znaků.');
            }
            if (String(password || '').length < 8) {
                throw new Error('Heslo musí mít alespoň 8 znaků.');
            }
            if (findUser(normalized)) {
                throw new Error('Toto uživatelské jméno už existuje.');
            }
            const user = {
                id: randomBytes(12).toString('hex'),
                username: normalized,
                passwordHash: await hashPassword(password),
                role: state.users.length === 0 ? 'admin' : 'user',
                createdAt: new Date().toISOString()
            };
            state.users.push(user);
            await save();
            return publicUser(user);
        },

        async updateProfile(userId, username) {
            await load();
            const user = state.users.find((item) => item.id === userId);
            const normalized = cleanUsername(username);
            if (!user || !USERNAME_PATTERN.test(normalized)) throw new Error('Neplatné uživatelské jméno.');
            if (state.users.some((item) => item.id !== userId && item.username === normalized)) throw new Error('Uživatelské jméno už existuje.');
            user.username = normalized;
            await save({ actorId: userId, action: 'profile.update' });
            return publicUser(user);
        },

        async changePassword(userId, currentPassword, nextPassword) {
            await load();
            const user = state.users.find((item) => item.id === userId);
            if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw new Error('Současné heslo nesouhlasí.');
            if (String(nextPassword || '').length < 8) throw new Error('Heslo musí mít alespoň 8 znaků.');
            user.passwordHash = await hashPassword(nextPassword);
            await save({ actorId: userId, action: 'password.change' });
        },

        async login(username, password) {
            await load();
            const user = findUser(username);
            if (!user || !(await verifyPassword(password, user.passwordHash))) {
                throw new Error('Neplatné uživatelské jméno nebo heslo.');
            }
            const token = randomBytes(32).toString('base64url');
            sessions.set(token, {
                userId: user.id,
                expiresAt: Date.now() + SESSION_MAX_AGE * 1000
            });
            return { token, user: publicUser(user) };
        },

        logout(token) {
            sessions.delete(token);
        },

        async userFromToken(token) {
            await load();
            const session = sessions.get(token);
            if (!session || session.expiresAt <= Date.now()) {
                sessions.delete(token);
                return null;
            }
            const user = state.users.find((item) => item.id === session.userId);
            return user ? publicUser(user) : null;
        },

        async listWorkspaces(userId) {
            await load();
            return state.workspaces.filter((item) => access(userId, item.id));
        },

        async ownsWorkspace(userId, workspaceId) {
            await load();
            return Boolean(access(userId, workspaceId));
        },

        async access(userId, workspaceId) {
            await load();
            const found = access(userId, workspaceId);
            return found ? { workspace: found.workspace, role: found.role } : null;
        },

        async createWorkspace(userId, name, requestedId) {
            await load();
            const id = cleanWorkspaceId(requestedId || name);
            if (!WORKSPACE_PATTERN.test(id)) {
                throw new Error('ID workspace musí mít 3–48 znaků.');
            }
            if (state.workspaces.some((item) => item.id === id)) {
                throw new Error('Tento workspace už existuje.');
            }
            const workspace = {
                id,
                name: String(name || id).trim().slice(0, 80) || id,
                ownerId: userId,
                members: [{ userId, role: 'owner' }],
                createdAt: new Date().toISOString(),
                stations: []
            };
            state.workspaces.push(workspace);
            await save({ actorId: userId, action: 'workspace.create', workspaceId: id });
            return workspace;
        },

        async updateWorkspace(userId, workspaceId, name) {
            await load();
            const found = access(userId, workspaceId);
            if (!found || !['owner', 'editor'].includes(found.role)) throw new Error('Nemáte právo workspace upravit.');
            found.workspace.name = String(name || found.workspace.name).trim().slice(0, 80);
            await save({ actorId: userId, action: 'workspace.update', workspaceId: found.workspace.id });
            return found.workspace;
        },

        async deleteWorkspace(userId, workspaceId) {
            await load();
            const found = access(userId, workspaceId);
            if (!found || found.workspace.ownerId !== userId) throw new Error('Workspace může smazat pouze vlastník.');
            state.workspaces = state.workspaces.filter((item) => item !== found.workspace);
            state.shares = state.shares.filter((item) => item.workspaceId !== found.workspace.id);
            await save({ actorId: userId, action: 'workspace.delete', workspaceId: found.workspace.id });
        },

        async addMember(userId, workspaceId, username, role = 'viewer') {
            await load();
            const found = access(userId, workspaceId);
            const member = findUser(username);
            if (!found || found.workspace.ownerId !== userId || !member) throw new Error('Workspace nebo uživatel nebyl nalezen.');
            if (!['editor', 'viewer'].includes(role)) throw new Error('Neplatná role.');
            found.workspace.members = found.workspace.members.filter((item) => item.userId !== member.id);
            found.workspace.members.push({ userId: member.id, role });
            await save({ actorId: userId, action: 'member.add', workspaceId: found.workspace.id });
            return found.workspace;
        },

        async addStation(userId, workspaceId, station) {
            await load();
            const workspace = state.workspaces.find(
                (item) => item.id === cleanWorkspaceId(workspaceId)
                    && item.ownerId === userId
            );
            if (!workspace) throw new Error('Workspace nebyl nalezen.');
            const member = workspace.members?.find((item) => item.userId === userId);
            if (!member || !['owner', 'editor'].includes(member.role)) throw new Error('Nemáte právo přidat stanici.');
            const item = {
                id: randomBytes(8).toString('hex'),
                name: String(station?.name || '').trim().slice(0, 80),
                sourceUrl: String(station?.sourceUrl || '').trim().slice(0, 300),
                createdAt: new Date().toISOString()
            };
            if (!item.name || !item.sourceUrl) throw new Error('Stanice potřebuje název a URL.');
            workspace.stations.push(item);
            await save({ actorId: userId, action: 'station.create', workspaceId: workspace.id });
            return workspace;
        },

        async updateStation(userId, workspaceId, stationId, station) {
            await load();
            const found = access(userId, workspaceId);
            if (!found || !['owner', 'editor'].includes(found.role)) throw new Error('Nemáte právo upravit stanici.');
            const item = found.workspace.stations.find((entry) => entry.id === stationId);
            if (!item) throw new Error('Stanice nebyla nalezena.');
            item.name = String(station?.name || item.name).trim().slice(0, 80);
            item.sourceUrl = String(station?.sourceUrl || item.sourceUrl).trim().slice(0, 300);
            await save({ actorId: userId, action: 'station.update', workspaceId: found.workspace.id });
            return found.workspace;
        },

        async deleteStation(userId, workspaceId, stationId) {
            await load();
            const found = access(userId, workspaceId);
            if (!found || !['owner', 'editor'].includes(found.role)) throw new Error('Nemáte právo smazat stanici.');
            found.workspace.stations = found.workspace.stations.filter((item) => item.id !== stationId);
            await save({ actorId: userId, action: 'station.delete', workspaceId: found.workspace.id });
            return found.workspace;
        },

        async createShare(userId, workspaceId, role = 'viewer', days = 30) {
            await load();
            const found = access(userId, workspaceId);
            if (!found || found.workspace.ownerId !== userId) throw new Error('Sdílení může vytvořit pouze vlastník.');
            const share = { token: randomBytes(24).toString('base64url'), workspaceId: found.workspace.id, role: ['editor', 'viewer'].includes(role) ? role : 'viewer', expiresAt: Date.now() + Math.min(Math.max(Number(days) || 30, 1), 365) * 86400000 };
            state.shares.push(share);
            await save({ actorId: userId, action: 'share.create', workspaceId: found.workspace.id });
            return share;
        },

        async resolveShare(token) {
            await load();
            const share = state.shares.find((item) => item.token === String(token || '') && item.expiresAt > Date.now());
            if (!share) return null;
            const workspace = findWorkspace(share.workspaceId);
            return workspace ? { workspace, role: share.role, expiresAt: share.expiresAt } : null;
        },

        async exportUserData(userId) {
            await load();
            return { version: 1, exportedAt: new Date().toISOString(), workspaces: await this.listWorkspaces(userId) };
        },

        async importUserData(userId, payload) {
            await load();
            const source = Array.isArray(payload?.workspaces) ? payload.workspaces : [];
            for (const item of source.slice(0, 50)) {
                const id = cleanWorkspaceId(item.id);
                if (!WORKSPACE_PATTERN.test(id) || state.workspaces.some((entry) => entry.id === id)) continue;
                state.workspaces.push({ id, name: String(item.name || id).slice(0, 80), ownerId: userId, createdAt: new Date().toISOString(), members: [{ userId, role: 'owner' }], stations: Array.isArray(item.stations) ? item.stations.slice(0, 100) : [] });
            }
            await save({ actorId: userId, action: 'data.import' });
            return this.listWorkspaces(userId);
        },

        async listHistory(userId) {
            await load();
            const ids = new Set((await this.listWorkspaces(userId)).map((item) => item.id));
            return state.history.filter((item) => item.actorId === userId || ids.has(item.workspaceId)).slice(0, 100);
        },

        async backup() {
            await load();
            const backupFile = `${dataFile}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
            await writeFile(backupFile, json(state), 'utf8');
            return backupFile;
        },

        cookie(token) {
            return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax`;
        },
        clearCookie() {
            return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
        }
    };
};

export const AUTH_COOKIE_NAME = SESSION_COOKIE;
