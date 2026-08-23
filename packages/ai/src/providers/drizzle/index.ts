import { Layer } from 'effect';
import type postgres from 'postgres';
import { ConversationStoreLayer } from './conversation';
import { StoreDrizzle } from './store';

export const createDrizzleStoreLayer = (
	conn: postgres.Sql,
	opts?: {
		store?: Parameters<typeof StoreDrizzle.createLayer>[1];
	},
) =>
	Layer.provide(
		ConversationStoreLayer,
		StoreDrizzle.createLayer(conn, opts?.store),
	);
