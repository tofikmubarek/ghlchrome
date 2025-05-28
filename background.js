chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // Remove MCP tool handling code
  if (request.use_mcp_tool) {
    return;
  }

  // Handle the "getOpportunitiesByEmail" action
  if (request.action === "getOpportunitiesByEmail") {
    const { email } = request;
    console.log("Background script received getOpportunitiesByEmail request:", email);

    try {
      // Retrieve the API key
      const apiKey = await getApiKey();
      if (!apiKey) {
        // If the API key is not set, send an error response
        sendResponse({ success: false, error: "API Key not set. Please configure it in the extension options." });
        return;
      }

      // Retrieve the refresh token from storage
      chrome.storage.sync.get(["ghlRefreshToken"], async (result) => {
        if (chrome.runtime.lastError || !result.ghlRefreshToken) {
          console.error("Error retrieving refresh token:", chrome.runtime.lastError);
          sendResponse({ success: false, error: "Refresh token not found. Please configure it in the extension options." });
          return;
        }

        const refreshToken = result.ghlRefreshToken;
        console.log("Refresh token retrieved successfully:", refreshToken);

        try {
          // Obtain an access token using the refresh token
          const accessToken = await getAccessToken(refreshToken);
          console.log("Access token retrieved successfully:", accessToken);

          // Fetch opportunities using the access token and email
          const opportunities = await getOpportunitiesByEmail(accessToken, email);
          console.log("Opportunities retrieved successfully:", opportunities);

          // Send a success response with the opportunities
          sendResponse({ success: true, opportunities: opportunities });
        } catch (error) {
          // If there's an error obtaining the access token or fetching opportunities, log the error and send an error response
          console.error("Error obtaining access token or fetching opportunities:", error);
          sendResponse({ success: false, error: error.message || "An unknown error occurred." });
        }
      });

      return true; // Indicates that the response is sent asynchronously
    } catch (error) {
      // If there's an error retrieving the API key, log the error and send an error response
      console.error("Error retrieving API key:", error);
      sendResponse({ success: false, error: error.message || "An unknown error occurred." });
    }

    return true; // Indicates that the response is sent asynchronously
  }
});

// --- Helper Functions ---

async function getAccessToken(refreshToken) {
  const CLIENT_ID = "683613ebe9e40340a2225714-mb6z1x17";
  const CLIENT_SECRET = "3c498c9b-15b3-4d07-9f08-3824bd534a23";
  const REDIRECT_URI = chrome.identity.getRedirectURL();

  try {
    console.log("Using refresh token:", refreshToken);
    const response = await fetch('https://api.gohighlevel.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    });

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
      throw new Error(errorData.message || "Failed to refresh access token.");
    }

    const data = await response.json();
    console.log("Access token response:", data);
    return data.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw new Error(error.message || "Failed to refresh access token.");
  }
}

async function getOpportunitiesByEmail(accessToken, email) {
  const GHL_BASE_URL = "https://services.leadconnectorhq.com";
  const endpoint = `/opportunities/search?q=${email}&location_id=1Ght1Y7YfOCqD0cSZQpF`;

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
