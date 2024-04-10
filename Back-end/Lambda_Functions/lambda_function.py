import boto3
import json
from urllib.parse import urlparse
import requests
from datetime import datetime


def get_domain_age(domain):
    url = "YOUR API GOES HERE"
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
            return 1110
    except Exception as e:
        print(f"Exception parsing response: {e}")
        return 1110

def preprocess_url(url):
    parsed_url = urlparse(url)
    hostname = parsed_url.hostname or ''
    path = parsed_url.path or ''

    # Computing features
    features = {
        "Is www present": 'www' in hostname,
        "Digit to alphabet ratio": sum(c.isdigit() for c in hostname) / (sum(c.isalpha() for c in hostname) or 1),
        "Uppercase to LowercaseRatio": sum(c.isupper() for c in hostname) / (sum(c.islower() for c in hostname) or 1),
        "Domain to URL Ratio": len(hostname) / (len(url) or 1),
        "Dots": hostname.count('.'),
        "Semicolon": url.count(';'),
        "Underscore": url.count('_'),
        "Question Mark": url.count('?'),
        "Equals": url.count('='),
        "Percentage Character": url.count('%'),
        "Ampersand": url.count('&'),
        "Dash": hostname.count('-'),
        "Delimiters": url.count('/') + url.count('?') + url.count('='),
        "Double Slash": url.count('//'),
        "Https in URL": parsed_url.scheme == 'https',
        "TLD in path": any(part.endswith(tuple(['.com', '.org', '.net', '.io'])) for part in path.split('/')),
        "Host name length": len(hostname),
        "Path length": len(path),
    }
    print(features)

    # Adding the "Is domain suspicious" feature based on the domain's age
    domain_age_days = get_domain_age(parsed_url.netloc)
    features["Is domain suspicious"] = 1 if domain_age_days < 60 else 0

    # Convert boolean features to binary
    features_binary = {k: int(v) for k, v in features.items()}

    # Convert features into the sample format expected by the model
    sample = ','.join(str(features_binary[feature]) for feature in sorted(features_binary))
    print("Features in binary", features_binary)
    return sample, domain_age_days

def lambda_handler(event, context):
    runtime_client = boto3.client('runtime.sagemaker')
    endpoint_name = 'knn-2024-04-09-20-54-55-139'

    try:
        post_data = json.loads(event['body'])
        url = post_data['url']
        sample, domain_age_days = preprocess_url(url)

        response = runtime_client.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType='text/csv',
            Body=sample
        )

        result_str = response['Body'].read().decode('ascii')
        result_json = json.loads(result_str)
        predicted_label = result_json["predictions"][0]["predicted_label"]
        predicted_label_int = int(predicted_label)

        response_body = {"Classified": predicted_label_int}
        if domain_age_days != -1:
            response_body["Domain age in days"] = domain_age_days
            print("Response Body :",response_body)

        return {
            'statusCode': 200,
            'body': json.dumps(response_body),
            
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
            
        }

