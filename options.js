// options.js - Logic for the extension options page

const getRefreshTokenButton = document.getElementById("getRefreshToken");
const statusDiv = document.getElementById("status");
const accessTokenDiv = document.getElementById("accessToken");

// Function to exchange authorization code for refresh token and access token
async function getRefreshToken() {
  const CLIENT_ID = "683613ebe9e40340a2225714-mb6z1x17";
  const SCOPES = ['https://api.gohighlevel.com/'];
  const REDIRECT_URI = "https://toffeetech.net/";
  const AUTH_URL = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES.join(' '))}`;
  console.log("Auth URL:", AUTH_URL);
  chrome.identity.launchWebAuthFlow({
    interactive: true,
    url: AUTH_URL
  }, async function (redirect_uri) {
    if (chrome.runtime.lastError) {
      console.error("Error during web auth flow:", JSON.stringify(chrome.runtime.lastError));
      statusDiv.textContent = `Error during web auth flow: ${JSON.stringify(chrome.runtime.lastError)}`;
      statusDiv.style.color = "red";
      return;
    }

    const url = new URL(redirect_uri);
    const authCode = url.searchParams.get('code');

    if (!authCode) {
      statusDiv.textContent = "Authorization Code not found.";
      statusDiv.style.color = "red";
      return;
    }

    try {
      console.log("Exchanging authorization code for tokens...");
      const response = await fetch('https://api.gohighlevel.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: CLIENT_ID,
          client_secret: "3c498c9b-15b3-4d07-9f08-3824bd534a23",
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
        throw new Error(errorData.message || "Failed to exchange authorization code for tokens.");
      }

      const data = await response.json();
      console.log("Token response:", data);

      const refreshToken = data.refresh_token;
      const accessToken = data.access_token;

      // Save the refresh token to Chrome storage
      chrome.storage.sync.set({ "ghlRefreshToken": refreshToken }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving refresh token:", chrome.runtime.lastError);
          statusDiv.textContent = `Error saving refresh token: ${chrome.runtime.lastError.message}`;
          statusDiv.style.color = "red";
        } else {
          console.log("Refresh token saved successfully.");
          statusDiv.textContent = "Refresh token saved successfully!";
          statusDiv.style.color = "green";
        }
        // Clear status after a few seconds
        setTimeout(() => { statusDiv.textContent = ""; }, 3000);
      });

      // Display the access token
      accessTokenDiv.textContent = `Access Token: ${accessToken}`;
      accessTokenDiv.style.color = "green";

    } catch (error) {
      console.error('Error exchanging authorization code for tokens:', error);
      statusDiv.textContent = `Error exchanging authorization code for tokens: ${error.message}`;
      statusDiv.style.color = "red";
    }
  });
}

// Add event listener to the get refresh token button
getRefreshTokenButton.addEventListener("click", () => {
  getRefreshToken();
});
