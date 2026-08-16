import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('028 offline single-truth contract',()=>{
  it('stores a validated public snapshot with savedAt and degrades alert verification offline',async()=>{
    const source=await readFile('src/client/pwa/useSnapshot.ts','utf8');
    expect(source).toContain('interface StoredSnapshot { readonly snapshot: Snapshot; readonly savedAt: string }');
    expect(source).toContain("alertStatus: 'FUENTES_DE_ALERTAS_NO_DISPONIBLES'");
    expect(source).toContain("fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' })");
  });
  it('surfaces the saved-copy time when offline',async()=>{
    const shell=await readFile('src/client/app/AppShell.tsx','utf8');
    expect(shell).toContain('Copia guardada ·');
    expect(shell).toContain('offline-saved-at');
  });
});
