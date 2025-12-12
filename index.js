/**
 * Generic MCP DB Server (HTTP/SSE Transport)
 * Provides tools to query MySQL and optionally MongoDB databases via Model Context Protocol
 * Accessible remotely via HTTP with Server-Sent Events
 * MongoDB support is parametric - tools are only available if MongoDB is configured
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
import { v1 } from '@datadog/datadog-api-client';
import express from 'express';
import cors from 'cors';

// ============================================================================================================
// CONFIGURATION
// ============================================================================================================

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'your-secret-api-key-change-this';

// MongoDB configuration - check if enabled
const MONGO_ENABLED = process.env.MONGO_ENABLED === 'true';
const MONGO_URL = process.env.MONGO_URL;
const MONGO_DATABASE = process.env.MONGO_DATABASE;

// Datadog configuration - check if enabled
const DATADOG_ENABLED = process.env.DATADOG_ENABLED === 'true';
const DATADOG_API_KEY = process.env.DATADOG_API_KEY;
const DATADOG_APP_KEY = process.env.DATADOG_APP_KEY;
const DATADOG_SITE = process.env.DATADOG_SITE || 'datadoghq.com';

const config = {
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'database',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  mongo: MONGO_ENABLED && MONGO_URL ? {
    url: MONGO_URL,
    database: MONGO_DATABASE || 'database'
  } : null,
  datadog: DATADOG_ENABLED && DATADOG_API_KEY && DATADOG_APP_KEY ? {
    apiKey: DATADOG_API_KEY,
    appKey: DATADOG_APP_KEY,
    site: DATADOG_SITE
  } : null
};

// ============================================================================================================
// DATABASE CONNECTIONS
// ============================================================================================================

let mysqlPool;
let mongoClient;
let mongoDB;
let datadogLogsApi;

async function initDatabases() {
  try {
    // Initialize MySQL connection pool
    mysqlPool = mysql.createPool(config.mysql);
    const connection = await mysqlPool.getConnection();
    await connection.ping();
    connection.release();
    console.log('[MySQL] Connected successfully');
    
    // Initialize MongoDB connection only if enabled
    if (config.mongo) {
      try {
        mongoClient = new MongoClient(config.mongo.url);
        await mongoClient.connect();
        mongoDB = mongoClient.db(config.mongo.database);
        await mongoDB.admin().ping();
        console.log('[MongoDB] Connected successfully to:', config.mongo.url);
      } catch (mongoError) {
        console.warn('[MongoDB] Connection failed, MongoDB tools will be disabled:', mongoError.message);
        config.mongo = null;
        mongoClient = null;
        mongoDB = null;
      }
    } else {
      console.log('[MongoDB] Disabled - tools will not be available');
    }

    // Initialize Datadog connection only if enabled
    if (config.datadog) {
      try {
        const configuration = v1.createConfiguration({
          authMethods: {
            apiKeyAuth: DATADOG_API_KEY,
            appKeyAuth: DATADOG_APP_KEY,
          },
        });
        configuration.setServerVariables({
          site: DATADOG_SITE,
        });
        
        datadogLogsApi = new v1.LogsApi(configuration);
        
        // Test the connection by making a simple API call
        await datadogLogsApi.listLogs({ limit: 1 });
        console.log('[Datadog] Connected successfully to site:', DATADOG_SITE);
      } catch (datadogError) {
        console.warn('[Datadog] Connection failed, Datadog tools will be disabled:', datadogError.message);
        config.datadog = null;
        datadogLogsApi = null;
      }
    } else {
      console.log('[Datadog] Disabled - tools will not be available');
    }

    return true;
  } catch (error) {
    console.error('[Database] Connection error:', error.message);
    throw error;
  }
}

async function closeDatabases() {
  try {
    if (mysqlPool) {
      await mysqlPool.end();
      console.log('[MySQL] Connection closed');
    }
    if (mongoClient) {
      await mongoClient.close();
      console.log('[MongoDB] Connection closed');
    }
    // Datadog client doesn't need explicit closing
  } catch (error) {
    console.error('[Database] Error closing connections:', error.message);
  }
}

// ============================================================================================================
// MCP SERVER CLASS
// ============================================================================================================

class GenericMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "generic-mcp-db-server",
        version: "1.0.0",
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
      const tools = [
        {
          name: "mysql_query",
          description: "Execute a SELECT query on the MySQL database. Returns query results as JSON. Only read-only queries are allowed.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The SQL SELECT query to execute"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "mysql_describe",
          description: "Describe the structure of a MySQL table (show columns, types, keys, etc.)",
          inputSchema: {
            type: "object",
            properties: {
              table: {
                type: "string",
                description: "The table name to describe"
              }
            },
            required: ["table"]
          }
        },
        {
          name: "mysql_list_tables",
          description: "List all tables in the MySQL database",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ];

      // Add MongoDB tools only if MongoDB is enabled and connected
      if (config.mongo && mongoDB) {
        tools.push(
          {
            name: "mongo_query",
            description: "Execute a find query on a MongoDB collection. Returns documents as JSON.",
            inputSchema: {
              type: "object",
              properties: {
                collection: {
                  type: "string",
                  description: "The collection name to query"
                },
                filter: {
                  type: "object",
                  description: "MongoDB filter object (optional, default: {})"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of documents to return (default: 100)"
                }
              },
              required: ["collection"]
            }
          },
          {
            name: "mongo_aggregate",
            description: "Execute an aggregation pipeline on a MongoDB collection",
            inputSchema: {
              type: "object",
              properties: {
                collection: {
                  type: "string",
                  description: "The collection name to query"
                },
                pipeline: {
                  type: "array",
                  description: "MongoDB aggregation pipeline array"
                }
              },
              required: ["collection", "pipeline"]
            }
          },
          {
            name: "mongo_list_collections",
            description: "List all collections in the MongoDB database",
            inputSchema: {
              type: "object",
              properties: {},
              required: []
            }
          }
        );
      }

      // Add Datadog tools only if Datadog is enabled and connected
      if (config.datadog && datadogLogsApi) {
        tools.push(
          {
            name: "datadog_logs_search",
            description: "Search Datadog logs with filters. Returns matching logs as JSON.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query string (default: '*' for all logs)"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of logs to return (default: 100, max: 1000)"
                },
                timeFrom: {
                  type: "string",
                  description: "Start time for the search (ISO 8601 format or relative like '1h')"
                },
                timeTo: {
                  type: "string",
                  description: "End time for the search (ISO 8601 format or relative like 'now')"
                },
                index: {
                  type: "string",
                  description: "Log index to search (default: 'logs')"
                },
                source: {
                  type: "string",
                  description: "Log source filter"
                }
              },
              required: []
            }
          },
          {
            name: "datadog_logs_get",
            description: "Get a specific log by ID from Datadog",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "The unique ID of the log to retrieve"
                }
              },
              required: ["id"]
            }
          }
        );
      }

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "mysql_query":
            return await this.handleMySQLQuery(args);
          case "mysql_describe":
            return await this.handleMySQLDescribe(args);
          case "mysql_list_tables":
            return await this.handleMySQLListTables();
          case "mongo_query":
            if (!config.mongo || !mongoDB) {
              throw new Error('MongoDB is not enabled or not connected');
            }
            return await this.handleMongoQuery(args);
          case "mongo_aggregate":
            if (!config.mongo || !mongoDB) {
              throw new Error('MongoDB is not enabled or not connected');
            }
            return await this.handleMongoAggregate(args);
          case "mongo_list_collections":
            if (!config.mongo || !mongoDB) {
              throw new Error('MongoDB is not enabled or not connected');
            }
            return await this.handleMongoListCollections();
          case "datadog_logs_search":
            if (!config.datadog || !datadogLogsApi) {
              throw new Error('Datadog is not enabled or not connected');
            }
            return await this.handleDatadogLogsSearch(args);
          case "datadog_logs_get":
            if (!config.datadog || !datadogLogsApi) {
              throw new Error('Datadog is not enabled or not connected');
            }
            return await this.handleDatadogLogsGet(args);
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

  // MySQL Handlers
  async handleMySQLQuery(args) {
    const { query } = args;

    // Security: Only allow SELECT queries
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('select') && !trimmedQuery.startsWith('show') && !trimmedQuery.startsWith('describe')) {
      throw new Error('Only SELECT, SHOW, and DESCRIBE queries are allowed');
    }

    const [rows] = await mysqlPool.execute(query);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(rows, null, 2)
        }
      ]
    };
  }

  async handleMySQLDescribe(args) {
    const { table } = args;

    // Sanitize table name to prevent SQL injection
    const sanitizedTable = table.replace(/[^a-zA-Z0-9_]/g, '');
    const [rows] = await mysqlPool.execute(`DESCRIBE ${sanitizedTable}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(rows, null, 2)
        }
      ]
    };
  }

  async handleMySQLListTables() {
    const [rows] = await mysqlPool.execute('SHOW TABLES');

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(rows, null, 2)
        }
      ]
    };
  }

  // MongoDB Handlers
  async handleMongoQuery(args) {
    const { collection, filter = {}, limit = 100 } = args;

    const results = await mongoDB
      .collection(collection)
      .find(filter)
      .limit(Math.min(limit, 1000)) // Cap at 1000 documents
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

  async handleMongoAggregate(args) {
    const { collection, pipeline } = args;

    const results = await mongoDB
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

  async handleMongoListCollections() {
    const collections = await mongoDB.listCollections().toArray();
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

  // Datadog Handlers
  async handleDatadogLogsSearch(args) {
    const { 
      query = '*', 
      limit = 100, 
      timeFrom, 
      timeTo, 
      index = 'logs',
      source 
    } = args;

    const params = {
      body: {
        query: query,
        limit: Math.min(limit, 1000), // Cap at 1000 logs
        sort: '-timestamp' // Most recent first
      }
    };

    // Add optional time filters
    if (timeFrom) {
      params.body.from = timeFrom;
    }
    if (timeTo) {
      params.body.to = timeTo;
    }

    // Add optional index and source filters
    if (index) {
      params.body.index = index;
    }
    if (source) {
      params.body.source = source;
    }

    try {
      const response = await datadogLogsApi.listLogs(params);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              logs: response.data,
              total: response.meta?.page?.total || response.data.length,
              count: response.data.length
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Datadog logs search failed: ${error.message}`);
    }
  }

  async handleDatadogLogsGet(args) {
    const { id } = args;

    if (!id) {
      throw new Error('Log ID is required');
    }

    try {
      const response = await datadogLogsApi.getLogs({ id });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Datadog logs get failed: ${error.message}`);
    }
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
  app.use(express.json());

  // Simple API key authentication middleware
  const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (apiKey !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    next();
  };

  // Store active SSE sessions
  const sessions = new Map();

  // Health check endpoint (no auth required)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      server: 'generic-mcp-db-server',
      version: '1.0.0',
      mongodb_enabled: config.mongo && mongoDB ? true : false,
      datadog_enabled: config.datadog && datadogLogsApi ? true : false,
      timestamp: new Date().toISOString()
    });
  });

  // MCP SSE endpoint (requires authentication)
  app.get('/sse', authenticate, async (req, res) => {
    console.log('[SSE] New client connected');

    // Generate a unique session ID
    const sessionId = Math.random().toString(36).substring(7);

    const mcpServer = new GenericMCPServer();
    const transport = new SSEServerTransport('/message', res);

    // Store the session
    sessions.set(sessionId, { mcpServer, transport, res });

    // Add session ID to response headers
    res.setHeader('X-Session-ID', sessionId);

    await mcpServer.getServer().connect(transport);

    // Handle client disconnect
    req.on('close', () => {
      console.log('[SSE] Client disconnected');
      sessions.delete(sessionId);
    });
  });

  // MCP message endpoint (requires authentication)
  app.post('/message', authenticate, async (req, res) => {
    // Get session ID from headers or body
    const sessionId = req.headers['x-session-id'] || req.body.sessionId;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // The transport will handle the message
    res.status(200).end();
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
          serverInfo: { name: 'generic-mcp-db-server', version: '1.0.0' }
        };
      } else if (method === 'notifications/initialized') {
        // Acknowledge initialization - no result needed for notifications
        return res.status(200).json({
          jsonrpc: '2.0',
          id
        });
      } else if (method === 'tools/list') {
        const tools = [
          {
            name: "mysql_query",
            description: "Execute a SELECT query on the MySQL database. Returns query results as JSON. Only read-only queries are allowed.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "The SQL SELECT query to execute" }
              },
              required: ["query"]
            }
          },
          {
            name: "mysql_describe",
            description: "Describe the structure of a MySQL table (show columns, types, keys, etc.)",
            inputSchema: {
              type: "object",
              properties: {
                table: { type: "string", description: "The table name to describe" }
              },
              required: ["table"]
            }
          },
          {
            name: "mysql_list_tables",
            description: "List all tables in the MySQL database",
            inputSchema: {
              type: "object",
              properties: {},
              required: []
            }
          }
        ];

        // Add MongoDB tools only if enabled
        if (config.mongo && mongoDB) {
          tools.push(
            {
              name: "mongo_query",
              description: "Execute a find query on a MongoDB collection. Returns documents as JSON.",
              inputSchema: {
                type: "object",
                properties: {
                  collection: { type: "string", description: "The collection name to query" },
                  filter: { type: "object", description: "MongoDB filter object (optional, default: {})" },
                  limit: { type: "number", description: "Maximum number of documents to return (default: 100)" }
                },
                required: ["collection"]
              }
            },
            {
              name: "mongo_aggregate",
              description: "Execute an aggregation pipeline on a MongoDB collection",
              inputSchema: {
                type: "object",
                properties: {
                  collection: { type: "string", description: "The collection name to query" },
                  pipeline: { type: "array", description: "MongoDB aggregation pipeline array" }
                },
                required: ["collection", "pipeline"]
              }
            },
            {
              name: "mongo_list_collections",
              description: "List all collections in the MongoDB database",
              inputSchema: {
                type: "object",
                properties: {},
                required: []
              }
            }
          );
        }

        // Add Datadog tools only if enabled
        if (config.datadog && datadogLogsApi) {
          tools.push(
            {
              name: "datadog_logs_search",
              description: "Search Datadog logs with filters. Returns matching logs as JSON.",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query string (default: '*' for all logs)" },
                  limit: { type: "number", description: "Maximum number of logs to return (default: 100, max: 1000)" },
                  timeFrom: { type: "string", description: "Start time for the search (ISO 8601 format or relative like '1h')" },
                  timeTo: { type: "string", description: "End time for the search (ISO 8601 format or relative like 'now')" },
                  index: { type: "string", description: "Log index to search (default: 'logs')" },
                  source: { type: "string", description: "Log source filter" }
                },
                required: []
              }
            },
            {
              name: "datadog_logs_get",
              description: "Get a specific log by ID from Datadog",
              inputSchema: {
                type: "object",
                properties: {
                  id: { type: "string", description: "The unique ID of the log to retrieve" }
                },
                required: ["id"]
              }
            }
          );
        }

        result = { tools };
      } else if (method === 'tools/call') {
        const toolName = params.name;
        const toolArgs = params.arguments || {};

        // Route to appropriate handler
        if (toolName === 'mysql_query') {
          result = await sharedMCPServer.handleMySQLQuery(toolArgs);
        } else if (toolName === 'mysql_describe') {
          result = await sharedMCPServer.handleMySQLDescribe(toolArgs);
        } else if (toolName === 'mysql_list_tables') {
          result = await sharedMCPServer.handleMySQLListTables();
        } else if (toolName === 'mongo_query') {
          if (!config.mongo || !mongoDB) {
            return res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'MongoDB is not enabled or not connected' },
              id
            });
          }
          result = await sharedMCPServer.handleMongoQuery(toolArgs);
        } else if (toolName === 'mongo_aggregate') {
          if (!config.mongo || !mongoDB) {
            return res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'MongoDB is not enabled or not connected' },
              id
            });
          }
          result = await sharedMCPServer.handleMongoAggregate(toolArgs);
        } else if (toolName === 'mongo_list_collections') {
          if (!config.mongo || !mongoDB) {
            return res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'MongoDB is not enabled or not connected' },
              id
            });
          }
          result = await sharedMCPServer.handleMongoListCollections();
        } else if (toolName === 'datadog_logs_search') {
          if (!config.datadog || !datadogLogsApi) {
            return res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'Datadog is not enabled or not connected' },
              id
            });
          }
          result = await sharedMCPServer.handleDatadogLogsSearch(toolArgs);
        } else if (toolName === 'datadog_logs_get') {
          if (!config.datadog || !datadogLogsApi) {
            return res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'Datadog is not enabled or not connected' },
              id
            });
          }
          result = await sharedMCPServer.handleDatadogLogsGet(toolArgs);
        } else {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32601, message: `Tool not found: ${toolName}` },
            id
          });
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
    console.log('[Server] Generic MCP DB Server (HTTP/SSE)');
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[Server] SSE Endpoint: http://localhost:${PORT}/sse`);
    console.log(`[Server] Health Check: http://localhost:${PORT}/health`);
    console.log(`[MongoDB] ${config.mongo && mongoDB ? 'Enabled' : 'Disabled'}`);
    console.log(`[Datadog] ${config.datadog && datadogLogsApi ? 'Enabled' : 'Disabled'}`);
    console.log(`[Auth] API Key: ${API_KEY}`);
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