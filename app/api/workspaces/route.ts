import { NextResponse } from 'next/server';
import {
  authorizedEmail, database, emptyWorkspace, SHARED_MEMBER_EMAILS, workspaceId,
} from '@/lib/server/workspace-db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const email = authorizedEmail(request);
  if (!email) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const { results } = await database().prepare(`
    SELECT w.id, w.name, w.description, w.updated_at AS updatedAt,
           w.version, m.role
    FROM workspaces w
    INNER JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.email = ?
    ORDER BY w.updated_at DESC
  `).bind(email).all<{ id: string; name: string; description: string; updatedAt: string; version: number; role: string }>();
  return NextResponse.json({ workspaces: results, email });
}

export async function POST(request: Request) {
  const email = authorizedEmail(request);
  if (!email) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const input = await request.json().catch(() => null) as { name?: unknown; description?: unknown } | null;
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (!name) return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
  const description = typeof input?.description === 'string' ? input.description.trim().slice(0, 240) : '';
  const id = workspaceId();
  const now = new Date().toISOString();
  const db = database();
  const statements = [
    db.prepare(`INSERT INTO workspaces (id, name, description, data_json, created_by, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).bind(id, name, description, JSON.stringify(emptyWorkspace()), email, now, now),
    ...SHARED_MEMBER_EMAILS.map((memberEmail) => db.prepare(`INSERT INTO workspace_members (workspace_id, email, role, joined_at) VALUES (?, ?, ?, ?)`).bind(id, memberEmail, memberEmail === email ? 'owner' : 'editor', now)),
  ];
  await db.batch(statements);
  return NextResponse.json({ workspace: { id, name, description, updatedAt: now, version: 1, role: 'owner' } }, { status: 201 });
}
