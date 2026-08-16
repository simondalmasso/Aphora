import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('028 civic cleanup',()=>{
  it('does not mark Inicio and Ríos as the same current page and removes the stale communications hash link',async()=>{
    const shell=await readFile('src/client/components/civic/MuniShell.tsx','utf8');
    const civic=await readFile('src/client/components/civic/CivicSystem.tsx','utf8');
    expect(shell).toContain("if (href.startsWith('/#')) return false");
    expect(shell).not.toContain("href=\"/#situacion-hidrica\" aria-current");
    expect(civic).not.toContain("{ label: 'Comunicaciones', href: '/#alertas' }");
  });
  it('removes government manifest classification',async()=>{
    const manifest=await readFile('public/manifest.webmanifest','utf8'); expect(manifest).not.toContain('government');
  });
});
