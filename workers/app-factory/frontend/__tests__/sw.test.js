/**
 * Service Worker Tests — sw.js
 * ════════════════════════════════════════════════════════════════
 * Tests for Infinity Worker IDE Service Worker v5.1.
 * Covers: install, activate, fetch, sync, push, notificationclick,
 *         message event handlers, and the syncProjects helper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SW_PATH = path.resolve(__dirname, '../public/static/sw.js');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a minimal cache object used by the `caches` global.
 */
function makeCache() {
    return {
        addAll: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        match: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Build the full caches API mock.
 * `openedCaches` lets tests inspect which cache name was opened.
 */
function makeCachesApi() {
    const cache = makeCache();
    return {
        _cache: cache,
        open: vi.fn().mockResolvedValue(cache),
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
        match: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Build a minimal FetchEvent-like object.
 */
function makeFetchEvent({ url, method = 'GET', mode = 'cors' } = {}) {
    return {
        request: {
            url: url ?? `http://localhost:3000/`,
            method,
            mode,
            clone: vi.fn().mockReturnValue({}),
        },
        respondWith: vi.fn(),
        waitUntil: vi.fn(),
    };
}

/**
 * Load (or reload) the service worker module in a fresh require context so
 * that each test suite starts with a clean set of registered listeners.
 *
 * Returns an object whose keys are event names and whose values are the
 * listener functions registered via `self.addEventListener`.
 */
function loadSW(overrides = {}) {
    const handlers = {};

    const mockSelf = {
        addEventListener: vi.fn((event, handler) => {
            handlers[event] = handler;
        }),
        skipWaiting: vi.fn().mockResolvedValue(undefined),
        location: { origin: 'http://localhost:3000' },
        registration: {
            showNotification: vi.fn().mockResolvedValue(undefined),
        },
        clients: {
            claim: vi.fn().mockResolvedValue(undefined),
        },
        ...overrides.self,
    };

    const mockCaches = makeCachesApi();

    // Expose as globals so the sw.js script picks them up
    global.self = mockSelf;
    global.caches = mockCaches;
    global.clients = {
        openWindow: vi.fn().mockResolvedValue(undefined),
        ...overrides.clients,
    };
    // Default: a never-resolving promise so sw.js can always call .then/.catch on it.
    // Individual tests override this with mockResolvedValueOnce / mockRejectedValueOnce.
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    // Response and URL are native in Node ≥ 18 — no need to mock them

    // Clear the require cache so each loadSW() gets a fresh module evaluation
    const req = createRequire(import.meta.url);
    delete req.cache[require.resolve ? require.resolve(SW_PATH) : SW_PATH];
    req(SW_PATH);

    return { handlers, self: mockSelf, caches: mockCaches };
}

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

describe('Service Worker constants', () => {
    it('uses the expected CACHE_NAME', () => {
        const { handlers } = loadSW();
        // Trigger install so caches.open is called with CACHE_NAME
        const event = { waitUntil: vi.fn() };
        handlers['install'](event);
        expect(global.caches.open).toHaveBeenCalledWith('infinity-worker-v5.1');
    });

    it('registers all expected event types', () => {
        const { handlers } = loadSW();
        const registeredEvents = global.self.addEventListener.mock.calls.map(
            ([eventName]) => eventName,
        );
        expect(registeredEvents).toEqual(
            expect.arrayContaining([
                'install',
                'activate',
                'fetch',
                'sync',
                'push',
                'notificationclick',
                'message',
            ]),
        );
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// install event
// ══════════════════════════════════════════════════════════════════════════════

describe('install event handler', () => {
    let handlers, mockSelf, mockCaches;

    beforeEach(() => {
        ({ handlers, self: mockSelf, caches: mockCaches } = loadSW());
    });

    it('calls event.waitUntil', () => {
        const event = { waitUntil: vi.fn() };
        handlers['install'](event);
        expect(event.waitUntil).toHaveBeenCalledTimes(1);
    });

    it('opens the current CACHE_NAME', async () => {
        const event = { waitUntil: vi.fn() };
        handlers['install'](event);
        // Resolve the promise passed to waitUntil
        await event.waitUntil.mock.calls[0][0];
        expect(mockCaches.open).toHaveBeenCalledWith('infinity-worker-v5.1');
    });

    it('precaches all required core assets', async () => {
        const event = { waitUntil: vi.fn() };
        handlers['install'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCaches._cache.addAll).toHaveBeenCalledWith(
            expect.arrayContaining(['/', '/ide', '/health', '/manifest.json', '/offline']),
        );
    });

    it('precaches exactly the documented assets (no extras, no omissions)', async () => {
        const event = { waitUntil: vi.fn() };
        handlers['install'](event);
        await event.waitUntil.mock.calls[0][0];
        const [assets] = mockCaches._cache.addAll.mock.calls[0];
        expect(assets).toHaveLength(5);
    });

    it('calls self.skipWaiting() after successful precache', async () => {
        const event = { waitUntil: vi.fn() };
        handlers['install'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockSelf.skipWaiting).toHaveBeenCalledTimes(1);
    });

    it('does not throw when cache.addAll rejects (handles error gracefully)', async () => {
        mockCaches._cache.addAll.mockRejectedValueOnce(new Error('quota exceeded'));
        const event = { waitUntil: vi.fn() };
        handlers['install'](event);
        // Should not reject — the catch inside the handler swallows the error
        await expect(event.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// activate event
// ══════════════════════════════════════════════════════════════════════════════

describe('activate event handler', () => {
    let handlers, mockSelf, mockCaches;

    beforeEach(() => {
        ({ handlers, self: mockSelf, caches: mockCaches } = loadSW());
    });

    it('calls event.waitUntil', () => {
        const event = { waitUntil: vi.fn() };
        handlers['activate'](event);
        expect(event.waitUntil).toHaveBeenCalledTimes(1);
    });

    it('deletes caches whose names do not match CACHE_NAME', async () => {
        mockCaches.keys.mockResolvedValue(['old-cache-v1', 'old-cache-v2']);
        const event = { waitUntil: vi.fn() };
        handlers['activate'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCaches.delete).toHaveBeenCalledWith('old-cache-v1');
        expect(mockCaches.delete).toHaveBeenCalledWith('old-cache-v2');
    });

    it('does not delete the current CACHE_NAME', async () => {
        mockCaches.keys.mockResolvedValue(['infinity-worker-v5.1', 'old-cache-v1']);
        const event = { waitUntil: vi.fn() };
        handlers['activate'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCaches.delete).not.toHaveBeenCalledWith('infinity-worker-v5.1');
        expect(mockCaches.delete).toHaveBeenCalledWith('old-cache-v1');
    });

    it('does not delete any caches when only the current cache exists', async () => {
        mockCaches.keys.mockResolvedValue(['infinity-worker-v5.1']);
        const event = { waitUntil: vi.fn() };
        handlers['activate'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCaches.delete).not.toHaveBeenCalled();
    });

    it('calls self.clients.claim() after cleanup', async () => {
        mockCaches.keys.mockResolvedValue([]);
        const event = { waitUntil: vi.fn() };
        handlers['activate'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockSelf.clients.claim).toHaveBeenCalledTimes(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// fetch event — request filtering
// ══════════════════════════════════════════════════════════════════════════════

describe('fetch event handler — request filtering', () => {
    let handlers, mockCaches;

    beforeEach(() => {
        ({ handlers, caches: mockCaches } = loadSW());
    });

    it('does not call respondWith for POST requests', () => {
        const event = makeFetchEvent({
            url: 'http://localhost:3000/some-page',
            method: 'POST',
        });
        handlers['fetch'](event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not call respondWith for PUT requests', () => {
        const event = makeFetchEvent({
            url: 'http://localhost:3000/some-page',
            method: 'PUT',
        });
        handlers['fetch'](event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not call respondWith for DELETE requests', () => {
        const event = makeFetchEvent({
            url: 'http://localhost:3000/some-page',
            method: 'DELETE',
        });
        handlers['fetch'](event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not call respondWith for cross-origin GET requests', () => {
        const event = makeFetchEvent({
            url: 'https://cdn.example.com/script.js',
            method: 'GET',
        });
        handlers['fetch'](event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// fetch event — network-only API routes
// ══════════════════════════════════════════════════════════════════════════════

describe('fetch event handler — network-only API routes', () => {
    let handlers;

    beforeEach(() => {
        ({ handlers } = loadSW());
    });

    const NETWORK_ONLY_ROUTES = [
        '/api/generate',
        '/api/mobile/build',
        '/api/deploy',
        '/api/git',
    ];

    NETWORK_ONLY_ROUTES.forEach((route) => {
        it(`calls respondWith for ${route}`, () => {
            const event = makeFetchEvent({ url: `http://localhost:3000${route}` });
            handlers['fetch'](event);
            expect(event.respondWith).toHaveBeenCalledTimes(1);
        });

        it(`passes the request directly to fetch() for ${route}`, async () => {
            const mockResponse = new Response('ok', { status: 200 });
            global.fetch.mockResolvedValueOnce(mockResponse);
            const event = makeFetchEvent({ url: `http://localhost:3000${route}` });
            handlers['fetch'](event);
            const response = await event.respondWith.mock.calls[0][0];
            expect(global.fetch).toHaveBeenCalledWith(event.request);
            expect(response).toBe(mockResponse);
        });

        it(`returns a 503 JSON response when network fails for ${route}`, async () => {
            global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
            const event = makeFetchEvent({ url: `http://localhost:3000${route}` });
            handlers['fetch'](event);
            const response = await event.respondWith.mock.calls[0][0];
            expect(response.status).toBe(503);
            const body = await response.json();
            expect(body).toEqual({ error: 'Offline - API unavailable' });
        });
    });

    it('matches API route sub-paths (startsWith semantics)', async () => {
        const mockResponse = new Response('ok', { status: 200 });
        global.fetch.mockResolvedValueOnce(mockResponse);
        const event = makeFetchEvent({
            url: 'http://localhost:3000/api/generate/stream',
        });
        handlers['fetch'](event);
        expect(event.respondWith).toHaveBeenCalledTimes(1);
        const response = await event.respondWith.mock.calls[0][0];
        expect(global.fetch).toHaveBeenCalled();
        expect(response).toBe(mockResponse);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// fetch event — network-first with cache fallback
// ══════════════════════════════════════════════════════════════════════════════

describe('fetch event handler — network-first with cache fallback', () => {
    let handlers, mockCaches;

    beforeEach(() => {
        ({ handlers, caches: mockCaches } = loadSW());
    });

    it('returns the network response when fetch succeeds', async () => {
        const networkResponse = new Response('<html>', { status: 200 });
        networkResponse.clone = vi.fn().mockReturnValue(new Response('<html>', { status: 200 }));
        global.fetch.mockResolvedValueOnce(networkResponse);

        const event = makeFetchEvent({ url: 'http://localhost:3000/' });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response).toBe(networkResponse);
    });

    it('caches a successful (ok) response asynchronously', async () => {
        const cloned = new Response('<html>', { status: 200 });
        const networkResponse = new Response('<html>', { status: 200 });
        networkResponse.clone = vi.fn().mockReturnValue(cloned);
        global.fetch.mockResolvedValueOnce(networkResponse);

        const event = makeFetchEvent({ url: 'http://localhost:3000/ide' });
        handlers['fetch'](event);
        await event.respondWith.mock.calls[0][0];
        // Allow microtasks (async caching) to flush
        await Promise.resolve();

        expect(mockCaches.open).toHaveBeenCalledWith('infinity-worker-v5.1');
        expect(mockCaches._cache.put).toHaveBeenCalledWith(event.request, cloned);
    });

    it('does not cache a non-ok (e.g. 404) response', async () => {
        const networkResponse = new Response('Not Found', { status: 404 });
        networkResponse.clone = vi.fn().mockReturnValue(new Response('Not Found', { status: 404 }));
        global.fetch.mockResolvedValueOnce(networkResponse);

        const event = makeFetchEvent({ url: 'http://localhost:3000/missing' });
        handlers['fetch'](event);
        await event.respondWith.mock.calls[0][0];
        await Promise.resolve();

        expect(mockCaches._cache.put).not.toHaveBeenCalled();
    });

    it('returns cached response when network fails and cache has a match', async () => {
        global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const cachedResponse = new Response('<html>cached</html>', { status: 200 });
        mockCaches.match.mockResolvedValueOnce(cachedResponse);

        const event = makeFetchEvent({ url: 'http://localhost:3000/ide' });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response).toBe(cachedResponse);
    });

    it('returns the offline page for navigate requests when cache misses', async () => {
        global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        // First match (for request) returns nothing; second match (for /offline) returns offline page
        const offlinePage = new Response('<html>offline</html>', { status: 200 });
        mockCaches.match
            .mockResolvedValueOnce(undefined)        // no match for request
            .mockResolvedValueOnce(offlinePage);     // match for /offline

        const event = makeFetchEvent({
            url: 'http://localhost:3000/some-page',
            mode: 'navigate',
        });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(mockCaches.match).toHaveBeenCalledWith('/offline');
        expect(response).toBe(offlinePage);
    });

    it('returns a 503 plain-text response for non-navigate cache misses', async () => {
        global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        mockCaches.match.mockResolvedValueOnce(undefined);

        const event = makeFetchEvent({
            url: 'http://localhost:3000/static/style.css',
            mode: 'cors',
        });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response.status).toBe(503);
        const text = await response.text();
        expect(text).toBe('Offline');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// sync event
// ══════════════════════════════════════════════════════════════════════════════

describe('sync event handler', () => {
    let handlers;

    beforeEach(() => {
        ({ handlers } = loadSW());
    });

    it('calls event.waitUntil for the "sync-projects" tag', () => {
        const event = { tag: 'sync-projects', waitUntil: vi.fn() };
        handlers['sync'](event);
        expect(event.waitUntil).toHaveBeenCalledTimes(1);
    });

    it('resolves the sync-projects promise without error', async () => {
        const event = { tag: 'sync-projects', waitUntil: vi.fn() };
        handlers['sync'](event);
        await expect(event.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
    });

    it('does not call event.waitUntil for unknown sync tags', () => {
        const event = { tag: 'some-other-tag', waitUntil: vi.fn() };
        handlers['sync'](event);
        expect(event.waitUntil).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// push event
// ══════════════════════════════════════════════════════════════════════════════

describe('push event handler', () => {
    let handlers, mockSelf;

    beforeEach(() => {
        ({ handlers, self: mockSelf } = loadSW());
    });

    it('shows a notification when event.data is present', async () => {
        const pushData = { title: 'Deploy complete', body: 'Your app is live', data: { url: '/ide' } };
        const event = {
            data: { json: () => pushData },
            waitUntil: vi.fn(),
        };
        handlers['push'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockSelf.registration.showNotification).toHaveBeenCalledWith(
            'Deploy complete',
            expect.objectContaining({
                body: 'Your app is live',
                icon: '/static/icons/icon-192x192.png',
                badge: '/static/icons/icon-72x72.png',
                data: { url: '/ide' },
            }),
        );
    });

    it('falls back to default title "Infinity Worker" when title is absent', async () => {
        const pushData = { body: 'Something happened' };
        const event = {
            data: { json: () => pushData },
            waitUntil: vi.fn(),
        };
        handlers['push'](event);
        await event.waitUntil.mock.calls[0][0];
        const [title] = mockSelf.registration.showNotification.mock.calls[0];
        expect(title).toBe('Infinity Worker');
    });

    it('falls back to default body "New notification" when body is absent', async () => {
        const pushData = { title: 'Hello' };
        const event = {
            data: { json: () => pushData },
            waitUntil: vi.fn(),
        };
        handlers['push'](event);
        await event.waitUntil.mock.calls[0][0];
        const [, options] = mockSelf.registration.showNotification.mock.calls[0];
        expect(options.body).toBe('New notification');
    });

    it('does not show a notification when event.data is falsy', () => {
        const event = { data: null, waitUntil: vi.fn() };
        handlers['push'](event);
        expect(event.waitUntil).not.toHaveBeenCalled();
        expect(mockSelf.registration.showNotification).not.toHaveBeenCalled();
    });

    it('calls event.waitUntil when data is present', () => {
        const pushData = { title: 'Test' };
        const event = {
            data: { json: () => pushData },
            waitUntil: vi.fn(),
        };
        handlers['push'](event);
        expect(event.waitUntil).toHaveBeenCalledTimes(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// notificationclick event
// ══════════════════════════════════════════════════════════════════════════════

describe('notificationclick event handler', () => {
    let handlers;

    beforeEach(() => {
        ({ handlers } = loadSW());
    });

    it('closes the notification', () => {
        const closeMock = vi.fn();
        const event = {
            notification: { close: closeMock, data: { url: '/ide' } },
            waitUntil: vi.fn(),
        };
        handlers['notificationclick'](event);
        expect(closeMock).toHaveBeenCalledTimes(1);
    });

    it('opens the window with the URL from notification data', async () => {
        const event = {
            notification: { close: vi.fn(), data: { url: '/projects' } },
            waitUntil: vi.fn(),
        };
        handlers['notificationclick'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(global.clients.openWindow).toHaveBeenCalledWith('/projects');
    });

    it('falls back to "/ide" when notification data URL is undefined', async () => {
        const event = {
            notification: { close: vi.fn(), data: {} },
            waitUntil: vi.fn(),
        };
        handlers['notificationclick'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(global.clients.openWindow).toHaveBeenCalledWith('/ide');
    });

    it('falls back to "/ide" when notification data is null', async () => {
        const event = {
            notification: { close: vi.fn(), data: null },
            waitUntil: vi.fn(),
        };
        handlers['notificationclick'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(global.clients.openWindow).toHaveBeenCalledWith('/ide');
    });

    it('calls event.waitUntil with the openWindow promise', () => {
        const event = {
            notification: { close: vi.fn(), data: null },
            waitUntil: vi.fn(),
        };
        handlers['notificationclick'](event);
        expect(event.waitUntil).toHaveBeenCalledTimes(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// message event
// ══════════════════════════════════════════════════════════════════════════════

describe('message event handler', () => {
    let handlers, mockSelf, mockCaches;

    beforeEach(() => {
        ({ handlers, self: mockSelf, caches: mockCaches } = loadSW());
    });

    it('calls self.skipWaiting() for SKIP_WAITING messages', () => {
        const event = { data: { type: 'SKIP_WAITING' }, waitUntil: vi.fn() };
        handlers['message'](event);
        expect(mockSelf.skipWaiting).toHaveBeenCalledTimes(1);
    });

    it('opens CACHE_NAME and calls addAll for CACHE_URLS messages', async () => {
        const urlsToCache = ['/page1', '/page2', '/page3'];
        const event = {
            data: { type: 'CACHE_URLS', urls: urlsToCache },
            waitUntil: vi.fn(),
        };
        handlers['message'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCaches.open).toHaveBeenCalledWith('infinity-worker-v5.1');
        expect(mockCaches._cache.addAll).toHaveBeenCalledWith(urlsToCache);
    });

    it('calls event.waitUntil for CACHE_URLS messages', () => {
        const event = {
            data: { type: 'CACHE_URLS', urls: ['/a'] },
            waitUntil: vi.fn(),
        };
        handlers['message'](event);
        expect(event.waitUntil).toHaveBeenCalledTimes(1);
    });

    it('does not call skipWaiting for non-SKIP_WAITING messages', () => {
        const event = { data: { type: 'SOMETHING_ELSE' }, waitUntil: vi.fn() };
        handlers['message'](event);
        expect(mockSelf.skipWaiting).not.toHaveBeenCalled();
    });

    it('does not call event.waitUntil for unknown message types', () => {
        const event = { data: { type: 'UNKNOWN' }, waitUntil: vi.fn() };
        handlers['message'](event);
        expect(event.waitUntil).not.toHaveBeenCalled();
    });

    it('handles SKIP_WAITING and CACHE_URLS independently when both conditions apply', () => {
        // A message of type SKIP_WAITING should only trigger skipWaiting, not addAll
        const event = { data: { type: 'SKIP_WAITING' }, waitUntil: vi.fn() };
        handlers['message'](event);
        expect(mockSelf.skipWaiting).toHaveBeenCalled();
        expect(event.waitUntil).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// syncProjects helper — regression / boundary
// ══════════════════════════════════════════════════════════════════════════════

describe('syncProjects (via sync event)', () => {
    let handlers;

    beforeEach(() => {
        ({ handlers } = loadSW());
    });

    it('resolves without throwing even if IndexedDB is not available', async () => {
        // indexedDB is not mocked — the function should still complete gracefully
        const event = { tag: 'sync-projects', waitUntil: vi.fn() };
        handlers['sync'](event);
        await expect(event.waitUntil.mock.calls[0][0]).resolves.not.toThrow();
    });

    it('runs syncProjects only for the "sync-projects" tag, not other tags', () => {
        const unrelatedEvent = { tag: 'sync-contacts', waitUntil: vi.fn() };
        handlers['sync'](unrelatedEvent);
        expect(unrelatedEvent.waitUntil).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// Additional boundary / regression tests
// ══════════════════════════════════════════════════════════════════════════════

describe('fetch event handler — async caching failure is silent', () => {
    let handlers, mockCaches;

    beforeEach(() => {
        ({ handlers, caches: mockCaches } = loadSW());
    });

    it('still returns the network response even when cache.put rejects', async () => {
        mockCaches._cache.put.mockRejectedValueOnce(new Error('QuotaExceededError'));
        const cloned = new Response('<html>', { status: 200 });
        const networkResponse = new Response('<html>', { status: 200 });
        networkResponse.clone = vi.fn().mockReturnValue(cloned);
        global.fetch.mockResolvedValueOnce(networkResponse);

        const event = makeFetchEvent({ url: 'http://localhost:3000/' });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        // Allow microtasks for the async caching path to flush
        await Promise.resolve();
        expect(response).toBe(networkResponse);
    });

    it('still returns the network response even when caches.open rejects during caching', async () => {
        mockCaches.open.mockRejectedValueOnce(new Error('storage error'));
        const networkResponse = new Response('<html>', { status: 200 });
        networkResponse.clone = vi.fn().mockReturnValue(new Response('<html>', { status: 200 }));
        global.fetch.mockResolvedValueOnce(networkResponse);

        const event = makeFetchEvent({ url: 'http://localhost:3000/ide' });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        await Promise.resolve();
        expect(response).toBe(networkResponse);
    });
});

describe('fetch event handler — non-GET method filtering (additional methods)', () => {
    let handlers;

    beforeEach(() => {
        ({ handlers } = loadSW());
    });

    it('does not call respondWith for PATCH requests', () => {
        const event = makeFetchEvent({
            url: 'http://localhost:3000/some-resource',
            method: 'PATCH',
        });
        handlers['fetch'](event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not call respondWith for HEAD requests', () => {
        const event = makeFetchEvent({
            url: 'http://localhost:3000/health',
            method: 'HEAD',
        });
        handlers['fetch'](event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });
});

describe('fetch event handler — non-NETWORK_ONLY /api path uses network-first', () => {
    let handlers, mockCaches;

    beforeEach(() => {
        ({ handlers, caches: mockCaches } = loadSW());
    });

    it('routes /api/status through network-first (not network-only)', async () => {
        // /api/status is NOT in NETWORK_ONLY — should use network-first + caching
        const cloned = new Response('{"status":"ok"}', { status: 200 });
        const networkResponse = new Response('{"status":"ok"}', { status: 200 });
        networkResponse.clone = vi.fn().mockReturnValue(cloned);
        global.fetch.mockResolvedValueOnce(networkResponse);

        const event = makeFetchEvent({ url: 'http://localhost:3000/api/status' });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        await Promise.resolve();

        expect(response).toBe(networkResponse);
        // Network-first path caches the response (unlike NETWORK_ONLY which never caches)
        expect(mockCaches._cache.put).toHaveBeenCalledWith(event.request, cloned);
    });
});

describe('fetch event handler — API offline 503 Content-Type header', () => {
    let handlers;

    beforeEach(() => {
        ({ handlers } = loadSW());
    });

    it('sets Content-Type: application/json on the 503 offline API response', async () => {
        global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const event = makeFetchEvent({ url: 'http://localhost:3000/api/deploy' });
        handlers['fetch'](event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response.headers.get('Content-Type')).toBe('application/json');
    });
});

describe('push event handler — both title and body absent', () => {
    let handlers, mockSelf;

    beforeEach(() => {
        ({ handlers, self: mockSelf } = loadSW());
    });

    it('uses both default title and default body when neither is provided', async () => {
        const pushData = { data: { url: '/ide' } };
        const event = {
            data: { json: () => pushData },
            waitUntil: vi.fn(),
        };
        handlers['push'](event);
        await event.waitUntil.mock.calls[0][0];
        const [title, options] = mockSelf.registration.showNotification.mock.calls[0];
        expect(title).toBe('Infinity Worker');
        expect(options.body).toBe('New notification');
    });
});

describe('notificationclick event handler — undefined data property', () => {
    let handlers;

    beforeEach(() => {
        ({ handlers } = loadSW());
    });

    it('falls back to "/ide" when notification.data is undefined', async () => {
        const event = {
            notification: { close: vi.fn(), data: undefined },
            waitUntil: vi.fn(),
        };
        handlers['notificationclick'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(global.clients.openWindow).toHaveBeenCalledWith('/ide');
    });
});

describe('message event handler — CACHE_URLS edge cases', () => {
    let handlers, mockCaches;

    beforeEach(() => {
        ({ handlers, caches: mockCaches } = loadSW());
    });

    it('calls cache.addAll with an empty array when urls is []', async () => {
        const event = {
            data: { type: 'CACHE_URLS', urls: [] },
            waitUntil: vi.fn(),
        };
        handlers['message'](event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCaches._cache.addAll).toHaveBeenCalledWith([]);
    });
});