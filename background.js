let allowList = [];
let blockList = [];

//Load lists that are stored
function loadList(fileName) {
  return fetch(chrome.runtime.getURL(`Lists/${fileName}`))
    .then(response => response.text())
    .then(text => {
      return text.split('\n').map(domain => domain.trim());
    })
    .catch(error => {
      console.error(`Failed to load ${fileName}:`, error);
      return [];
    });
}

//Make sure both lists are loaded into memory
async function ensureListsLoaded() {
  if (!allowList.length) {
    console.log("Loading allow list...");
    allowList = await loadList('ALLOW.txt');
  }
  if (!blockList.length) {
    console.log("Loading block list...");
    blockList = await loadList('BLOCK.txt');
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
        await ensureListsLoaded();
        const url = new URL(details.url);
        const domain = normalizeUrl(url.href);
        console.log(`Checking access to ${domain} from block list`);
        if (blockList.includes(domain)) {
          console.log(`Blocking access to ${domain} from block list`);
          return { cancel: true };
        }
        if (allowList.includes(domain)) {
            console.log(`Allowing access to ${domain}`);
            return { cancel: false };
        } else {
            console.log(`Could not find ${domain}, classifying...`);
            const classification = await classifyUrl(details.url);
            if (!classification || classification.Classified !== 1) {
                console.log(`${domain} is benign or failed classification, blocking`);
                return { cancel: true };
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
// Stop the ability to open new tabs in the browser without users consent
chrome.tabs.onCreated.addListener(tab => {
  if (tab.url === 'chrome://newtab/' || tab.url === "") {
      console.log("New empty tab opened, likely by the user directly");
  } else {
      console.log("Tab opened potentially without user interaction:", tab.url);
      chrome.tabs.remove(tab.id); // Close the tab
  }
});

// Block pop ups by sub_frame
chrome.webRequest.onBeforeRequest.addListener(
  details => {
      if (details.type === "sub_frame") {
          console.log("Blocking a pop-up or ad frame:", details.url);
          return { cancel: true }; // Block the sub_frame
      }
      return { cancel: false };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);


//Blocking Content
chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
      let block = false;
      const fileTypesToBlock = ["application/x-shockwave-flash", "image/gif"];
      const sizeLimit = 1000000; // Size limit for content, in bytes for stopping big files

      // Checking the response headers for content type and size
      for (let i = 0; i < details.responseHeaders.length; i++) {
          const header = details.responseHeaders[i];

          // Check for content type
          if (header.name.toLowerCase() === "content-type" && fileTypesToBlock.includes(header.value.toLowerCase())) {
              block = true;
          }

          // Check for content size if needed
          if (header.name.toLowerCase() === "content-length" && parseInt(header.value) > sizeLimit) {
              block = true;
          }

          // If both conditions are met, block the content
          if (block) {
              console.log(`Blocking ${details.url} due to content type or size restrictions.`);
              return { cancel: true };
          }
      }

      return { cancel: false };
  },
  { urls: ["<all_urls>"], types: ["image", "object", "other"] },
  ["blocking", "responseHeaders"]
);
