import { vi } from 'vitest';

/**
 * Creates a chainable mock that resolves to the given value.
 * Supports Drizzle's fluent API: db.select().from().where().returning() etc.
 */
export function createChain(resolvedValue: unknown = []) {
  const chain: Record<string, any> = {};
  const methods = [
    'from', 'where', 'values', 'returning', 'set',
    'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin',
    'onConflictDoNothing', 'onConflictDoUpdate',
  ];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Make it thenable so `await` resolves to the configured value
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  chain.catch = (reject: (e: unknown) => void) =>
    Promise.resolve(resolvedValue).catch(reject);

  return chain;
}

/**
 * Creates a mock transaction function.
 * Pass a factory that configures `tx` mock methods per test.
 */
export function mockTransaction(db: any) {
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: any) => Promise<void>) => {
      const tx: Record<string, any> = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      // Store tx on db so tests can configure it before the callback runs
      db._tx = tx;
      return fn(tx);
    },
  );
}
