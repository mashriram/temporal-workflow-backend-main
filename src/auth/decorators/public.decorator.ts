import { SetMetadata } from '@nestjs/common';

// Marks a route as exempt from the global JwtAuthGuard — the webhook
// endpoint (called by external systems), the engine's own two backend
// calls (GET /integrations at boot, POST /environments/:id/resolve at
// run time — neither carries a logged-in user's token), and the auth
// endpoints themselves (register/login must be reachable pre-auth).
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
