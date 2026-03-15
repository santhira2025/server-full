import requests
import time

url = "https://argus.watsapp.santhira.com/api/webhook"

# Simulate a standard WhatsApp payload from Meta
payload = {
    "object": "whatsapp_business_account",
    "entry": [{
        "id": "123456789",
        "changes": [{
            "value": {
                "messaging_product": "whatsapp",
                "metadata": {
                    "display_phone_number": "1234567890",
                    "phone_number_id": "123456789"
                },
                "contacts": [{
                    "profile": {
                        "name": "Rajkumar Testing"
                    },
                    "wa_id": "919876543210"
                }],
                "messages": [{
                    "from": "919876543210",
                    "id": f"wamid.{int(time.time())}",
                    "timestamp": str(int(time.time())),
                    "text": {
                        "body": "Hi, I am interested in your financial products."
                    },
                    "type": "text"
                }]
            },
            "field": "messages"
        }]
    }]
}

print("Sending mock WhatsApp message from 'Rajkumar Testing'...")
response = requests.post(url, json=payload)
print(f"Server response: {response.status_code}")
if response.status_code == 200:
    print("Success! Check your dashboard at http://localhost:9000/dashboard/")
else:
    print(f"Error: {response.text}")
