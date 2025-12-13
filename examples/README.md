# OpenCode Integration Examples

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![MCP Server](https://badge.mcpx.dev?type=server&features=tools 'Model Context Protocol Server')

This repository contains example configurations for integrating the Generic MCP DB Server with OpenCode.

## Files

- `opencode-config.json` - Complete OpenCode configuration with Generic MCP DB Server
- `database-agent.md` - Example OpenCode agent specialized for database operations

## Quick Start

1. Copy the configuration to your OpenCode setup:
```bash
cp opencode-config.json ~/.config/opencode/opencode.json
```

2. Set required environment variables:
```bash
export GENERIC_DB_API_KEY="your-api-key-here"
```

3. Start the Generic MCP DB Server:
```bash
docker run -d --name mcp-db -p 3000:3000 \
  -e API_KEY=$GENERIC_DB_API_KEY \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_USER=your-mysql-user \
  -e MYSQL_PASSWORD=your-mysql-password \
  -e MYSQL_DATABASE=your-database \
  ghcr.io/stucchi/generic-mcp-db-server:latest
```

4. Test in OpenCode:
```
List all tables in the database. use the generic-db-server tool
```

## Example Usage Scenarios

### Database Exploration
```
Show me the structure of all tables in the database. use the generic-db-server tool
```

### Data Analysis
```
Find the top 10 users by registration date. use the generic-db-server tool
```

### MongoDB Integration (if enabled)
```
Search for documents in the products collection where price is greater than 100. use the generic-db-server tool
```