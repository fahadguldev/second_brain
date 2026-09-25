# Second Brain backend

## Chat persistence

The API assigns anonymous visitors a signed, HTTP-only cookie and stores their
conversation history in the application database. SQLite is used locally by
default; set `DATABASE_URL` to a PostgreSQL/Supabase connection string in
production.

Required production configuration:

```env
DATABASE_URL=postgresql://postgres:password@host:5432/postgres
SESSION_SECRET=replace-with-a-long-random-secret
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

Use `COOKIE_SAMESITE=lax` when the frontend and API share a site. If they are
on different sites, HTTPS plus `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`
are required for browsers to retain the visitor cookie.

Run locally with:

```shell
uv sync
uv run uvicorn src.main:app --reload
```
