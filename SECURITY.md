# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest on `main` | Yes |
| older releases | No |

Only the latest production deployment is actively maintained with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability in SecondLayer, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use one of the following channels:

1. **GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/overthelex/secondlayer/security/advisories/new)
2. **Email**: security@legal.org.ua

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected components (backend, frontend, MCP servers, infrastructure)
- Potential impact assessment
- Any suggested fixes (optional)

### Response timeline

- **Acknowledgement**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix for critical issues**: as soon as possible, typically within 7 days
- **Fix for non-critical issues**: within 30 days

### What to expect

- We will acknowledge receipt of your report promptly
- We will keep you informed about the progress of the fix
- We will credit you in the fix announcement (unless you prefer to remain anonymous)

## Scope

The following are in scope for security reports:

- **legal.org.ua** and its subdomains
- Backend MCP servers (mcp_backend, mcp_rada, mcp_openreyestr)
- Frontend web application (lexwebapp)
- Authentication and authorization flows (OAuth, OIDC, Diia, WebAuthn)
- Payment processing (Monobank integration)
- API endpoints and tool execution
- Data storage and encryption (Vault, E2EE consultations)

The following are out of scope:

- Third-party services and APIs we consume (EDRSR, Rada API, data.gov.ua)
- Issues requiring physical access to infrastructure
- Social engineering attacks
- Denial of service attacks

## Security Practices

- All user-facing authentication supports multi-factor (WebAuthn, Diia)
- Consultations use end-to-end encryption
- API access requires Bearer token or authenticated session
- Production deployments use blue-green strategy with health checks
- Dependencies are monitored via Dependabot
