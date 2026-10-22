# Workly — Project Context

## Purpose

Workly is a blue-and-white HR/Admin dashboard for employee administration, leave and attendance, project delivery, tasks, recognition, analytics, notifications, and audit history. The current build is the **HR/Admin workspace**; a separate Manager or Employee workspace has not been designed or implemented in this repository.

## Current architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React + Vite | Responsive admin dashboard, authentication screen, module views, forms, profile views, calendar, table controls, and exports. |
| Authentication | Supabase Auth | Secure email/password sign-in. Passwords are managed by Supabase and are never stored in Workly source code. |
| Cloud backend | Supabase Edge Function (`workly-api`) | Verifies signed-in administrator access and performs protected dashboard reads and record mutations. |
| Database | Supabase PostgreSQL | Stores employees, projects, tasks, leave, attendance, rewards, documents, notifications, and audit history. |
| Security | Supabase RLS + Edge Function checks | Restricts protected records to registered administrators and keeps privileged operations server-side. |

There is **no local Express server and no local PostgreSQL requirement**. The Vite dev server is only the frontend development server.

## Supabase configuration

- Supabase project reference: `nwnbazqarazusyhulifr`
- Deployed Edge Function: `workly-api`
- Local frontend configuration is stored only in an ignored `.env` file:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Do not commit `.env`, database passwords, service-role keys, SMTP credentials, or any other secret.

## Implemented admin modules

### Overview

- Workforce, leave, task, project, and attendance summary cards.
- Project event schedule and calendar modal.
- Event detail modal that links to the relevant project.
- Task-status summary.
- Pending leave information and operational status panels.

### Employee details

- Create employee records with unique employee IDs.
- Employee directory and searchable/sortable/paginated CSV-exportable table.
- Employee profile view with Personal, Employment, Documents, Attendance, Leave, Projects, and Performance tabs.
- Cloud schema supports professional details, reporting manager, contact information, emergency contact, skills, qualifications, assets, custom fields, and account status.
- Document metadata and document-expiry alert support.

### Leave management

- Create leave requests and store leave type, dates, reason, chargeable days, handover information, emergency contact, policy exception state, and decision information.
- Approval/rejection queue.
- Administrator manually confirms chargeable leave days.
- Atomic PostgreSQL leave decision function: approval history and leave-balance deduction are completed together.
- Audited server-side decision records.

### Attendance

- Attendance records with employee, date, check-in/out, work mode, and status.
- Attendance correction request data model.
- Administrator approval/rejection queue for corrections.
- Original attendance data is recorded in the audit history before an approved correction changes the active attendance record.

### Project management

- Create projects with project code, dates, progress, status, risk level, manager, and team lead support.
- Project portfolio cards and summary metrics.
- Cloud data model for project members and milestones.
- Deletion protection: the Edge Function blocks project deletion while tasks remain related to the project.

### Employee tasks

- Create task records linked to projects and employees.
- Task status, due date, priority, blocker, dependency, milestone, deliverable, and comments data support.
- Task reassignment tracking stores previous assignee, new assignee, reason, administrator, and timestamp.
- Task workload and delivery metrics.

### Rewards and recognition

- Create recognition nominations.
- HR approval/rejection workflow with decision reason, administrator, and timestamp.

### Analytics, notifications, and audit history

- Workforce, project, leave, and task analytics based on cloud records.
- Recent audit-history display.
- Notification and notification-preference database support.
- Search, sorting, pagination, and CSV export across the main module tables.

## Security and audit controls

- Edge Function requires a Supabase authenticated user.
- Edge Function checks the user is present in `public.app_admins` before allowing protected operations.
- Row Level Security is enabled on application tables.
- Field allow-lists prevent the generic record API from accepting arbitrary database fields.
- Important create, update, delete, decision, reassignment, and correction operations write audit records.
- Project deletion is explicitly checked server-side.
- No dummy organisation records are inserted by Workly.

## Repository layout

```text
src/                              React/Vite dashboard
src/lib/supabase.js               Browser Supabase client
src/lib/dashboard.js              Cloud API client and dashboard data shaping
database/schema.sql               Idempotent Supabase database schema/migration
database/bootstrap-admin.sql.example
supabase/functions/workly-api/    Deployed Supabase Edge Function
.env.example                      Safe frontend environment-variable template
PROJECT_CONTEXT.md                This handover/context document
```

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL Vite prints, normally `http://localhost:5173/` or `http://localhost:5174/` if port 5173 is already busy.

## First-time cloud setup

1. Create `.env` from `.env.example` and enter the Supabase project URL and **publishable** key.
2. In Supabase SQL Editor, run `database/schema.sql`.
3. Create the first Supabase Auth account.
4. Grant the first account administrator access by running the query in `database/bootstrap-admin.sql.example` after replacing the placeholder email.
5. Deploy the function whenever `supabase/functions/workly-api/index.ts` changes:

```powershell
npx supabase functions deploy workly-api --project-ref nwnbazqarazusyhulifr --use-api
```

## Recent cloud deployment and Git state

- GitHub repository: `https://github.com/razaan11/Workly`
- Branch: `main`
- Latest implementation commit at the time of this document: `29af6f3` (`Add HR workflow workspaces and table controls`)
- The `workly-api` Edge Function was deployed after that commit.

## Remaining configuration / future work

These are not represented as completed features because they need configuration or a future workspace design:

1. **Document file upload and controlled file access** — document metadata/expiry is present, but file uploads require a Supabase Storage bucket, file-validation rules, and the final document-access matrix.
2. **Email notifications** — in-app notification data is supported; outbound email needs a chosen provider/SMTP credentials stored as Supabase server secrets, never in the frontend.
3. **Employee workspace** — employees need their own authenticated experience to submit leave requests, attendance check-ins, and correction requests. This was explicitly outside the current Admin-dashboard specification.
4. **Final policy decisions** — leave accrual/carry-forward, company holidays, overtime, attendance shifts, retention periods, and detailed document access rules were marked as needing final policy decisions in the baseline.

## Verification completed

- `npm run build` passes after the current frontend changes.
- Edge Function deployment completed successfully for Supabase project `nwnbazqarazusyhulifr`.

