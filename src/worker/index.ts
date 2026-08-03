import { routeRequest, type WorkerEnv } from './router';
import { errorResponse } from './responses';
import { withSecurityHeaders } from './security';

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
};
