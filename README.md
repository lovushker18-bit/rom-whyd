# Music Rating Site

AOTY-inspired music rating/review website built for Cloudflare Workers + D1.

## Current MVP

- User registration
- Login / logout
- Session cookies
- User profiles
- Artists
- Albums
- Tracks
- 0–10 ratings in 0.5 increments
- Album average ratings
- Reviews
- Comments
- Basic responsive UI
- Cloudflare D1 database

## Local setup

Requirements:
- Node.js 20+
- Wrangler

Install:
```bash
npm install
```

Create a local D1 database:
```bash
npx wrangler d1 create music-rating-db
```

Put the returned database ID into `wrangler.jsonc`.

Apply schema locally:
```bash
npm run db:migrate:local
```

Start development:
```bash
npm run dev
```

## Cloudflare deployment

After connecting the GitHub repository to Cloudflare Workers, set the D1 database binding named `DB` to your production D1 database.

Apply the schema to production:
```bash
npm run db:migrate
```

Deploy:
```bash
npm run deploy
```

## Notes

This is a functional starting point, not a finished production service. Before public launch, add email verification, password reset, rate limiting, CSRF protection, stronger moderation tools, abuse prevention, and production-grade session management.
