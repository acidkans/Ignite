--
-- PostgreSQL database dump
--

\restrict dmHNRJ2KLCFpacQ6VJp5H56SCAm9oMhFf0N0hb4qrscv6yViDwlP7rWFEpMGRmW

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _TeamToUser; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."_TeamToUser" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id text NOT NULL,
    "userId" text,
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" text NOT NULL,
    diff jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: budget_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_line_items (
    id text NOT NULL,
    "versionId" text,
    "subtaskId" text,
    type text NOT NULL,
    description text NOT NULL,
    unit text NOT NULL,
    "unitCost" double precision NOT NULL,
    quantity double precision NOT NULL,
    "totalCost" double precision NOT NULL,
    margin double precision NOT NULL,
    "unitPrice" double precision NOT NULL,
    "totalPrice" double precision NOT NULL,
    comment text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "nodeId" text NOT NULL,
    discount double precision DEFAULT 0 NOT NULL
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id text NOT NULL,
    name text NOT NULL,
    size integer NOT NULL,
    "mimeType" text NOT NULL,
    path text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: hardware; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardware (
    id text NOT NULL,
    "serialNumber" text NOT NULL,
    name text NOT NULL,
    model text NOT NULL,
    manufacturer text NOT NULL,
    "productionYear" integer NOT NULL,
    "siteId" text NOT NULL
);


--
-- Name: node_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_permissions (
    id text NOT NULL,
    "nodeId" text NOT NULL,
    "userId" text,
    "roleType" text,
    permission text NOT NULL,
    "teamId" text
);


--
-- Name: order_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_requirements (
    id text NOT NULL,
    "nodeId" text NOT NULL,
    "versionId" text,
    "offerDeadline" timestamp(3) without time zone,
    "projectStart" timestamp(3) without time zone,
    "projectEnd" timestamp(3) without time zone,
    "projectGoal" text,
    "projectItems" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "wbsDescription" text,
    "clientContacts" text,
    "clientProjectManager" text,
    "clientProjectManagerEmail" text,
    "clientProjectManagerPhone" text,
    "budgetNotes" text,
    "offerStatus" text,
    "offerStatusComment" text
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id text NOT NULL,
    name text NOT NULL
);


--
-- Name: process_node_closure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_node_closure (
    "ancestorId" text NOT NULL,
    "descendantId" text NOT NULL,
    depth integer NOT NULL
);


--
-- Name: process_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_nodes (
    id text NOT NULL,
    "parentId" text,
    name text NOT NULL,
    type text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "ownerId" text,
    visibility text DEFAULT 'private'::text NOT NULL,
    address text,
    "contactPerson" text,
    "customTypeLabel" text,
    nip text,
    region text,
    "fileSize" integer,
    "mimeType" text,
    "storagePath" text
);


--
-- Name: project_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_versions (
    id text NOT NULL,
    "nodeId" text NOT NULL,
    label text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    notes text
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    "roleId" text NOT NULL,
    "permissionId" text NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id text NOT NULL,
    name text NOT NULL
);


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id text NOT NULL,
    number text,
    "structureType" text,
    "accessDesc" text,
    "additionalDesc" text,
    "drivingDesc" text,
    "shelterType" text,
    greenfield boolean DEFAULT false NOT NULL,
    "addressStreet" text,
    "addressCity" text,
    "addressZipCode" text,
    "addressCountry" text,
    "addressLatitude" double precision,
    "addressLongitude" double precision,
    "customData" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "contactEmail" text,
    "contactFirstName" text,
    "contactLastName" text,
    "contactPhone" text
);


--
-- Name: subtask_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subtask_files (
    id text NOT NULL,
    "subtaskId" text NOT NULL,
    name text NOT NULL,
    path text NOT NULL,
    size integer NOT NULL,
    "mimeType" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: subtask_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subtask_templates (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: subtasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subtasks (
    id text NOT NULL,
    "nodeId" text NOT NULL,
    "versionId" text,
    name text NOT NULL,
    description text,
    "plannedStart" timestamp(3) without time zone,
    "plannedEnd" timestamp(3) without time zone,
    "assignedUserId" text,
    status text DEFAULT 'NEW'::text NOT NULL,
    "visibilityType" text DEFAULT 'ALL'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    category text,
    phase text,
    "requirementItemId" text,
    "isAiGenerated" boolean DEFAULT false NOT NULL,
    "isApproved" boolean DEFAULT true NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: user_entity_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_entity_configs (
    id text NOT NULL,
    "userId" text NOT NULL,
    "entityType" text NOT NULL,
    config jsonb NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    "userId" text NOT NULL,
    "roleId" text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    "firstName" text,
    "lastName" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "supervisorId" text
);


--
-- Data for Name: _TeamToUser; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."_TeamToUser" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
73293a98-7ebf-46af-ae1b-204bb0216811	165e24974bc6b4d17e39878187bf2a9f37b3c9524a29f2acdbfcc35abc0f5724	2026-03-10 21:37:47.919308+00	20251228100338_init	\N	\N	2026-03-10 21:37:47.323156+00	1
8de57e89-01d0-4a0c-b279-d3d0e5e11872	b8e9c2fe6e5f80217818483fa79c1ab99532371713340405e9fa38e86601b593	2026-03-10 21:37:47.949114+00	20251228110337_add_supervisor	\N	\N	2026-03-10 21:37:47.925316+00	1
f30844cf-fe57-4678-b812-107f9196a511	cd5a574de85c05c89d030a77411d58ee1645ca46ffa1f2625e4b01c610acc780	2026-03-10 23:09:41.226289+00	20260310230941_add_budget_notes_to_requirements	\N	\N	2026-03-10 23:09:41.201518+00	1
9f7027fa-9b3b-4d0a-9ad9-f033fdd74a05	36f59de8134f0768ab3635c3b26e1148df673ad3ac5bd707b8374fd25812c349	2026-03-10 21:37:48.248916+00	20260214190249_add_site_entity_and_config	\N	\N	2026-03-10 21:37:47.955274+00	1
d1092531-4293-4596-b866-7c3123a6ce24	60649dc22b04343306450699feeab55f48c756363c2098ec5855fe61aba0fa65	2026-03-10 21:37:48.378365+00	20260216202736_add_team_permissions	\N	\N	2026-03-10 21:37:48.255298+00	1
fb673fd9-d032-464f-83a8-86603e1daeeb	eb898b0b96efb5884f309db031e173dd21c1428bf8a529381c26735293c2bd60	2026-03-10 21:37:48.491092+00	20260217075843_user_teams_many_to_many	\N	\N	2026-03-10 21:37:48.384581+00	1
80d6d7a2-c828-464d-9b41-b2de9a79e719	2dea2d9188ee474eb03bc2af5fc927e337ded3eb65bbf2749d7536fb819fa9e7	2026-03-10 23:21:42.428916+00	20260310232142_add_discount_to_budget_item	\N	\N	2026-03-10 23:21:42.376542+00	1
b4af3155-2c0a-4539-ab77-105451be006f	f4bed75d7986d877d6f73262ca9263b46a6dfbaa1d52bd73f7e014bc7e7d79b7	2026-03-10 21:37:48.882841+00	20260225175124_init_versioning_and_budget	\N	\N	2026-03-10 21:37:48.496646+00	1
36f35468-7518-4711-9e17-d12c69e03127	f0555940caa397b7efc6d1ebce44a909bd173bdce22aca99ef471f578558d908	2026-03-10 21:37:48.918201+00	20260225182806_add_wbs_description_and_task_phases	\N	\N	2026-03-10 21:37:48.888272+00	1
7cfd429f-9c71-48d0-8660-c9ebbb9cc1de	5d8f0bed278f0c14777bd9ba390e3526fa40243e91e7c7bea843f0fd254e93e7	2026-03-10 21:37:48.939897+00	20260225184729_add_ai_fields_to_subtask	\N	\N	2026-03-10 21:37:48.924038+00	1
2bc88558-bf97-4f98-807e-d7963a7f3d1c	2b2111678997bb00c6153d16f8a5b4ce025332ae5011345ad87231c70196b8a0	2026-03-10 23:57:54.609582+00	20260310235754_add_offer_status	\N	\N	2026-03-10 23:57:54.583209+00	1
47ddf120-1feb-4d33-8066-a9dd8e45e5d5	ffdc1dfdaa7d85176581e79defcbc94e237e9a6428120c50d481a4118a56f398	2026-03-10 21:37:49.057179+00	20260225195057_budget_nodeid	\N	\N	2026-03-10 21:37:48.945363+00	1
9f1f1a5f-98d0-4b5d-8b14-544f86035402	352d161504ae162c003a643c07ac6f05638764c10394fe18a47342962d432fdb	2026-03-10 21:37:49.092116+00	20260308054729_add_site_contact_fields	\N	\N	2026-03-10 21:37:49.062688+00	1
7969213e-5d57-4f45-b971-ad7b0efa7f0d	66b92dabb342258a5d11d70e0e70c6ed1616bc008076b5ee245debb82385af1a	2026-03-10 21:38:07.245468+00	20260310213807_add_flexible_node_fields	\N	\N	2026-03-10 21:38:07.215106+00	1
8b4195b9-1a9b-492b-b572-4b25806d37e3	c072c4ee1c9fc144f0dc869cbbc84b5ac19d57aaf44c57a79ca02f262a5c747f	2026-03-10 22:23:55.156473+00	20260310222355_add_file_storage_fields	\N	\N	2026-03-10 22:23:55.120917+00	1
a0e65bba-ef5d-4763-85c7-03f22df77ef5	09034b98281e189f79c3c9f56e018ed400ba5f689d6ea1faaed03c838d504a7f	2026-03-10 23:03:25.151576+00	20260310230325_add_version_notes	\N	\N	2026-03-10 23:03:25.103532+00	1
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, "userId", action, entity, "entityId", diff, "createdAt") FROM stdin;
\.


--
-- Data for Name: budget_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_line_items (id, "versionId", "subtaskId", type, description, unit, "unitCost", quantity, "totalCost", margin, "unitPrice", "totalPrice", comment, "createdAt", "updatedAt", "nodeId", discount) FROM stdin;
ee752a6f-bb3f-4f5e-a49c-d09fcd76247f	\N	d61ce25d-8155-4e22-ac8a-7aea71ab3583	EXTERNAL_SERVICE		szt	1000	1	1000	0	1000	1000	Arek tarnawski	2026-03-10 23:36:50.249	2026-03-10 23:41:03.332	ce1050ab-0914-4f47-9e64-3c09dea05055	0
777d5e69-4336-484c-9980-3a7316eb4311	\N	a2e5d711-bb92-4a23-b6c3-77287cf89873	WORK	dzień szkolenia	dzień	500	6	3000	0	500	3000		2026-03-10 22:33:55.468	2026-03-10 22:34:34.266	ce1050ab-0914-4f47-9e64-3c09dea05055	0
cec16407-efd2-4537-a051-5aac9182f7f8	\N	4b4b7e3b-af16-4d43-98f7-52c3f0148620	WORK		dzień	500	1	500	50	750	750	ARO	2026-03-10 22:33:58.159	2026-03-10 23:13:00.649	ce1050ab-0914-4f47-9e64-3c09dea05055	0
d67636de-d91a-4c04-bf16-aba5f7dd7247	\N	0ac28bc1-1f5b-4aa9-952a-b49ad5b791d5	WORK	Michał przygotowania	dzień	250	1	250	0	250	250		2026-03-10 22:33:57.163	2026-03-10 22:35:58.387	ce1050ab-0914-4f47-9e64-3c09dea05055	0
68e5e890-818c-4c92-b1c3-43769d877721	\N	11160965-51e5-4489-9f4a-1ee241471b8c	WORK		dzień	1000	2	2000	100	2000	4000	2024&2025	2026-03-10 23:35:18.058	2026-03-10 23:35:44.662	ce1050ab-0914-4f47-9e64-3c09dea05055	0
547a66f6-8a36-4a54-b6ab-1cf42d070d12	\N	f7923424-8ab3-40c8-9d07-57945e42b7a6	MATERIAL	uchwyt	szt	350	2	700	100	700	1400		2026-03-10 22:42:09.105	2026-03-10 22:42:40.034	ce1050ab-0914-4f47-9e64-3c09dea05055	0
81fb6b04-6c85-469a-9ca6-7b8988d4191f	\N	f7923424-8ab3-40c8-9d07-57945e42b7a6	WORK	instalacja	dzień	1000	2	2000	100	2000	4000		2026-03-10 22:34:01.35	2026-03-10 23:19:30.214	ce1050ab-0914-4f47-9e64-3c09dea05055	0
beb48b76-3e40-4f9e-b7f6-eb2490465fcd	\N	6f3f29f3-a872-43a4-98af-5b2871b371ee	MATERIAL	zakup kamer	szt	1000	8	8000	100	2000	16000	DS-2G6464	2026-03-10 22:34:00.398	2026-03-10 22:40:35.92	ce1050ab-0914-4f47-9e64-3c09dea05055	0
f49eaa65-16b1-4baa-9055-23a05f1ad1a1	\N	b9a4e215-1be3-4221-8446-4fcbaeddfe76	WORK	wizyta gwarancyjna	dzień	1500	3	4500	100	3000	9000		2026-03-10 22:34:02.563	2026-03-10 22:47:59.207	ce1050ab-0914-4f47-9e64-3c09dea05055	0
d923c729-ac8b-4a36-a23d-c5e76d64892c	\N	6f3f29f3-a872-43a4-98af-5b2871b371ee	WORK		dzień	1600	10	16000	100	3200	32000		2026-03-10 22:39:31.021	2026-03-10 22:40:57.334	ce1050ab-0914-4f47-9e64-3c09dea05055	0
a7d5b96d-1c93-4c1e-8a7c-6ab62c3e5220	\N	6f3f29f3-a872-43a4-98af-5b2871b371ee	EXTERNAL_SERVICE	zwyżka	dzień	500	10	5000	100	1000	10000		2026-03-10 22:55:26.697	2026-03-10 23:33:42.393	ce1050ab-0914-4f47-9e64-3c09dea05055	0
\.


--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.files (id, name, size, "mimeType", path, "createdAt") FROM stdin;
\.


--
-- Data for Name: hardware; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hardware (id, "serialNumber", name, model, manufacturer, "productionYear", "siteId") FROM stdin;
\.


--
-- Data for Name: node_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.node_permissions (id, "nodeId", "userId", "roleType", permission, "teamId") FROM stdin;
\.


--
-- Data for Name: order_requirements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_requirements (id, "nodeId", "versionId", "offerDeadline", "projectStart", "projectEnd", "projectGoal", "projectItems", "createdAt", "updatedAt", "wbsDescription", "clientContacts", "clientProjectManager", "clientProjectManagerEmail", "clientProjectManagerPhone", "budgetNotes", "offerStatus", "offerStatusComment") FROM stdin;
6d2861b6-bd92-45be-aeff-b8e9cc7f555a	gst4-order-id	\N	2026-03-21 23:00:00	2026-04-01 00:00:00	2026-12-31 00:00:00	\N	{}	2026-03-10 22:00:09.838	2026-03-10 22:00:29.334	\N	[]	\N	\N	\N	\N	\N	\N
4ee1b19b-824b-48a1-819a-4c845c28da96	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	2026-02-27 21:00:00	2026-03-16 00:00:00	2026-06-30 00:00:00	Instalacja ośmiu kamer i dwóch monitorów.\n\nMonitory dostarcza AMP, my dostarczamy uchwyty i kable HDMI	{"instalacyjne":[{"id":"729c7bb1-2631-4d66-9b43-f11020c05a0c","name":"Instalacja ośmiu kamer","description":""},{"id":"8797ce66-d4f8-44a6-b529-12a375f8df9c","name":"Instalacja dwóch monitorów","description":""},{"id":"b3d722a0-a33d-4caf-8ea1-41c77416de48","name":"wizja techniczna","description":""}],"organizacyjne":[{"id":"1a6d5e44-1a1e-4b3d-a286-06ea09113c06","name":"Dokumentacja BHP","description":""},{"id":"5a4d8af3-e3a0-44bb-908a-aa29f5733867","name":"Złote zasady","description":""},{"id":"f6396116-3a8d-48bc-b50b-413197932032","name":"Paszporty PHP","description":""},{"id":"839ee6b9-5e96-49b4-b1fc-af05047a9fd9","name":"Dokumentacja wykonawcza","description":""}],"gwarancyjne":[{"id":"361ab2b5-64d7-4c29-83b8-4a18621c4160","name":"Gwarancja 36 miesięcy","description":""}]}	2026-03-10 22:31:23.266	2026-03-11 00:01:06.3	Instalacja ze zwyżki dróg kablowych i uchwytów kamer podczas przerwy remontowej na nawie AB.\nMontaż poziomych dróg kablowych w PESZL-u. Prawdopodobnie diaskar będzie dociągał w tym czasie piony, tak żebyśmy mogli w tym samym czasie za jedną wizytą zejść w dół.\nInstalacja monitorów odłożona w czasie. \n	[]	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permissions (id, name) FROM stdin;
\.


--
-- Data for Name: process_node_closure; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.process_node_closure ("ancestorId", "descendantId", depth) FROM stdin;
2a837f28-9b92-48f6-8939-e0934cc6e403	2a837f28-9b92-48f6-8939-e0934cc6e403	0
9e38a137-dc6a-4d71-b230-dab01c5de18f	9e38a137-dc6a-4d71-b230-dab01c5de18f	0
e608e039-d1d0-432f-801a-c962baf1a0f5	e608e039-d1d0-432f-801a-c962baf1a0f5	0
ce1050ab-0914-4f47-9e64-3c09dea05055	ce1050ab-0914-4f47-9e64-3c09dea05055	0
gst4-order-id	gst4-order-id	0
2a837f28-9b92-48f6-8939-e0934cc6e403	9e38a137-dc6a-4d71-b230-dab01c5de18f	1
2a837f28-9b92-48f6-8939-e0934cc6e403	e608e039-d1d0-432f-801a-c962baf1a0f5	1
9e38a137-dc6a-4d71-b230-dab01c5de18f	ce1050ab-0914-4f47-9e64-3c09dea05055	1
e608e039-d1d0-432f-801a-c962baf1a0f5	gst4-order-id	1
2a837f28-9b92-48f6-8939-e0934cc6e403	ce1050ab-0914-4f47-9e64-3c09dea05055	2
2a837f28-9b92-48f6-8939-e0934cc6e403	gst4-order-id	2
93bbae64-c829-47c5-931b-b155c417229e	93bbae64-c829-47c5-931b-b155c417229e	0
gst4-order-id	93bbae64-c829-47c5-931b-b155c417229e	1
e608e039-d1d0-432f-801a-c962baf1a0f5	93bbae64-c829-47c5-931b-b155c417229e	2
2a837f28-9b92-48f6-8939-e0934cc6e403	93bbae64-c829-47c5-931b-b155c417229e	3
d7dc25cc-3e89-42dc-b1ea-fbea7b05cf19	d7dc25cc-3e89-42dc-b1ea-fbea7b05cf19	0
2a837f28-9b92-48f6-8939-e0934cc6e403	d7dc25cc-3e89-42dc-b1ea-fbea7b05cf19	1
f92cb743-ccfb-42f7-a05f-87052167abe6	f92cb743-ccfb-42f7-a05f-87052167abe6	0
2a837f28-9b92-48f6-8939-e0934cc6e403	f92cb743-ccfb-42f7-a05f-87052167abe6	1
7697d59f-cea9-4d95-aadc-5b114d5a4c47	7697d59f-cea9-4d95-aadc-5b114d5a4c47	0
ce1050ab-0914-4f47-9e64-3c09dea05055	7697d59f-cea9-4d95-aadc-5b114d5a4c47	1
9e38a137-dc6a-4d71-b230-dab01c5de18f	7697d59f-cea9-4d95-aadc-5b114d5a4c47	2
2a837f28-9b92-48f6-8939-e0934cc6e403	7697d59f-cea9-4d95-aadc-5b114d5a4c47	3
3744b545-5466-4e86-9778-d4b1cf313da1	3744b545-5466-4e86-9778-d4b1cf313da1	0
ce1050ab-0914-4f47-9e64-3c09dea05055	3744b545-5466-4e86-9778-d4b1cf313da1	1
9e38a137-dc6a-4d71-b230-dab01c5de18f	3744b545-5466-4e86-9778-d4b1cf313da1	2
2a837f28-9b92-48f6-8939-e0934cc6e403	3744b545-5466-4e86-9778-d4b1cf313da1	3
\.


--
-- Data for Name: process_nodes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.process_nodes (id, "parentId", name, type, "createdAt", "updatedAt", "isPublic", "ownerId", visibility, address, "contactPerson", "customTypeLabel", nip, region, "fileSize", "mimeType", "storagePath") FROM stdin;
2a837f28-9b92-48f6-8939-e0934cc6e403	\N	AMP	area	2026-03-10 21:41:14.576	2026-03-10 21:54:55.556	f	0210e785-d606-4277-a01a-53ece9e1f57d	private	ul. Metalurgiczna 1, Poznań	Jan Kowalski	KLIENT	123-456-78-90	Wielkopolska	\N	\N	\N
9e38a137-dc6a-4d71-b230-dab01c5de18f	2a837f28-9b92-48f6-8939-e0934cc6e403	Kraków	site	2026-03-10 21:49:01.809	2026-03-10 21:54:55.578	f	0210e785-d606-4277-a01a-53ece9e1f57d	private	\N	\N	\N	\N	\N	\N	\N	\N
e608e039-d1d0-432f-801a-c962baf1a0f5	2a837f28-9b92-48f6-8939-e0934cc6e403	Dąbrowa	site	2026-03-10 21:49:01.843	2026-03-10 21:54:55.59	f	0210e785-d606-4277-a01a-53ece9e1f57d	private	\N	\N	\N	\N	\N	\N	\N	\N
gst4-order-id	e608e039-d1d0-432f-801a-c962baf1a0f5	GST4	order	2026-03-10 21:51:08.625	2026-03-10 21:54:55.6	f	0210e785-d606-4277-a01a-53ece9e1f57d	private	\N	\N	\N	\N	\N	\N	\N	\N
ce1050ab-0914-4f47-9e64-3c09dea05055	9e38a137-dc6a-4d71-b230-dab01c5de18f	kamery walcowania Nawa AB	order	2026-03-10 21:49:01.875	2026-03-10 21:54:55.61	f	0210e785-d606-4277-a01a-53ece9e1f57d	private	\N	\N	\N	\N	\N	\N	\N	\N
93bbae64-c829-47c5-931b-b155c417229e	gst4-order-id	[Dokumentacja techniczna] AIM Addendum to tender - automation syst.pdf	document	2026-03-10 21:59:02.377	2026-03-10 21:59:02.377	f	\N	private	\N	\N	\N	\N	\N	\N	\N	\N
d7dc25cc-3e89-42dc-b1ea-fbea7b05cf19	2a837f28-9b92-48f6-8939-e0934cc6e403	AIM_Addendum_to_tender_-_Video_Monitoring_System_requirements_PL_v08.pdf	document	2026-03-10 22:25:20.029	2026-03-10 22:25:20.029	f	\N	private	\N	\N	\N	\N	\N	397354	application/pdf	060f27f3-ea97-4ab7-b147-d30148a0e827.pdf
f92cb743-ccfb-42f7-a05f-87052167abe6	2a837f28-9b92-48f6-8939-e0934cc6e403	NIP_AMP_Walcownia_Walcownia_photo_0063.jpg	document	2026-03-10 22:26:31.883	2026-03-10 22:26:31.883	f	\N	private	\N	\N	\N	\N	\N	3592667	image/jpeg	d7e469fd-719e-4b88-a7c9-5387aec5e238.jpg
7697d59f-cea9-4d95-aadc-5b114d5a4c47	ce1050ab-0914-4f47-9e64-3c09dea05055	AIM_Addendum_to_tender_-_Video_Monitoring_System_requirements_PL_v08.pdf	document	2026-03-10 22:31:39.21	2026-03-10 22:31:39.21	f	\N	private	\N	\N	\N	\N	\N	397354	application/pdf	fd4c2bbe-3076-4d3f-8989-ad4f96c161d1.pdf
3744b545-5466-4e86-9778-d4b1cf313da1	ce1050ab-0914-4f47-9e64-3c09dea05055	NIP_AMP_Walcownia_Walcownia_photo_0063.jpg	document	2026-03-10 22:59:35.004	2026-03-10 22:59:35.004	f	\N	private	\N	\N	\N	\N	\N	3592667	image/jpeg	01059369-0fca-4edb-a77c-9959af1f3c03.jpg
\.


--
-- Data for Name: project_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.project_versions (id, "nodeId", label, "createdAt", "updatedAt", "isActive", notes) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, name, description, status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.role_permissions ("roleId", "permissionId") FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, name) FROM stdin;
61789740-5234-4e0b-aebe-401f8f277e03	ADMIN
\.


--
-- Data for Name: sites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sites (id, number, "structureType", "accessDesc", "additionalDesc", "drivingDesc", "shelterType", greenfield, "addressStreet", "addressCity", "addressZipCode", "addressCountry", "addressLatitude", "addressLongitude", "customData", "contactEmail", "contactFirstName", "contactLastName", "contactPhone") FROM stdin;
9e38a137-dc6a-4d71-b230-dab01c5de18f	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	{}	\N	\N	\N	\N
\.


--
-- Data for Name: subtask_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subtask_files (id, "subtaskId", name, path, size, "mimeType", "createdAt") FROM stdin;
\.


--
-- Data for Name: subtask_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subtask_templates (id, name, description, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: subtasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subtasks (id, "nodeId", "versionId", name, description, "plannedStart", "plannedEnd", "assignedUserId", status, "visibilityType", "createdAt", "updatedAt", category, phase, "requirementItemId", "isAiGenerated", "isApproved") FROM stdin;
d61ce25d-8155-4e22-ac8a-7aea71ab3583	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	Dokumentacja BHP	\N	\N	\N	\N	NEW	ALL	2026-03-10 22:33:06.748	2026-03-10 23:17:44.894	Organizacyjne	PRZED	1a6d5e44-1a1e-4b3d-a286-06ea09113c06	f	t
b9a4e215-1be3-4221-8446-4fcbaeddfe76	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	Gwarancja 36 miesięcy	\N	\N	\N	\N	NEW	ALL	2026-03-10 22:32:59.569	2026-03-10 23:17:44.896	Gwarancyjne	PO	361ab2b5-64d7-4c29-83b8-4a18621c4160	f	t
a2e5d711-bb92-4a23-b6c3-77287cf89873	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	Złote zasady	\N	\N	\N	\N	NEW	ALL	2026-03-10 22:33:07.742	2026-03-10 23:17:44.898	Organizacyjne	PRZED	5a4d8af3-e3a0-44bb-908a-aa29f5733867	f	t
6f3f29f3-a872-43a4-98af-5b2871b371ee	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	Instalacja ośmiu kamer	\N	\N	\N	\N	NEW	ALL	2026-03-10 22:33:21.937	2026-03-10 23:17:44.9	Instalacyjne	INSTAL	729c7bb1-2631-4d66-9b43-f11020c05a0c	f	t
4b4b7e3b-af16-4d43-98f7-52c3f0148620	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	Dokumentacja wykonawcza	\N	\N	\N	\N	NEW	ALL	2026-03-10 22:33:48.296	2026-03-10 23:17:44.902	Organizacyjne	PRZED	839ee6b9-5e96-49b4-b1fc-af05047a9fd9	f	t
f7923424-8ab3-40c8-9d07-57945e42b7a6	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	Instalacja dwóch monitorów	\N	\N	\N	\N	NEW	ALL	2026-03-10 22:33:24.039	2026-03-10 23:17:44.904	Instalacyjne	INSTAL	8797ce66-d4f8-44a6-b529-12a375f8df9c	f	t
0ac28bc1-1f5b-4aa9-952a-b49ad5b791d5	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	Paszporty PHP	\N	\N	\N	\N	NEW	ALL	2026-03-10 22:33:13.072	2026-03-10 23:17:44.906	Organizacyjne	PRZED	f6396116-3a8d-48bc-b50b-413197932032	f	t
11160965-51e5-4489-9f4a-1ee241471b8c	ce1050ab-0914-4f47-9e64-3c09dea05055	\N	wizja techniczna	\N	\N	\N	\N	NEW	ALL	2026-03-10 23:17:44.907	2026-03-10 23:17:44.907	Instalacyjne	PRZED	b3d722a0-a33d-4caf-8ea1-41c77416de48	f	t
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teams (id, name, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: user_entity_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_entity_configs (id, "userId", "entityType", config) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles ("userId", "roleId") FROM stdin;
2fb46ea0-1cdf-4915-91f4-e90fb4ecf250	61789740-5234-4e0b-aebe-401f8f277e03
0210e785-d606-4277-a01a-53ece9e1f57d	61789740-5234-4e0b-aebe-401f8f277e03
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password, "firstName", "lastName", "isActive", "createdAt", "updatedAt", "supervisorId") FROM stdin;
2fb46ea0-1cdf-4915-91f4-e90fb4ecf250	admin@poz.pl	$argon2id$v=19$m=65536,t=3,p=4$LFnnkXHFA1tDxi4J4QNqGA$yZW2cluKHKczU24cM9F8VaudKZaAaJyVUcC81uWq6bE	Admin	Systemu	t	2026-03-10 21:41:14.513	2026-03-10 21:54:55.506	\N
0210e785-d606-4277-a01a-53ece9e1f57d	a@poz.pl	$argon2id$v=19$m=65536,t=3,p=4$LFnnkXHFA1tDxi4J4QNqGA$yZW2cluKHKczU24cM9F8VaudKZaAaJyVUcC81uWq6bE	a	Systemu	t	2026-03-10 21:46:45.062	2026-03-10 21:54:55.546	\N
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: budget_line_items budget_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT budget_line_items_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: hardware hardware_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware
    ADD CONSTRAINT hardware_pkey PRIMARY KEY (id);


--
-- Name: node_permissions node_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_permissions
    ADD CONSTRAINT node_permissions_pkey PRIMARY KEY (id);


--
-- Name: order_requirements order_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_requirements
    ADD CONSTRAINT order_requirements_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: process_node_closure process_node_closure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_node_closure
    ADD CONSTRAINT process_node_closure_pkey PRIMARY KEY ("ancestorId", "descendantId");


--
-- Name: process_nodes process_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_nodes
    ADD CONSTRAINT process_nodes_pkey PRIMARY KEY (id);


--
-- Name: project_versions project_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_versions
    ADD CONSTRAINT project_versions_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY ("roleId", "permissionId");


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: subtask_files subtask_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtask_files
    ADD CONSTRAINT subtask_files_pkey PRIMARY KEY (id);


--
-- Name: subtask_templates subtask_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtask_templates
    ADD CONSTRAINT subtask_templates_pkey PRIMARY KEY (id);


--
-- Name: subtasks subtasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: user_entity_configs user_entity_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_entity_configs
    ADD CONSTRAINT user_entity_configs_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY ("userId", "roleId");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: _TeamToUser_AB_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "_TeamToUser_AB_unique" ON public."_TeamToUser" USING btree ("A", "B");


--
-- Name: _TeamToUser_B_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "_TeamToUser_B_index" ON public."_TeamToUser" USING btree ("B");


--
-- Name: node_permissions_nodeId_roleType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "node_permissions_nodeId_roleType_key" ON public.node_permissions USING btree ("nodeId", "roleType");


--
-- Name: node_permissions_nodeId_teamId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "node_permissions_nodeId_teamId_key" ON public.node_permissions USING btree ("nodeId", "teamId");


--
-- Name: node_permissions_nodeId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "node_permissions_nodeId_userId_key" ON public.node_permissions USING btree ("nodeId", "userId");


--
-- Name: order_requirements_nodeId_versionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "order_requirements_nodeId_versionId_key" ON public.order_requirements USING btree ("nodeId", "versionId");


--
-- Name: permissions_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_name_key ON public.permissions USING btree (name);


--
-- Name: project_versions_nodeId_label_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "project_versions_nodeId_label_key" ON public.project_versions USING btree ("nodeId", label);


--
-- Name: roles_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);


--
-- Name: subtask_templates_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subtask_templates_name_key ON public.subtask_templates USING btree (name);


--
-- Name: teams_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teams_name_key ON public.teams USING btree (name);


--
-- Name: user_entity_configs_userId_entityType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_entity_configs_userId_entityType_key" ON public.user_entity_configs USING btree ("userId", "entityType");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: _TeamToUser _TeamToUser_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."_TeamToUser"
    ADD CONSTRAINT "_TeamToUser_A_fkey" FOREIGN KEY ("A") REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _TeamToUser _TeamToUser_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."_TeamToUser"
    ADD CONSTRAINT "_TeamToUser_B_fkey" FOREIGN KEY ("B") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audit_log audit_log_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: budget_line_items budget_line_items_nodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT "budget_line_items_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: budget_line_items budget_line_items_subtaskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT "budget_line_items_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES public.subtasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: budget_line_items budget_line_items_versionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT "budget_line_items_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES public.project_versions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hardware hardware_siteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware
    ADD CONSTRAINT "hardware_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: node_permissions node_permissions_nodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_permissions
    ADD CONSTRAINT "node_permissions_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: node_permissions node_permissions_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_permissions
    ADD CONSTRAINT "node_permissions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: node_permissions node_permissions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_permissions
    ADD CONSTRAINT "node_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: order_requirements order_requirements_nodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_requirements
    ADD CONSTRAINT "order_requirements_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: order_requirements order_requirements_versionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_requirements
    ADD CONSTRAINT "order_requirements_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES public.project_versions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: process_node_closure process_node_closure_ancestorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_node_closure
    ADD CONSTRAINT "process_node_closure_ancestorId_fkey" FOREIGN KEY ("ancestorId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: process_node_closure process_node_closure_descendantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_node_closure
    ADD CONSTRAINT "process_node_closure_descendantId_fkey" FOREIGN KEY ("descendantId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: process_nodes process_nodes_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_nodes
    ADD CONSTRAINT "process_nodes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: process_nodes process_nodes_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_nodes
    ADD CONSTRAINT "process_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: project_versions project_versions_nodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_versions
    ADD CONSTRAINT "project_versions_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sites sites_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_id_fkey FOREIGN KEY (id) REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subtask_files subtask_files_subtaskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtask_files
    ADD CONSTRAINT "subtask_files_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES public.subtasks(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subtasks subtasks_assignedUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT "subtasks_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: subtasks subtasks_nodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT "subtasks_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES public.process_nodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subtasks subtasks_versionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT "subtasks_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES public.project_versions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_entity_configs user_entity_configs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_entity_configs
    ADD CONSTRAINT "user_entity_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_roles user_roles_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_supervisorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict dmHNRJ2KLCFpacQ6VJp5H56SCAm9oMhFf0N0hb4qrscv6yViDwlP7rWFEpMGRmW

