#!/usr/bin/env node
console.log('ghl-oauth-server started');
console.log("GHL OAuth MCP server starting...");
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
const REFRESH_TOKEN = "8756773a19b242f9063fedb329735377ec51e81b";
console.log("REFRESH_TOKEN:", REFRESH_TOKEN);
const CLIENT_ID = "683613ebe9e40340a2225714-mb6z1x17";
console.log("CLIENT_ID:", CLIENT_ID);
const CLIENT_SECRET = "3c498c9b-15b3-4d07-9f08-3824bd534a23";
console.log("CLIENT_SECRET:", CLIENT_SECRET);


async function getAccessToken(refreshToken) {
    try {
        console.log("Using refresh token:", refreshToken);
        const response = await axios.post('https://api.gohighlevel.com/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        });
        console.log("Access token response:", response.data);
        return response.data.access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        console.error('Error refreshing access token data:', error.response ? error.response.data : error.message);
        throw new Error('Failed to refresh access token');
    }
}

async function getOpportunities(accessToken, email) {
    const GHL_BASE_URL = "https://services.leadconnectorhq.com";
    const endpoint = `/opportunities/search?q=${email}&location_id=1Ght1Y7YfOCqD0cSZQpF`;
    const url = `${GHL_BASE_URL}${endpoint}`;

    const options = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    try {
        console.log("Fetching opportunities with URL:", url);
        const response = await fetch(url, options);

        if (!response.ok) {
            let errorBody = "Could not read error body";
            try {
                errorBody = await response.text();
            } catch (e) {
                console.error("Error reading response body:", e);
            }
            console.error("GHL API Error Response (raw):", errorBody);
            let errorData;
            try {
                errorData = JSON.parse(errorBody);
            } catch (e) {
                errorData = { message: "Unexpected error: Unable to parse error response." };
            }
            console.error("GHL API Error Response (parsed):", JSON.stringify(errorData, null, 2));
            throw new Error(errorData.message || "Failed to fetch opportunities.");
        }

        const data = await response.json();
        console.log("GHL API Success Response:", data);
        return data.opportunities || [];
    } catch (error) {
        console.error("Error fetching opportunities:", error);
        throw new Error(error.message || "An unknown error occurred.");
    }
}

class GHLServer {
    constructor() {
        this.server = new Server(
            {
                name: 'ghl-oauth-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    resources: {},
                    tools: {},
                },
            }
        );

        this.setupToolHandlers();

        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'get_opportunities_by_email',
                    description: 'Get opportunities for a contact by email',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            email: {
                                type: 'string',
                                description: 'Contact email',
                            },
                        },
                        required: ['email'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            console.log("Received tool request:", request);

            if (request.params.name === 'get_opportunities_by_email') {
                const { email } = request.params.arguments;
                console.log("Parsed email argument:", email);

                try {
                    console.log("Invoking getAccessToken...");
                    const accessToken = await getAccessToken(REFRESH_TOKEN);
                    console.log("Access token retrieved:", accessToken);

                    console.log("Invoking getOpportunities...");
                    const opportunities = await getOpportunities(accessToken, email);
                    console.log("Opportunities retrieved:", JSON.stringify(opportunities));

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(opportunities, null, 2),
                            },
                        ],
                    };
                } catch (error) {
                    console.error("Error in get_opportunities_by_email:", error);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Error: ${error.message}`,
                            },
                        ],
                        isError: true,
                    };
                }
            } else {
                console.log("Unknown tool requested:", request.params.name);
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
            }
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('GHL OAuth MCP server running on stdio');
    }
}

const server = new GHLServer();
server.run().catch(console.error);