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
      console.error('Error fetching classification report:', error);
      return null;
    }
  }
  
  // Listener for incoming web requests
  chrome.webRequest.onBeforeRequest.addListener(
    async (details) => {
      const url = details.url;
      const classification = await classifyUrl(url);
  
      // If the Lambda function returns null, an error occurred, so allow the request anyway (need some other error handling)
      if (!classification) {
        return {cancel: True};
      }
  
      const {Classified, "Domain age in days": domainAgeDays} = classification;
  
      // Check the classification score and domain age from the report 
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