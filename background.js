// background.js
// Service Worker for Gmail to GHL Extension
// This script runs in the background and handles communication between the content script and the GoHighLevel API.

// Listen for messages from content scripts or options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request); // Log the received message for debugging
  if (request.use_mcp_tool) {
    console.log("Background script received MCP tool request:", request);
  }

  if (request.action === "getApiKey") {
    chrome.storage.sync.get(["ghlApiKey"], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error retrieving API key:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, apiKey: result.ghlApiKey });
      }
    });
    return true; // Indicates that the response is sent asynchronously
  }

  // Handle the "fetchGHL" action
  if (request.action === "fetchGHL") {
    // Call the handleFetchGHL function to fetch data from the GoHighLevel API
    handleFetchGHL(request.endpoint, request.options, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  // Handle the "createOpportunity" action
  if (request.action === "createOpportunity") {
    // Call the handleCreateOpportunity function to create a new opportunity in GoHighLevel
    handleCreateOpportunity(request.data, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  // Handle the "updateOpportunityStatus" action
  if (request.action === "updateOpportunityStatus") {
    // Call the updateOpportunityStatus function to update the status of an opportunity in GoHighLevel
    updateOpportunityStatus(request.pipelineId, request.opportunityId, request.status, request.stageId, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  // Default response if action is not handled
  // sendResponse({ success: false, error: "Unknown action" });
  // return false; // No async response
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.use_mcp_tool) {
    console.log("Background script received MCP tool request:", request);

    const { server_name, tool_name, arguments } = request;
    const command = `node ./ghl-oauth-server/index.js ${tool_name} '${JSON.stringify(arguments)}'`;

    console.log("Executing MCP server command:", command);

    const { exec } = require('child_process');
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Error executing MCP server command:", error);
        sendResponse({ success: false, error: error.message });
        return;
      }

      console.log("MCP server stdout:", stdout);
      console.log("MCP server stderr:", stderr);

      try {
        const response = JSON.parse(stdout);
        console.log("Parsed MCP server response:", response);
        sendResponse({ success: true, content: response });
      } catch (parseError) {
        console.error("Error parsing MCP server response:", parseError);
        sendResponse({ success: false, error: "Failed to parse MCP server response." });
      }
    });

    return true; // Indicates that the response will be sent asynchronously
  }
});

/**
 * Retrieves the API key from Chrome storage.
 * @returns {Promise<string>} A promise that resolves with the API key or rejects with an error.
 */
async function getApiKey() {
  return new Promise((resolve, reject) => {
    // Retrieve the API key from Chrome storage
    chrome.storage.sync.get(["ghlApiKey"], (result) => {
      if (chrome.runtime.lastError) {
        // If there's an error retrieving the API key, log the error and reject the promise
        console.error("Error retrieving API key:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        // If the API key is retrieved successfully, log it and resolve the promise
        console.log("API key retrieved successfully:", result.ghlApiKey);
        resolve(result.ghlApiKey);
      }
    });
  });
}

/**
 * Fetches data from the GoHighLevel API.
 * @param {string} endpoint The API endpoint to fetch.
 * @param {object} options The options for the fetch request.
 * @param {function} sendResponse The function to send the response to the content script.
 */
async function handleFetchGHL(endpoint, options = {}, sendResponse) {
  try {
    // Retrieve the API key
    const apiKey = await getApiKey();
    if (!apiKey) {
      // If the API key is not set, send an error response
      sendResponse({ success: false, error: "API Key not set. Please configure it in the extension options." });
      return;
    }

    const GHL_BASE_URL = "https://rest.gohighlevel.com"; // Base URL for the GoHighLevel API
    const url = `${GHL_BASE_URL}${endpoint}`; // Construct the full API URL

    // Define the options for the fetch request
    const fetchOptions = {
      method: options.method || 'GET', // Use the provided method or default to GET
      headers: {
        'Authorization': `Bearer ${apiKey}`, // Add the API key to the Authorization header
        'Content-Type': 'application/json', // Set the Content-Type header to application/json
        'Accept': 'application/json' // Set the Accept header to application/json
        // Removed 'Version' header as it's not specified in V1 docs
      },
      ...options // Spread any additional options like body
    };

    console.log("Fetching GHL API:", url, fetchOptions); // Log the API URL and fetch options for debugging
    console.log("Fetching GHL API - URL:", url); // Log the API URL for debugging
    console.log("Fetching GHL API - fetchOptions:", JSON.stringify(fetchOptions, null, 2)); // Log the fetch options for debugging
    const response = await fetch(url, fetchOptions); // Fetch data from the API

    if (!response.ok) {
      // If the response is not ok, log the error and send an error response
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
      sendResponse({ success: false, error: errorData });
      return;
    } else {
      console.log("Response was ok");
    }

    // For GET /v1/pipelines/, the response might be directly the array or nested.
    // Need to check the actual response structure later.
    const data = await response.json(); // Parse the response body as JSON
    console.log("GHL API Success Response:", data); // Log the API response for debugging
    sendResponse({ success: true, data: data }); // Send a success response with the data

  } catch (error) {
    // If there's an error during the API fetch, log the error and send an error response
    console.error("Error fetching GHL data:", error);
    console.error("Error fetching GHL data - error:", error);
    console.log("Error fetching GHL data - error:", error);
    sendResponse({ success: false, error: error.message || "An unknown error occurred during API fetch." });
  }
}

/**
 * Creates a new opportunity in GoHighLevel.
 * @param {object} opportunityData The data for the new opportunity.
 * @param {function} sendResponse The function to send the response to the content script.
 */
async function handleCreateOpportunity(opportunityData, sendResponse) {
  // V1 endpoint: POST /v1/pipelines/:pipelineId/opportunities/
  // Ensure opportunityData includes pipelineId and other required fields for V1.
  if (!opportunityData.pipelineId) {
    sendResponse({ success: false, error: "Pipeline ID is missing in the request data." });
    return;
  }
  if (!opportunityData.opportunityName) {
    sendResponse({ success: false, error: "Opportunity Name is missing in the request data." });
    return;
  }

let contactId = opportunityData.contactId;
if (!contactId && opportunityData.email) {
  // If contactId is not provided but email is, try to find an existing contact by email
  const apiKey = await getApiKey();
  const existingContact = await findContactByEmail(opportunityData.email, apiKey);
  if (existingContact) {
    // If an existing contact is found, use its ID
    contactId = existingContact.id;
    console.log("Found existing contact:", existingContact);
  } else {
    // If no existing contact is found, create a new contact
    const newContactData = {
      firstName: opportunityData.firstName,
      email: opportunityData.email,
      source: opportunityData.source
    };
    const newContact = await createContact(newContactData, apiKey);
    if (newContact && newContact.contact) {
      // If the new contact is created successfully, use its ID
      contactId = newContact.contact.id;
      console.log("Created new contact:", newContact);
    } else {
      // If the new contact creation fails, send an error response
      console.error("Failed to create contact.");
      sendResponse({ success: false, error: "Failed to create contact." });
      return;
    }
  }
}

  // Construct the API endpoint URL
  const endpoint = `/v1/pipelines/${opportunityData.pipelineId}/opportunities/`;
  // Define the options for the API request
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getApiKey()}`,
    },
    body: JSON.stringify({
      title: opportunityData.opportunityName,
      stageId: opportunityData.stageId,
      status: opportunityData.status,
      monetaryValue: opportunityData.monetaryValue,
      contactId: contactId
  }),
};

    console.log("Creating opportunity with the following details:", {
      endpoint,
      method: options.method || "POST",
      payload: options.body,
    });
    console.log("Creating opportunity - endpoint:", endpoint);
    console.log("Creating opportunity - options:", JSON.stringify(options, null, 2));

    console.log("Received data for opportunity creation:", {
      pipelineId: opportunityData.pipelineId,
      opportunityId: opportunityData.opportunityId,
      status: opportunityData.status,
      stageId: opportunityData.stageId,
      contactId: opportunityData.contactId
    });

  try {
    const url = `https://services.leadconnectorhq.com${endpoint}`;
    console.log("Creating opportunity with URL:", url);
    const response = await fetch(`https://rest.gohighlevel.com${endpoint}`, options);
    if (!response.ok) {
      let errorData;
      let rawText;
      try {
        rawText = await response.text();
        errorData = JSON.parse(rawText);
      } catch (e) {
        errorData = {
          message: "Unexpected error: Unable to parse error response.",
          status: response.status,
          endpoint: endpoint,
          method: options.method || "GET",
          payload: options.body || "No payload available",
          rawResponse: rawText || "No raw response available",
        };
      }

      if (response.status === 404) {
        errorData.message = "Resource not found. Please verify the pipeline ID and endpoint.";
      }

      console.error("GHL API Error Response:", JSON.stringify(errorData, null, 2));
      sendResponse({ success: false, error: errorData });
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { message: "No content in response." };
    }

    console.log("GHL API Success Response:", data);
    sendResponse({ success: true, data: data });

  } catch (error) {
    console.error("Error creating GHL opportunity:", error);
    console.error("Error creating GHL opportunity - error:", error);
    console.log("Error creating GHL opportunity - error:", error);
    sendResponse({ success: false, error: error.message || "An unknown error occurred during API fetch." });
  }
}

/**
 * Finds a contact in GoHighLevel by email.
 * @param {string} email The email address to search for.
 * @param {string} apiKey The GoHighLevel API key.
 * @returns {Promise<object|null>} A promise that resolves with the contact object if found, or null if not found or an error occurs.
 */
async function findContactByEmail(email, apiKey) {
  const GHL_BASE_URL = "https://rest.gohighlevel.com";
  const endpoint = `/v1/contacts/?email=${email}`;
  const url = `${GHL_BASE_URL}${endpoint}`;

  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

  try {
    console.log("Fetching contact with URL:", url);
    console.log("Fetching contact with URL - URL:", url);
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
      return null; // Indicate no contact found or error
    }

    const data = await response.json();
    console.log("GHL API Success Response:", data);
    console.log("GHL API Success Response (JSON):", JSON.stringify(data, null, 2));

    if (data.contacts && data.contacts.length > 0) {
      const contact = data.contacts[0];
      if (contact.email === email) {
        console.log("Found contact:", contact);
        console.log("Found contact (JSON):", JSON.stringify(contact, null, 2));
        return contact; // Return the first contact found
      } else {
        console.log("Found contact with different email:", contact.email, "Expected:", email);
        return null;
      }
    } else {
      return null; // No contact found
    }

  } catch (error) {
    console.error("Error fetching GHL data:", error);
    return null; // Indicate no contact found or error
  }
}

async function createContact(contactData, apiKey) {
  const GHL_BASE_URL = "https://rest.gohighlevel.com";
  const endpoint = `/v1/contacts`;

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(contactData)
  };

  try {
    console.log("Creating contact with URL:", `${GHL_BASE_URL}${endpoint}`, options);
    console.log("Creating contact with URL - URL:", `${GHL_BASE_URL}${endpoint}`);
    console.log("Creating contact with URL - options:", JSON.stringify(options, null, 2));
    const response = await fetch(`${GHL_BASE_URL}${endpoint}`, options);

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
      return null; // Indicate contact creation failure
    }

    const data = await response.json();
    console.log("GHL API Success Response:", data);
    return data; // Return the created contact data

  } catch (error) {
    console.error("Error fetching GHL data:", error);
    return null; // Indicate contact creation failure
  }
}

async function updateOpportunityStatus(pipelineId, opportunityId, status, stageId, sendResponse) {
  chrome.storage.sync.get(["ghlApiKey"], async (result) => {
    if (chrome.runtime.lastError || !result.ghlApiKey) {
      console.error("Error retrieving API key or API key not set:", chrome.runtime.lastError);
      sendResponse({ success: false, error: "API key not found. Please set it in the options page." });
      return;
    }

    const apiKey = result.ghlApiKey;
    const endpoint = `/v1/pipelines/${pipelineId}/opportunities/${opportunityId}/status`;
    const options = {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: status,
        stageId: stageId,
      }),
    };

    try {
      const response = await fetch(`https://rest.gohighlevel.com${endpoint}`, options);
      if (!response.ok) {
        console.error("Error updating opportunity status - endpoint:", endpoint);
        console.error("Error updating opportunity status - options:", JSON.stringify(options, null, 2));
        const errorData = await response.json();
        console.error("Error updating opportunity status:", errorData);
        sendResponse({ success: false, error: errorData });
        return;
      }

      const data = await response.json();
      console.log("Opportunity status updated successfully:", data);
      sendResponse({ success: true, data: data });
    } catch (error) {
      console.error("Error updating opportunity status:", error);
      sendResponse({ success: false, error: error.message || "An unknown error occurred." });
    }
  });
  
  // --- Fetch Opportunities by Email ---
  async function getOpportunitiesByEmail(email, apiKey) {
      const GHL_BASE_URL = "https://rest.gohighlevel.com";
      const endpoint = `/v1/opportunities?email=${email}`;
  
      const options = {
          method: 'GET',
          headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
          }
      };
  
      try {
          console.log("Fetching opportunities with URL:", `${GHL_BASE_URL}${endpoint}`, options);
          const response = await fetch(`${GHL_BASE_URL}${endpoint}`, options);
  
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
              return { success: false, error: errorData };
          }
  
          const data = await response.json();
          console.log("GHL API Success Response:", data);
          console.log("getOpportunitiesByEmail sending response:", { success: true, data: data.opportunities });
          sendResponse({ success: true, data: data.opportunities }); // V1 returns opportunities in .opportunities array
          return;

      } catch (error) {
          console.error("Error fetching GHL data:", error);
          console.log("getOpportunitiesByEmail error:", error);
          sendResponse({ success: false, error: error.message || "An unknown error occurred." });
          return;
      }
  }
  
  // --- Message Listener Update ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("Background script message listener triggered:", JSON.stringify(request));
  
      if (request.action === "getApiKey") {
          chrome.storage.sync.get(["ghlApiKey"], (result) => {
              if (chrome.runtime.lastError) {
                  console.error("Error retrieving API key:", chrome.runtime.lastError);
                  sendResponse({ success: false, error: chrome.runtime.lastError.message });
              } else {
                  sendResponse({ success: true, apiKey: result.ghlApiKey });
              }
          });
          return true;
      }
  
      if (request.action === "getOpportunities") {
          console.log("getOpportunities action received");
          getApiKey().then(apiKey => {
              if (!apiKey) {
                  sendResponse({ success: false, error: "API Key not set. Please configure it in the extension options." });
                  return;
              }
              getOpportunitiesByEmail(request.email, apiKey).then(response => {
                  sendResponse(response);
              });
          });
          return true;
      }
  
      if (request.action === "fetchGHL") {
          handleFetchGHL(request.endpoint, request.options, sendResponse);
          return true;
      }
  
      if (request.action === "createOpportunity") {
          handleCreateOpportunity(request.data, sendResponse);
          return true;
      }
  
      if (request.action === "updateOpportunityStatus") {
          updateOpportunityStatus(request.pipelineId, request.opportunityId, request.status, request.stageId, sendResponse);
          return true;
      }
  });
}

console.log("Background service worker started.");

// Optional: Add listeners for extension installation/update to guide users
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
        // Open options page on first install to prompt for API key
        chrome.runtime.openOptionsPage();
    }
});

