import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('028 rain truth UI contract',()=>{
  it('requires connected, current source and validUntil before showing a numeric rate',async()=>{
    const source=await readFile('src/client/features/rain/RainContext.tsx','utf8');
    expect(source).toContain("source.freshness === 'ACTUALIZADO'");
    expect(source).toContain("Date.parse(source.validUntil!) >= Date.parse(snapshot.generatedAt)");
    expect(source).toContain('Sin estimación reciente');
    expect(source).not.toContain('Estimación satelital instantánea');
  });
});
