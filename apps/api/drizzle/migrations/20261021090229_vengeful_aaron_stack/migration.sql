CREATE TYPE "payment_claim_status" AS ENUM('pending', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TYPE "share_attachment_mode" AS ENUM('hidden', 'shown');--> statement-breakpoint
CREATE TYPE "share_pay_button_mode" AS ENUM('hidden', 'shown');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"transaction_id" integer,
	"key" text NOT NULL UNIQUE,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_shares" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"token" text NOT NULL UNIQUE,
	"message" text,
	"from_date" date,
	"to_date" date,
	"expires_on" date,
	"password_hash" text,
	"secret" text NOT NULL,
	"upi_id" text,
	"payee_name" text,
	"pay_button" "share_pay_button_mode" DEFAULT 'hidden'::"share_pay_button_mode" NOT NULL,
	"attachments" "share_attachment_mode" DEFAULT 'hidden'::"share_attachment_mode" NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_claims" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"share_id" integer,
	"amount" bigint NOT NULL,
	"payer_name" text,
	"reference" text,
	"status" "payment_claim_status" DEFAULT 'pending'::"payment_claim_status" NOT NULL,
	"decided_at" timestamp with time zone,
	"transaction_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "splits" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "splits" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shortcuts" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_client_uq" ON "transfers" ("user_id","client_id") WHERE "client_id" is not null;--> statement-breakpoint
CREATE INDEX "attachments_transaction_idx" ON "attachments" ("transaction_id");--> statement-breakpoint
CREATE INDEX "attachments_user_idx" ON "attachments" ("user_id","size");--> statement-breakpoint
CREATE INDEX "book_shares_book_idx" ON "book_shares" ("book_id");--> statement-breakpoint
CREATE INDEX "book_shares_user_idx" ON "book_shares" ("user_id");--> statement-breakpoint
CREATE INDEX "payment_claims_book_pending_idx" ON "payment_claims" ("book_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "payment_claims_book_idx" ON "payment_claims" ("book_id");--> statement-breakpoint
CREATE INDEX "payment_claims_user_idx" ON "payment_claims" ("user_id");--> statement-breakpoint
CREATE INDEX "payment_claims_share_idx" ON "payment_claims" ("share_id") WHERE "share_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_claims_transaction_idx" ON "payment_claims" ("transaction_id") WHERE "transaction_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_client_uq" ON "settlements" ("user_id","client_id") WHERE "client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "splits_client_uq" ON "splits" ("user_id","client_id") WHERE "client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_client_uq" ON "transactions" ("user_id","client_id") WHERE "client_id" is not null;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transaction_id_transactions_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "book_shares" ADD CONSTRAINT "book_shares_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "book_shares" ADD CONSTRAINT "book_shares_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_share_id_book_shares_id_fkey" FOREIGN KEY ("share_id") REFERENCES "book_shares"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_transaction_id_transactions_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;