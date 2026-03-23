# lexwebapp

Web frontend for the SecondLayer legal tech platform.

## Stack

- **React 19** with TypeScript
- **Vite** — build tooling
- **TailwindCSS 3** — styling
- **Zustand** — state management
- **TanStack Query** — data fetching and caching
- **React Router** — routing with protected routes

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env.local

# Start dev server (port 5173)
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:staging` | Staging build |
| `npm run test` | Run Vitest tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | ESLint check |

## Environment Variables

See [.env.example](.env.example) for all available configuration options.

Key variables:
- `VITE_API_URL` — Backend API base URL
- `VITE_API_KEY` — API authentication key
- `VITE_ENABLE_SSE_STREAMING` — Enable real-time streaming

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Route-level page components
├── stores/         # Zustand state stores
├── services/       # API client layer
├── lib/            # TanStack Query config, utilities
├── hooks/          # Custom React hooks
└── utils/          # Helper functions
```
