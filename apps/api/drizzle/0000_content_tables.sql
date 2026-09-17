CREATE TABLE "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"blurb" text NOT NULL,
	"accent" text NOT NULL,
	"position" integer NOT NULL,
	"content_hash" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_accent" CHECK ("domains"."accent" in ('violet', 'cyan'))
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" text PRIMARY KEY NOT NULL,
	"org" text NOT NULL,
	"title" text NOT NULL,
	"period_from" text NOT NULL,
	"period_to" text,
	"location" text,
	"highlights" text[] NOT NULL,
	"placeholder" boolean NOT NULL,
	"position" integer NOT NULL,
	"content_hash" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"headline" text NOT NULL,
	"sub" text NOT NULL,
	"location" text NOT NULL,
	"email" text NOT NULL,
	"email_placeholder" boolean DEFAULT false NOT NULL,
	"availability" text NOT NULL,
	"roles" jsonb NOT NULL,
	"links" jsonb NOT NULL,
	"kpis" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_singleton" CHECK ("profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "project_outcomes" (
	"project_slug" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"placeholder" boolean NOT NULL,
	CONSTRAINT "project_outcomes_project_slug_position_pk" PRIMARY KEY("project_slug","position")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain_id" text NOT NULL,
	"role" text NOT NULL,
	"period_from" text NOT NULL,
	"period_to" text,
	"summary" text NOT NULL,
	"stack" text[] NOT NULL,
	"visibility" text NOT NULL,
	"featured" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"links" jsonb NOT NULL,
	"formation" text NOT NULL,
	"placeholder" boolean NOT NULL,
	"content_hash" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_visibility" CHECK ("projects"."visibility" in ('public', 'private', 'client'))
);
--> statement-breakpoint
CREATE TABLE "skill_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"content_hash" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"group_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "skills_group_id_position_pk" PRIMARY KEY("group_id","position"),
	CONSTRAINT "skills_level" CHECK ("skills"."level" in ('core', 'working', 'familiar'))
);
--> statement-breakpoint
CREATE TABLE "seed_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seed_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"git_sha" text NOT NULL,
	"content_hash" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dry_run" boolean NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_outcomes" ADD CONSTRAINT "project_outcomes_project_slug_projects_slug_fk" FOREIGN KEY ("project_slug") REFERENCES "public"."projects"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_group_id_skill_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."skill_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_sort_order_key" ON "projects" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "projects_domain_idx" ON "projects" USING btree ("domain_id");