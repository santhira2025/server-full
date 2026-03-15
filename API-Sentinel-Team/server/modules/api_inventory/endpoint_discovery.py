from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from server.models.core import APIEndpoint
from .path_normalizer import PathNormalizer
import datetime

class EndpointDiscovery:
    """
    Handles discovery and persistence of observed API endpoints.
    """
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.normalizer = PathNormalizer()

    async def discover(self, entry: dict):
        """
        Takes a normalized HAR entry and updates the database inventory.
        """
        method = entry['request']['method']
        raw_url = entry['request']['url']
        host = entry['host']
        path = entry['request']['url'].split('?')[0].replace(f"{entry['scheme']}://{host}", '')
        
        # 1. Normalize the path (cluster /user/123 -> /user/{id})
        path_pattern = self.normalizer.normalize(path)
        
        # 2. Check if this endpoint pattern already exists
        # In a real system, we'd also store unique query params/body structure
        query = select(APIEndpoint).where(
            APIEndpoint.method == method,
            APIEndpoint.host == host,
            APIEndpoint.path_pattern == path_pattern
        )
        
        result = await self.db.execute(query)
        endpoint = result.scalar_one_or_none()
        
        if endpoint:
            # 3. Update 'last_seen' and count-related stats
            endpoint.last_seen = datetime.datetime.now()
            # If path was /user/123 and pattern /{id}, path doesn't change
            # However, we can keep track of samples etc.
        else:
            # 4. Create new endpoint entry
            new_endpoint = APIEndpoint(
                method=method,
                host=host,
                path=path,  # store first seen path
                path_pattern=path_pattern,
                description=f"Auto-discovered {method} on {host}",
                last_seen=datetime.datetime.now()
            )
            self.db.add(new_endpoint)
        
        await self.db.commit()
