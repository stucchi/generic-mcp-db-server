# Generic MCP DB Server Integration for OpenCode

This guide shows how to integrate the **Generic MCP DB Server** with OpenCode to add database query capabilities to your AI assistant.

## Quick Start

### Option 1: Remote Server (Recommended)

Use the remote Generic MCP DB Server hosted on GitHub Container Registry:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "generic-db-server": {
      "type": "remote",
      "url": "http://localhost:3000/mcp",
      "enabled": true,
      "headers": {
        "X-API-Key": "your-api-key-here"
      },
      "oauth": false
    }
  }
}
```

### Option 2: Local Server

Run the Generic MCP DB Server locally and connect to it:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "generic-db-local": {
      "type": "local",
      "command": ["docker", "run", "--rm", "-p", "3000:3000",
        "-e", "API_KEY=your-api-key",
        "-e", "MYSQL_HOST=your-mysql-host",
        "-e", "MYSQL_USER=your-mysql-user",
        "-e", "MYSQL_PASSWORD=your-mysql-password",
        "-e", "MYSQL_DATABASE=your-database",
        "ghcr.io/stucchi/generic-mcp-db-server:latest"
      ],
      "environment": {
        "MCP_SERVER_URL": "http://localhost:3000/mcp"
      },
      "enabled": true
    }
  }
}
```

## Configuration Examples

### Production Setup

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "generic-db-prod": {
      "type": "remote",
      "url": "https://your-mcp-server.com/mcp",
      "enabled": true,
      "headers": {
        "X-API-Key": "{env:DB_MCP_API_KEY}",
        "Content-Type": "application/json"
      },
      "oauth": false,
      "timeout": 10000
    }
  }
}
```

### Development Setup with MongoDB

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "generic-db-dev": {
      "type": "local",
      "command": ["npx", "-y", "ghcr.io/stucchi/generic-mcp-db-server"],
      "environment": {
        "API_KEY": "dev-key-12345",
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "password",
        "MYSQL_DATABASE": "myapp",
        "MONGO_ENABLED": "true",
        "MONGO_URL": "mongodb://localhost:27017",
        "MONGO_DATABASE": "myapp_mongo"
      },
      "enabled": true
    }
  }
}
```

## Available Tools

When integrated, the following database tools become available in OpenCode:

### MySQL Tools
- `mysql_query`: Execute SELECT queries on MySQL database
- `mysql_describe`: Describe table structure
- `mysql_list_tables`: List all tables in database

### MongoDB Tools (when enabled)
- `mongo_query`: Query MongoDB collections
- `mongo_aggregate`: Execute aggregation pipelines
- `mongo_list_collections`: List all collections

## Usage Examples

### Basic Database Queries

Add `use the generic-db-server tool` to your prompts:

```
Show me the structure of the users table. use the generic-db-server tool
```

```
List all tables in the database and get the count of records in each. use the generic-db-server tool
```

```
Find all users who signed up in the last 30 days. use the generic-db-server tool
```

### Advanced MongoDB Queries (when enabled)

```
Search for documents in the products collection where price is greater than 100. use the generic-db-server tool
```

### Agent Configuration

Add to your `AGENTS.md`:

```markdown
When you need to query databases or analyze data, use the `generic-db-server` tools.

The server provides access to:
- MySQL databases (read-only queries)
- MongoDB databases (if enabled)

Always use the database tools when you need to:
- Check table structures
- Query for specific data
- Analyze database contents
- List available tables/collections
```

## Environment Setup

### Required Environment Variables

For the Generic MCP DB Server, set these environment variables:

```bash
# Required
API_KEY=your-secret-api-key
MYSQL_HOST=your-mysql-host
MYSQL_USER=your-mysql-user
MYSQL_PASSWORD=your-mysql-password
MYSQL_DATABASE=your-database

# Optional (for MongoDB support)
MONGO_ENABLED=true
MONGO_URL=mongodb://localhost:27017
MONGO_DATABASE=your-mongo-database
```

### OpenCode Configuration

Create or edit your `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "generic-db": {
      "type": "remote",
      "url": "http://localhost:3000/mcp",
      "enabled": true,
      "headers": {
        "X-API-Key": "{env:DB_MCP_API_KEY}"
      },
      "oauth": false
    }
  },
  "tools": {
    "generic-db*": true
  }
}
```

## Security Considerations

1. **API Key Management**: Store API keys in environment variables, not in config files
2. **Network Access**: Ensure the MCP server is accessible from your OpenCode instance
3. **Database Permissions**: Use read-only database users when possible
4. **Firewall Rules**: Restrict access to the MCP server from trusted networks only

## Troubleshooting

### Common Issues

1. **Connection Timeout**: Increase the `timeout` setting in your MCP configuration
2. **Authentication Error**: Verify your API key is correct and properly set
3. **Database Connection**: Check that database credentials are valid and databases are accessible
4. **CORS Issues**: Ensure the MCP server allows requests from your OpenCode instance

### Debug Commands

```bash
# Check MCP server status
curl -H "X-API-Key: your-key" http://localhost:3000/health

# Test MCP tools
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# List OpenCode MCP servers
opencode mcp list
```

## Best Practices

1. **Use Environment Variables**: Never hardcode credentials in configuration files
2. **Monitor Usage**: The MCP server adds to context, so monitor token usage
3. **Database Optimization**: Use efficient queries to avoid performance issues
4. **Regular Updates**: Keep the Generic MCP DB Server updated for security and features

## Support

- **Generic MCP DB Server**: https://github.com/stucchi/generic-mcp-db-server
- **OpenCode Documentation**: https://opencode.ai/docs/mcp-servers/
- **OpenCode Discord**: https://opencode.ai/discord