# My Daily Assistant

Mobile-first personal productivity app built with Next.js and Supabase.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in your Supabase project values.

3. Run the SQL in `supabase/schema.sql` inside the Supabase SQL editor.

4. In Supabase Auth settings, enable Email auth and turn on **Allow new users to sign up**. You can turn off **Confirm email** if you want new users to log in immediately.

5. Start the app:

```bash
npm run dev
```

## Phase 1 Features

- Supabase username login, with Gmail only required during registration
- Per-user `events` and `tasks` tables with RLS
- Today and Upcoming dashboard
- Task CRUD with priority and status
- Task progress detail with checklist and progress updates
- Event CRUD with optional time, note, and color label
