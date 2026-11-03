const WORKSPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;

export const DEFAULT_WORKSPACE_ID = 'default';

export const normalizeWorkspaceId = (value) => {
    const text = String(value ?? '').trim();
    return WORKSPACE_PATTERN.test(text) ? text : DEFAULT_WORKSPACE_ID;
};

export const getWorkspaceId = (location = globalThis.location) => {
    try {
        const value = new URLSearchParams(location?.search || '')
            .get('workspace');
        return normalizeWorkspaceId(value);
    } catch {
        return DEFAULT_WORKSPACE_ID;
    }
};

export const workspaceStorageKey = (key, location = globalThis.location) =>
    `${String(key)}::workspace:${getWorkspaceId(location)}`;

export const workspaceChannelName = (
    channel = 'pragotron.platformTable.channel.v2',
    location = globalThis.location
) => `${channel}::workspace:${getWorkspaceId(location)}`;
