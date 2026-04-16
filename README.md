# GeorgiaBooked

Statewide Georgia arrest tracker. Pulls from Georgia Gazette WP REST API, AI-rewrites facts, publishes static site to GitHub Pages.

## Development

1. `cp .env.example .env` and fill in `GEMINI_API_KEY`
2. `npm install`
3. `npm run ingest` to pull latest data
4. `npm run dev` to run dev server at http://localhost:4321

## Ingestion

Runs hourly via GitHub Actions. Manually run with `npm run ingest`.

## Deployment

Auto-deploys to GitHub Pages on push to main.
