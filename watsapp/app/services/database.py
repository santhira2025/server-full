"""
PostgreSQL Database Service - Direct connection, no Supabase SDK.
Self-hosted on K8s. Uses psycopg2 for sync operations.
Handles all CRUD: conversations, messages, analytics.
"""

import logging
logger = logging.getLogger(__name__)
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool

from app.core.config import get_settings
from app.models.schemas import MessageDirection, LeadStage, SentimentType


class DatabaseConnectionPool:
    """Connection pool for PostgreSQL to handle concurrent requests."""
    _pool = None
    _initialized = False
    
    @classmethod
    def initialize(cls):
        """Initialize the connection pool."""
        if cls._initialized:
            return
            
        settings = get_settings()
        cls._pool = SimpleConnectionPool(
            minconn=1,
            maxconn=20,
            host=settings.db_host,
            port=settings.db_port,
            dbname=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5,
        )
        cls._initialized = True
        logger.info("Database connection pool initialized")
    
    @classmethod
    @contextmanager
    def get_connection(cls):
        """Get a direct connection for simplicity."""
        settings = get_settings()
        conn = None
        try:
            conn = psycopg2.connect(
                host=settings.db_host,
                port=settings.db_port,
                dbname=settings.db_name,
                user=settings.db_user,
                password=settings.db_password,
            )
            conn.autocommit = True
            yield conn
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            raise
        finally:
            if conn:
                conn.close()


class Database:
    def __init__(self):
        try:
            DatabaseConnectionPool.initialize()
        except Exception as e:
            logger.warning(f"Database not available at startup (will retry on first query): {e}")
        
    def _execute(self, query: str, params: Optional[tuple] = None) -> List[Dict[str, Any]]:
        """Execute a query and return results."""
        with DatabaseConnectionPool.get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, params)
                if cur.description:
                    return [dict(row) for row in cur.fetchall()]
                return []
    
    def _execute_one(self, query: str, params: Optional[tuple] = None) -> Optional[Dict[str, Any]]:
        """Execute a query and return single result."""
        rows = self._execute(query, params)
        return rows[0] if rows else None
    
    @staticmethod
    def _serialize(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Convert UUID and datetime objects to strings for JSON."""
        if not row:
            return {}
        result = {}
        for key, val in row.items():
            if isinstance(val, datetime):
                result[key] = val.isoformat()
            elif hasattr(val, "hex"):  # UUID
                result[key] = str(val)
            else:
                result[key] = val
        return result

    # ------------------------------------------
    # Schema Bootstrap (auto-create tables)
    # ------------------------------------------

    def init_tables(self):
        """Create tables if they don't exist. Called on app startup."""
        with DatabaseConnectionPool.get_connection() as conn:
            with conn.cursor() as cur:
                # 1. Users table (for signup/login)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                        email           TEXT NOT NULL UNIQUE,
                        password_hash   TEXT NOT NULL,
                        business_name   TEXT,
                        whatsapp_number TEXT,
                        created_at      TIMESTAMPTZ DEFAULT NOW()
                    );
                    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                """)

                # 2. Conversations table (Modified for multi-tenancy)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS conversations (
                        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
                        phone_number    TEXT NOT NULL,
                        customer_name   TEXT,
                        lead_stage      TEXT DEFAULT 'new',
                        lead_score      INTEGER DEFAULT 0,
                        sentiment       TEXT DEFAULT 'neutral',
                        total_messages  INTEGER DEFAULT 0,
                        tags            JSONB DEFAULT '[]'::jsonb,
                        notes           TEXT,
                        is_paused       BOOLEAN DEFAULT FALSE,
                        last_message_at TIMESTAMPTZ,
                        created_at      TIMESTAMPTZ DEFAULT NOW(),
                        UNIQUE(user_id, phone_number)
                    );
    
                    CREATE INDEX IF NOT EXISTS idx_conv_phone ON conversations(phone_number);
                    CREATE INDEX IF NOT EXISTS idx_conv_stage ON conversations(lead_stage);
                    CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON conversations(last_message_at DESC);
    
                    CREATE TABLE IF NOT EXISTS messages (
                        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
                        phone_number    TEXT NOT NULL,
                        direction       TEXT NOT NULL,
                        content         TEXT NOT NULL,
                        intent_detected TEXT DEFAULT 'general',
                        ai_confidence   FLOAT DEFAULT 0.0,
                        timestamp       TIMESTAMPTZ DEFAULT NOW()
                    );
    
                    CREATE INDEX IF NOT EXISTS idx_msg_convo ON messages(conversation_id);
                    CREATE INDEX IF NOT EXISTS idx_msg_phone ON messages(phone_number);
                    CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(timestamp DESC);
                """)

                # 3. Handle migrations for existing databases
                cur.execute("""
                    DO $$ 
                    BEGIN 
                        -- Add user_id if missing
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                       WHERE table_name='conversations' AND column_name='user_id') THEN
                            ALTER TABLE conversations ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
                        END IF;
                        
                        -- Add is_paused if missing
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                       WHERE table_name='conversations' AND column_name='is_paused') THEN
                            ALTER TABLE conversations ADD COLUMN is_paused BOOLEAN DEFAULT FALSE;
                        END IF;

                        -- Add last_message_preview if missing
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                       WHERE table_name='conversations' AND column_name='last_message_preview') THEN
                            ALTER TABLE conversations ADD COLUMN last_message_preview TEXT;
                        END IF;

                        -- Add unique constraint if missing
                        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                                       WHERE table_name='conversations' AND constraint_type='UNIQUE') THEN
                            -- Note: This is simplified, usually you'd check for the specific constraint name
                            BEGIN
                                ALTER TABLE conversations ADD UNIQUE(user_id, phone_number);
                            EXCEPTION WHEN OTHERS THEN
                                NULL; -- Already exists or could not add
                            END;
                        END IF;

                        -- Add index for user_id
                        IF EXISTS (SELECT 1 FROM information_schema.columns 
                                   WHERE table_name='conversations' AND column_name='user_id') THEN
                            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conv_user') THEN
                                CREATE INDEX idx_conv_user ON conversations(user_id);
                            END IF;
                        END IF;
                    END $$;
                """)
            conn.commit()
        
        # 4. Bootstrap default user if none exist
        try:
            settings = get_settings()
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            
            existing = self._execute("SELECT id FROM users LIMIT 1")
            if not existing:
                admin_email = "admin@argus.ai"
                admin_pass = settings.dashboard_password or "admin123"
                hashed = pwd_context.hash(admin_pass)
                self.create_user(
                    email=admin_email,
                    password_hash=hashed,
                    business_name=settings.business_name or "Argus Demo",
                    whatsapp_number=settings.whatsapp_phone_number_id # Fallback identifier
                )
                logger.info(f"Created default admin user: {admin_email}")
        except Exception as e:
            logger.warning(f"Could not bootstrap default user: {e}")

        logger.info("Database tables initialized with multi-tenant support")

    # ------------------------------------------
    # Users (Auth)
    # ------------------------------------------

    def create_user(self, email: str, password_hash: str, business_name: str, whatsapp_number: Optional[str] = None) -> dict:
        row = self._execute_one(
            """INSERT INTO users (email, password_hash, business_name, whatsapp_number)
               VALUES (%s, %s, %s, %s)
               RETURNING *""",
            (email, password_hash, business_name, whatsapp_number),
        )
        return self._serialize(row)

    def get_user_by_email(self, email: str) -> Optional[dict]:
        row = self._execute_one("SELECT * FROM users WHERE email = %s", (email,))
        return self._serialize(row) if row else None

    def get_user_by_id(self, user_id: str) -> Optional[dict]:
        row = self._execute_one("SELECT * FROM users WHERE id = %s", (user_id,))
        return self._serialize(row) if row else None

    # ------------------------------------------
    # Conversations
    # ------------------------------------------

    def get_or_create_conversation(self, phone_number: str, user_id: Optional[str] = None) -> dict:
        # Try to find by phone + user_id first, then fall back to phone alone
        row = self._execute_one("SELECT * FROM conversations WHERE phone_number = %s", (phone_number,))
        if row:
            # If found under different user, reassign to current user
            if user_id and row["user_id"] != user_id:
                self._execute_one(
                    "UPDATE conversations SET user_id = %s WHERE phone_number = %s RETURNING *",
                    (user_id, phone_number)
                )
                row = self._execute_one("SELECT * FROM conversations WHERE phone_number = %s", (phone_number,))
            return self._serialize(row)

        row = self._execute_one(
            """INSERT INTO conversations (user_id, phone_number, lead_stage, lead_score, sentiment, total_messages, created_at)
               VALUES (%s, %s, %s, %s, %s, 0, NOW())
               RETURNING *""",
            (user_id, phone_number, LeadStage.NEW.value, 0, SentimentType.NEUTRAL.value),
        )
        return self._serialize(row)

    def update_conversation(self, phone_number: str, user_id: str, updates: dict) -> dict:
        if not updates:
            return {}

        updates["last_message_at"] = datetime.now(timezone.utc)

        set_parts = []
        values = []
        for key, val in updates.items():
            set_parts.append(f"{key} = %s")
            values.append(val)

        values.append(user_id)
        values.append(phone_number)
        query = f"UPDATE conversations SET {', '.join(set_parts)} WHERE user_id = %s AND phone_number = %s RETURNING *"

        row = self._execute_one(query, tuple(values))
        return self._serialize(row) if row else {}

    def get_all_conversations(self, user_id: str, limit: int = 50) -> list[dict]:
        rows = self._execute(
            """SELECT c.*,
                      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS total_messages
               FROM conversations c
               WHERE c.user_id = %s
               ORDER BY c.last_message_at DESC NULLS LAST
               LIMIT %s""",
            (user_id, limit),
        )
        return [self._serialize(r) for r in rows]

    # ------------------------------------------
    # Messages
    # ------------------------------------------

    def save_message(
        self,
        conversation_id: str,
        phone_number: str,
        direction: MessageDirection,
        content: str,
        intent: str = "general",
        confidence: float = 0.0,
    ) -> dict:
        row = self._execute_one(
            """INSERT INTO messages (conversation_id, phone_number, direction, content, intent_detected, ai_confidence, timestamp)
               VALUES (%s, %s, %s, %s, %s, %s, NOW())
               RETURNING *""",
            (conversation_id, phone_number, direction.value, content, intent, confidence),
        )
        # Store last message preview in conversation row
        preview = (content[:80] + "…") if len(content) > 80 else content
        self._execute_one(
            "UPDATE conversations SET last_message_preview = %s WHERE id = %s",
            (preview, conversation_id),
        )
        return self._serialize(row) if row else {}

    def get_conversation_history(self, phone_number: str, user_id: str, limit: int = 20) -> list[dict]:
        rows = self._execute(
            """SELECT m.* FROM messages m 
               JOIN conversations c ON m.conversation_id = c.id
               WHERE c.user_id = %s AND c.phone_number = %s 
               ORDER BY m.timestamp ASC LIMIT %s""",
            (user_id, phone_number, limit),
        )
        return [self._serialize(r) for r in rows]

    def get_messages_for_conversation(self, conversation_id: str, limit: int = 50) -> list[dict]:
        rows = self._execute(
            "SELECT * FROM messages WHERE conversation_id = %s ORDER BY timestamp ASC LIMIT %s",
            (conversation_id, limit),
        )
        return [self._serialize(r) for r in rows]

    # ------------------------------------------
    # Analytics / Dashboard
    # ------------------------------------------

    def get_dashboard_metrics(self, user_id: str) -> dict:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()

        # All conversations for this user
        conversations = self._execute("SELECT * FROM conversations WHERE user_id = %s", (user_id,))

        # Active today
        today_convos = self._execute(
            "SELECT id FROM conversations WHERE user_id = %s AND last_message_at >= %s",
            (user_id, today_start),
        )

        # Total messages count for this user's conversations
        msg_row = self._execute_one("""
            SELECT COUNT(m.id) as cnt 
            FROM messages m 
            JOIN conversations c ON m.conversation_id = c.id 
            WHERE c.user_id = %s
        """, (user_id,))
        total_msgs = msg_row["cnt"] if msg_row else 0

        # Stage & sentiment breakdown
        stage_counts = {}
        sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
        total_score = 0

        for c in conversations:
            stage = c.get("lead_stage", "new")
            stage_counts[stage] = stage_counts.get(stage, 0) + 1
            total_score += c.get("lead_score", 0)
            s = c.get("sentiment", "neutral")
            sentiment_counts[s] = sentiment_counts.get(s, 0) + 1

        total = len(conversations) or 1
        closed_won = stage_counts.get("closed_won", 0)

        return {
            "total_conversations": len(conversations),
            "active_today": len(today_convos),
            "total_messages": total_msgs,
            "avg_lead_score": round(total_score / total, 1),
            "conversion_rate": round((closed_won / total) * 100, 1),
            "leads_by_stage": stage_counts,
            "sentiment_breakdown": sentiment_counts,
        }

    def get_recent_activity(self, limit: int = 20) -> list[dict]:
        rows = self._execute(
            "SELECT * FROM messages ORDER BY timestamp DESC LIMIT %s",
            (limit,),
        )
        return [self._serialize(r) for r in rows]

    # ------------------------------------------
    # Helpers
    # ------------------------------------------

    @staticmethod
    def _serialize(row: dict) -> dict:
        """Convert UUID and datetime objects to strings for JSON."""
        if not row:
            return {}
        result = {}
        for key, val in row.items():
            if isinstance(val, datetime):
                result[key] = val.isoformat()
            elif hasattr(val, "hex"):  # UUID
                result[key] = str(val)
            else:
                result[key] = val
        return result


# Singleton
db = Database()
