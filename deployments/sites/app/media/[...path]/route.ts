import { env } from 'cloudflare:workers';
import { handleMedia } from '../../server/service.mjs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleMedia(request, env);
export const HEAD = GET;
