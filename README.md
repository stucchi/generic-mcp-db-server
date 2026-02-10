# Generic MCP DB Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/stucchi/generic-mcp-db-server/workflows/Build%20and%20Publish%20Docker%20Image/badge.svg)](https://github.com/stucchi/generic-mcp-db-server/actions)
[![GitHub stars](https://img.shields.io/github/stars/stucchi/generic-mcp-db-server?style=social)](https://github.com/stucchi/generic-mcp-db-server/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/stucchi/generic-mcp-db-server?style=social)](https://github.com/stucchi/generic-mcp-db-server/network)
[![GitHub issues](https://img.shields.io/github/issues/stucchi/generic-mcp-db-server)](https://github.com/stucchi/generic-mcp-db-server/issues)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Type: Module](https://img.shields.io/badge/Type-Module-blue)](https://img.shields.io/)
![MCP Server](https://badge.mcpx.dev?type=server&features=tools 'Model Context Protocol Server')
[![MCP Enabled](https://badge.mcpx.dev?status=on 'MCP Enabled')]

A flexible Model Context Protocol (MCP) server that provides **multi-database** query capabilities via HTTP API and Server-Sent Events (SSE).

**v2.0 Highlights**: Support for unlimited simultaneous databases with configurable read-only/read-write modes for MySQL and MongoDB.

**Perfect for OpenCode integration** - Add database query tools to your AI assistant!

## Features

- **Multi-Database Support**: Connect to unlimited MySQL and MongoDB databases simultaneously
- **Read-Only/Read-Write Modes**: Configure each database with appropriate access levels
- **Flexible Configuration**: JSON file, environment variables, or legacy single-database format
- **Security**: Code-level validation prevents write operations on read-only databases
- **Multiple Transport Methods**: HTTP JSON-RPC and Server-Sent Events
- **Graceful Degradation**: Server continues operating even if some databases fail to connect
- **Docker Ready**: Optimized for containerized deployments

## Quick Start

### Using Docker (Recommended)

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/stucchi/generic-mcp-db-server:latest

# Basic usage with configuration file
docker run -d \
  --name mcp-server \
  -p 3000:3000 \
  -e API_KEY=your-secret-key \
  -v $(pwd)/databases.json:/app/databases.json \
  ghcr.io/stucchi/generic-mcp-db-server:latest
```

**Note:** The package is currently not published to npm. Use Docker or build from source for deployment.

## Configuration

### Option 1: Configuration File (Recommended)

Create a `databases.json` file in the project root:

```json
{
  "databases": [
    {
      "id": "prod_read",
      "type": "mysql",
      "mode": "read-only",
      "host": "prod-db.example.com",
      "port": 3306,
      "user": "readonly_user",
      "password": "${PROD_READ_PASSWORD}",
      "database": "production"
    },
    {
      "id": "prod_write",
      "type": "mysql",
      "mode": "read-write",
      "host": "prod-db.example.com",
      "port": 3306,
      "user": "write_user",
      "password": "${PROD_WRITE_PASSWORD}",
      "database": "production"
    },
    {
      "id": "analytics",
      "type": "mongodb",
      "mode": "read-only",
      "url": "mongodb://analytics.example.com:27017",
      "database": "analytics"
    }
  ]
}
```

Environment variables in the format `${VAR_NAME}` are automatically expanded.

### Option 2: Environment Variables

Configure databases using `DATABASE_<INDEX>_<PROPERTY>` format:

```bash
# Production read-only MySQL
DATABASE_0_ID=prod_read
DATABASE_0_TYPE=mysql
DATABASE_0_MODE=read-only
DATABASE_0_HOST=prod-db.example.com
DATABASE_0_USER=readonly_user
DATABASE_0_PASSWORD=${PROD_READ_PASSWORD}
DATABASE_0_DATABASE=production

# Production read-write MySQL
DATABASE_1_ID=prod_write
DATABASE_1_TYPE=mysql
DATABASE_1_MODE=read-write
DATABASE_1_HOST=prod-db.example.com
DATABASE_1_USER=write_user
DATABASE_1_PASSWORD=${PROD_WRITE_PASSWORD}
DATABASE_1_DATABASE=production

# MongoDB analytics
DATABASE_2_ID=analytics
DATABASE_2_TYPE=mongodb
DATABASE_2_MODE=read-only
DATABASE_2_URL=mongodb://analytics.example.com:27017
DATABASE_2_DATABASE=analytics
```

### Option 3: Legacy Configuration (Backward Compatible)

For simple single-database setups, the old format still works:

```bash
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=mydb
```

This creates a database with `id="default"` and `mode="read-only"`.

### Database Configuration Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for this database (used in tool calls) |
| `type` | string | Yes | Database type: `mysql` or `mongodb` |
| `mode` | string | No | Access mode: `read-only` or `read-write` (default: `read-write`) |
| `host` | string | MySQL | MySQL server hostname |
| `port` | number | No | MySQL port (default: 3306) |
| `user` | string | MySQL | MySQL username |
| `password` | string | MySQL | MySQL password |
| `database` | string | Yes | Database name (MySQL) or database name (MongoDB) |
| `url` | string | MongoDB | MongoDB connection string |
| `connectionLimit` | number | No | MySQL connection pool size (default: 10) |

## API Endpoints

### Health Check
```
GET /health
```

Returns server status and all configured database connections:
```json
{
  "status": "ok",
  "server": "generic-mcp-db-server",
  "version": "2.0.0",
  "databases": {
    "prod_read": {
      "type": "mysql",
      "mode": "read-only",
      "status": "connected",
      "database": "production"
    },
    "prod_write": {
      "type": "mysql",
      "mode": "read-write",
      "status": "connected",
      "database": "production"
    }
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
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

### Universal Tools

| Tool | Description |
|------|-------------|
| `query` | Execute read-only queries (MySQL SELECT, MongoDB find) |
| `execute` | Execute write queries on read-write MySQL databases |
| `describe` | Describe table (MySQL) or collection (MongoDB) structure |
| `list_databases` | List all configured databases and their status |

### MySQL-Specific Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables in a MySQL database |

### MongoDB-Specific Tools

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections in a MongoDB database |
| `aggregate` | Execute aggregation pipelines |

## Usage Examples

### Query a read-only MySQL database

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "query",
    "arguments": {
      "database": "prod_read",
      "query": "SELECT * FROM users WHERE id = ?"
    }
  },
  "id": 1
}
```

### Execute a write query

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "execute",
    "arguments": {
      "database": "prod_write",
      "query": "UPDATE users SET status = ? WHERE id = ?"
    }
  },
  "id": 2
}
```

**Note**: Attempting to use `execute` on a read-only database will return an error:
```
Database 'prod_read' is in READ-ONLY mode. Write operations are not allowed.
```

### MongoDB query

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "query",
    "arguments": {
      "database": "analytics",
      "collection": "events",
      "filter": { "status": "active" },
      "limit": 100
    }
  },
  "id": 3
}
```

### MongoDB aggregation

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "aggregate",
    "arguments": {
      "database": "analytics",
      "collection": "events",
      "pipeline": [
        { "$match": { "status": "active" } },
        { "$group": { "_id": "$type", "count": { "$sum": 1 } } }
      ]
    }
  },
  "id": 4
}
```

### List configured databases

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_databases",
    "arguments": {}
  },
  "id": 5
}
```

Returns:
```json
[
  {
    "id": "prod_read",
    "type": "mysql",
    "mode": "read-only",
    "status": "connected",
    "database": "production",
    "host": "prod-db.example.com"
  },
  {
    "id": "prod_write",
    "type": "mysql",
    "mode": "read-write",
    "status": "connected",
    "database": "production",
    "host": "prod-db.example.com"
  }
]
```

## Development

```bash
# Clone and setup
git clone https://github.com/stucchi/generic-mcp-db-server.git
cd generic-mcp-db-server
npm install

# Copy and edit configuration
cp databases.json.example databases.json
# Edit databases.json with your database connections

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
Show me the structure of the users table in the production database. use the generic-db-server tool
```

```
Count all active users in the read-only prod database. use the generic-db-server tool
```

📖 **Full integration guide**: [docs/opencode-integration.md](docs/opencode-integration.md)

## Docker Development

```bash
# Build image
docker build -t generic-mcp-db-server .

# Run with configuration file
docker run -d \
  --name mcp-dev \
  -p 3000:3000 \
  -v $(pwd)/databases.json:/app/databases.json \
  generic-mcp-db-server

# Run with environment variables
docker run -d \
  --name mcp-dev \
  -p 3000:3000 \
  -e API_KEY=dev-key \
  -e DATABASE_0_ID=local \
  -e DATABASE_0_TYPE=mysql \
  -e DATABASE_0_MODE=read-write \
  -e DATABASE_0_HOST=host.docker.internal \
  -e DATABASE_0_USER=root \
  -e DATABASE_0_PASSWORD=password \
  -e DATABASE_0_DATABASE=mydb \
  generic-mcp-db-server
```

## Migration from v1.x to v2.0

### Breaking Changes

1. **Tool names changed**: The old `mysql_query`, `mongo_query` tools are now unified into `query` with a `database` parameter
2. **Tool parameters**: All tools now require a `database` parameter

### Migration Steps

**Old (v1.x):**
```json
{
  "name": "mysql_query",
  "arguments": {
    "query": "SELECT * FROM users"
  }
}
```

**New (v2.0):**
```json
{
  "name": "query",
  "arguments": {
    "database": "default",
    "query": "SELECT * FROM users"
  }
}
```

### Backward Compatibility

If you use the legacy environment variables (`MYSQL_HOST`, `MYSQL_DATABASE`, etc.), the server will automatically create a database with:
- `id`: "default"
- `mode`: "read-only"

This allows existing configurations to work without changes.

## Security

- **Read-Only Enforcement**: Code-level validation prevents write operations on databases marked as read-only
- **API Key Authentication**: All requests require a valid API key
- **Input Validation**: All inputs are validated and sanitized
- **CORS Support**: Configurable for web applications
- **Graceful Failure**: Server continues operating if individual databases fail

## License

MIT License - see LICENSE file for details.
