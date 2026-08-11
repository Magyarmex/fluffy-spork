import { bootstrapApplication } from '@app/bootstrap';

void bootstrapApplication().catch((error: unknown) => {
  console.error('[NOVA shell] Unhandled startup failure:', error);
});
