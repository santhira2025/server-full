"""
Persists captured traffic (request + response pairs) to the sample_data table.
Used by mitmproxy addon and HAR ingestion to feed WordListResolver.
"""
import datetime
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.models.core import SampleData


class SampleDataWriter:
    """Write and retrieve sample request/response pairs per endpoint."""

    async def save(
        self,
        endpoint_id: str,
        request: dict,
        response: dict,
        db: AsyncSession,
    ) -> None:
        record = SampleData(
            id=str(uuid.uuid4()),
            endpoint_id=endpoint_id,
            request=request,
            response=response,
            created_at=datetime.datetime.utcnow(),
        )
        db.add(record)
        await db.commit()

    async def get_by_endpoint(self, endpoint_id: str, db: AsyncSession, limit: int = 10) -> list:
        result = await db.execute(
            select(SampleData)
            .where(SampleData.endpoint_id == endpoint_id)
            .order_by(SampleData.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def get_all(self, db: AsyncSession, limit: int = 500) -> list:
        result = await db.execute(
            select(SampleData).order_by(SampleData.created_at.desc()).limit(limit)
        )
        return result.scalars().all()
