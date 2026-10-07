# herofolio

## Getting started

1. Copy `.env.example` to `.env` and point it at a Postgres database (a local
   Postgres 18, or a connection string from a hosted one).
2. Install dependencies: `npm install`
3. Create a local database if needed: `createdb herofolio`
4. Build the schema: `npm run migrate`
5. Load the seed data: `npm run seed`
6. Run the app: `npm start` (Vite on :3000, API on :4002)
7. Sign in as `BOOTSTRAP_USER_EMAIL` with the password whose hash you put in
   `BOOTSTRAP_USER_PASSWORD_HASH`. Others can sign up with `SIGNUP_INVITE_CODE`.

## Checks

`npm run check` runs what CI runs: Prettier, ESLint, the typecheck, the tests
and a production build. `npm run format` fixes formatting. Details are in
[docs/ci-quality.md](docs/ci-quality.md).
