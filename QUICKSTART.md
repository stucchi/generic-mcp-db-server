# Generic MCP DB Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/stucchi/generic-mcp-db-server/workflows/Build%20and%20Publish%20Docker%20Image/badge.svg)](https://github.com/stucchi/generic-mcp-db-server/actions)
![MCP Server](https://badge.mcpx.dev?type=server&features=tools 'Model Context Protocol Server')

A flexible Model Context Protocol (MCP) server that provides database query capabilities via HTTP API and Server-Sent Events (SSE).

## Quick Start with Docker

```bash
# Clone and run
git clone https://github.com/yourusername/generic-mcp-db-server.git
cd generic-mcp-db-server
docker-compose up

# Test the server
curl http://localhost:3000/health
```

The server will be available at `http://localhost:3000` with:
- Health check: `/health`
- HTTP MCP endpoint: `/mcp` 
- SSE endpoint: `/sse`

## Usage in Projects

### 1. Basic Docker Compose Integration

Add to your `docker-compose.yml`:

```yaml
services:
  mcp-db-server:
    image: ghcr.io/yourusername/generic-mcp-db-server:latest
    ports:
      - "3000:3000"
    environment:
      - API_KEY=${MCP_API_KEY}
      - MYSQL_HOST=${DB_HOST}
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASSWORD}
      - MYSQL_DATABASE=${DB_NAME}
```

### 2. Environment Configuration

Configure via environment variables:
- `API_KEY`: Your secret API key
- `MYSQL_*`: MySQL connection settings
- `MONGO_ENABLED=true`: Enable MongoDB support
- `DATADOG_ENABLED=true`: Enable Datadog logging

### 3. API Usage

```bash
# List available tools
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Execute MySQL query
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"mysql_query",
      "arguments":{"query":"SELECT COUNT(*) as total FROM users"}
    }
  }'
```

## Development

```bash
npm install
npm run dev
```

## Deploy

- Push to GitHub Actions to auto-build Docker image
- Pull `ghcr.io/yourusername/generic-mcp-db-server:latest`
- Configure with your environment variables