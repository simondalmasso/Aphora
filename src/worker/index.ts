import { purgeExpiredPrivateData } from './retention';
import { routeRequest, type WorkerEnv } from './router';
import { errorResponse } from './responses';
import { withSecurityHeaders } from './security';

interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void }
interface ScheduledControllerLike { readonly scheduledTime: number; readonly cron: string }

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const response = await routeRequest(request, env);
      return withSecurityHeaders(response);
    } catch {
      console.error(JSON.stringify({ level: 'error', event: 'request_failed', at: new Date().toISOString() }));
      return errorResponse('INTERNAL_ERROR', 'No se pudo completar la solicitud', 500);
    }
  },
  async scheduled(controller: ScheduledControllerLike, env: WorkerEnv, ctx: ExecutionContextLike): Promise<void> {
    const operation = purgeExpiredPrivateData(env, new Date(controller.scheduledTime)).then((result) => {
      console.info(JSON.stringify({ level: 'info', event: 'retention_purge_completed', cron: controller.cron, deletedPhotos: result.deletedPhotos, pendingPhotos: result.pendingPhotos, at: result.completedAt }));
    }).catch(() => {
      console.error(JSON.stringify({ level: 'error', event: 'retention_purge_failed', cron: controller.cron, at: new Date(controller.scheduledTime).toISOString() }));
      throw new Error('RETENTION_PURGE_FAILED');
    });
    ctx.waitUntil(operation);
  },
};
