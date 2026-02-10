/**
 * Generic MCP DB Server (HTTP/SSE Transport)
 * Provides tools to query MySQL and MongoDB databases via Model Context Protocol
 * Accessible remotely via HTTP with Server-Sent Events
 *
 * v2.0.0 - Multi-database support with read-only/read-write modes
 */

import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================================================
// CONFIGURATION
// ============================================================================================================

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'your-secret-api-key-change-this';
const SERVER_VERSION = '2.0.1';

/**
 * Load database configurations from file or environment variables
 * Supports backward compatibility with legacy single-database configuration
 */
function loadDatabaseConfigs() {
  // 1. Try DATABASES_JSON file path
  const configPath = process.env.DATABASES_JSON || join(process.cwd(), 'databases.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      console.log(`[Config] Loaded databases from ${configPath}`);
      return expandEnvVars(config.databases || []);
    } catch (error) {
      console.warn(`[Config] Failed to load databases.json: ${error.message}`);
    }
  }

  // 2. Parse env vars with prefix DATABASE_*
  const envDatabases = parseEnvVarDatabases();
  if (envDatabases.length > 0) {
    console.log(`[Config] Loaded ${envDatabases.length} database(s) from environment variables`);
    return envDatabases;
  }

  // 3. Fallback to legacy single-database configuration (backward compatibility)
  if (process.env.MYSQL_HOST || process.env.MONGO_URL) {
    console.log('[Config] Using legacy single-database configuration (backward compatibility mode)');
    return createLegacyDatabaseConfig();
  }

  console.warn('[Config] No databases configured');
  return [];
}

/**
 * Expand environment variables in config values (${VAR_NAME} syntax)
 */
function expandEnvVars(obj) {
  if (typeof obj === 'string' && obj.startsWith('${') && obj.endsWith('}')) {
    const varName = obj.slice(2, -1);
    const envValue = process.env[varName];
    if (envValue === undefined) {
      console.warn(`[Config] Environment variable ${varName} not found`);
    }
    return envValue !== undefined ? envValue : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(expandEnvVars);
  }

  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVars(value);
    }
    return result;
  }

  return obj;
}

/**
 * Parse database configurations from DATABASE_* environment variables
 * Supports format: DATABASE_0_ID, DATABASE_0_TYPE, DATABASE_0_MODE, etc.
 */
function parseEnvVarDatabases() {
  const databases = [];
  const databaseEnvVars = {};

  // Collect all DATABASE_* environment variables
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('DATABASE_')) {
      const match = key.match(/^DATABASE_(\d+)_(.+)$/);
      if (match) {
        const index = parseInt(match[1]);
        const prop = match[2].toLowerCase();
        if (!databaseEnvVars[index]) {
          databaseEnvVars[index] = {};
        }
        databaseEnvVars[index][prop] = value;
      }
    }
  }

  // Convert to database config objects
  for (const index of Object.keys(databaseEnvVars).sort()) {
    const config = databaseEnvVars[index];
    if (config.id && config.type) {
      databases.push({
        id: config.id,
        type: config.type,
        mode: config.mode || 'read-write',
        ...config
      });
    }
  }

  return databases;
}

/**
 * Create legacy single-database configuration for backward compatibility
 */
function createLegacyDatabaseConfig() {
  const databases = [];

  // Legacy MySQL configuration
  if (process.env.MYSQL_HOST) {
    databases.push({
      id: 'default',
      type: 'mysql',
      mode: 'read-only', // Legacy behavior was read-only
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'database',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  // Legacy MongoDB configuration
  if (process.env.MONGO_ENABLED === 'true' && process.env.MONGO_URL) {
    databases.push({
      id: 'mongodb',
      type: 'mongodb',
      mode: 'read-only',
      url: process.env.MONGO_URL,
      database: process.env.MONGO_DATABASE || 'database'
    });
  }

  return databases;
}

// ============================================================================================================
// DATABASE CONNECTIONS
// ============================================================================================================

/**
 * Map of database connections: id -> { pool/client, db, config, type, status }
 */
const connections = new Map();

async function initDatabases() {
  const dbConfigs = loadDatabaseConfigs();

  if (dbConfigs.length === 0) {
    console.warn('[Database] No databases configured - server will start but no tools will be available');
    return true;
  }

  for (const dbConfig of dbConfigs) {
    try {
      if (dbConfig.type === 'mysql') {
        const pool = mysql.createPool(dbConfig);
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();

        connections.set(dbConfig.id, {
          pool,
          config: dbConfig,
          type: 'mysql',
          status: 'connected'
        });

        console.log(`[${dbConfig.id}] MySQL connected successfully (${dbConfig.mode})`);
      } else if (dbConfig.type === 'mongodb') {
        const client = new MongoClient(dbConfig.url);
        await client.connect();
        const db = client.db(dbConfig.database);
        await db.admin().ping();

        connections.set(dbConfig.id, {
          client,
          db,
          config: dbConfig,
          type: 'mongodb',
          status: 'connected'
        });

        console.log(`[${dbConfig.id}] MongoDB connected successfully (${dbConfig.mode})`);
      }
    } catch (error) {
      console.warn(`[${dbConfig.id}] Connection failed: ${error.message}`);
      // Store as failed so tools can provide appropriate error messages
      connections.set(dbConfig.id, {
        config: dbConfig,
        type: dbConfig.type,
        status: 'failed',
        error: error.message
      });
    }
  }

  return true;
}

async function closeDatabases() {
  try {
    for (const [id, conn] of connections) {
      try {
        if (conn.type === 'mysql' && conn.pool) {
          await conn.pool.end();
          console.log(`[${id}] MySQL connection closed`);
        } else if (conn.type === 'mongodb' && conn.client) {
          await conn.client.close();
          console.log(`[${id}] MongoDB connection closed`);
        }
      } catch (error) {
        console.error(`[${id}] Error closing connection:`, error.message);
      }
    }
    connections.clear();
  } catch (error) {
    console.error('[Database] Error closing connections:', error.message);
  }
}

/**
 * Get a database connection by ID
 */
function getConnection(id) {
  const conn = connections.get(id);
  if (!conn) {
    const availableIds = Array.from(connections.keys()).join(', ');
    throw new Error(
      `Database '${id}' not found. Available databases: ${availableIds || 'none'}`
    );
  }
  if (conn.status !== 'connected') {
    throw new Error(
      `Database '${id}' is not connected. Status: ${conn.status}` +
      (conn.error ? ` - ${conn.error}` : '')
    );
  }
  return conn;
}

/**
 * Get all database IDs
 */
function getDatabaseIds() {
  return Array.from(connections.keys()).filter(id => {
    const conn = connections.get(id);
    return conn && conn.status === 'connected';
  });
}

/**
 * Get database info for health check
 */
function getDatabaseInfo() {
  const info = {};
  for (const [id, conn] of connections) {
    info[id] = {
      type: conn.type,
      mode: conn.config?.mode || 'unknown',
      status: conn.status,
      database: conn.config?.database || 'unknown'
    };
  }
  return info;
}

// ============================================================================================================
// QUERY VALIDATION
// ============================================================================================================

/**
 * Validate that a query operation matches the database mode
 * @param {Object} dbConfig - Database configuration
 * @param {string} query - Query string to validate
 * @param {boolean} isMongoDB - Whether this is a MongoDB operation
 */
function validateQueryOperation(dbConfig, query, isMongoDB = false) {
  const mode = dbConfig.mode || 'read-write';

  // For MongoDB, we need to check at runtime what operation is being performed
  // For now, we'll be conservative and allow most operations on read-write only
  if (isMongoDB) {
    if (mode === 'read-only') {
      // MongoDB read-only mode - we'll check the tool being used
      // query/find operations are ok, insert/update/delete are not
    }
    return;
  }

  // For MySQL, check the query type
  const trimmedQuery = query.trim().toLowerCase();
  const readOnlyPatterns = ['select', 'show', 'describe', 'explain', 'with'];
  const isReadOnlyQuery = readOnlyPatterns.some(p => trimmedQuery.startsWith(p));

  if (mode === 'read-only' && !isReadOnlyQuery) {
    throw new Error(
      `Database '${dbConfig.id}' is in READ-ONLY mode. ` +
      `Only SELECT, SHOW, DESCRIBE, EXPLAIN queries are allowed. ` +
      `Use a read-write database for modifications.`
    );
  }
}

/**
 * Check if a database is in read-only mode
 */
function isReadOnlyDatabase(id) {
  const conn = connections.get(id);
  return conn?.config?.mode === 'read-only';
}

// ============================================================================================================
// MCP SERVER CLASS
// ============================================================================================================

class GenericMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "generic-mcp-db-server",
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  // Shared tools list definition - used by both SSE and HTTP transports
  static getToolsList() {
    return [
        {
          name: "query",
          description: "Execute a read-only query on a configured database. For MySQL: SELECT, SHOW, DESCRIBE queries. For MongoDB: find queries.",
          inputSchema: {
            type: "object",
            properties: {
              database: {
                type: "string",
                description: "Database ID from configuration (e.g., default, prod_read, staging)"
              },
              query: {
                type: "string",
                description: "SQL SELECT query for MySQL databases"
              },
              collection: {
                type: "string",
                description: "Collection name for MongoDB find queries"
              },
              filter: {
                type: "object",
                description: "MongoDB filter object (optional, default: {})"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 100, max: 1000)"
              }
            },
            required: ["database"]
          }
        },
        {
          name: "execute",
          description: "Execute a write query on a read-write MySQL database (INSERT, UPDATE, DELETE, etc.). Only works on databases with mode='read-write'.",
          inputSchema: {
            type: "object",
            properties: {
              database: {
                type: "string",
                description: "Database ID (must be configured with mode='read-write')"
              },
              query: {
                type: "string",
                description: "SQL query to execute (INSERT, UPDATE, DELETE, etc.)"
              }
            },
            required: ["database", "query"]
          }
        },
        {
          name: "describe",
          description: "Describe the structure of a table (MySQL) or collection (MongoDB)",
          inputSchema: {
            type: "object",
            properties: {
              database: {
                type: "string",
                description: "Database ID"
              },
              table: {
                type: "string",
                description: "Table name for MySQL databases"
              },
              collection: {
                type: "string",
                description: "Collection name for MongoDB databases"
              }
            },
            required: ["database"]
          }
        },
        {
          name: "list_tables",
          description: "List all tables in a MySQL database",
          inputSchema: {
            type: "object",
            properties: {
              database: {
                type: "string",
                description: "MySQL Database ID"
              }
            },
            required: ["database"]
          }
        },
        {
          name: "list_collections",
          description: "List all collections in a MongoDB database",
          inputSchema: {
            type: "object",
            properties: {
              database: {
                type: "string",
                description: "MongoDB Database ID"
              }
            },
            required: ["database"]
          }
        },
        {
          name: "aggregate",
          description: "Execute an aggregation pipeline on a MongoDB collection",
          inputSchema: {
            type: "object",
            properties: {
              database: {
                type: "string",
                description: "MongoDB Database ID"
              },
              collection: {
                type: "string",
                description: "Collection name to aggregate"
              },
              pipeline: {
                type: "array",
                description: "MongoDB aggregation pipeline array"
              }
            },
            required: ["database", "collection", "pipeline"]
          }
        },
        {
          name: "list_databases",
          description: "List all configured databases and their status",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ];
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      console.log('\n[Server] Shutting down...');
      await closeDatabases();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n[Server] Shutting down...');
      await closeDatabases();
      process.exit(0);
    });
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = GenericMCPServer.getToolsList();
      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "query":
            return await this.handleQuery(args);
          case "execute":
            return await this.handleExecute(args);
          case "describe":
            return await this.handleDescribe(args);
          case "list_tables":
            return await this.handleListTables(args);
          case "list_collections":
            return await this.handleListCollections(args);
          case "aggregate":
            return await this.handleAggregate(args);
          case "list_databases":
            return await this.handleListDatabases();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  // Unified query handler for MySQL SELECT and MongoDB find
  async handleQuery(args) {
    const { database, query, collection, filter = {}, limit = 100 } = args;

    const conn = getConnection(database);

    if (conn.type === 'mysql') {
      if (!query) {
        throw new Error('Missing required parameter: query (for MySQL databases)');
      }

      // Validate read-only
      validateQueryOperation(conn.config, query, false);

      const [rows] = await conn.pool.execute(query);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2)
          }
        ]
      };
    } else if (conn.type === 'mongodb') {
      if (!collection) {
        throw new Error('Missing required parameter: collection (for MongoDB databases)');
      }

      // MongoDB find is read-only, no validation needed for mode
      const results = await conn.db
        .collection(collection)
        .find(filter)
        .limit(Math.min(limit, 1000))
        .toArray();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }

    throw new Error(`Unknown database type: ${conn.type}`);
  }

  // Execute write operations on MySQL
  async handleExecute(args) {
    const { database, query } = args;

    const conn = getConnection(database);

    if (conn.type !== 'mysql') {
      throw new Error('Execute is only supported for MySQL databases. Use aggregate for MongoDB.');
    }

    if (isReadOnlyDatabase(database)) {
      throw new Error(
        `Database '${database}' is in READ-ONLY mode. ` +
        `Write operations are not allowed. Use a database configured with mode='read-write'.`
      );
    }

    // Allow write operations since this is the execute tool and we checked the mode
    const result = await conn.pool.execute(query);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            affectedRows: result[0]?.affectedRows || 0,
            insertId: result[0]?.insertId || 0,
            changedRows: result[0]?.changedRows || 0
          }, null, 2)
        }
      ]
    };
  }

  // Describe table or collection
  async handleDescribe(args) {
    const { database, table, collection } = args;

    const conn = getConnection(database);

    if (conn.type === 'mysql') {
      if (!table) {
        throw new Error('Missing required parameter: table (for MySQL databases)');
      }

      const sanitizedTable = table.replace(/[^a-zA-Z0-9_]/g, '');
      const [rows] = await conn.pool.execute(`DESCRIBE ${sanitizedTable}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2)
          }
        ]
      };
    } else if (conn.type === 'mongodb') {
      if (!collection) {
        throw new Error('Missing required parameter: collection (for MongoDB databases)');
      }

      // Get collection info
      const stats = await conn.db.collection(collection).aggregate([
        { $collStats: { storageStats: {} } }
      ]).toArray();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(stats, null, 2)
          }
        ]
      };
    }

    throw new Error(`Unknown database type: ${conn.type}`);
  }

  // List MySQL tables
  async handleListTables(args) {
    const { database } = args;

    const conn = getConnection(database);

    if (conn.type !== 'mysql') {
      throw new Error('list_tables is only supported for MySQL databases');
    }

    const [rows] = await conn.pool.execute('SHOW TABLES');

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(rows, null, 2)
        }
      ]
    };
  }

  // List MongoDB collections
  async handleListCollections(args) {
    const { database } = args;

    const conn = getConnection(database);

    if (conn.type !== 'mongodb') {
      throw new Error('list_collections is only supported for MongoDB databases');
    }

    const collections = await conn.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(collectionNames, null, 2)
        }
      ]
    };
  }

  // MongoDB aggregation
  async handleAggregate(args) {
    const { database, collection, pipeline } = args;

    const conn = getConnection(database);

    if (conn.type !== 'mongodb') {
      throw new Error('aggregate is only supported for MongoDB databases');
    }

    // Check if read-only for operations that might modify data
    if (isReadOnlyDatabase(database)) {
      // Check pipeline for write operations like $out, $merge
      const pipelineStr = JSON.stringify(pipeline);
      if (pipelineStr.includes('$out') || pipelineStr.includes('$merge')) {
        throw new Error(
          `Database '${database}' is in READ-ONLY mode. ` +
          `Aggregation pipelines with $out or $merge are not allowed.`
        );
      }
    }

    const results = await conn.db
      .collection(collection)
      .aggregate(pipeline)
      .toArray();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }

  // List configured databases
  async handleListDatabases() {
    const dbInfo = [];

    for (const [id, conn] of connections) {
      dbInfo.push({
        id,
        type: conn.type,
        mode: conn.config?.mode || 'unknown',
        status: conn.status,
        database: conn.config?.database || 'unknown',
        host: conn.config?.host || conn.config?.url || 'unknown'
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(dbInfo, null, 2)
        }
      ]
    };
  }

  getServer() {
    return this.server;
  }
}

// ============================================================================================================
// EXPRESS HTTP SERVER WITH SSE
// ============================================================================================================

async function startHTTPServer() {
  const app = express();

  // Middleware
  app.use(cors());

  // Raw body parser for SSE message endpoint (must come before express.json)
  app.use('/message', express.raw({ type: '*/*', limit: '10mb' }));

  // JSON parser for other endpoints
  app.use(express.json());

  // Simple API key authentication middleware
  const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (apiKey !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    next();
  };

  // Store active SSE sessions and their transports
  const sessions = new Map();
  const transports = new Map();

  // Health check endpoint (no auth required)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      server: 'generic-mcp-db-server',
      version: SERVER_VERSION,
      databases: getDatabaseInfo(),
      timestamp: new Date().toISOString()
    });
  });

  // MCP SSE endpoint (requires authentication)
  app.get('/sse', authenticate, async (req, res) => {
    console.log('[SSE] New client connected');

    // Generate a unique session ID
    const sessionId = Math.random().toString(36).substring(7);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-ID', sessionId);

    const mcpServer = new GenericMCPServer();

    // Create a custom SSE transport handler
    const transport = {
      async start() {
        console.log(`[SSE] Session ${sessionId} started`);
      },
      async close() {
        console.log(`[SSE] Session ${sessionId} closed`);
      },
      async send(message) {
        try {
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(message)}\n\n`);
        } catch (err) {
          console.error(`[SSE] Error sending message:`, err);
        }
      }
    };

    // Store the session and transport
    sessions.set(sessionId, { mcpServer, transport, res });
    transports.set(sessionId, mcpServer);

    await mcpServer.getServer().connect(transport);

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[SSE] Session ${sessionId} disconnected`);
      sessions.delete(sessionId);
      transports.delete(sessionId);
    });
  });

  // MCP message endpoint (requires authentication) - handles POST from SSE clients
  app.post('/message', authenticate, async (req, res) => {
    const sessionId = req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    try {
      // Parse the request body (it's raw buffer due to express.raw)
      const message = JSON.parse(req.body.toString());

      // Process through the MCP server
      const response = await session.mcpServer.getServer().request(
        message,
        CallToolRequestSchema
      );

      // Send response via SSE
      await session.transport.send({
        jsonrpc: '2.0',
        id: message.id,
        result: response
      });

      res.status(202).end();
    } catch (error) {
      console.error('[Message] Error:', error);
      await session.transport.send({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: { code: -32603, message: error.message }
      });
      res.status(202).end();
    }
  });

  // Create a shared MCP server instance for HTTP transport
  const sharedMCPServer = new GenericMCPServer();

  // HTTP MCP endpoint (JSON-RPC over HTTP)
  app.post('/mcp', authenticate, async (req, res) => {
    console.log('[HTTP] MCP request received:', req.body.method);

    try {
      const { method, params, id, jsonrpc } = req.body;

      if (jsonrpc !== '2.0') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' },
          id: id || null
        });
      }

      // Handle different MCP methods
      let result;

      if (method === 'initialize') {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'generic-mcp-db-server', version: SERVER_VERSION }
        };
      } else if (method === 'notifications/initialized') {
        return res.status(200).json({ jsonrpc: '2.0', id });
      } else if (method === 'tools/list') {
        result = { tools: GenericMCPServer.getToolsList() };
      } else if (method === 'tools/call') {
        const toolName = params.name;
        const toolArgs = params.arguments || {};

        // Route to appropriate handler
        let handlerResult;
        switch (toolName) {
          case 'query':
            handlerResult = await sharedMCPServer.handleQuery(toolArgs);
            break;
          case 'execute':
            handlerResult = await sharedMCPServer.handleExecute(toolArgs);
            break;
          case 'describe':
            handlerResult = await sharedMCPServer.handleDescribe(toolArgs);
            break;
          case 'list_tables':
            handlerResult = await sharedMCPServer.handleListTables(toolArgs);
            break;
          case 'list_collections':
            handlerResult = await sharedMCPServer.handleListCollections(toolArgs);
            break;
          case 'aggregate':
            handlerResult = await sharedMCPServer.handleAggregate(toolArgs);
            break;
          case 'list_databases':
            handlerResult = await sharedMCPServer.handleListDatabases();
            break;
          default:
            return res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32601, message: `Tool not found: ${toolName}` },
              id
            });
        }
        result = handlerResult.content[0].text;
        // Parse back from JSON for consistency
        try {
          result = JSON.parse(result);
        } catch {
          // Keep as string if not JSON
        }
      } else {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id
        });
      }

      res.json({
        jsonrpc: '2.0',
        result,
        id
      });
    } catch (error) {
      console.error('[HTTP] Error:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Internal error: ${error.message}` },
        id: req.body.id || null
      });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log('='.repeat(80));
    console.log('[Server] Generic MCP DB Server (HTTP/SSE) v' + SERVER_VERSION);
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[Server] SSE Endpoint: http://localhost:${PORT}/sse`);
    console.log(`[Server] Health Check: http://localhost:${PORT}/health`);
    console.log(`[Server] Configured databases: ${getDatabaseIds().join(', ') || 'none'}`);
    console.log('='.repeat(80));
    console.log('[Info] Add this API key as X-API-Key header or ?apiKey=... query parameter');
    console.log('='.repeat(80));
  });
}

// ============================================================================================================
// MAIN
// ============================================================================================================

async function main() {
  try {
    // Initialize database connections
    await initDatabases();

    // Start HTTP server with SSE
    await startHTTPServer();

  } catch (error) {
    console.error('[Fatal Error]', error);
    process.exit(1);
  }
}

main();
