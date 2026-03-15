import asyncio
import random
import time
from server.modules.persistence.database import engine, AsyncSessionLocal
from server.models.core import ThreatActor, MaliciousEventRecord

async def seed_data():
    async with AsyncSessionLocal() as db:
        print("Seeding threat data...")
        
        ips = [f"192.168.1.{i}" for i in range(1, 11)]
        event_types = ["SQL_INJECTION", "XSS", "BOLA", "SENSITIVE_DATA_EXPOSURE", "BROKEN_AUTH"]
        methods = ["GET", "POST", "PUT", "DELETE"]
        paths = ["/api/v1/users", "/api/v1/auth/login", "/api/v1/billing", "/api/v1/profile", "/api/v1/orders"]
        countries = ["US", "IN", "CN", "DE", "GB", "FR", "RU", "JP", "BR", "CA"]
        
        # Current time in ms
        now = int(time.time() * 1000)
        day_ms = 86400 * 1000
        
        for ip in ips:
            # Create/get actor
            status = random.choice(["MONITORING", "BLOCKED", "WHITELISTED"])
            actor = ThreatActor(source_ip=ip, status=status, event_count=random.randint(5, 50), risk_score=random.random() * 10)
            db.add(actor)
            await db.flush()
            
            # Create events for last 7 days
            for day_offset in range(7):
                day_ts = now - (day_offset * day_ms)
                num_events = random.randint(1, 10)
                
                for _ in range(num_events):
                    event_type = random.choice(event_types)
                    is_blocked = status == "BLOCKED"
                    is_successful = not is_blocked and (random.random() < 0.2)
                    
                    record = MaliciousEventRecord(
                        account_id=1000000,
                        actor=actor.id,
                        ip=ip,
                        url=random.choice(paths),
                        method=random.choice(methods),
                        event_type=event_type,
                        category=event_type,
                        severity=random.choice(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
                        detected_at=day_ts + random.randint(0, day_ms),
                        status="BLOCKED" if is_blocked else "OPEN",
                        successful_exploit=is_successful,
                        country_code=random.choice(countries)
                    )
                    db.add(record)
                    
        await db.commit()
        print("Seeding complete.")

if __name__ == "__main__":
    asyncio.run(seed_data())
