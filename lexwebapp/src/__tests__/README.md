# Frontend Unit Tests

This directory contains root-level integration tests. Unit tests are co-located with source code in `__tests__/` directories throughout `src/`.

## Overview

Tests are written using:
- **Vitest 4** - Fast unit test framework for Vite projects
- **React Testing Library** - React component testing
- **jsdom** - DOM simulation for Node.js

## Test Locations

Tests are distributed across the codebase:

```
src/
├── __tests__/                              # Root-level integration tests
│   ├── setup.ts                            # Global test setup
│   └── consultation-escrow.test.tsx
├── services/
│   ├── api/__tests__/
│   │   ├── SSEClient.test.ts              # SSE client streaming tests
│   │   └── MCPService.test.ts             # MCP service tests
│   └── crypto/__tests__/
│       ├── e2ee-integration.test.ts       # E2EE integration tests
│       └── crypto.test.ts                 # Crypto utility tests
├── stores/__tests__/
│   ├── chatStore.test.ts                  # Chat store tests
│   ├── uiStore.test.ts                    # UI store tests
│   ├── localeStore.test.ts                # Locale store tests
│   ├── undoStore.test.ts                  # Undo store tests
│   └── videoCallStore.test.ts             # Video call store tests
├── hooks/__tests__/
│   ├── useMCPTool.test.tsx                # MCP tool hook tests
│   └── useVideoSignaling.test.ts          # Video signaling tests
├── pages/__tests__/
│   ├── AdminUsersPage.test.tsx
│   ├── AdminMonitoringPage.test.tsx
│   ├── AdminMonitoringBackfill.test.tsx
│   ├── AdminOverviewPage.test.tsx
│   ├── AdminCostsPage.test.tsx
│   ├── ConsultationDetailPage.test.tsx
│   ├── ConsultationsPage.test.tsx
│   └── LegalCodesLibraryPage.test.tsx
└── components/
    ├── video-call/__tests__/
    │   ├── VideoCallControls.test.tsx
    │   └── CallNotification.test.tsx
    ├── organization/__tests__/
    │   └── OrganizationSetupModal.test.tsx
    ├── chat/__tests__/
    │   └── ConsultationChatTab.test.tsx
    ├── attorney/__tests__/
    │   └── PendingInvitationsModal.test.tsx
    └── ui/__tests__/
        └── ConfirmModal.test.tsx
```

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (recommended during development)
npm run test:watch

# UI mode (visual test runner)
npm run test:ui

# Coverage report
npm run test:coverage
```

## Running Specific Tests

```bash
# Single test file
npx vitest run src/services/api/__tests__/SSEClient.test.ts

# By name pattern
npx vitest run -t "should parse progress events"

# All tests in a directory
npx vitest run src/stores/__tests__/
```

## Writing Tests

### Example: Testing a Component

```typescript
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MyComponent } from '../MyComponent';

test('renders correctly', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

### Example: Testing a Service

```typescript
import { expect, test, vi } from 'vitest';

test('calls API correctly', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: 'success' }),
  });

  const result = await mcpService.callTool('test_tool', {});
  expect(result).toEqual({ result: 'success' });
});
```

### Example: Testing a Hook

```typescript
import { renderHook, act } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useMCPTool } from '../hooks/useMCPTool';

test('executes tool', async () => {
  const { result } = renderHook(() => useMCPTool('get_legal_advice'));

  await act(async () => {
    await result.current.executeTool({ query: 'test' });
  });

  expect(result.current.isLoading).toBe(false);
});
```

## Mocking

### Mocking Services

```typescript
vi.mock('../services', () => ({
  mcpService: {
    streamTool: vi.fn(),
    callTool: vi.fn(),
  },
}));
```

### Mocking Stores

```typescript
import { useChatStore } from '../stores/chatStore';

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    isStreaming: false,
  });
});
```

### Mocking fetch

```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: 'mock' }),
});
```

## Best Practices

1. **Isolate Tests**: Each test should be independent
2. **Clear Setup**: Use beforeEach/afterEach for cleanup
3. **Descriptive Names**: Test names should describe what they test
4. **AAA Pattern**: Arrange, Act, Assert
5. **Mock External Dependencies**: Don't make real API calls
6. **Test Behavior, Not Implementation**: Focus on what, not how

## Debugging Tests

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal"
}
```

## Troubleshooting

### Issue: Tests timeout

**Solution**: Increase timeout
```typescript
test('long running test', async () => {
  // ...
}, 10000); // 10 second timeout
```

### Issue: Async tests failing

**Solution**: Use `await` and `act()`
```typescript
await act(async () => {
  await asyncFunction();
});
```

### Issue: Mock not working

**Solution**: Clear mocks between tests
```typescript
afterEach(() => {
  vi.clearAllMocks();
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)

---

**Last Updated:** 2026-03-28
