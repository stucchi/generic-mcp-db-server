# Generic MCP DB Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/stucchi/generic-mcp-db-server/workflows/Build%20and%20Publish%20Docker%20Image/badge.svg)](https://github.com/stucchi/generic-mcp-db-server/actions)
[![GitHub stars](https://img.shields.io/github/stars/stucchi/generic-mcp-db-server?style=social)](https://github.com/stucchi/generic-mcp-db-server/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/stucchi/generic-mcp-db-server?style=social)](https://github.com/stucchi/generic-mcp-db-server/network)
[![GitHub issues](https://img.shields.io/github/issues/stucchi/generic-mcp-db-server)](https://github.com/stucchi/generic-mcp-db-server/issues)
[![GitHub Package Registry](https://img.shields.io/badge/GHCR-Package-Registry-blue)](https://github.com/stucchi/generic-mcp-db-server/pkgs/container/generic-mcp-db-server)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Type: Module](https://img.shields.io/badge/Type-Module-blue)](https://img.shields.io/)
![MCP Server](https://badge.mcpx.dev?type=server&features=tools 'Model Context Protocol Server')
[![MCP Enabled](https://badge.mcpx.dev?status=on 'MCP Enabled')]

A flexible Model Context Protocol (MCP) server that provides database query capabilities via HTTP API and Server-Sent Events (SSE).

**Perfect for OpenCode integration** - Add database query tools to your AI assistant!

## Features

- **MySQL Support**: Execute read-only queries, describe tables, list tables
- **MongoDB Support**: Optional document database queries and aggregations  
- **Multiple Transport Methods**: HTTP JSON-RPC and Server-Sent Events
- **Secure API Authentication**: API key-based authentication
- **Docker Ready**: Optimized for containerized deployments
- **Configurable**: Environment-based configuration for different projects

## Quick Start

### Using Docker (Recommended)

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/stucchi/generic-mcp-db-server:latest

# Basic MySQL usage
docker run -d \
  --name mcp-server \
  -p 3000:3000 \
  -e API_KEY=your-secret-key \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_USER=your-user \
  -e MYSQL_PASSWORD=your-password \
  -e MYSQL_DATABASE=your-database \
  ghcr.io/stucchi/generic-mcp-db-server:latest
```

**Note:** The package is currently not published to npm. Use Docker or build from source for deployment.

### With MongoDB Support

```bash
docker run -d \
  --name mcp-server \
  -p 3000:3000 \
  -e API_KEY=your-secret-key \
  -e MYSQL_HOST=mysql \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  -e MYSQL_DATABASE=database \
  -e MONGO_ENABLED=true \
  -e MONGO_URL=mongodb://mongo:27017 \
  -e MONGO_DATABASE=app \
  ghcr.io/yourusername/generic-mcp-db-server:latest
```

## Configuration

All configuration is done via environment variables:

### Required
- `API_KEY`: Authentication key for API access
- `MYSQL_HOST`: MySQL server hostname
- `MYSQL_USER`: MySQL username  
- `MYSQL_PASSWORD`: MySQL password
- `MYSQL_DATABASE`: MySQL database name

### Optional
- `PORT`: Server port (default: 3000)
- `MONGO_ENABLED`: Enable MongoDB (true/false)
- `MONGO_URL`: MongoDB connection string
- `MONGO_DATABASE`: MongoDB database name

## API Endpoints

### Health Check
```
GET /health
```

### Server-Sent Events (SSE)
```
GET /sse
Headers: X-API-Key: your-api-key
```

### HTTP JSON-RPC
```
POST /mcp
Headers: X-API-Key: your-api-key
Body: MCP JSON-RPC request
```

## Available Tools

### MySQL Tools
- `mysql_query`: Execute SELECT queries
- `mysql_describe`: Describe table structure
- `mysql_list_tables`: List all tables

### MongoDB Tools (when enabled)
- `mongo_query`: Query MongoDB collections
- `mongo_aggregate`: Execute aggregation pipelines
- `mongo_list_collections`: List all collections



## Development

```bash
# Clone and setup
git clone https://github.com/stucchi/generic-mcp-db-server.git
cd generic-mcp-db-server
npm install

# Development mode
npm run dev

# Production mode
npm start
```

## OpenCode Integration

Add database query capabilities to OpenCode AI assistant:

### Quick Setup

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "generic-db-server": {
      "type": "remote",
      "url": "http://localhost:3000/mcp",
      "enabled": true,
      "headers": {
        "X-API-Key": "{env:GENERIC_DB_API_KEY}"
      },
      "oauth": false
    }
  }
}
```

### Usage

Add `use the generic-db-server tool` to your OpenCode prompts:

```
Show me the structure of the users table. use the generic-db-server tool
```

📖 **Full integration guide**: [docs/opencode-integration.md](docs/opencode-integration.md)

## Docker Development

```bash
# Build image
docker build -t generic-mcp-db-server .

# Run with local environment
docker run -d \
  --name mcp-dev \
  -p 3000:3000 \
  --env-file .env.local \
  generic-mcp-db-server
```

## Security

- Only read-only SQL queries are allowed
- API key authentication required
- Input validation and sanitization
- CORS support for web applications

## License

MIT License - see LICENSE file for details.