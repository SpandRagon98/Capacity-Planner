import { NextResponse } from 'next/server';
import { authorizedEmail, database, parseWorkspace } from '@/lib/server/workspace-db';
import type { Workspace } from '@/lib/planner';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

async function findWorkspace(id: string, email: string) {
  return database().prepare(`
    SELECT w.id, w.name, w.description, w.data_json AS dataJson,
           w.created_by AS createdBy, w.created_at AS createdAt,
           w.updated_at AS updatedAt, w.version, m.role
    FROM workspaces w
    INNER JOIN workspace_members m ON m.workspace_id = w.id
    WHERE w.id = ? AND m.email = ?
  `).bind(id, email).first<{ id: string; name: string; description: string; dataJson: string; createdBy: string; createdAt: string; updatedAt: string; version: number; role: 'owner' | 'editor' }>();
}

export async function GET(request: Request, context: RouteContext) {
  const email = authorizedEmail(request);
  if (!email) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const { id } = await context.params;
  const record = await findWorkspace(id, email);
  if (!record) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  return NextResponse.json({ workspace: parseWorkspace(record.dataJson), meta: { id: record.id, name: record.name, description: record.description, updatedAt: record.updatedAt, version: record.version, role: record.role } });
}

export async function PUT(request: Request, context: RouteContext) {
  const email = authorizedEmail(request);
  if (!email) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const { id } = await context.params;
  const input = await request.json().catch(() => null) as { workspace?: Workspace; expectedVersion?: number } | null;
  if (!input?.workspace || !Array.isArray(input.workspace.tasks) || !Array.isArray(input.workspace.plans) || !Array.isArray(input.workspace.activity) || !Number.isInteger(input.expectedVersion)) {
    return NextResponse.json({ error: 'Invalid workspace data' }, { status: 400 });
  }
  const expectedVersion = input.expectedVersion as number;
  const now = new Date().toISOString();
  const result = await database().prepare(`
    UPDATE workspaces
    SET data_json = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND version = ?
      AND EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = ? AND email = ?)
  `).bind(JSON.stringify(input.workspace), now, id, expectedVersion, id, email).run();
  if (result.meta.changes === 0) {
    const current = await findWorkspace(id, email);
    if (!current) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    return NextResponse.json({ error: 'Workspace changed by another member', workspace: parseWorkspace(current.dataJson), meta: { version: current.version, updatedAt: current.updatedAt } }, { status: 409 });
  }
  return NextResponse.json({ saved: true, version: expectedVersion + 1, updatedAt: now });
}
