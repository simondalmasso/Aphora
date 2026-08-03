# ARQ DEPLOY OVERRIDE — ONE-SHOT + GITHUB ACTIONS

```text
PROJECT=SOS-SF
ORDER_ID=SOS-SF-HUMAN-ARQ-WEBAPP-V1-ONE-SHOT-001
STATUS=ACTIVE_OVERRIDE
PRECEDENCE=THIS_FILE_OVER_CONFLICTING_DEPLOY_OR_EXECUTION_TEXT
EXECUTION_MODE=ONE_CONTINUOUS_RUN
INTERMEDIATE_OWNER_APPROVAL=NO
WAIT_FOR_AUD=NO
SECRETS_LOCATION=GITHUB_ACTIONS
SECRETS_READBACK=FORBIDDEN
```

Leer junto con `RULES_SOS_SF.md`, `AGENTS.md` y `START_HERE_ARQ.md`.

## Regla principal

ARQ debe construir la V1 completa **de una, de corrido**, como un único tramo largo. No debe detenerse entre arquitectura, frontend, Worker, PWA, tests, deployment, correcciones, evidencia y publicación del checkpoint. No debe enviar microactualizaciones ni pedir autorización después de commits o fases internas.

Un fallo de código, tests, build, workflow o deploy corregible no es una condición de parada: ARQ debe diagnosticar, corregir y repetir autónomamente.

Sólo puede detenerse antes del checkpoint por:

- repositorio incorrecto o acceso de escritura realmente imposible;
- riesgo inmediato de exposición de secretos;
- riesgo de sobrescribir una producción ajena no identificada;
- prohibición de seguridad de la plataforma;
- ausencia comprobada de una capacidad indispensable sin alternativa técnica.

## Secretos ya disponibles

Los siguientes secretos existen en GitHub Actions:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

ARQ no debe leerlos, imprimirlos, copiarlos, pedirlos ni almacenarlos. Debe consumirlos exclusivamente mediante GitHub Actions.

## Ruta canónica

```text
READ_ALL_INSTRUCTIONS
→ RESOLVE_REMOTE_BASELINES
→ DESIGN_AND_IMPLEMENT_COMPLETE_V1
→ RUN_LOCAL_TESTS_AND_BUILD
→ CREATE_GITHUB_ACTIONS_DEPLOY_WORKFLOW
→ COMMIT_AND_PUSH_MATERIAL_CHECKPOINT
→ RUN_OR_TRIGGER_DEPLOY_WORKFLOW
→ VERIFY_WORKERS_DEV_REMOTE
→ FIX_AND_REPEAT_UNTIL_GREEN
→ GENERATE_ARTIFACTS_AND_SCREENSHOTS
→ FINAL_COMMIT_AND_PUSH
→ PUBLISH_MATERIAL_CHECKPOINT
→ STOP
```

## Workflow obligatorio

Crear `.github/workflows/deploy-workers.yml` con `workflow_dispatch`, checkout, Node LTS, `npm ci`, typecheck, lint, tests, build y `wrangler deploy`, usando:

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

No usar Pages. Usar Workers + Static Assets en `workers.dev`. No custom domain ni routes en este tramo. No depender de `wrangler whoami` local: el run exitoso demuestra la autenticación.

## Condición de cierre

ARQ no puede declarar finalización sin:

```text
REMOTE_HEAD_SHA=RESOLVED
TYPECHECK=PASS
LINT=PASS
UNIT_AND_CONTRACT_TESTS=PASS
E2E=PASS_OR_EVIDENCED_PLATFORM_LIMITATION
BUILD=PASS
GITHUB_ACTIONS_RUN=COMPLETED_SUCCESS
CLOUDFLARE_DEPLOY=VERIFIED
WORKERS_DEV_URL=RESOLVED
REMOTE_HEALTH=PASS
REMOTE_DASHBOARD=PASS
REMOTE_LITE=PASS
ARTIFACTS=AVAILABLE
CHECKPOINT=PUBLISHED
AUD_READY=YES
```
