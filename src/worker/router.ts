import { demoSnapshot, DEMO_REFERENCE_AT } from '../data/demo-snapshot';
import { visibleMessages } from '../domain/messages';
import { errorResponse, jsonResponse } from './responses';
import { liteResponse } from './lite';

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  readonly ASSETS: AssetFetcher;
}

const API_PATHS = new Set(['/api/health', '/api/snapshot', '/api/sources', '/api/messages']);

function apiResponse(pathname: string): Response {
  switch (pathname) {
    case '/api/health':
      return jsonResponse({ service: 'sos-sf', status: 'healthy', dataMode: 'DEMO_FIXTURES', snapshotId: demoSnapshot.id }, { cacheControl: 'no-store' });
    case '/api/snapshot':
      return jsonResponse(demoSnapshot, { generatedAt: demoSnapshot.generatedAt });
    case '/api/sources':
      return jsonResponse({ snapshotId: demoSnapshot.id, sources: demoSnapshot.sources, contradictions: demoSnapshot.contradictions }, { generatedAt: demoSnapshot.generatedAt });
    case '/api/messages':
      return jsonResponse({ snapshotId: demoSnapshot.id, messages: visibleMessages(demoSnapshot.messages, new Date(DEMO_REFERENCE_AT)), deliveryClaims: 'NONE' }, { generatedAt: demoSnapshot.generatedAt });
    default:
      return errorResponse('NOT_FOUND', 'Ruta API inexistente', 404);
  }
}

export async function routeRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const isHead = request.method === 'HEAD';
  if (url.pathname.startsWith('/api/') || url.pathname === '/lite') {
    if (request.method !== 'GET' && !isHead) return errorResponse('METHOD_NOT_ALLOWED', 'Sólo se admite lectura por GET o HEAD', 405);
    const response = url.pathname === '/lite' ? liteResponse() : API_PATHS.has(url.pathname) ? apiResponse(url.pathname) : errorResponse('NOT_FOUND', 'Ruta API inexistente', 404);
    return isHead ? new Response(null, response) : response;
  }
  if (request.method !== 'GET' && !isHead) return errorResponse('METHOD_NOT_ALLOWED', 'Método no admitido', 405);
  return env.ASSETS.fetch(request);
}
