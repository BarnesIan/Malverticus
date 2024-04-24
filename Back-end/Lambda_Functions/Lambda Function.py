import boto3
import json
from urllib.parse import urlparse
import requests
from datetime import datetime
import re
import ipaddress
import logging

def get_domain_age(domain):
    url ="YOUR API GOES HERE"
    querystring = {"domain": domain, "format": "json", "_forceRefresh": "0"}
    headers = {
        "X-RapidAPI-Key": "KEY IF REQUIRED",
        "X-RapidAPI-Host": "API HOST IF REQUIRED"
    }
    
    response = requests.get(url, headers=headers, params=querystring)
    
    # First, let's ensure we're getting a successful response.
    if response.status_code != 200:
        print(f"Error fetching WHOIS data, status code: {response.status_code}")
        return 1110

    # Assuming a successful response, log the entire response for inspection in cloudwatch.
    try:
        data = response.json()  # This should be a dict object
        print("Full API response:", json.dumps(data, indent=4))  # Pretty print the JSON response in cloudwatch.

        creation_date_str = data.get('created', None)
        if creation_date_str:
            creation_date = datetime.strptime(creation_date_str, "%Y-%m-%d %H:%M:%S")
            current_date = datetime.now()
            domain_age_days = (current_date - creation_date).days
            return domain_age_days
        else:
            print("Creation date not found in response.")
            return 110
    except Exception as e:
        print(f"Exception parsing response: {e}")
        return 110
        
def preprocess_url(url):
    parsed_url = urlparse(url)
    url_len = len(url)
    letters_count = sum(c.isalpha() for c in url)
    digits_count = sum(c.isdigit() for c in url)
    special_chars_count = sum(c in "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~" for c in url)
    secure_http = 1 if parsed_url.scheme == 'https' else 0
    try:
        have_ip = 1 if ipaddress.ip_address(parsed_url.hostname) else 0
    except ValueError:
        have_ip = 0
    shortened = has_shortening_service(url)
    domain_age_days = get_domain_age(parsed_url.netloc)
    
    features = {
        "url_len": url_len,
        "letters_count": letters_count,
        "digits_count": digits_count,
        "special_chars_count": special_chars_count,
        "secure_http": secure_http,
        "have_ip": have_ip,
        "shortened": shortened
    }
    print("Features used:", features)
     # Define the order explicitly
    feature_order = [
        "url_len", "letters_count", "digits_count", "special_chars_count",
        "secure_http", "have_ip", "shortened"
    ]

    # Generate the sample string based on the specified order
    sample = ','.join(str(features[feature]) for feature in feature_order)
    print("Features used:", features)
    print("Type of features:", type(features))
    print("Content of features:", features)
    print("Domain age in days:", domain_age_days)
    print("Domain age in days:", type(domain_age_days))
    print("Sample string:", sample)
    print("Domain age days:", domain_age_days)
    return sample, domain_age_days

def has_shortening_service(url):
    pattern = re.compile(r'https?://(?:www\.)?(?:\w+\.)*(\w+)\.\w+')
    match = pattern.search(url)
    if match:
        domain = match.group(1)
        common_shortening_services = set(['bit', 'goo', 'tinyurl', 'ow', 't', 'is',
                                          'cli', 'yfrog', 'migre', 'ff', 'url4', 'twit',
                                          'su', 'snipurl', 'short', 'BudURL', 'ping', 
                                          'post', 'Just', 'bkite', 'snipr', 'fic', 
                                          'loopt', 'doiop', 'short', 'kl', 'wp', 
                                          'rubyurl', 'om', 'to', 'bit', 't', 'lnkd', 
                                          'db', 'qr', 'adf', 'goo', 'bitly', 'cur', 
                                          'tinyurl', 'ow', 'bit', 'ity', 'q', 'is', 
                                          'po', 'bc', 'twitthis', 'u', 'j', 'buzurl', 
                                          'cutt', 'u', 'yourls', 'x', 'prettylinkpro', 
                                          'scrnch', 'filoops', 'vzturl', 'qr', '1url', 
                                          'tweez', 'v', 'tr', 'link', 'zip'])
        return 1 if domain.lower() in common_shortening_services else 0
    return 0
    

def lambda_handler(event, context):
    # SageMaker runtime client
    runtime_client = boto3.client('runtime.sagemaker')
    endpoint_name = 'xgboost-2024-04-23-16-06-04-759'

    try:
        # Parse the incoming JSON payload
        post_data = json.loads(event['body'])
        url = post_data['url']

        # Process the URL to extract features and domain age
        sample, domain_age_days = preprocess_url(url)

        # Invoke the SageMaker endpoint with the processed features
        response = runtime_client.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType='text/csv', 
            Body=sample
        )

        # Read and decode the response from the endpoint
        result_str = response['Body'].read().decode('ascii')
        probability = float(result_str)
        predicted_label = 1 if probability > 0.5 else 0

        # Prepare the response body
        response_body = {
            "Classified": predicted_label,
            "Probability": probability,
            "Domain age in days": domain_age_days
        }

        # Log results for debugging
        print(f"URL: {url}")
        print(f"Processed sample: {sample}")
        print(f"Probability: {probability}")
        print(f"Predicted Label: {predicted_label}")
        print(f"Domain Age in Days: {domain_age_days}")

        # Return the results as a successful HTTP response
        return {
            'statusCode': 200,
            'body': json.dumps(response_body)
        }

    except Exception as e:
        # Log and return error information if an exception occurs
        print(f"Error processing URL: {url}")
        print(f"Exception: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }