import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: ['./node_modules/ff-ai/src/providers/drizzle/schema.ts'],
	dbCredentials: {
		url: process.env.DATABASE_URL,
	},
});
