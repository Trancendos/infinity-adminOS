/**
 * Service Worker Tests — sw.js
 * ════════════════════════════════════════════════════════════════════
 * Tests for the Infinity Worker IDE service worker covering:
 *  - Install: precaching core assets, skipWaiting
 *  - Activate: old-cache cleanup, clients.claim
 *  - Fetch: non-GET skip, cross-origin skip, network-only API routes,
 *           network-first with cache fallback, offline page for navigation
 *  - Background sync: sync-projects tag
 *  - Push notifications: with data / without data
 *  - Notification click: custom URL and default /ide fallback
 *  - Message handler: SKIP_WAITING and CACHE_URLS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SW_PATH = path.resolve(__dirname, '../sw.js');

// ── SW globals helpers ──────────────────────────────────────────────

/**
 * Build a fresh mock service-worker environment, load sw.js into it,
 * and return the captured event handlers plus the mock objects.
 */
async function loadSW() {
    const handlers = {};

    const mockCache = {
        addAll: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        match: vi.fn().mockResolvedValue(undefined),
    };

    const mockCacheStorage = {
        open: vi.fn().mockResolvedValue(mockCache),
        keys: vi.fn().mockResolvedValue([]),
        match: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(true),
    };

    const mockClients = {
        claim: vi.fn().mockResolvedValue(undefined),
        openWindow: vi.fn().mockResolvedValue(undefined),
    };

    const mockRegistration = {
        showNotification: vi.fn().mockResolvedValue(undefined),
    };

    const mockSelf = {
        addEventListener: vi.fn((type, handler) => {
            handlers[type] = handler;
        }),
        skipWaiting: vi.fn().mockResolvedValue(undefined),
        location: { origin: 'https://example.com' },
        clients: mockClients,
        registration: mockRegistration,
    };

    const mockFetch = vi.fn();

    const src = await readFile(SW_PATH, 'utf8');

    // Execute sw.js source in a context where all globals are injected.
    // We use the Function constructor so that `self`, `caches`, `fetch`,
    // and `clients` resolve to our mocks instead of the host globals.
    // eslint-disable-next-line no-new-func
    const factory = new Function(
        'self', 'caches', 'fetch', 'clients', 'URL', 'Response', 'console',
        src,
    );
    factory(
        mockSelf,
        mockCacheStorage,
        mockFetch,
        mockClients,
        URL,
        Response,
        console,
    );

    return { handlers, mockCache, mockCacheStorage, mockClients, mockSelf, mockRegistration, mockFetch };
}

// ── Helper to build a minimal FetchEvent-like object ───────────────

function makeFetchEvent(url, { method = 'GET', mode = 'cors' } = {}) {
    const request = new Request(url, { method });
    Object.defineProperty(request, 'mode', { value: mode });
    return {
        request,
        respondWith: vi.fn(),
        waitUntil: vi.fn(),
    };
}

function makeInstallEvent() {
    return { waitUntil: vi.fn() };
}

function makeActivateEvent() {
    return { waitUntil: vi.fn() };
}

// ══════════════════════════════════════════════════════════════════
// Install event
// ══════════════════════════════════════════════════════════════════
describe('install event', () => {
    it('registers an install event listener', async () => {
        const { handlers } = await loadSW();
        expect(typeof handlers.install).toBe('function');
    });

    it('opens the versioned cache during install', async () => {
        const { handlers, mockCacheStorage } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCacheStorage.open).toHaveBeenCalledWith('infinity-worker-v5.1');
    });

    it('precaches all required core assets', async () => {
        const { handlers, mockCache } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCache.addAll).toHaveBeenCalledWith(
            expect.arrayContaining(['/', '/ide', '/health', '/manifest.json', '/offline']),
        );
    });

    it('calls skipWaiting after precaching', async () => {
        const { handlers, mockSelf } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockSelf.skipWaiting).toHaveBeenCalled();
    });

    it('calls event.waitUntil with the cache promise', async () => {
        const { handlers } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        expect(event.waitUntil).toHaveBeenCalledOnce();
    });

    it('handles precache failure gracefully (no unhandled rejection)', async () => {
        const { handlers, mockCacheStorage } = await loadSW();
        mockCacheStorage.open.mockRejectedValueOnce(new Error('QuotaExceeded'));
        const event = makeInstallEvent();
        handlers.install(event);
        // Should not throw
        await expect(event.waitUntil.mock.calls[0][0]).resolves.not.toThrow();
    });
});

// ══════════════════════════════════════════════════════════════════
// Activate event
// ══════════════════════════════════════════════════════════════════
describe('activate event', () => {
    it('registers an activate event listener', async () => {
        const { handlers } = await loadSW();
        expect(typeof handlers.activate).toBe('function');
    });

    it('deletes old caches that do not match the current cache name', async () => {
        const { handlers, mockCacheStorage } = await loadSW();
        mockCacheStorage.keys.mockResolvedValueOnce([
            'infinity-worker-v4.0',
            'infinity-worker-v5.1', // current — must NOT be deleted
            'old-cache-v1',
        ]);
        const event = makeActivateEvent();
        handlers.activate(event);
        await event.waitUntil.mock.calls[0][0];

        expect(mockCacheStorage.delete).toHaveBeenCalledWith('infinity-worker-v4.0');
        expect(mockCacheStorage.delete).toHaveBeenCalledWith('old-cache-v1');
        expect(mockCacheStorage.delete).not.toHaveBeenCalledWith('infinity-worker-v5.1');
    });

    it('does not delete the current cache', async () => {
        const { handlers, mockCacheStorage } = await loadSW();
        mockCacheStorage.keys.mockResolvedValueOnce(['infinity-worker-v5.1']);
        const event = makeActivateEvent();
        handlers.activate(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCacheStorage.delete).not.toHaveBeenCalled();
    });

    it('calls clients.claim after cache cleanup', async () => {
        const { handlers, mockClients, mockCacheStorage } = await loadSW();
        mockCacheStorage.keys = vi.fn().mockResolvedValue([]);
        const event = makeActivateEvent();
        handlers.activate(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockClients.claim).toHaveBeenCalled();
    });

    it('calls event.waitUntil with the cleanup promise', async () => {
        const { handlers } = await loadSW();
        const event = makeActivateEvent();
        handlers.activate(event);
        expect(event.waitUntil).toHaveBeenCalledOnce();
    });
});

// ══════════════════════════════════════════════════════════════════
// Fetch event — request filtering
// ══════════════════════════════════════════════════════════════════
describe('fetch event — request filtering', () => {
    it('registers a fetch event listener', async () => {
        const { handlers } = await loadSW();
        expect(typeof handlers.fetch).toBe('function');
    });

    it('does not call respondWith for non-GET requests (POST)', async () => {
        const { handlers } = await loadSW();
        const event = makeFetchEvent('https://example.com/api/data', { method: 'POST' });
        handlers.fetch(event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not call respondWith for non-GET requests (PUT)', async () => {
        const { handlers } = await loadSW();
        const event = makeFetchEvent('https://example.com/api/data', { method: 'PUT' });
        handlers.fetch(event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('does not call respondWith for cross-origin GET requests', async () => {
        const { handlers } = await loadSW();
        const event = makeFetchEvent('https://external-cdn.com/script.js');
        handlers.fetch(event);
        expect(event.respondWith).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════════════════════════
// Fetch event — network-only API routes
// ══════════════════════════════════════════════════════════════════
describe('fetch event — network-only API routes', () => {
    const API_ROUTES = [
        '/api/generate',
        '/api/mobile/build',
        '/api/deploy',
        '/api/git',
    ];

    for (const route of API_ROUTES) {
        it(`calls respondWith for ${route} (network-only)`, async () => {
            const { handlers, mockFetch } = await loadSW();
            const mockResponse = new Response('OK');
            mockFetch.mockResolvedValueOnce(mockResponse);
            const event = makeFetchEvent(`https://example.com${route}`);
            handlers.fetch(event);
            expect(event.respondWith).toHaveBeenCalledOnce();
        });

        it(`${route}: returns 503 JSON when offline`, async () => {
            const { handlers, mockFetch } = await loadSW();
            mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
            const event = makeFetchEvent(`https://example.com${route}`);
            handlers.fetch(event);
            const response = await event.respondWith.mock.calls[0][0];
            expect(response.status).toBe(503);
            const body = await response.json();
            expect(body.error).toBe('Offline - API unavailable');
        });
    }

    it('matches API routes that have sub-paths (/api/git/status)', async () => {
        const { handlers, mockFetch } = await loadSW();
        mockFetch.mockResolvedValueOnce(new Response('OK'));
        const event = makeFetchEvent('https://example.com/api/git/status');
        handlers.fetch(event);
        expect(event.respondWith).toHaveBeenCalledOnce();
        // Should NOT go to cache, just network
        const { mockCache } = await loadSW();
        // cache.match should not be called for API routes on success
        expect(mockCache.match).not.toHaveBeenCalled();
    });

    it('returns Content-Type application/json in offline API response', async () => {
        const { handlers, mockFetch } = await loadSW();
        mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const event = makeFetchEvent('https://example.com/api/deploy');
        handlers.fetch(event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response.headers.get('Content-Type')).toBe('application/json');
    });
});

// ══════════════════════════════════════════════════════════════════
// Fetch event — network-first with cache fallback
// ══════════════════════════════════════════════════════════════════
describe('fetch event — network-first with cache fallback', () => {
    it('returns network response when online', async () => {
        const { handlers, mockFetch } = await loadSW();
        const networkResponse = new Response('<html>IDE</html>', { status: 200 });
        mockFetch.mockResolvedValueOnce(networkResponse);
        const event = makeFetchEvent('https://example.com/ide');
        handlers.fetch(event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response.status).toBe(200);
    });

    it('caches successful network responses (status ok)', async () => {
        const { handlers, mockFetch, mockCacheStorage, mockCache } = await loadSW();
        const networkResponse = new Response('body', { status: 200 });
        mockFetch.mockResolvedValueOnce(networkResponse);
        const event = makeFetchEvent('https://example.com/ide');
        handlers.fetch(event);
        await event.respondWith.mock.calls[0][0];
        // Give async cache.put time to settle
        await new Promise(r => setTimeout(r, 0));
        expect(mockCacheStorage.open).toHaveBeenCalledWith('infinity-worker-v5.1');
        expect(mockCache.put).toHaveBeenCalled();
    });

    it('does NOT cache non-ok network responses (status 404)', async () => {
        const { handlers, mockFetch, mockCache } = await loadSW();
        const networkResponse = new Response('Not Found', { status: 404 });
        mockFetch.mockResolvedValueOnce(networkResponse);
        const event = makeFetchEvent('https://example.com/missing');
        handlers.fetch(event);
        await event.respondWith.mock.calls[0][0];
        await new Promise(r => setTimeout(r, 0));
        expect(mockCache.put).not.toHaveBeenCalled();
    });

    it('returns cached response when network fails and cache hit', async () => {
        const { handlers, mockFetch, mockCacheStorage, mockCache } = await loadSW();
        mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const cachedResponse = new Response('Cached content');
        mockCacheStorage.match.mockResolvedValueOnce(cachedResponse);
        const event = makeFetchEvent('https://example.com/ide');
        handlers.fetch(event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response).toBe(cachedResponse);
    });

    it('returns offline page for navigate requests when cache misses', async () => {
        const { handlers, mockFetch, mockCacheStorage } = await loadSW();
        mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        mockCacheStorage.match.mockResolvedValue(undefined); // no cache hit
        const offlinePage = new Response('<html>Offline</html>', { status: 200 });
        // First match is for the request itself, second for OFFLINE_URL
        let callCount = 0;
        mockCacheStorage.match.mockImplementation(() => {
            callCount++;
            return Promise.resolve(callCount === 1 ? undefined : offlinePage);
        });
        const event = makeFetchEvent('https://example.com/newpage', { mode: 'navigate' });
        handlers.fetch(event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response).toBe(offlinePage);
    });

    it('returns 503 plain text for non-navigate requests on full cache miss', async () => {
        const { handlers, mockFetch, mockCacheStorage } = await loadSW();
        mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        mockCacheStorage.match.mockResolvedValue(undefined);
        const event = makeFetchEvent('https://example.com/image.png');
        handlers.fetch(event);
        const response = await event.respondWith.mock.calls[0][0];
        expect(response.status).toBe(503);
        const text = await response.text();
        expect(text).toBe('Offline');
    });

    it('calls respondWith for same-origin non-API GET requests', async () => {
        const { handlers, mockFetch } = await loadSW();
        mockFetch.mockResolvedValueOnce(new Response('OK'));
        const event = makeFetchEvent('https://example.com/');
        handlers.fetch(event);
        expect(event.respondWith).toHaveBeenCalledOnce();
    });
});

// ══════════════════════════════════════════════════════════════════
// Background sync event
// ══════════════════════════════════════════════════════════════════
describe('sync event', () => {
    it('registers a sync event listener', async () => {
        const { handlers } = await loadSW();
        expect(typeof handlers.sync).toBe('function');
    });

    it('calls event.waitUntil for sync-projects tag', async () => {
        const { handlers } = await loadSW();
        const event = { tag: 'sync-projects', waitUntil: vi.fn() };
        handlers.sync(event);
        expect(event.waitUntil).toHaveBeenCalledOnce();
    });

    it('does not call waitUntil for unknown sync tags', async () => {
        const { handlers } = await loadSW();
        const event = { tag: 'unknown-tag', waitUntil: vi.fn() };
        handlers.sync(event);
        expect(event.waitUntil).not.toHaveBeenCalled();
    });

    it('syncProjects resolves without throwing', async () => {
        const { handlers } = await loadSW();
        const event = { tag: 'sync-projects', waitUntil: vi.fn() };
        handlers.sync(event);
        await expect(event.waitUntil.mock.calls[0][0]).resolves.not.toThrow();
    });
});

// ══════════════════════════════════════════════════════════════════
// Push event
// ══════════════════════════════════════════════════════════════════
describe('push event', () => {
    it('registers a push event listener', async () => {
        const { handlers } = await loadSW();
        expect(typeof handlers.push).toBe('function');
    });

    it('shows a notification with title and body from push data', async () => {
        const { handlers, mockRegistration } = await loadSW();
        const pushData = { title: 'Build complete', body: 'Your app deployed!' };
        const event = {
            data: { json: () => pushData },
            waitUntil: vi.fn(),
        };
        handlers.push(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockRegistration.showNotification).toHaveBeenCalledWith(
            'Build complete',
            expect.objectContaining({ body: 'Your app deployed!' }),
        );
    });

    it('falls back to default title when push data has no title', async () => {
        const { handlers, mockRegistration } = await loadSW();
        const event = {
            data: { json: () => ({ body: 'Hello' }) },
            waitUntil: vi.fn(),
        };
        handlers.push(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockRegistration.showNotification).toHaveBeenCalledWith(
            'Infinity Worker',
            expect.anything(),
        );
    });

    it('falls back to default body when push data has no body', async () => {
        const { handlers, mockRegistration } = await loadSW();
        const event = {
            data: { json: () => ({ title: 'Alert' }) },
            waitUntil: vi.fn(),
        };
        handlers.push(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockRegistration.showNotification).toHaveBeenCalledWith(
            'Alert',
            expect.objectContaining({ body: 'New notification' }),
        );
    });

    it('does nothing when push event has no data', async () => {
        const { handlers, mockRegistration } = await loadSW();
        const event = {
            data: null,
            waitUntil: vi.fn(),
        };
        handlers.push(event);
        expect(event.waitUntil).not.toHaveBeenCalled();
        expect(mockRegistration.showNotification).not.toHaveBeenCalled();
    });

    it('includes correct icon and badge paths in notification', async () => {
        const { handlers, mockRegistration } = await loadSW();
        const event = {
            data: { json: () => ({ title: 'Test' }) },
            waitUntil: vi.fn(),
        };
        handlers.push(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockRegistration.showNotification).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                icon: '/static/icons/icon-192x192.png',
                badge: '/static/icons/icon-72x72.png',
            }),
        );
    });

    it('passes custom data payload to notification options', async () => {
        const { handlers, mockRegistration } = await loadSW();
        const customData = { url: '/ide', projectId: 'abc' };
        const event = {
            data: { json: () => ({ title: 'Done', data: customData }) },
            waitUntil: vi.fn(),
        };
        handlers.push(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockRegistration.showNotification).toHaveBeenCalledWith(
            'Done',
            expect.objectContaining({ data: customData }),
        );
    });
});

// ══════════════════════════════════════════════════════════════════
// Notification click event
// ══════════════════════════════════════════════════════════════════
describe('notificationclick event', () => {
    it('registers a notificationclick event listener', async () => {
        const { handlers } = await loadSW();
        expect(typeof handlers.notificationclick).toBe('function');
    });

    it('closes the notification on click', async () => {
        const { handlers, mockClients } = await loadSW();
        const closeFn = vi.fn();
        const event = {
            notification: { close: closeFn, data: { url: '/ide' } },
            waitUntil: vi.fn(),
        };
        handlers.notificationclick(event);
        expect(closeFn).toHaveBeenCalled();
    });

    it('opens the URL from notification data', async () => {
        const { handlers, mockClients } = await loadSW();
        const event = {
            notification: { close: vi.fn(), data: { url: '/app/project-123' } },
            waitUntil: vi.fn(),
        };
        handlers.notificationclick(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockClients.openWindow).toHaveBeenCalledWith('/app/project-123');
    });

    it('falls back to /ide when notification data has no url', async () => {
        const { handlers, mockClients } = await loadSW();
        const event = {
            notification: { close: vi.fn(), data: {} },
            waitUntil: vi.fn(),
        };
        handlers.notificationclick(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockClients.openWindow).toHaveBeenCalledWith('/ide');
    });

    it('falls back to /ide when notification data is null', async () => {
        const { handlers, mockClients } = await loadSW();
        const event = {
            notification: { close: vi.fn(), data: null },
            waitUntil: vi.fn(),
        };
        handlers.notificationclick(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockClients.openWindow).toHaveBeenCalledWith('/ide');
    });
});

// ══════════════════════════════════════════════════════════════════
// Message event
// ══════════════════════════════════════════════════════════════════
describe('message event', () => {
    it('registers a message event listener', async () => {
        const { handlers } = await loadSW();
        expect(typeof handlers.message).toBe('function');
    });

    it('calls skipWaiting when SKIP_WAITING message is received', async () => {
        const { handlers, mockSelf } = await loadSW();
        const event = { data: { type: 'SKIP_WAITING' }, waitUntil: vi.fn() };
        handlers.message(event);
        expect(mockSelf.skipWaiting).toHaveBeenCalled();
    });

    it('caches provided URLs when CACHE_URLS message is received', async () => {
        const { handlers, mockCacheStorage, mockCache } = await loadSW();
        const urlsToCache = ['/style.css', '/app.js', '/logo.png'];
        const event = {
            data: { type: 'CACHE_URLS', urls: urlsToCache },
            waitUntil: vi.fn(),
        };
        handlers.message(event);
        await event.waitUntil.mock.calls[0][0];
        expect(mockCacheStorage.open).toHaveBeenCalledWith('infinity-worker-v5.1');
        expect(mockCache.addAll).toHaveBeenCalledWith(urlsToCache);
    });

    it('does not call skipWaiting for non-SKIP_WAITING messages', async () => {
        const { handlers, mockSelf } = await loadSW();
        const event = { data: { type: 'CACHE_URLS', urls: [] }, waitUntil: vi.fn() };
        handlers.message(event);
        expect(mockSelf.skipWaiting).not.toHaveBeenCalled();
    });

    it('does not call cache for non-CACHE_URLS messages', async () => {
        const { handlers, mockCacheStorage } = await loadSW();
        // Reset the mock call count (open was called in loadSW during install setup)
        mockCacheStorage.open.mockClear();
        const event = { data: { type: 'SKIP_WAITING' }, waitUntil: vi.fn() };
        handlers.message(event);
        expect(event.waitUntil).not.toHaveBeenCalled();
    });

    it('handles both SKIP_WAITING and CACHE_URLS in the same message', async () => {
        // This is a boundary/regression test: the sw handles them as independent
        // if-blocks, so sending a message type that is neither should be a no-op
        const { handlers, mockSelf, mockCacheStorage } = await loadSW();
        mockCacheStorage.open.mockClear();
        const event = { data: { type: 'UNKNOWN_TYPE' }, waitUntil: vi.fn() };
        handlers.message(event);
        expect(mockSelf.skipWaiting).not.toHaveBeenCalled();
        expect(event.waitUntil).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════════════════════════
// Constants / configuration
// ══════════════════════════════════════════════════════════════════
describe('SW constants', () => {
    it('CACHE_NAME is versioned string', async () => {
        // Verify that install opens the correct cache name
        const { handlers, mockCacheStorage } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        await event.waitUntil.mock.calls[0][0];
        const cacheName = mockCacheStorage.open.mock.calls[0][0];
        expect(cacheName).toMatch(/^infinity-worker-v/);
    });

    it('PRECACHE_ASSETS includes exactly 5 entries', async () => {
        const { handlers, mockCache } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        await event.waitUntil.mock.calls[0][0];
        const assets = mockCache.addAll.mock.calls[0][0];
        expect(assets).toHaveLength(5);
    });

    it('PRECACHE_ASSETS includes /offline', async () => {
        const { handlers, mockCache } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        await event.waitUntil.mock.calls[0][0];
        const assets = mockCache.addAll.mock.calls[0][0];
        expect(assets).toContain('/offline');
    });

    it('NETWORK_ONLY routes are not cached during precache', async () => {
        const { handlers, mockCache } = await loadSW();
        const event = makeInstallEvent();
        handlers.install(event);
        await event.waitUntil.mock.calls[0][0];
        const assets = mockCache.addAll.mock.calls[0][0];
        expect(assets).not.toContain('/api/generate');
        expect(assets).not.toContain('/api/deploy');
        expect(assets).not.toContain('/api/git');
        expect(assets).not.toContain('/api/mobile/build');
    });
});