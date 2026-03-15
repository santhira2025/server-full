from locust import HttpUser, task, between
import random

class APISecurityUser(HttpUser):
    wait_time = between(1, 5)
    token = None
    headers = None

    def on_start(self):
        # Create a user for load testing
        email = f"loadtest_{random.randint(1000, 9999)}@test.com"
        resp = self.client.post("/api/auth/signup", json={
            "email": email, 
            "password": "loadtestpass",
            "account_name": "LoadTestCorp"
        })
        if resp.status_code == 200:
            self.token = resp.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            # Try login if signup failed (maybe user exists)
            resp = self.client.post("/api/auth/login", json={
                "email": email,
                "password": "loadtestpass"
            })
            if resp.status_code == 200:
                self.token = resp.json()["access_token"]
                self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(10)
    def get_dashboard(self):
        if self.headers:
            self.client.get("/api/dashboard/", headers=self.headers)

    @task(5)
    def get_endpoints(self):
        if self.headers:
            self.client.get("/api/endpoints/", headers=self.headers)

    @task(2)
    def list_vulnerabilities(self):
        if self.headers:
            self.client.get("/api/vulnerabilities/", headers=self.headers)

    @task(1)
    def trigger_test_run(self):
        if self.headers:
            # Just a mock trigger to see if it responds fast
            self.client.post("/api/tests/run", 
                            headers=self.headers,
                            json={
                                "template_ids": ["bola_user_id"], 
                                "endpoint_ids": ["some-uuid"]
                            })
