import asyncio
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from server.api.main import app
from server.modules.persistence.database import get_db, get_read_db
from server.models import Base
from server.config import settings
from server.modules.auth.jwt_issuer import JWTIssuer

# Use an in-memory database for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="session")
def event_loop():
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop

@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.fixture
async def db_session(test_engine):
    Session = async_sessionmaker(bind=test_engine, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()

@pytest.fixture
async def client(db_session):
    def override_get_db():
        yield db_session
    def override_get_read_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_read_db] = override_get_read_db
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    token = JWTIssuer.create_access_token({
        "user_id": "test-user",
        "account_id": 1000000,
        "role": "ADMIN",
    })
    return {"Authorization": f"Bearer {token}"}
