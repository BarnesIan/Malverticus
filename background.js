let allowList = [];

function loadAllowList() {
 return fetch(chrome.runtime.getURL('Lists/ALLOW.txt'))
    .then(response => response.text())
    .then(text => {
      allowList = text.split('\n').map(domain => domain.trim());  // Assuming each domain is on a new line
      console.log('Allow List Loaded:', allowList);
      return allowList;
    })
    .catch(error =>{
       console.error('Failed to load allow list:', error);
       return [];
  });
}

async function ensureAllowListLoaded() {
  if (!allowList.length) {
    console.log("Loading allow list...");
    allowList = await loadAllowList().catch(error => {
      console.error("Error loading allow list:", error);
      return [];  // Return an empty list if fails
    });
  }
}

function normalizeUrl(url) {
  let normalizedUrl = new URL(url);
  normalizedUrl = normalizedUrl.hostname.replace(/^www\./, ''); // Remove "www." if present
  return normalizedUrl;
}

async function classifyUrl(url) {
    try {
      const response = await fetch('https://kh93s05rh3.execute-api.eu-west-1.amazonaws.com/prod/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({url: url})
      });
      if (!response.ok) {
        throw new Error('Network response returned not ok');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching classification report for ${url}:`,error);
      return null;
    }
  }
  

  // Listener for incoming web requests
  chrome.webRequest.onBeforeRequest.addListener(
    async (details) => {
        if (details.url.includes('https://kh93s05rh3.execute-api.eu-west-1.amazonaws.com/prod/')) {
            console.log('Access to classifier API, allowing');
            return { cancel: false }; // Allow the request immediately, no further checks needed
        }
        await ensureAllowListLoaded();
        const url = new URL(details.url);
        const domain = normalizeUrl(url.href);
        if (allowList.includes(domain)) {
            console.log(`Allowing access to ${domain}`);
            return { cancel: true };
        } else {
            console.log(`Could not find ${domain}, classifying...`);
            const classification = await classifyUrl(details.url);
            if (!classification || classification.Classified !== 1) {
                console.log(`${domain} is benign or failed classification, loading`);
                return { cancel: false };
            }
            const { Classified, "Domain age in days": domainAgeDays } = classification;
            if (Classified === 1 && domainAgeDays > 1000) {
                console.log(`Blocking URL: ${url} based on classification and domain age.`);
                return { cancel: true };
            }
            return { cancel: false };
        }
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
);

// Example pop-up blocking logic
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        if (details.type === "popup") {
            return { cancel: true }; // Block the popup
        }
        return { cancel: false };
    },
    { urls: ["<all_urls>"], types: ["script"] },
    ["blocking"]
);