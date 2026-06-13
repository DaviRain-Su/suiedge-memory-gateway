/**
 * Run pending migrations and exit. Idempotent.
 * Usage: pnpm db:migrate
 */
import { openStore, closeStore } from '../src/lib/store.js';

openStore();
console.log('migrations applied');
closeStore();
