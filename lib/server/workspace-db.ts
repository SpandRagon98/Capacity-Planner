import { env } from 'cloudflare:workers';
import type { Workspace } from '@/lib/planner';

export const SHARED_MEMBER_EMAILS = ['spandan@gmail.com', 'mandhya@gmail.com'] as const;

type Statement = {
  bind: (...values: unknown[]) => Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

type Database = {
  prepare: (sql: string) => Statement;
  batch: (statements: Statement[]) => Promise<unknown[]>;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  description: string;
  dataJson: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  role?: 'owner' | 'editor';
};

export function database() {
  return (env as unknown as { DB: Database }).DB;
}

export function emptyWorkspace(): Workspace {
  return { tasks: [], plans: [], activity: [] };
}

export function authorizedEmail(request: Request) {
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (email && SHARED_MEMBER_EMAILS.includes(email as (typeof SHARED_MEMBER_EMAILS)[number])) return email;
  const host = request.headers.get('host') || '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return 'spandan@gmail.com';
  return null;
}

export function workspaceId() {
  return `WS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function parseWorkspace(value: string): Workspace {
  const parsed = JSON.parse(value) as Partial<Workspace>;
  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    plans: Array.isArray(parsed.plans) ? parsed.plans : [],
    activity: Array.isArray(parsed.activity) ? parsed.activity : [],
  };
}
