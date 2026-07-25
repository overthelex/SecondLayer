# JWT Authentication for SecondLayer MCP Server

## ✅ Setup Complete

Your SecondLayer MCP server at `https://mcp.legal.org.ua/v1/sse` now requires JWT authentication for all endpoints (except `/health`).

---

## 🔐 **Your JWT Token**

**Client ID:** `claude-desktop`
**Expires:** January 18, 2027 (365 days)
**Token:**
```
YOUR_JWT_TOKEN_HERE
```

---

## 📋 **MCP Client Configuration**

### For Claude Desktop

**File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "SecondLayerMCP": {
      "url": "https://mcp.legal.org.ua/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"
      }
    }
  }
}
```

### For Other MCP Clients (Cline, etc.)

Same configuration format - just update the headers section with the Authorization Bearer token.

---

## 🧪 **Verification Tests**

All tests passing ✅:

```bash
# Health endpoint (no auth required)
curl https://mcp.legal.org.ua/health
# ✅ Returns: {"status":"ok","service":"secondlayer-mcp-sse","version":"1.0.0","transport":"sse","tools":10}

# SSE endpoint without token (should fail)
curl -X POST https://mcp.legal.org.ua/v1/sse
# ✅ Returns: {"error":"Unauthorized","message":"Missing Authorization header..."}

# SSE endpoint with valid JWT token (should succeed)
curl -X POST https://mcp.legal.org.ua/v1/sse \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
# ✅ Returns: event: endpoint (SSE stream established)
```

---

## 🔑 **Generating New Tokens**

To generate additional tokens (for different clients, users, or if the token expires):

```bash
cd <project-root>/mcp_backend

# Generate token with default settings (365 days expiration)
node scripts/generate-jwt-token.js

# Generate token for specific client with custom expiration
node scripts/generate-jwt-token.js "my-client-id" "30d"

# Generate token that never expires
node scripts/generate-jwt-token.js "production-bot" "never"
```

**Token Expiration Options:**
- `7d` - 7 days
- `30d` - 30 days
- `90d` - 90 days
- `365d` - 1 year (default)
- `never` - Never expires (use with caution)

---

## 🔒 **Security Features**

✅ **JWT Secret:** 128-character random hex string stored in `.env.production`
✅ **Token Expiration:** Tokens expire after 365 days by default
✅ **Health Check:** Public endpoint for monitoring without auth
✅ **HTTPS Only:** All traffic encrypted via Let's Encrypt SSL
✅ **Cloudflare Proxy:** Additional DDoS protection layer
✅ **Request Logging:** All authenticated requests logged with client ID

---

## 📊 **What's Protected**

| Endpoint | Authentication Required | Description |
|----------|------------------------|-------------|
| `GET /health` | ❌ No | Public health check |
| `POST /v1/sse` | ✅ Yes | MCP SSE connection |

---

## 🛠️ **Implementation Details**

### Files Created/Modified

1. **`src/middleware/jwt-auth.ts`** - JWT authentication middleware
2. **`scripts/generate-jwt-token.js`** - Token generator CLI tool
3. **`scripts/generate-jwt-token.ts`** - TypeScript version
4. **`src/sse-server.ts`** - Updated with JWT auth middleware
5. **`.env.production`** - Added `JWT_SECRET`
6. **`package.json`** - Added `jsonwebtoken` dependency

### JWT Payload Structure

```json
{
  "sub": "claude-desktop",           // Client identifier
  "iat": 1768764219,                 // Issued at (Unix timestamp)
  "exp": 1800300219,                 // Expires at (Unix timestamp)
  "iss": "secondlayer-mcp"           // Issuer
}
```

### Authentication Flow

1. Client sends request with `Authorization: Bearer <token>` header
2. Middleware extracts and validates JWT token
3. If valid → attach client info to request and proceed
4. If invalid/expired → return 401 Unauthorized
5. Health endpoint bypasses authentication

---

## 🔄 **Token Rotation**

When a token is about to expire:

1. Generate a new token:
   ```bash
   node scripts/generate-jwt-token.js claude-desktop 365d
   ```

2. Update your MCP client configuration with the new token

3. Old token continues to work until expiration

4. No server restart required

---

## 📝 **Monitoring Authenticated Requests**

View authenticated requests in server logs:

```bash
ssh gate.lexapp.co.ua
cd ~/secondlayer
docker compose -f docker-compose.prod.yml logs -f app | grep "JWT authentication successful"
```

Logs include:
- Client ID (from JWT `sub` field)
- Request path
- IP address
- Timestamp

---

## 🚨 **Troubleshooting**

### "Missing Authorization header"

❌ **Problem:** Client didn't send Authorization header
✅ **Solution:** Add `Authorization: Bearer <token>` to headers

### "Invalid token"

❌ **Problem:** Token is malformed or signature doesn't match
✅ **Solution:** Generate a new token with the script

### "Token has expired"

❌ **Problem:** Token expiration time has passed
✅ **Solution:** Generate a new token (tokens last 365 days by default)

### "JWT_SECRET not configured"

❌ **Problem:** Server missing JWT_SECRET environment variable
✅ **Solution:** Verify `.env.production` has `JWT_SECRET` and redeploy

---

## 🔐 **Security Best Practices**

1. **Protect JWT Secret:** Never commit `JWT_SECRET` to git
2. **Token Storage:** Store tokens securely in MCP client config files
3. **Token Expiration:** Use reasonable expiration times (not "never" in production)
4. **Monitor Logs:** Regularly check for unauthorized access attempts
5. **Rotate Tokens:** Generate new tokens periodically for security
6. **HTTPS Only:** Never send tokens over unencrypted HTTP

---

## 📚 **Additional Resources**

- **JWT Standard:** https://jwt.io/
- **Token Generator Script:** `scripts/generate-jwt-token.js`
- **Middleware Code:** `src/middleware/jwt-auth.ts`
- **Deployment Guide:** `REMOTE_MCP_DEPLOYMENT.md`

---

## ✅ **Summary**

Your SecondLayer MCP server is now secured with JWT authentication:

- **Endpoint:** `https://mcp.legal.org.ua/v1/sse`
- **Authentication:** JWT Bearer token required
- **Your Token:** Valid until January 18, 2027
- **Tools Available:** 10 legal analysis tools
- **Status:** ✅ Deployed and verified

**Next Step:** Copy the client configuration above to your MCP client and restart!
