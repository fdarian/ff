import { Data } from "effect";

export class StoreError extends Data.TaggedError('ff-ai/StoreError')<{
	message: string;
	cause?: unknown;
}> {
	constructor(message: string, opts?: { cause?: unknown }) {
		super({ message, ...opts });
	}
}
