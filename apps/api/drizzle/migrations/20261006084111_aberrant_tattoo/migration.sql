CREATE TYPE "account_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "account_type" AS ENUM('bank', 'cash', 'credit_card', 'wallet', 'other');--> statement-breakpoint
CREATE TYPE "book_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "book_totals" AS ENUM('included', 'separate');--> statement-breakpoint
CREATE TYPE "category_origin" AS ENUM('system', 'custom');--> statement-breakpoint
CREATE TYPE "frequency" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "txn_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "recurring_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "own_share_mode" AS ENUM('recorded', 'skipped');--> statement-breakpoint
CREATE TYPE "relation" AS ENUM('friend', 'office', 'family', 'other');--> statement-breakpoint
CREATE TYPE "settlement_direction" AS ENUM('received', 'paid');--> statement-breakpoint
CREATE TYPE "shared_split_decision" AS ENUM('added', 'skipped');--> statement-breakpoint
CREATE TYPE "split_method" AS ENUM('equal', 'exact', 'percent', 'shares');--> statement-breakpoint
CREATE TYPE "auth_state" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "otp_purpose" AS ENUM('register', 'reset_password');--> statement-breakpoint
CREATE TYPE "tagged_expense_mode" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" DEFAULT 'bank'::"account_type" NOT NULL,
	"icon" text DEFAULT 'landmark' NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"status" "account_status" DEFAULT 'active'::"account_status" NOT NULL,
	"archived_at" timestamp with time zone,
	"default_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_user_name" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"from_account_id" integer NOT NULL,
	"to_account_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'book-open' NOT NULL,
	"color" text DEFAULT '#7c3aed' NOT NULL,
	"note" text,
	"totals" "book_totals" DEFAULT 'included'::"book_totals" NOT NULL,
	"status" "book_status" DEFAULT 'active'::"book_status" NOT NULL,
	"archived_at" timestamp with time zone,
	"default_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_user_name" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_user_category" UNIQUE("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "txn_type" NOT NULL,
	"icon" text DEFAULT 'circle' NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"origin" "category_origin" DEFAULT 'custom'::"category_origin" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_user_type_name" UNIQUE("user_id","type","name")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'party-popper' NOT NULL,
	"color" text DEFAULT '#db2777' NOT NULL,
	"start_date" date,
	"end_date" date,
	"budget" bigint,
	"active_since" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" serial PRIMARY KEY,
	"goal_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"target" bigint NOT NULL,
	"target_date" date,
	"color" text DEFAULT '#10b981' NOT NULL,
	"icon" text DEFAULT 'piggy-bank' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"type" "txn_type" NOT NULL,
	"amount" bigint NOT NULL,
	"category_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"note" text,
	"frequency" "frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_run_date" date NOT NULL,
	"status" "recurring_status" DEFAULT 'active'::"recurring_status" NOT NULL,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"relation" "relation" DEFAULT 'friend'::"relation" NOT NULL,
	"linked_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_user_linked_unique" UNIQUE("user_id","linked_user_id")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"group_id" integer,
	"direction" "settlement_direction" NOT NULL,
	"amount" bigint NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_split_prefs" (
	"split_id" integer,
	"user_id" integer,
	"decision" "shared_split_decision" NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_split_prefs_pkey" PRIMARY KEY("split_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "split_group_members" (
	"group_id" integer,
	"person_id" integer,
	CONSTRAINT "split_group_members_pkey" PRIMARY KEY("group_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "split_groups" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'users' NOT NULL,
	"color" text DEFAULT '#0d9488' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_shares" (
	"id" serial PRIMARY KEY,
	"split_id" integer NOT NULL,
	"person_id" integer,
	"amount" bigint NOT NULL,
	"value" double precision
);
--> statement-breakpoint
CREATE TABLE "splits" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"group_id" integer,
	"description" text NOT NULL,
	"total" bigint NOT NULL,
	"date" date NOT NULL,
	"paid_by_person_id" integer,
	"method" "split_method" DEFAULT 'equal'::"split_method" NOT NULL,
	"category_id" integer,
	"own_share" "own_share_mode" DEFAULT 'recorded'::"own_share_mode" NOT NULL,
	"account_id" integer,
	"event_id" integer,
	"book_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"type" "txn_type" NOT NULL,
	"amount" bigint NOT NULL,
	"category_id" integer NOT NULL,
	"date" date NOT NULL,
	"account_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"event_id" integer,
	"note" text,
	"original_amount" bigint,
	"original_currency" text,
	"fx_rate" double precision,
	"split_id" integer,
	"shared_split_id" integer,
	"recurring_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" integer PRIMARY KEY,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config_history" (
	"id" serial PRIMARY KEY,
	"modified_by" integer,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auths" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"token" text NOT NULL UNIQUE,
	"state" "auth_state" DEFAULT 'active'::"auth_state" NOT NULL,
	"device" text DEFAULT 'unknown' NOT NULL,
	"ip" text,
	"details" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_otps" (
	"id" serial PRIMARY KEY,
	"email" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"credential_id" text NOT NULL UNIQUE,
	"public_key" text NOT NULL,
	"algorithm" text NOT NULL,
	"transports" jsonb DEFAULT '[]' NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"user_id" integer,
	"blocked_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_pkey" PRIMARY KEY("user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"username" text NOT NULL UNIQUE,
	"username_changed_at" timestamp with time zone,
	"tagged_expenses" "tagged_expense_mode" DEFAULT 'manual'::"tagged_expense_mode" NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user'::"user_role" NOT NULL,
	"monthly_budget" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_default_uq" ON "accounts" ("user_id") WHERE "default_since" is not null;--> statement-breakpoint
CREATE INDEX "transfers_user_date_idx" ON "transfers" ("user_id","date","id");--> statement-breakpoint
CREATE INDEX "transfers_from_account_idx" ON "transfers" ("from_account_id","amount");--> statement-breakpoint
CREATE INDEX "transfers_to_account_idx" ON "transfers" ("to_account_id","amount");--> statement-breakpoint
CREATE UNIQUE INDEX "books_user_default_uq" ON "books" ("user_id") WHERE "default_since" is not null;--> statement-breakpoint
CREATE INDEX "events_user_idx" ON "events" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_user_active_uq" ON "events" ("user_id") WHERE "active_since" is not null;--> statement-breakpoint
CREATE INDEX "goal_contributions_goal_idx" ON "goal_contributions" ("goal_id","date");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_user_idx" ON "recurring_rules" ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_due_idx" ON "recurring_rules" ("next_run_date") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "recurring_category_idx" ON "recurring_rules" ("category_id");--> statement-breakpoint
CREATE INDEX "recurring_account_idx" ON "recurring_rules" ("account_id");--> statement-breakpoint
CREATE INDEX "recurring_book_idx" ON "recurring_rules" ("book_id");--> statement-breakpoint
CREATE INDEX "people_user_idx" ON "people" ("user_id");--> statement-breakpoint
CREATE INDEX "people_linked_user_idx" ON "people" ("linked_user_id") WHERE "linked_user_id" is not null;--> statement-breakpoint
CREATE INDEX "settlements_user_person_idx" ON "settlements" ("user_id","person_id");--> statement-breakpoint
CREATE INDEX "settlements_person_idx" ON "settlements" ("person_id");--> statement-breakpoint
CREATE INDEX "shared_split_prefs_user_idx" ON "shared_split_prefs" ("user_id");--> statement-breakpoint
CREATE INDEX "split_group_members_person_idx" ON "split_group_members" ("person_id");--> statement-breakpoint
CREATE INDEX "split_groups_user_idx" ON "split_groups" ("user_id");--> statement-breakpoint
CREATE INDEX "split_shares_split_idx" ON "split_shares" ("split_id");--> statement-breakpoint
CREATE INDEX "split_shares_person_idx" ON "split_shares" ("person_id") WHERE "person_id" is not null;--> statement-breakpoint
CREATE INDEX "splits_user_date_idx" ON "splits" ("user_id","date","id");--> statement-breakpoint
CREATE INDEX "splits_book_idx" ON "splits" ("book_id") WHERE "book_id" is not null;--> statement-breakpoint
CREATE INDEX "splits_group_idx" ON "splits" ("group_id") WHERE "group_id" is not null;--> statement-breakpoint
CREATE INDEX "splits_paid_by_idx" ON "splits" ("paid_by_person_id") WHERE "paid_by_person_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" ("user_id","date","id");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" ("account_id","type","amount");--> statement-breakpoint
CREATE INDEX "transactions_book_idx" ON "transactions" ("book_id","type","amount");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" ("category_id","date");--> statement-breakpoint
CREATE INDEX "transactions_event_idx" ON "transactions" ("event_id","date") WHERE "event_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_split_idx" ON "transactions" ("split_id") WHERE "split_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_shared_split_idx" ON "transactions" ("shared_split_id","user_id") WHERE "shared_split_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_recurring_idx" ON "transactions" ("recurring_id") WHERE "recurring_id" is not null;--> statement-breakpoint
CREATE INDEX "auths_user_idx" ON "auths" ("user_id");--> statement-breakpoint
CREATE INDEX "auths_active_idx" ON "auths" ("expires_at") WHERE "state" = 'active';--> statement-breakpoint
CREATE INDEX "email_otps_email_purpose_idx" ON "email_otps" ("email","purpose");--> statement-breakpoint
CREATE INDEX "passkeys_user_idx" ON "passkeys" ("user_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" ("blocked_user_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_accounts_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_accounts_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id");--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id");--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_linked_user_id_users_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_person_id_people_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_split_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "split_groups"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "shared_split_prefs" ADD CONSTRAINT "shared_split_prefs_split_id_splits_id_fkey" FOREIGN KEY ("split_id") REFERENCES "splits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shared_split_prefs" ADD CONSTRAINT "shared_split_prefs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "split_group_members" ADD CONSTRAINT "split_group_members_group_id_split_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "split_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "split_group_members" ADD CONSTRAINT "split_group_members_person_id_people_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "split_groups" ADD CONSTRAINT "split_groups_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_split_id_splits_id_fkey" FOREIGN KEY ("split_id") REFERENCES "splits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_person_id_people_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_group_id_split_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "split_groups"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_paid_by_person_id_people_id_fkey" FOREIGN KEY ("paid_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_split_id_splits_id_fkey" FOREIGN KEY ("split_id") REFERENCES "splits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_shared_split_id_splits_id_fkey" FOREIGN KEY ("shared_split_id") REFERENCES "splits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_id_recurring_rules_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "recurring_rules"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "system_config_history" ADD CONSTRAINT "system_config_history_modified_by_users_id_fkey" FOREIGN KEY ("modified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "auths" ADD CONSTRAINT "auths_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE CASCADE;