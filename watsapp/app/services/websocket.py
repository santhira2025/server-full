from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: dict):
        """
        Broadcasts a message to all connected clients.
        event_type: e.g. 'new_message', 'metrics_update'
        """
        message = {"type": event_type, "data": data}
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                self.disconnect(connection)

ws_manager = ConnectionManager()
