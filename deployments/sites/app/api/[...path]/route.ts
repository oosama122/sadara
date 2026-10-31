import { env } from 'cloudflare:workers';
import { handleApi } from '../../server/service.mjs';
export const dynamic = 'force-dynamic';
const handle = (request: Request) => handleApi(request, env);
export { handle as GET, handle as POST, handle as PUT, handle as DELETE, handle as PATCH, handle as OPTIONS, handle as HEAD };
