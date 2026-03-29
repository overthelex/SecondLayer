# lexwebapp

Web frontend for the SecondLayer legal tech platform.

## Stack

- **React 19** with TypeScript 5.5
- **Vite 8** — build tooling
- **TailwindCSS 3** — styling
- **Zustand 5** — state management
- **TanStack Query 5** — data fetching and caching
- **React Router 7** — routing with protected routes
- **Vitest 4** — testing framework
- **Framer Motion** — animations
- **Recharts** — data visualisation
- **Lucide React** — icons
- **DOMPurify** — XSS sanitisation
- **react-markdown** + remark-gfm — markdown rendering
- **xterm.js** — admin terminal emulator
- **xyflow** — workflow visualisation
- **rrweb** — session replay recording

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
| `npm run build` | Production build (outputs to `dist/`) |
| `npm run test` | Run Vitest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ui` | Visual test runner UI |
| `npm run test:coverage` | Run tests with V8 coverage |
| `npm run lint` | ESLint check |
| `npm run preview` | Preview production build locally |

## Environment Variables

See [.env.example](.env.example) for all available configuration options.

Key variables:
- `VITE_API_URL` — Backend API base URL
- `VITE_API_KEY` — API authentication key (must match `SECONDARY_LAYER_KEYS` in backend)
- `VITE_ENABLE_SSE_STREAMING` — Enable real-time SSE streaming
- `VITE_MOCK_PAYMENTS` — Mock payment processing in development

## Project Structure

```
src/
├── components/        # Reusable UI components
│   ├── admin/         # Admin panel components
│   ├── attorney/      # Attorney-specific components
│   ├── billing/       # Billing & payment components
│   ├── chat/          # Chat interface components
│   ├── clients/       # Client management components
│   ├── consultation/  # Consultation components
│   ├── contracts/     # Contract components
│   ├── encryption/    # E2EE key management UI
│   ├── invoices/      # Invoice components
│   ├── legislation/   # Legislation viewer components
│   ├── matters/       # Matter management components
│   ├── message/       # Message display components
│   ├── onboarding/    # User onboarding flow
│   ├── organization/  # Organization setup
│   ├── right-panel/   # Evidence/results side panel
│   ├── sidebar/       # Navigation sidebar
│   ├── team/          # Team management
│   ├── time/          # Time tracking components
│   ├── ui/            # Base UI primitives
│   └── video-call/    # WebRTC video call components
├── content/           # Static legal content (md files, multi-language)
├── contexts/          # React contexts (AuthContext)
├── hooks/             # Custom React hooks
│   ├── chat/          # AI chat hooks (useAIChat, useAIChatStream)
│   └── queries/       # TanStack Query hooks (useAuth, useBilling, etc.)
├── i18n/              # Internationalisation (uk, en, es)
├── layouts/           # Page layouts (MainLayout)
├── lib/               # TanStack Query config
├── pages/             # Route-level page components (60+ pages)
├── providers/         # React providers (QueryProvider)
├── router/            # Route definitions and guards
├── services/          # API client layer
│   ├── api/           # Service classes (Auth, MCP, Billing, etc.)
│   │   ├── mcp/       # MCP response formatters/transformers
│   │   └── sse/       # SSE client, parser, retry strategy
│   ├── crypto/        # E2EE encryption services
│   └── upload/        # File upload service
├── stores/            # Zustand state stores
├── types/             # TypeScript type definitions
│   ├── api/           # API response types
│   └── models/        # Domain model types
└── utils/             # Helper functions (api-client, errors, i18n, toast)
```

## Environments

| Environment | API URL | Build Command |
|-------------|---------|---------------|
| Local dev | `http://localhost:3000/api` | `npm run dev` |
| Production | `https://legal.org.ua/api` | `npm run build` |

## Testing

Tests are co-located with source code in `__tests__/` directories:

```bash
# Run all tests
npm run test

# Run specific test file
npx vitest run src/services/api/__tests__/MCPService.test.ts

# Watch mode
npm run test:watch
```

Test locations:
- `src/__tests__/` — root-level integration tests
- `src/services/api/__tests__/` — SSEClient, MCPService
- `src/services/crypto/__tests__/` — E2EE, crypto
- `src/stores/__tests__/` — Zustand store tests
- `src/hooks/__tests__/` — hook tests
- `src/pages/__tests__/` — page component tests
- `src/components/*/__tests__/` — component tests
