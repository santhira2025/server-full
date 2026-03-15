import logging
import os
import sys
import time

try:
    from pyngrok import ngrok
except ImportError:
    print("pyngrok not installed. Run 'pip install pyngrok'")
    sys.exit(1)

logging.basicConfig(level=logging.ERROR)

def main():
    print("\nStarting Ngrok Webhook Tunnel...")
    
    # Start an ngrok tunnel pointing to our local port 9000
    try:
        http_tunnel = ngrok.connect(9000)
    except Exception as e:
        print(f"Error starting ngrok: {e}")
        return

    public_url = http_tunnel.public_url
    webhook_url = f"{public_url}/api/webhook"

    print("\n" + "="*70)
    print(" ✅ WEBHOOK TUNNEL STARTED SUCCESSFULLY ✅ ")
    print("="*70)
    print(f"\nYour app is running on localhost:9000")
    print(f"Twilio needs this exact URL to send messages to your app:\n")
    print(f"    👉  {webhook_url}  👈")
    print("\n" + "="*70)
    
    print("\nINSTRUCTIONS:")
    print("1. Go to Twilio Dashboard -> Messaging -> Try it out -> Send a WhatsApp message")
    print("2. Click on the 'Sandbox Settings' tab at the top.")
    print("3. In the 'WHEN A MESSAGE COMES IN' box, paste the URL above.")
    print("4. Click Save.")
    print("5. Keep this terminal open! If you close it, the URL will change.")
    print("\nPress Ctrl+C to stop the tunnel.")
    
    try:
        # Keep the script running to keep the tunnel alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping tunnel...")
        ngrok.disconnect(http_tunnel.public_url)
        ngrok.kill()

if __name__ == "__main__":
    main()
