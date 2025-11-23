# Task Manager

This is a small Express/MongoDB task manager app using EJS views.

This repository is prepared to deploy on Render.com. Below are the exact steps and the environment variables you must set.

## What to configure on Render

1. Create a new Web Service on Render and connect your GitHub repo.
2. When Render asks for a `Start Command`, use:

   npm start

   (Render will run `npm install` automatically by default; the included `render.yaml` also instructs build/start commands.)

3. Set the following Environment Variables in your Render service (Environment > Environment Variables):

   - `MONGODB_URI` — your MongoDB connection string (Atlas). Example: `mongodb+srv://<user>:<password>@cluster0...`
   - `SESSION_SECRET` — a long random string for express-session (keep secret).
   - `NODE_ENV` — set to `production` (optional but recommended).

   Note: Do NOT commit secrets to this repository. Use Render's dashboard to store them.

## Files added to help deploy

- `render.yaml` — Render service config (optional, useful for automatic import).
- `Procfile` — fallback start command (web: npm start).
- `.env.example` — example env vars (never commit real secrets).

## Local development

Install dependencies and run with nodemon:

```fish
npm install
npm run dev
```

Or run in production mode locally (ensure env vars are set locally):

```fish
NODE_ENV=production MONGODB_URI="your-uri" SESSION_SECRET="your-secret" npm start
```

## Notes

- The app reads `process.env.PORT` (Render will set this automatically). No changes to the code required for port binding.
- Before deploying, ensure a valid `MONGODB_URI` and `SESSION_SECRET` are configured in Render.
- If you prefer, I can help generate a small migration script to assign `createdBy` for existing tasks created prior to adding ownership.

If you'd like, I can also refactor the controllers into a `controllers/` folder to better follow MVC before deployment.