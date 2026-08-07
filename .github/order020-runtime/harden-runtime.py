from pathlib import Path

path = Path('node_modules/.tmp/order020-runtime.mjs')
text = path.read_text()

old_run = "  return execFileSync(command, args, { encoding: 'utf8', stdio: options.stdio || ['ignore', 'pipe', 'pipe'], ...options }).trim();"
new_run = "  const output = execFileSync(command, args, { encoding: 'utf8', stdio: options.stdio || ['ignore', 'pipe', 'pipe'], ...options });\n  return typeof output === 'string' ? output.trim() : '';"
old_required = "  const required = ['GOOGLE_CLIENT_ID','SESSION_SIGNING_KEY','SOS_SF_OPERATOR_EMAILS'];\n  const missing = required.filter((name) => !String(process.env[name] || '').trim());\n  if (missing.length) throw new Error(`PROTECTED_CONFIGURATION_MISSING:${missing.join(',')}`);"
new_required = "  if (!String(process.env.GOOGLE_CLIENT_ID || '').trim()) throw new Error('PROTECTED_CONFIGURATION_MISSING:GOOGLE_CLIENT_ID');\n  const requiredExistingSecrets = ['SESSION_SIGNING_KEY','SOS_SF_OPERATOR_EMAILS'];\n  const missingExistingSecrets = requiredExistingSecrets.filter((name) => !baseline.secretNames.includes(name));\n  if (missingExistingSecrets.length) throw new Error(`EXISTING_CLOUDFLARE_SECRETS_MISSING:${missingExistingSecrets.join(',')}`);"
old_secret_block = "  const secretPayload = {\n    SESSION_SIGNING_KEY: String(process.env.SESSION_SIGNING_KEY),\n    SOS_SF_OPERATOR_EMAILS: String(process.env.SOS_SF_OPERATOR_EMAILS),\n    ...(String(process.env.MESSAGE_BLOCKLIST || '') ? { MESSAGE_BLOCKLIST: String(process.env.MESSAGE_BLOCKLIST) } : {}),\n  };\n  await writeFile('.worker-secrets.json', `${JSON.stringify(secretPayload)}\\n`, { mode: 0o600 });\n\n"
old_deploy = "spawnSync('npx', ['wrangler','deploy','--config','wrangler.generated.jsonc','--secrets-file','.worker-secrets.json'], { encoding: 'utf8' })"
new_deploy = "spawnSync('npx', ['wrangler','deploy','--config','wrangler.generated.jsonc'], { encoding: 'utf8' })"

for old, new, label in [
    (old_run, new_run, 'null-safe command output'),
    (old_required, new_required, 'existing-secret gate'),
    (old_secret_block, '', 'secret rewrite removal'),
    (old_deploy, new_deploy, 'single deploy command'),
]:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} replacement count={count}')
    text = text.replace(old, new)

path.write_text(text)
