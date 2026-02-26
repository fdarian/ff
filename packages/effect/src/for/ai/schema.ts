import { jsonSchema as aiJsonSchema } from 'ai';
import { Either, JSONSchema, Schema } from 'effect';

export function effectSchema<A, I>(schema: Schema.Schema<A, I>) {
	const decode = Schema.decodeUnknownEither(schema);
	return aiJsonSchema<A>(JSONSchema.make(schema), {
		validate: (value) => {
			const result = decode(value);
			if (Either.isRight(result)) {
				return { success: true as const, value: result.right };
			}
			return { success: false as const, error: new Error(String(result.left)) };
		},
	});
}

export const describe =
	(d: string) =>
	<A, I, R>(self: Schema.Schema<A, I, R>) =>
		self.annotations({ description: d });
