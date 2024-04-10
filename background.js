async function classifyUrl(url) {
    try {
      const response = await fetch('https://y2kw6gjng2.execute-api.eu-west-1.amazonaws.com/dev/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add any required headers here
        },
        body: JSON.stringify({url: url})
      });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching classification:', error);
      return null;
    }
  }
  
  // Listener for web requests
  chrome.webRequest.onBeforeRequest.addListener(
    async (details) => {
      const url = details.url;
      const classification = await classifyUrl(url);
  
      // If the Lambda function returns null, an error occurred, so allow the request
      if (!classification) {
        return {cancel: True};
      }
  
      const {Classified, "Domain age in days": domainAgeDays} = classification;
  
      // Check the classification score and domain age
      if (Classified === 0 && domainAgeDays > 1000) {
        console.log(`Blocking URL: ${url} based on classification and domain age.`);
        return {cancel: true}; // Cancel the request
      }
  
      // Allow the request
      return {cancel: false};
    },
    {urls: ["<all_urls>"]}, // Adjust the pattern to target specific URLs if needed
    ["blocking"] // Use the "blocking" option to allow canceling requests
  );