#!/bin/bash

# SecondLayer MCP Remote Wrapper
# Connects to remote SSE MCP server via local stdio

# Configuration
REMOTE_URL="${MCP_REMOTE_URL:-https://mcp.legal.org.ua/v1/sse}"
JWT_TOKEN="${MCP_JWT_TOKEN:?Error: MCP_JWT_TOKEN environment variable is required. Generate one with: npx tsx scripts/generate-jwt-token.ts}"

# Use npx to run the MCP client proxy
# This requires @modelcontextprotocol/sdk to be installed
exec npx -y @modelcontextprotocol/sdk sse-client "$REMOTE_URL" --header "Authorization: Bearer $JWT_TOKEN"
