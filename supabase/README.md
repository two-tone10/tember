# Tember Supabase Setup

Run `schema.sql` in the Supabase SQL editor for the Tember project.

Set these environment variables in Vercel for the Tember project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFY_SECRET` optional but recommended
- `RESEND_API_KEY` and `EMAIL_FROM` for email reminders
- `TEMBER_APP_URL` optional, defaults to `https://tember.vercel.app`

The browser talks only to `/api/tember`; the service role key stays server-side.

Current backend behavior:

- `POST /api/tember` with `action: "subscribe"` stores or updates email reminder signups.
- `POST /api/tember` with `action: "cancel"` marks matching email signups as canceled.
- `POST /api/tember` with `action: "spark"` stores shared reflections.
- `GET /api/tember` returns approved reflections for the current hour and five prior hours.
- `GET /api/notify` sends due email reminders for active subscribers when Resend env vars are configured.

Resend setup:

1. Create a Resend API key.
2. Add `RESEND_API_KEY`, `EMAIL_FROM`, and `NOTIFY_SECRET` in Vercel.
3. Redeploy the Vercel project.
4. Test email delivery with:

`https://tember.vercel.app/api/notify?test=1&to=you@example.com&secret=YOUR_NOTIFY_SECRET`

Reminders are sent when `/api/notify` is called. If Vercel Cron is unavailable on the current plan, use an external scheduler to call:

`https://tember.vercel.app/api/notify?secret=YOUR_NOTIFY_SECRET`
