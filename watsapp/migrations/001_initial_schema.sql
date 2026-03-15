-- ============================================
-- WhatsApp AI Sales Agent - Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Conversations Table
-- Tracks every unique WhatsApp contact/lead
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    phone_number    TEXT NOT NULL UNIQUE,
    customer_name   TEXT,
    lead_stage      TEXT DEFAULT 'new' CHECK (lead_stage IN (
                        'new', 'engaged', 'qualified', 'proposal',
                        'negotiation', 'closed_won', 'closed_lost'
                    )),
    lead_score      INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
    sentiment       TEXT DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    total_messages  INTEGER DEFAULT 0,
    tags            JSONB DEFAULT '[]'::jsonb,
    notes           TEXT,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_stage ON conversations(lead_stage);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);

-- ============================================
-- Messages Table
-- Stores every inbound/outbound message
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    phone_number    TEXT NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content         TEXT NOT NULL,
    intent_detected TEXT DEFAULT 'general',
    ai_confidence   FLOAT DEFAULT 0.0,
    timestamp       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for conversation history and analytics
CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);

-- ============================================
-- Row Level Security (RLS)
-- Secure by default for production
-- ============================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (your backend)
CREATE POLICY "Service role full access on conversations"
    ON conversations FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on messages"
    ON messages FOR ALL
    USING (auth.role() = 'service_role');

-- Allow anon read for dashboard (if using anon key)
CREATE POLICY "Anon read conversations"
    ON conversations FOR SELECT
    USING (auth.role() = 'anon');

CREATE POLICY "Anon read messages"
    ON messages FOR SELECT
    USING (auth.role() = 'anon');
