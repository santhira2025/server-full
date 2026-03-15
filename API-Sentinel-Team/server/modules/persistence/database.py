from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from server.config import settings
from server.modules.tenancy.context import get_current_account_id

_engine_kwargs = {
    "echo": False,
    "future": True,
    "pool_pre_ping": True,
}

if not settings.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs.update({
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_timeout": settings.DB_POOL_TIMEOUT,
        "pool_recycle": settings.DB_POOL_RECYCLE,
    })

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

_read_engine = None
if settings.READ_REPLICA_URL:
    _read_engine = create_async_engine(settings.READ_REPLICA_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

ReadOnlySessionLocal = async_sessionmaker(
    bind=_read_engine or engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        await apply_tenant_context(session)
        yield session

async def get_read_db():
    async with ReadOnlySessionLocal() as session:
        await apply_tenant_context(session)
        yield session


async def apply_tenant_context(session) -> None:
    if not settings.TENANT_RLS_ENABLED:
        return
    if "postgres" not in settings.DATABASE_URL:
        return
    account_id = get_current_account_id()
    if account_id is None:
        return
    await session.execute(
        text(f"SET LOCAL {settings.TENANT_RLS_SETTING_NAME} = :account_id"),
        {"account_id": str(account_id)},
    )
