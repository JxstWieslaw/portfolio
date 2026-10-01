-- Undoes 0000_content_tables. Children first: their foreign keys reference the parents.
DROP TABLE "skills";
DROP TABLE "skill_groups";
DROP TABLE "experiences";
DROP TABLE "project_outcomes";
DROP TABLE "projects";
DROP TABLE "domains";
DROP TABLE "profile";
DROP TABLE "seed_runs";
