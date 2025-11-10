CREATE SCHEMA "ff_ai";
--> statement-breakpoint
CREATE TABLE "ff_ai"."messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid NOT NULL,
	"threadId" bigint NOT NULL,
	"aiSdkV5" jsonb,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "messages_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "ff_ai"."threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"resourceId" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "threads_resourceId_publicId_unique" UNIQUE("resourceId","publicId")
);
--> statement-breakpoint
ALTER TABLE "ff_ai"."messages" ADD CONSTRAINT "messages_threadId_threads_id_fk" FOREIGN KEY ("threadId") REFERENCES "ff_ai"."threads"("id") ON DELETE cascade ON UPDATE no action;