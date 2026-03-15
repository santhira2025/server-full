import asyncio
import httpx

async def test_signup():
    url = "http://127.0.0.1:8000/api/auth/signup"
    payload = {
        "email": "test@example.com",
        "password": "Password123!",
        "account_name": "Test Org"
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload)
            print(f"Status: {resp.status_code}")
            print(f"Body: {resp.text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_signup())
