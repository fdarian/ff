import { Layer } from 'effect';
import type postgres from 'postgres';
import { ConversationStoreLayer } from './conversation';
import { StoreDrizzle } from './store';

export const createDrizzleStoreLayer = (conn: postgres.Sql) =>
	Layer.provide(ConversationStoreLayer, StoreDrizzle.createLayer(conn));
