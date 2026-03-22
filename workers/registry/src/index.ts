/**
 * Module Registry Worker — Trancendos Plug-and-Play Ecosystem
 * ============================================================
 * Central registry for discovering, installing, and managing
 * modules (workers, apps, adapters, plugins) across tenants.
 * 
 * Routes:
 *   GET    /health
 *   GET    /modules                    — Search/list modules
 *   POST   /modules                    — Create module
 *   GET    /modules/:id                — Get module details
 *   PUT    /modules/:id                — Update module
 *   POST   /modules/:id/versions       — Publish version
 *   GET    /modules/:id/versions       — List versions
 *   GET    /modules/:id/resolve        — Resolve dependency tree
 *   POST   /tenants/:tid/modules       — Install module for tenant
 *   GET    /tenants/:tid/modules       — List tenant's installed modules
 *   PUT    /tenants/:tid/modules/:mid  — Update tenant module config
 *   DELETE /tenants/:tid/modules/:mid  — Uninstall module
 */

import { Hono } from 'hono';
import type {
  Env,
  Module,
  ModuleVersion,
  TenantModule,
  CreateModuleRequest,
  PublishVersionRequest,
  InstallModuleRequest,
  UpdateModuleConfigRequest,
  SearchModulesQuery,
  DependencyNode,
  ResolutionResult,
  PlatformEvent,
} from './types';
import {
  RegistryError,
  errorResponse,
  jsonResponse,
} from './types';

const app = new Hono<{ Bindings: Env }>();

// ── Health ────────────────────────────────────────────────────

app.get('/health', (c) =>
  c.json({
    status: 'operational',
    service: 'module-registry',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }),
);

// ── Search / List Modules ────────────────────────────────────

app.get('/modules', async (c) => {
  const query: SearchModulesQuery = {
    q: c.req.query('q'),
    type: c.req.query('type') as SearchModulesQuery['type'],
    category: c.req.query('category') as SearchModulesQuery['category'],
    plan: c.req.query('plan'),
    page: parseInt(c.req.query('page') || '1', 10),
    limit: Math.min(parseInt(c.req.query('limit') || '20', 10), 100),
  };

  const conditions: string[] = ["status = 'published'", "visibility IN ('public', 'unlisted')"];
  const params: unknown[] = [];

  if (query.q) {
    conditions.push('(name LIKE ? OR display_name LIKE ? OR description LIKE ?)');
    const search = `%${query.q}%`;
    params.push(search, search, search);
  }
  if (query.type) {
    conditions.push('type = ?');
    params.push(query.type);
  }
  if (query.category) {
    conditions.push('category = ?');
    params.push(query.category);
  }
  if (query.plan) {
    conditions.push('required_plan = ?');
    params.push(query.plan);
  }

  const offset = ((query.page || 1) - 1) * (query.limit || 20);
  const where = conditions.join(' AND ');

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM modules WHERE ${where}`,
  )
    .bind(...params)
    .first<{ total: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT * FROM modules WHERE ${where} ORDER BY install_count DESC, name ASC LIMIT ? OFFSET ?`,
  )
    .bind(...params, query.limit || 20, offset)
    .all();

  const modules = (rows.results || []).map(parseModuleRow);

  return c.json({
    modules,
    pagination: {
      page: query.page || 1,
      limit: query.limit || 20,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / (query.limit || 20)),
    },
  });
});

// ── Create Module ────────────────────────────────────────────

app.post('/modules', async (c) => {
  const body = await c.req.json<CreateModuleRequest>().catch(() => null);
  if (!body?.name || !body?.display_name || !body?.type) {
    return errorResponse(RegistryError.INVALID_INPUT, 'name, display_name, and type are required', 400);
  }

  // Check uniqueness
  const existing = await c.env.DB.prepare('SELECT id FROM modules WHERE name = ?')
    .bind(body.name)
    .first();
  if (existing) {
    return errorResponse(RegistryError.ALREADY_EXISTS, `Module '${body.name}' already exists`, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO modules (id, name, display_name, description, type, category, capabilities, required_bindings, required_plan, visibility, repository_url, icon_url, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
  )
    .bind(
      id,
      body.name,
      body.display_name,
      body.description || null,
      body.type,
      body.category || 'utility',
      JSON.stringify(body.capabilities || []),
      JSON.stringify(body.required_bindings || []),
      body.required_plan || 'free',
      body.visibility || 'private',
      body.repository_url || null,
      body.icon_url || null,
      now,
      now,
    )
    .run();

  return c.json({ id, name: body.name, status: 'draft', created_at: now }, 201);
});

// ── Get Module ───────────────────────────────────────────────

app.get('/modules/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM modules WHERE id = ?')
    .bind(id)
    .first();

  if (!row) {
    return errorResponse(RegistryError.NOT_FOUND, 'Module not found', 404);
  }

  const module = parseModuleRow(row);

  // Fetch latest published version
  const latestVersion = await c.env.DB.prepare(
    "SELECT * FROM module_versions WHERE module_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(id)
    .first();

  return c.json({
    ...module,
    latest_version: latestVersion ? parseVersionRow(latestVersion) : null,
  });
});

// ── Update Module ────────────────────────────────────────────

app.put('/modules/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<CreateModuleRequest>>().catch(() => null);
  if (!body) {
    return errorResponse(RegistryError.INVALID_INPUT, 'Request body required', 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM modules WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) {
    return errorResponse(RegistryError.NOT_FOUND, 'Module not found', 404);
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.display_name) { updates.push('display_name = ?'); values.push(body.display_name); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.category) { updates.push('category = ?'); values.push(body.category); }
  if (body.capabilities) { updates.push('capabilities = ?'); values.push(JSON.stringify(body.capabilities)); }
  if (body.required_bindings) { updates.push('required_bindings = ?'); values.push(JSON.stringify(body.required_bindings)); }
  if (body.visibility) { updates.push('visibility = ?'); values.push(body.visibility); }
  if (body.icon_url !== undefined) { updates.push('icon_url = ?'); values.push(body.icon_url); }

  if (updates.length === 0) {
    return errorResponse(RegistryError.INVALID_INPUT, 'No fields to update', 400);
  }

  updates.push("updated_at = datetime('now')");

  await c.env.DB.prepare(
    `UPDATE modules SET ${updates.join(', ')} WHERE id = ?`,
  )
    .bind(...values, id)
    .run();

  return c.json({ id, updated: true });
});

// ── Publish Version ──────────────────────────────────────────

app.post('/modules/:id/versions', async (c) => {
  const moduleId = c.req.param('id');
  const body = await c.req.json<PublishVersionRequest>().catch(() => null);
  if (!body?.version || !body?.entry_point) {
    return errorResponse(RegistryError.INVALID_INPUT, 'version and entry_point are required', 400);
  }

  // Verify module exists
  const module = await c.env.DB.prepare('SELECT id, status FROM modules WHERE id = ?')
    .bind(moduleId)
    .first<{ id: string; status: string }>();
  if (!module) {
    return errorResponse(RegistryError.NOT_FOUND, 'Module not found', 404);
  }

  // Check version uniqueness
  const existingVersion = await c.env.DB.prepare(
    'SELECT id FROM module_versions WHERE module_id = ? AND version = ?',
  )
    .bind(moduleId, body.version)
    .first();
  if (existingVersion) {
    return errorResponse(RegistryError.VERSION_CONFLICT, `Version ${body.version} already exists`, 409);
  }

  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO module_versions (id, module_id, version, changelog, entry_point, compatibility_flags, wrangler_overrides, min_platform_version, status, created_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
  )
    .bind(
      versionId,
      moduleId,
      body.version,
      body.changelog || null,
      body.entry_point,
      JSON.stringify(body.compatibility_flags || ['nodejs_compat']),
      JSON.stringify(body.wrangler_overrides || {}),
      body.min_platform_version || '0.1.0',
      now,
      now,
    )
    .run();

  // Update module status to published if first version
  if (module.status === 'draft') {
    await c.env.DB.prepare(
      "UPDATE modules SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?",
    )
      .bind(now, now, moduleId)
      .run();
  }

  return c.json({ id: versionId, version: body.version, status: 'published' }, 201);
});

// ── List Versions ────────────────────────────────────────────

app.get('/modules/:id/versions', async (c) => {
  const moduleId = c.req.param('id');
  const rows = await c.env.DB.prepare(
    'SELECT * FROM module_versions WHERE module_id = ? ORDER BY created_at DESC',
  )
    .bind(moduleId)
    .all();

  return c.json({
    versions: (rows.results || []).map(parseVersionRow),
  });
});

// ── Resolve Dependencies ─────────────────────────────────────

app.get('/modules/:id/resolve', async (c) => {
  const moduleId = c.req.param('id');
  const versionParam = c.req.query('version');

  const result = await resolveDependencies(c.env.DB, moduleId, versionParam);
  return c.json(result);
});

// ── Install Module for Tenant ────────────────────────────────

app.post('/tenants/:tid/modules', async (c) => {
  const tenantId = c.req.param('tid');
  const body = await c.req.json<InstallModuleRequest>().catch(() => null);
  if (!body?.module_id) {
    return errorResponse(RegistryError.INVALID_INPUT, 'module_id is required', 400);
  }

  // Verify module exists and is published
  const module = await c.env.DB.prepare(
    "SELECT * FROM modules WHERE id = ? AND status = 'published'",
  )
    .bind(body.module_id)
    .first();
  if (!module) {
    return errorResponse(RegistryError.NOT_FOUND, 'Module not found or not published', 404);
  }

  // Check if already installed
  const existing = await c.env.DB.prepare(
    'SELECT id FROM tenant_modules WHERE tenant_id = ? AND module_id = ?',
  )
    .bind(tenantId, body.module_id)
    .first();
  if (existing) {
    return errorResponse(RegistryError.ALREADY_EXISTS, 'Module already installed for this tenant', 409);
  }

  // Get target version (latest published if not specified)
  let versionRow: Record<string, unknown> | null;
  if (body.version) {
    versionRow = await c.env.DB.prepare(
      "SELECT * FROM module_versions WHERE module_id = ? AND version = ? AND status = 'published'",
    )
      .bind(body.module_id, body.version)
      .first();
  } else {
    versionRow = await c.env.DB.prepare(
      "SELECT * FROM module_versions WHERE module_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1",
    )
      .bind(body.module_id)
      .first();
  }

  if (!versionRow) {
    return errorResponse(RegistryError.NOT_FOUND, 'No published version available', 404);
  }

  const installId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO tenant_modules (id, tenant_id, module_id, version_id, config, enabled, deploy_status, installed_by, installed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'pending', ?, ?, ?)`,
  )
    .bind(
      installId,
      tenantId,
      body.module_id,
      versionRow.id as string,
      JSON.stringify(body.config || {}),
      'system',  // TODO: extract from auth context
      now,
      now,
    )
    .run();

  // Increment install count
  await c.env.DB.prepare(
    'UPDATE modules SET install_count = install_count + 1 WHERE id = ?',
  )
    .bind(body.module_id)
    .run();

  // Emit event
  await emitEvent(c.env, {
    tenant_id: tenantId,
    event_type: 'module.installed',
    source: 'module-registry',
    subject: body.module_id,
    data: {
      install_id: installId,
      module_id: body.module_id,
      module_name: module.name,
      version: versionRow.version,
    },
  });

  return c.json(
    {
      id: installId,
      module_id: body.module_id,
      version: versionRow.version as string,
      deploy_status: 'pending',
    },
    201,
  );
});

// ── List Tenant Modules ──────────────────────────────────────

app.get('/tenants/:tid/modules', async (c) => {
  const tenantId = c.req.param('tid');
  const rows = await c.env.DB.prepare(
    `SELECT tm.*, m.name as module_name, m.display_name, m.type, m.category, m.icon_url,
            mv.version as installed_version
     FROM tenant_modules tm
     JOIN modules m ON m.id = tm.module_id
     JOIN module_versions mv ON mv.id = tm.version_id
     WHERE tm.tenant_id = ?
     ORDER BY tm.installed_at DESC`,
  )
    .bind(tenantId)
    .all();

  return c.json({ modules: rows.results || [] });
});

// ── Update Tenant Module Config ──────────────────────────────

app.put('/tenants/:tid/modules/:mid', async (c) => {
  const tenantId = c.req.param('tid');
  const moduleId = c.req.param('mid');
  const body = await c.req.json<UpdateModuleConfigRequest>().catch(() => null);
  if (!body) {
    return errorResponse(RegistryError.INVALID_INPUT, 'Request body required', 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM tenant_modules WHERE tenant_id = ? AND module_id = ?',
  )
    .bind(tenantId, moduleId)
    .first<{ id: string }>();
  if (!existing) {
    return errorResponse(RegistryError.NOT_FOUND, 'Module not installed for this tenant', 404);
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.config !== undefined) {
    updates.push('config = ?');
    values.push(JSON.stringify(body.config));
  }
  if (body.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(body.enabled ? 1 : 0);
  }

  updates.push("updated_at = datetime('now')");

  await c.env.DB.prepare(
    `UPDATE tenant_modules SET ${updates.join(', ')} WHERE id = ?`,
  )
    .bind(...values, existing.id)
    .run();

  return c.json({ id: existing.id, updated: true });
});

// ── Uninstall Module ─────────────────────────────────────────

app.delete('/tenants/:tid/modules/:mid', async (c) => {
  const tenantId = c.req.param('tid');
  const moduleId = c.req.param('mid');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM tenant_modules WHERE tenant_id = ? AND module_id = ?',
  )
    .bind(tenantId, moduleId)
    .first<{ id: string }>();
  if (!existing) {
    return errorResponse(RegistryError.NOT_FOUND, 'Module not installed for this tenant', 404);
  }

  // Mark as uninstalling first
  await c.env.DB.prepare(
    "UPDATE tenant_modules SET deploy_status = 'uninstalling', updated_at = datetime('now') WHERE id = ?",
  )
    .bind(existing.id)
    .run();

  // Then delete
  await c.env.DB.prepare('DELETE FROM tenant_modules WHERE id = ?')
    .bind(existing.id)
    .run();

  // Decrement install count
  await c.env.DB.prepare(
    'UPDATE modules SET install_count = MAX(0, install_count - 1) WHERE id = ?',
  )
    .bind(moduleId)
    .run();

  // Emit event
  await emitEvent(c.env, {
    tenant_id: tenantId,
    event_type: 'module.uninstalled',
    source: 'module-registry',
    subject: moduleId,
    data: { module_id: moduleId },
  });

  return c.json({ id: existing.id, uninstalled: true });
});

// ── Dependency Resolution ────────────────────────────────────

async function resolveDependencies(
  db: D1Database,
  moduleId: string,
  version?: string | null,
): Promise<ResolutionResult> {
  const resolved: DependencyNode[] = [];
  const missing: string[] = [];
  const visited = new Set<string>();

  async function resolve(modId: string, ver?: string | null): Promise<DependencyNode | null> {
    if (visited.has(modId)) {
      return resolved.find((r) => r.module_name === modId) || null;
    }
    visited.add(modId);

    // Get module
    const mod = await db.prepare('SELECT id, name FROM modules WHERE id = ? OR name = ?')
      .bind(modId, modId)
      .first<{ id: string; name: string }>();
    if (!mod) {
      missing.push(modId);
      return null;
    }

    // Get version
    let versionRow: Record<string, unknown> | null;
    if (ver) {
      versionRow = await db.prepare(
        "SELECT * FROM module_versions WHERE module_id = ? AND version = ? AND status = 'published'",
      )
        .bind(mod.id, ver)
        .first();
    } else {
      versionRow = await db.prepare(
        "SELECT * FROM module_versions WHERE module_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1",
      )
        .bind(mod.id)
        .first();
    }

    if (!versionRow) {
      missing.push(`${mod.name}@${ver || 'latest'}`);
      return null;
    }

    // Get dependencies
    const deps = await db.prepare(
      'SELECT * FROM module_dependencies WHERE module_version_id = ?',
    )
      .bind(versionRow.id as string)
      .all();

    const childDeps: DependencyNode[] = [];
    for (const dep of deps.results || []) {
      const child = await resolve(dep.depends_on_module as string, dep.version_range as string);
      if (child) childDeps.push(child);
    }

    const node: DependencyNode = {
      module_name: mod.name,
      version: versionRow.version as string,
      version_id: versionRow.id as string,
      dependencies: childDeps,
    };
    resolved.push(node);
    return node;
  }

  await resolve(moduleId, version);

  return { resolved, missing, conflicts: [] };
}

// ── Event Emission ───────────────────────────────────────────

async function emitEvent(
  env: Env,
  event: Omit<PlatformEvent, 'id' | 'metadata' | 'version' | 'created_at'>,
): Promise<void> {
  const fullEvent: PlatformEvent = {
    id: crypto.randomUUID(),
    ...event,
    metadata: { trace_id: crypto.randomUUID() },
    version: '1.0',
    created_at: new Date().toISOString(),
  };

  try {
    // Persist to D1
    await env.DB.prepare(
      `INSERT INTO platform_events (id, tenant_id, event_type, source, subject, data, metadata, version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        fullEvent.id,
        fullEvent.tenant_id,
        fullEvent.event_type,
        fullEvent.source,
        fullEvent.subject || null,
        JSON.stringify(fullEvent.data),
        JSON.stringify(fullEvent.metadata),
        fullEvent.version,
        fullEvent.created_at,
      )
      .run();

    // Send to queue if available
    if (env.EVENTS_QUEUE) {
      await env.EVENTS_QUEUE.send(fullEvent);
    }
  } catch (err) {
    console.error('Failed to emit event:', err);
  }
}

// ── Row Parsers ──────────────────────────────────────────────

function parseModuleRow(row: Record<string, unknown>): Module {
  return {
    ...row,
    capabilities: safeJsonParse(row.capabilities as string, []),
    required_bindings: safeJsonParse(row.required_bindings as string, []),
    install_count: Number(row.install_count || 0),
    rating_sum: Number(row.rating_sum || 0),
    rating_count: Number(row.rating_count || 0),
  } as unknown as Module;
}

function parseVersionRow(row: Record<string, unknown>): ModuleVersion {
  return {
    ...row,
    compatibility_flags: safeJsonParse(row.compatibility_flags as string, []),
    wrangler_overrides: safeJsonParse(row.wrangler_overrides as string, {}),
    bundle_size: Number(row.bundle_size || 0),
  } as unknown as ModuleVersion;
}

function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

// ── Export ────────────────────────────────────────────────────

export default app;