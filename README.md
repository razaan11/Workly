# Workly

Workly is an HR and project-management dashboard built with React, Vite, and Supabase.

The browser connects directly to Supabase's cloud API and PostgreSQL database. There is no local Express server or `localhost:3001` requirement.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

In `.env`, add the public values from **Supabase → Connect → Server**:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Never add a database connection string or Supabase secret key to the frontend `.env` file.

## Database

Apply [database/schema.sql](database/schema.sql) once in the Supabase SQL Editor. The schema creates tables only and contains no sample business records.

## Security note

Before adding real HR records, enable Supabase Auth and Row Level Security policies appropriate for administrator access. Do not create public read/write policies for employee data.
