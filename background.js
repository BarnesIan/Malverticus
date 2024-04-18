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
    allowList = await loadAllowList();
  }
}


async function classifyUrl(url) {
    try {
      const response = await fetch('https://y2kw6gjng2.execute-api.eu-west-1.amazonaws.com/dev/', {
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
      await ensureAllowListLoaded();
      const url = new URL(details.url);
      const domain = url.hostname;
  
      // Check if the domain is in the allow list
      if (allowList.includes(domain)) {
        console.log(`Allowing access to ${domain}`);
        return { cancel: true };
      } else {
          //if url is not in the allowed list, classify it.
          console.log(`Could not find ${domain} classifying`);
          const classification = await classifyUrl(url);
          if(!classification) {
            return {cancel:false}; //Allow the reuqest if classified as benign. 
            console.log(` ${domain} was classified as benign loading`);
          }
          const { Classified, "Domain age in days": domainAgeDays } = classification;
          if (Classified === 1 && domainAgeDays > 1000) {
              console.log(`Blocking URL: ${url} based on classification and domain age.`);
              return { cancel: true }; // Cancel the request
          }
          return { cancel: false }; // Allow the request
      }
  },
{ urls: ["<all_urls>"] }, // Adjust the pattern to target specific URLs if needed
//["blocking"] // Use the "blocking" option to allow canceling requests
);

 // Listener for pop-up ads
 chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.type == "popup"){
      return {cancel:true}; //block the popup
    }
    return {cancel:false};
  },
  {urls: ["<all_urls>"], types: ["popup"]},
  ["blocking"]
);