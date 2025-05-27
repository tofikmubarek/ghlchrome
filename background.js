// background.js - Service Worker for Gmail to GHL Extension

// Listen for messages from content scripts or options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);

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

  if (request.action === "fetchGHL") {
    handleFetchGHL(request.endpoint, request.options, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  if (request.action === "createOpportunity") {
    handleCreateOpportunity(request.data, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  if (request.action === "updateOpportunityStatus") {
    updateOpportunityStatus(request.pipelineId, request.opportunityId, request.status, request.stageId, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }

  // Default response if action is not handled
  // sendResponse({ success: false, error: "Unknown action" });
  // return false; // No async response
});

async function getApiKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["ghlApiKey"], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.ghlApiKey);
      }
    });
  });
}

async function handleFetchGHL(endpoint, options = {}, sendResponse) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ success: false, error: "API Key not set. Please configure it in the extension options." });
      return;
    }

    const GHL_BASE_URL = "https://rest.gohighlevel.com"; // Updated base URL for V1 API
    const url = `${GHL_BASE_URL}${endpoint}`;

    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
        // Removed 'Version' header as it's not specified in V1 docs
      },
      ...options // Spread any additional options like body
    };

    console.log("Fetching GHL API:", url, fetchOptions);
    const response = await fetch(url, fetchOptions);

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
      sendResponse({ success: false, error: errorData });
      return;
    }

    // For GET /v1/pipelines/, the response might be directly the array or nested.
    // Need to check the actual response structure later.
    const data = await response.json();
    console.log("GHL API Success Response:", data);
    sendResponse({ success: true, data: data });

  } catch (error) {
    console.error("Error fetching GHL data:", error);
    sendResponse({ success: false, error: error.message || "An unknown error occurred during API fetch." });
  }
}

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

  const endpoint = `/v1/pipelines/${opportunityData.pipelineId}/opportunities/`;
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getApiKey()}`,
    },
    body: JSON.stringify({
      title: opportunityData.opportunityName, // Map opportunityName to title
      stageId: opportunityData.stageId,
      status: opportunityData.status,
      monetaryValue: opportunityData.monetaryValue,
      contactId: opportunityData.contactId,
      email: opportunityData.email,
    }),
  };

  console.log("Creating opportunity with the following details:", {
        endpoint,
        method: options.method || "POST",
        payload: options.body,
      });

      console.log("Received data for opportunity creation:", {
        pipelineId: opportunityData.pipelineId,
        opportunityId: opportunityData.opportunityId,
        status: opportunityData.status,
        stageId: opportunityData.stageId,
        contactId: opportunityData.contactId,
      });

      if (!opportunityData.stageId || (!opportunityData.contactId && !opportunityData.email)) {
        console.error("Missing required fields: stageId or contactId/email.", {
          stageId: opportunityData.stageId,
          contactId: opportunityData.contactId,
          email: opportunityData.email
        });
        sendResponse({
          success: false,
          error: "Missing required fields: stageId or contactId/email. Please ensure all fields are filled correctly."
        });
        return;
      }

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
    sendResponse({ success: false, error: error.message || "An unknown error occurred during API fetch." });
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
}

console.log("Background service worker started.");

// Optional: Add listeners for extension installation/update to guide users
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
        // Open options page on first install to prompt for API key
        chrome.runtime.openOptionsPage();
    }
});

