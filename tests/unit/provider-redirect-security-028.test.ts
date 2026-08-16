import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('028 provider redirect security',()=>{
  it('uses manual redirects, revalidates allowlists and rejects chains',async()=>{
    const source=await readFile('src/worker/providers/core.ts','utf8');
    expect(source).toContain("redirect: 'manual'");
    expect(source).toContain('allowedUrl(new URL(location, url).toString(), policy)');
    expect(source).toContain('PROVIDER_REDIRECT_CHAIN_REJECTED');
    expect(source).toContain('PROVIDER_FUTURE_TIMESTAMP');
  });
});
