# Tember Supabase Setup

Run `schema.sql` in the Supabase SQL editor for the Tember project.

Set these environment variables in Vercel for the Tember project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFY_SECRET` optional but recommended
- `RESEND_API_KEY` and `EMAIL_FROM` for email delivery
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_PHONE` for SMS delivery

The browser talks only to `/api/tember`; the service role key stays server-side.

Current backend behavior:

- `POST /api/tember` with `action: "subscribe"` stores or updates email/phone notification signups.
- `POST /api/tember` with `action: "cancel"` marks matching email/phone signups as canceled.
- `POST /api/tember` with `action: "spark"` stores shared reflections.
- `GET /api/tember` returns approved reflections for the current hour and five prior hours.
- `GET /api/notify` sends due notifications for active subscribers when delivery provider env vars are configured.

`vercel.json` schedules `/api/notify` once per hour. If `NOTIFY_SECRET` is set, update the cron target to include `?secret=...` or call the endpoint from an external scheduler with `Authorization: Bearer ...`.
