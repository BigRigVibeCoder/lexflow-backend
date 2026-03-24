/**
 * @file drizzle.config.ts
 * @description Drizzle Kit configuration for the Trust database.
 * REF: AGT-003-BE §6 (Database: lexflow_trust)
 */

import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://lexflow_trust:changeme@localhost:5432/lexflow_trust',
  },
});
