# Capacity Planner

A local-first task and capacity planning workspace built with React, Vinext, and shadcn/ui. The interface uses Montserrat throughout and starts with an empty workspace so teams can create separate plans or standalone tasks, add subtasks to either, optionally track time, and export the hierarchy to Excel. Light and dark themes are included.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Validate and build

```bash
npx tsc --noEmit
npm run build
```

The static site is written to `dist/client`.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, builds the static site, and publishes it to GitHub Pages.

> The login is a client-side prototype gate, not production authentication. Do not store sensitive data in the hosted demo.
