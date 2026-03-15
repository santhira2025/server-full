"""
Santhira DevOps Master Platform — Interactive Dashboard
Enterprise SaaS | Innovative Personal-Level UI/UX
Designed by Rajkumar Madhu, Founder & CTO
"""
import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
import time
from datetime import datetime
import random
import math
import sys
import os

BACKEND_PATH = os.path.join(os.path.dirname(__file__), '..', 'backend')
analyze_error = None
get_error_catalog = None

if os.path.exists(BACKEND_PATH):
    sys.path.insert(0, BACKEND_PATH)
    try:
        from troubleshooter.integration import analyze_error as _analyze_error, get_error_catalog as _get_catalog
        analyze_error = _analyze_error
        get_error_catalog = _get_catalog
        BACKEND_AVAILABLE = True
    except ImportError:
        BACKEND_AVAILABLE = False
else:
    BACKEND_AVAILABLE = False

ERROR_CATALOG = [
    {"Error ID": "k8s-001", "Title": "Pod CrashLoopBackOff", "Tool": "kubernetes", "Category": "state", "Severity": "critical"},
    {"Error ID": "k8s-002", "Title": "Pod ImagePullBackOff", "Tool": "kubernetes", "Category": "configuration", "Severity": "high"},
    {"Error ID": "k8s-003", "Title": "Pod Evicted", "Tool": "kubernetes", "Category": "resources", "Severity": "high"},
    {"Error ID": "k8s-004", "Title": "Pod OOMKilled", "Tool": "kubernetes", "Category": "resources", "Severity": "critical"},
    {"Error ID": "k8s-005", "Title": "Container Unhealthy", "Tool": "kubernetes", "Category": "state", "Severity": "high"},
    {"Error ID": "docker-001", "Title": "Docker Permission Denied", "Tool": "docker", "Category": "permissions", "Severity": "medium"},
    {"Error ID": "docker-002", "Title": "Container Already Exists", "Tool": "docker", "Category": "state", "Severity": "low"},
    {"Error ID": "terraform-001", "Title": "Provider Not Found", "Tool": "terraform", "Category": "configuration", "Severity": "high"},
    {"Error ID": "aws-001", "Title": "AWS Access Denied", "Tool": "aws", "Category": "permissions", "Severity": "high"},
    {"Error ID": "nginx-001", "Title": "502 Bad Gateway", "Tool": "nginx", "Category": "networking", "Severity": "high"},
    {"Error ID": "postgres-001", "Title": "Connection Refused", "Tool": "postgresql", "Category": "networking", "Severity": "high"},
    {"Error ID": "postgres-002", "Title": "Password Auth Failed", "Tool": "postgresql", "Category": "permissions", "Severity": "high"},
]


def _show_demo_troubleshoot(err: str):
    st.markdown("---")
    st.markdown('<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><span class="sev-high">HIGH SEVERITY</span><span style="color:#f1f5f9;font-weight:600;">CrashLoopBackOff — Service DOWN</span></div>', unsafe_allow_html=True)
    st.markdown("### 🎯 Root Cause Analysis")
    st.markdown("| Cause | Probability | Evidence |\n|-------|------------|----------|\n| **App crash (exception/panic)** | 45% | Non-zero exit code |\n| **OOMKilled** | 30% | `lastState.terminated.reason` |\n| **Failed liveness probe** | 15% | Probe timeout |\n| **Missing ConfigMap/Secret** | 10% | Volume mount failure |")
    st.markdown("### 🔍 Diagnostic Commands")
    st.code("kubectl describe pod payment-svc-7d4f8b-xk2lm -n production\nkubectl logs payment-svc-7d4f8b-xk2lm -n production --previous",language="bash")
    st.markdown("### 🔧 Fix Steps")
    for t,cmd,v,c in [("1. Check pod events","kubectl describe pod ...","Look for Events","#00d4aa"),("2. Check crash logs","kubectl logs ... --previous","Find exception","#00d4aa"),
        ("3. If OOMKilled → increase memory","kubectl patch deployment ...","kubectl get pod -w","#f59e0b"),("4. If probe → startup probe","Add startupProbe failureThreshold: 30","rollout status","#f59e0b")]:
        st.markdown(f'<div class="flow-card" style="--fc-color:{c};"><div class="fc-title">{t}</div><div style="font-family:JetBrains Mono,monospace;font-size:12px;color:#3b82f6;margin:6px 0;">{cmd}</div><div class="fc-desc">✓ Verify: {v}</div></div>', unsafe_allow_html=True)
    st.markdown("### 🛡️ Prevention")
    st.code("alert: PodCrashLooping\nexpr: rate(kube_pod_container_status_restarts_total[15m]) > 0\nfor: 5m\nlabels:\n  severity: critical",language="yaml")

# ─── Page Config ───
st.set_page_config(
    page_title="Santhira — DevOps Master Platform",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Time-based greeting ───
hour = datetime.now().hour
if hour < 12:
    greeting = "Good Morning"
    greeting_icon = "🌅"
elif hour < 17:
    greeting = "Good Afternoon"
    greeting_icon = "☀️"
else:
    greeting = "Good Evening"
    greeting_icon = "🌙"

# ─── INNOVATIVE CSS ───
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap');

    :root {
        --bg: #030712; --bg2: #0a0f1e; --bg3: #111827; --bg4: #1f2937;
        --border: rgba(255,255,255,0.06); --border2: rgba(255,255,255,0.1);
        --text: #f1f5f9; --text2: #94a3b8; --text3: #475569;
        --accent: #00d4aa; --accent2: #06b6d4; --accent3: #10b981;
        --blue: #3b82f6; --purple: #8b5cf6; --orange: #f59e0b;
        --red: #ef4444; --pink: #ec4899; --cyan: #06b6d4;
        --neon-glow: 0 0 20px rgba(0,212,170,0.15), 0 0 60px rgba(0,212,170,0.05);
    }

    .stApp {
        font-family: 'Inter', sans-serif;
        background: var(--bg) !important;
        background-image:
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,170,0.04), transparent),
            radial-gradient(ellipse 60% 40% at 80% 50%, rgba(59,130,246,0.02), transparent),
            radial-gradient(ellipse 60% 40% at 20% 80%, rgba(139,92,246,0.02), transparent) !important;
    }

    /* ── Chrome Hide ── */
    #MainMenu, footer, header, [data-testid="stToolbar"] { visibility: hidden; }
    .block-container { padding: 0.8rem 2rem 2rem !important; max-width: 100% !important; }

    /* ── Animated Grid Background ── */
    .stApp::before {
        content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
        background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
        background-size: 60px 60px;
        mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 70%);
        -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 70%);
    }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

    /* ── Sidebar ── */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, rgba(3,7,18,0.97) 0%, rgba(10,15,30,0.97) 100%) !important;
        border-right: 1px solid rgba(255,255,255,0.04);
        backdrop-filter: blur(40px);
    }
    [data-testid="stSidebar"] .stRadio > label { display: none; }
    [data-testid="stSidebar"] .stRadio > div { display: flex; flex-direction: column; gap: 1px; }
    [data-testid="stSidebar"] .stRadio > div > label {
        background: transparent; border-radius: 10px; padding: 9px 14px;
        cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        font-size: 13px; border: 1px solid transparent; font-weight: 500;
        position: relative; overflow: hidden;
    }
    [data-testid="stSidebar"] .stRadio > div > label:hover {
        background: rgba(0,212,170,0.03); border-color: rgba(255,255,255,0.04);
    }
    [data-testid="stSidebar"] .stRadio > div > label[data-checked="true"] {
        background: linear-gradient(135deg, rgba(0,212,170,0.06), rgba(59,130,246,0.04));
        border-color: rgba(0,212,170,0.15);
        box-shadow: inset 0 0 20px rgba(0,212,170,0.03), 0 0 15px rgba(0,212,170,0.03);
    }
    [data-testid="stSidebar"] .stRadio > div > label[data-checked="true"]::before {
        content: ''; position: absolute; left: 0; top: 25%; bottom: 25%; width: 2px;
        background: linear-gradient(180deg, #00d4aa, #06b6d4); border-radius: 2px;
    }

    /* ── Neon Glass Card ── */
    .neon-card {
        background: linear-gradient(145deg, rgba(17,24,39,0.6), rgba(31,41,55,0.3));
        backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255,255,255,0.05); border-radius: 18px;
        padding: 26px; position: relative; overflow: hidden;
        transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
    }
    .neon-card::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.08) 50%, transparent 90%);
    }
    .neon-card::after {
        content: ''; position: absolute; inset: 0; border-radius: 18px; opacity: 0;
        background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(0,212,170,0.06), transparent 60%);
        transition: opacity 0.4s;
    }
    .neon-card:hover {
        border-color: rgba(0,212,170,0.12); transform: translateY(-4px) scale(1.005);
        box-shadow: 0 20px 60px rgba(0,0,0,0.4), var(--neon-glow);
    }
    .neon-card:hover::after { opacity: 1; }

    /* ── Metric Tile ── */
    .metric-tile {
        background: linear-gradient(145deg, rgba(17,24,39,0.5), rgba(31,41,55,0.2));
        border: 1px solid rgba(255,255,255,0.04); border-radius: 16px;
        padding: 20px; position: relative; overflow: hidden;
        transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
    }
    .metric-tile:hover {
        border-color: rgba(255,255,255,0.08); transform: translateY(-2px);
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
    }
    .metric-tile .glow-orb {
        position: absolute; top: -20px; right: -20px; width: 80px; height: 80px;
        border-radius: 50%; opacity: 0.06; filter: blur(20px);
        transition: opacity 0.3s;
    }
    .metric-tile:hover .glow-orb { opacity: 0.12; }
    .mt-label {
        font-size: 10.5px; color: #64748b; text-transform: uppercase;
        letter-spacing: 1.5px; font-weight: 600; margin-bottom: 10px;
        display: flex; align-items: center; gap: 6px;
    }
    .mt-value {
        font-family: 'Space Grotesk', sans-serif; font-size: 32px;
        font-weight: 700; line-height: 1; margin-bottom: 8px;
        background: linear-gradient(135deg, var(--c1), var(--c2, var(--c1)));
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .mt-trend {
        font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px;
    }
    .mt-trend.up { color: #10b981; }
    .mt-trend.down { color: #ef4444; }
    .mt-trend.neutral { color: #475569; }
    .mt-spark {
        display: inline-block; vertical-align: middle;
    }

    /* ── Module Card Innovative ── */
    .mod-card {
        background: linear-gradient(145deg, rgba(17,24,39,0.5), rgba(31,41,55,0.15));
        border: 1px solid rgba(255,255,255,0.04); border-radius: 20px;
        padding: 28px; position: relative; overflow: hidden; cursor: pointer;
        transition: all 0.45s cubic-bezier(0.4,0,0.2,1);
    }
    .mod-card::before {
        content: ''; position: absolute; top: -2px; left: 20%; right: 20%; height: 2px;
        background: var(--accent-grad); border-radius: 2px; opacity: 0;
        transition: all 0.4s; filter: blur(0.5px);
    }
    .mod-card::after {
        content: ''; position: absolute; inset: 0; border-radius: 20px;
        background: linear-gradient(135deg, var(--card-glow, rgba(0,212,170,0.04)), transparent 60%);
        opacity: 0; transition: opacity 0.4s;
    }
    .mod-card:hover {
        border-color: var(--card-border, rgba(0,212,170,0.15));
        transform: translateY(-6px); box-shadow: 0 24px 60px rgba(0,0,0,0.35);
    }
    .mod-card:hover::before { opacity: 1; left: 10%; right: 10%; }
    .mod-card:hover::after { opacity: 1; }
    .mod-card .mc-icon {
        width: 48px; height: 48px; border-radius: 14px;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; margin-bottom: 16px; position: relative; z-index: 1;
        background: var(--icon-bg, rgba(0,212,170,0.08));
        border: 1px solid var(--icon-border, rgba(0,212,170,0.1));
    }
    .mod-card .mc-title {
        font-size: 16px; font-weight: 700; color: #f1f5f9;
        margin-bottom: 8px; position: relative; z-index: 1;
    }
    .mod-card .mc-desc {
        font-size: 12.5px; color: #94a3b8; line-height: 1.65;
        position: relative; z-index: 1;
    }
    .mod-card .mc-footer {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: 18px; padding-top: 14px;
        border-top: 1px solid rgba(255,255,255,0.04);
        position: relative; z-index: 1;
    }
    .mc-tag {
        font-size: 10px; padding: 3px 10px; border-radius: 20px;
        font-weight: 600; letter-spacing: 0.5px;
    }
    .mc-badge {
        font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #475569;
    }

    /* ── Tags ── */
    .tag-green { background: rgba(0,212,170,0.1); color: #00d4aa; }
    .tag-blue { background: rgba(59,130,246,0.1); color: #3b82f6; }
    .tag-purple { background: rgba(139,92,246,0.1); color: #8b5cf6; }
    .tag-orange { background: rgba(245,158,11,0.1); color: #f59e0b; }
    .tag-red { background: rgba(239,68,68,0.1); color: #ef4444; }
    .tag-cyan { background: rgba(6,182,212,0.1); color: #06b6d4; }
    .tag-pink { background: rgba(236,72,153,0.1); color: #ec4899; }

    /* ── Status Pulse ── */
    .status-pulse {
        width: 8px; height: 8px; border-radius: 50%; display: inline-block;
        position: relative; margin-right: 7px;
    }
    .status-pulse.live {
        background: #10b981;
        box-shadow: 0 0 6px rgba(16,185,129,0.6), 0 0 20px rgba(16,185,129,0.2);
    }
    .status-pulse.live::after {
        content: ''; position: absolute; inset: -4px; border-radius: 50%;
        border: 1.5px solid rgba(16,185,129,0.3);
        animation: pulse-expand 2s ease-out infinite;
    }
    @keyframes pulse-expand {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(2.2); opacity: 0; }
    }

    /* ── Section Divider ── */
    .sec-div {
        display: flex; align-items: center; gap: 12px; margin: 28px 0 20px;
    }
    .sec-div-text {
        font-size: 10.5px; text-transform: uppercase; letter-spacing: 2.5px;
        color: #475569; font-weight: 700; white-space: nowrap;
        font-family: 'JetBrains Mono', monospace;
    }
    .sec-div-line {
        flex: 1; height: 1px;
        background: linear-gradient(90deg, rgba(255,255,255,0.06), transparent);
    }

    /* ── Flow Step ── */
    .flow-card {
        background: linear-gradient(135deg, rgba(17,24,39,0.5), rgba(31,41,55,0.15));
        border-left: 3px solid var(--fc-color, #00d4aa);
        border-radius: 0 14px 14px 0; padding: 18px 24px; margin-bottom: 8px;
        border-top: 1px solid rgba(255,255,255,0.03);
        border-right: 1px solid rgba(255,255,255,0.03);
        border-bottom: 1px solid rgba(255,255,255,0.03);
        transition: all 0.3s;
    }
    .flow-card:hover {
        background: rgba(17,24,39,0.7);
        border-color: rgba(255,255,255,0.06);
        border-left-color: var(--fc-color, #00d4aa);
        transform: translateX(4px);
    }
    .fc-num { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; margin-bottom: 4px; }
    .fc-title { font-size: 14px; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; }
    .fc-desc { font-size: 12px; color: #94a3b8; line-height: 1.55; }

    /* ── Severity ── */
    .sev-critical { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
    .sev-high { background: linear-gradient(135deg, #ea580c, #c2410c); color: white; padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; }
    .sev-medium { background: linear-gradient(135deg, #d97706, #b45309); color: white; padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; }
    .sev-low { background: linear-gradient(135deg, #059669, #047857); color: white; padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; }

    /* ── Gradient Card Wrap ── */
    .grad-wrap {
        background: linear-gradient(135deg, var(--g1, #00d4aa), var(--g2, #3b82f6));
        padding: 1.5px; border-radius: 20px; transition: all 0.35s;
    }
    .grad-wrap:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.3); transform: translateY(-3px); }
    .grad-inner {
        background: linear-gradient(145deg, #0a0f1e, #111827);
        border-radius: 18.5px; padding: 28px;
    }

    /* ── Hero V3 ── */
    .hero-v3 {
        text-align: center; padding: 48px 20px 36px; position: relative;
        margin: -0.8rem -2rem 2rem; overflow: hidden;
    }
    .hero-v3::before {
        content: ''; position: absolute; inset: 0;
        background:
            radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,212,170,0.07), transparent),
            radial-gradient(ellipse 40% 40% at 20% 50%, rgba(59,130,246,0.04), transparent),
            radial-gradient(ellipse 40% 40% at 80% 50%, rgba(139,92,246,0.04), transparent);
    }
    .hero-v3::after {
        content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(0,212,170,0.15), rgba(59,130,246,0.1), transparent);
    }
    .hero-greeting {
        font-size: 14px; color: #64748b; font-weight: 500; margin-bottom: 8px;
        position: relative; z-index: 1;
    }
    .hero-title-v3 {
        font-family: 'Space Grotesk', sans-serif; font-size: 44px; font-weight: 700;
        letter-spacing: -1px; margin-bottom: 12px; position: relative; z-index: 1;
        background: linear-gradient(90deg, #94a3b8 0%, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%, #94a3b8 100%);
        background-size: 200% auto;
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .hero-accent-v3 {
        background: linear-gradient(135deg, #00d4aa, #06b6d4, #3b82f6);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .hero-sub-v3 {
        color: #64748b; font-size: 15px; font-weight: 400;
        position: relative; z-index: 1; max-width: 600px; margin: 0 auto;
    }
    .hero-pills {
        display: flex; gap: 8px; justify-content: center; margin-top: 20px;
        position: relative; z-index: 1; flex-wrap: wrap;
    }
    .hero-pill {
        display: inline-flex; align-items: center; gap: 5px;
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
        border-radius: 20px; padding: 5px 14px; font-size: 11px;
        color: #94a3b8; font-weight: 500; transition: all 0.3s;
    }
    .hero-pill:hover { border-color: rgba(0,212,170,0.2); background: rgba(0,212,170,0.04); }
    .hero-pill .pill-dot { width: 5px; height: 5px; border-radius: 50%; }

    /* ── Progress Ring (SVG) ── */
    .progress-ring { position: relative; display: inline-flex; align-items: center; justify-content: center; }
    .progress-ring svg { transform: rotate(-90deg); }
    .progress-ring .ring-text {
        position: absolute; font-family: 'Space Grotesk', sans-serif;
        font-size: 14px; font-weight: 700;
    }

    /* ── Activity Feed ── */
    .activity-item {
        display: flex; gap: 12px; padding: 12px 0;
        border-bottom: 1px solid rgba(255,255,255,0.03);
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-dot {
        width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0;
    }
    .activity-text { font-size: 12.5px; color: #94a3b8; line-height: 1.5; }
    .activity-time { font-size: 10px; color: #475569; margin-top: 2px; font-family: 'JetBrains Mono', monospace; }

    /* ── Tabs Override ── */
    .stTabs [data-baseweb="tab-list"] {
        gap: 2px; background: rgba(17,24,39,0.5); border-radius: 12px;
        padding: 4px; border: 1px solid rgba(255,255,255,0.04);
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 8px; padding: 8px 18px; font-size: 13px;
        background: transparent; color: #475569; font-weight: 500;
    }
    .stTabs [aria-selected="true"] {
        background: rgba(0,212,170,0.06); color: #00d4aa;
        box-shadow: 0 2px 12px rgba(0,0,0,0.2);
    }

    div[data-testid="stExpander"] {
        border: 1px solid rgba(255,255,255,0.04); border-radius: 16px;
        background: rgba(17,24,39,0.4);
    }
    div[data-testid="stExpander"] summary { font-weight: 600; }
    .stDataFrame { border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.04); }

    /* ── Page Header ── */
    .page-hdr {
        margin-bottom: 28px; padding-bottom: 20px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .page-hdr h1 {
        font-family: 'Space Grotesk', sans-serif; font-size: 30px;
        font-weight: 700; color: #f1f5f9; margin: 0 0 6px; letter-spacing: -0.5px;
    }
    .page-hdr p { color: #64748b; font-size: 14px; margin: 0; }

    /* ── Quick Action ── */
    .quick-action {
        background: rgba(17,24,39,0.4); border: 1px solid rgba(255,255,255,0.04);
        border-radius: 12px; padding: 14px 18px; cursor: pointer;
        transition: all 0.3s; display: flex; align-items: center; gap: 10px;
    }
    .quick-action:hover {
        border-color: rgba(0,212,170,0.15); background: rgba(0,212,170,0.03);
        transform: translateY(-2px);
    }
    .qa-icon { font-size: 18px; }
    .qa-text { font-size: 12.5px; color: #94a3b8; font-weight: 500; }

    /* ── Form Inputs (Enterprise Polish) ── */
    .stTextInput > div > div > input,
    .stTextArea > div > div > textarea {
        background: rgba(10,15,30,0.8) !important;
        border: 1px solid rgba(255,255,255,0.06) !important;
        border-radius: 12px !important;
        color: #e2e8f0 !important;
        font-family: 'Inter', sans-serif !important;
        font-size: 13px !important;
        padding: 12px 16px !important;
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1) !important;
        caret-color: #00d4aa !important;
    }
    .stTextInput > div > div > input:focus,
    .stTextArea > div > div > textarea:focus {
        border-color: rgba(0,212,170,0.3) !important;
        box-shadow: 0 0 0 3px rgba(0,212,170,0.06), 0 4px 20px rgba(0,0,0,0.3) !important;
        background: rgba(10,15,30,0.95) !important;
    }
    .stTextInput > div > div > input::placeholder,
    .stTextArea > div > div > textarea::placeholder {
        color: #334155 !important;
        font-style: italic;
    }

    /* ── Select Box ── */
    .stSelectbox > div > div,
    .stMultiSelect > div > div {
        background: rgba(10,15,30,0.8) !important;
        border: 1px solid rgba(255,255,255,0.06) !important;
        border-radius: 12px !important;
        transition: all 0.3s !important;
    }
    .stSelectbox > div > div:hover,
    .stMultiSelect > div > div:hover {
        border-color: rgba(0,212,170,0.2) !important;
    }
    .stSelectbox [data-baseweb="select"] > div {
        background: transparent !important;
        border: none !important;
    }

    /* ── Buttons ── */
    .stButton > button {
        background: linear-gradient(135deg, rgba(0,212,170,0.12), rgba(6,182,212,0.08)) !important;
        border: 1px solid rgba(0,212,170,0.2) !important;
        border-radius: 12px !important;
        color: #00d4aa !important;
        font-family: 'Inter', sans-serif !important;
        font-weight: 600 !important;
        font-size: 13px !important;
        padding: 10px 24px !important;
        letter-spacing: 0.3px !important;
        transition: all 0.35s cubic-bezier(0.4,0,0.2,1) !important;
        position: relative;
        overflow: hidden;
    }
    .stButton > button:hover {
        background: linear-gradient(135deg, rgba(0,212,170,0.2), rgba(6,182,212,0.15)) !important;
        border-color: rgba(0,212,170,0.35) !important;
        box-shadow: 0 4px 24px rgba(0,212,170,0.15), 0 0 40px rgba(0,212,170,0.05) !important;
        transform: translateY(-1px) !important;
        color: #00f5c8 !important;
    }
    .stButton > button:active {
        transform: translateY(0px) !important;
        box-shadow: 0 2px 12px rgba(0,212,170,0.1) !important;
    }
    .stButton > button[kind="primary"],
    button[data-testid="stBaseButton-primary"] {
        background: linear-gradient(135deg, #00d4aa, #06b6d4) !important;
        color: #030712 !important;
        border: none !important;
        font-weight: 700 !important;
        box-shadow: 0 4px 16px rgba(0,212,170,0.2) !important;
    }
    .stButton > button[kind="primary"]:hover,
    button[data-testid="stBaseButton-primary"]:hover {
        box-shadow: 0 8px 32px rgba(0,212,170,0.3), 0 0 60px rgba(0,212,170,0.08) !important;
        transform: translateY(-2px) !important;
        filter: brightness(1.1) !important;
    }

    /* ── Progress Bar ── */
    .stProgress > div > div > div {
        background: linear-gradient(90deg, #00d4aa, #06b6d4) !important;
        border-radius: 6px !important;
        box-shadow: 0 0 12px rgba(0,212,170,0.25) !important;
    }
    .stProgress > div > div {
        background: rgba(255,255,255,0.03) !important;
        border-radius: 6px !important;
    }

    /* ── File Uploader ── */
    [data-testid="stFileUploader"] {
        background: rgba(10,15,30,0.6) !important;
        border: 2px dashed rgba(255,255,255,0.06) !important;
        border-radius: 16px !important;
        padding: 24px !important;
        transition: all 0.3s !important;
    }
    [data-testid="stFileUploader"]:hover {
        border-color: rgba(0,212,170,0.2) !important;
        background: rgba(0,212,170,0.02) !important;
    }
    [data-testid="stFileUploader"] button {
        background: linear-gradient(135deg, rgba(0,212,170,0.1), rgba(6,182,212,0.06)) !important;
        border: 1px solid rgba(0,212,170,0.15) !important;
        border-radius: 10px !important;
        color: #00d4aa !important;
    }

    /* ── DataFrame ── */
    .stDataFrame [data-testid="stDataFrameResizable"] {
        border: 1px solid rgba(255,255,255,0.04) !important;
        border-radius: 16px !important;
        overflow: hidden !important;
    }

    /* ── Alerts / Info / Warning ── */
    .stAlert {
        border-radius: 14px !important;
        border: 1px solid rgba(255,255,255,0.05) !important;
        backdrop-filter: blur(12px) !important;
    }
    div[data-testid="stNotification"] {
        border-radius: 14px !important;
    }

    /* ── Spinner ── */
    .stSpinner > div {
        border-top-color: #00d4aa !important;
    }

    /* ── Code Block ── */
    .stCodeBlock {
        border-radius: 14px !important;
        border: 1px solid rgba(255,255,255,0.04) !important;
        overflow: hidden !important;
    }
    .stCodeBlock code {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 12.5px !important;
        line-height: 1.7 !important;
    }

    /* ── Divider ── */
    hr {
        border-color: rgba(255,255,255,0.04) !important;
        margin: 20px 0 !important;
    }

    /* ── Markdown Tables ── */
    table {
        border-collapse: separate !important;
        border-spacing: 0 !important;
        border: 1px solid rgba(255,255,255,0.04) !important;
        border-radius: 12px !important;
        overflow: hidden !important;
        width: 100% !important;
    }
    th {
        background: rgba(0,212,170,0.04) !important;
        color: #e2e8f0 !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        padding: 12px 16px !important;
        border-bottom: 1px solid rgba(255,255,255,0.06) !important;
    }
    td {
        padding: 10px 16px !important;
        font-size: 13px !important;
        color: #94a3b8 !important;
        border-bottom: 1px solid rgba(255,255,255,0.03) !important;
    }
    tr:hover td {
        background: rgba(0,212,170,0.02) !important;
    }
    tr:last-child td {
        border-bottom: none !important;
    }

    /* ── Tooltip / Popover ── */
    [data-baseweb="popover"] {
        border-radius: 12px !important;
        background: rgba(17,24,39,0.95) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        backdrop-filter: blur(24px) !important;
    }

    /* ── Multiselect Tags ── */
    [data-baseweb="tag"] {
        background: rgba(0,212,170,0.08) !important;
        border: 1px solid rgba(0,212,170,0.15) !important;
        border-radius: 8px !important;
        color: #00d4aa !important;
    }

    /* ── Caption ── */
    .stCaption, [data-testid="stCaptionContainer"] {
        color: #475569 !important;
        font-size: 11.5px !important;
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* ── Smooth page transitions ── */
    .main .block-container {
        animation: fadeIn 0.4s ease-out;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* ── Hero shimmer animation ── */
    @keyframes shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
    }
    .hero-title-v3 {
        background-size: 200% auto !important;
        animation: shimmer 6s ease-in-out infinite;
    }
</style>
""", unsafe_allow_html=True)


# ─── DATA ───
MODULES = [
    {"icon": "📚", "name": "Learning Engine", "desc": "15 learning paths, 500+ hrs, adaptive AI, real labs",
     "tag": "Core", "tc": "tag-green", "badge": "517 Topics",
     "glow": "rgba(0,212,170,0.04)", "border": "rgba(0,212,170,0.15)",
     "grad": "linear-gradient(135deg, #00d4aa, #06b6d4)", "icon_bg": "rgba(0,212,170,0.08)", "icon_bdr": "rgba(0,212,170,0.12)"},
    {"icon": "🚀", "name": "Deployment Engine", "desc": "100+ tools, one-click deploy, Helm/Terraform templates",
     "tag": "Core", "tc": "tag-blue", "badge": "100+ Tools",
     "glow": "rgba(59,130,246,0.04)", "border": "rgba(59,130,246,0.15)",
     "grad": "linear-gradient(135deg, #3b82f6, #06b6d4)", "icon_bg": "rgba(59,130,246,0.08)", "icon_bdr": "rgba(59,130,246,0.12)"},
    {"icon": "🔧", "name": "Troubleshooter AI", "desc": "10,000+ errors, instant RCA, step-by-step fixes",
     "tag": "AI", "tc": "tag-purple", "badge": "10K+ Errors",
     "glow": "rgba(139,92,246,0.04)", "border": "rgba(139,92,246,0.15)",
     "grad": "linear-gradient(135deg, #8b5cf6, #ec4899)", "icon_bg": "rgba(139,92,246,0.08)", "icon_bdr": "rgba(139,92,246,0.12)"},
    {"icon": "🎯", "name": "Interview Engine", "desc": "500+ Q&A, mock AI interviews, scoring",
     "tag": "AI", "tc": "tag-orange", "badge": "500+ Q&A",
     "glow": "rgba(245,158,11,0.04)", "border": "rgba(245,158,11,0.15)",
     "grad": "linear-gradient(135deg, #f59e0b, #ef4444)", "icon_bg": "rgba(245,158,11,0.08)", "icon_bdr": "rgba(245,158,11,0.12)"},
    {"icon": "📊", "name": "Log Analyzer", "desc": "AI log analysis, anomaly detection, reports",
     "tag": "AI", "tc": "tag-red", "badge": "Real-time",
     "glow": "rgba(239,68,68,0.04)", "border": "rgba(239,68,68,0.15)",
     "grad": "linear-gradient(135deg, #ef4444, #f59e0b)", "icon_bg": "rgba(239,68,68,0.08)", "icon_bdr": "rgba(239,68,68,0.12)"},
    {"icon": "✨", "name": "5-Point Expander", "desc": "5 keywords → complete documentation",
     "tag": "AI", "tc": "tag-cyan", "badge": "Auto-Gen",
     "glow": "rgba(6,182,212,0.04)", "border": "rgba(6,182,212,0.15)",
     "grad": "linear-gradient(135deg, #06b6d4, #3b82f6)", "icon_bg": "rgba(6,182,212,0.08)", "icon_bdr": "rgba(6,182,212,0.12)"},
    {"icon": "🔐", "name": "Config Vault", "desc": "500+ production configs, env-specific",
     "tag": "Core", "tc": "tag-green", "badge": "520+ Configs",
     "glow": "rgba(16,185,129,0.04)", "border": "rgba(16,185,129,0.15)",
     "grad": "linear-gradient(135deg, #10b981, #00d4aa)", "icon_bg": "rgba(16,185,129,0.08)", "icon_bdr": "rgba(16,185,129,0.12)"},
    {"icon": "🏗️", "name": "Architecture Generator", "desc": "Describe requirements → full architecture",
     "tag": "AI", "tc": "tag-purple", "badge": "163 Diagrams",
     "glow": "rgba(139,92,246,0.04)", "border": "rgba(139,92,246,0.15)",
     "grad": "linear-gradient(135deg, #8b5cf6, #3b82f6)", "icon_bg": "rgba(139,92,246,0.08)", "icon_bdr": "rgba(139,92,246,0.12)"},
]

LEARNING_PATHS = [
    {"id": "LP-001", "title": "Linux Fundamentals to Advanced", "topics": 45, "hours": 40, "level": "Beginner→Expert", "icon": "🐧"},
    {"id": "LP-002", "title": "Networking & Cloud Networking", "topics": 35, "hours": 35, "level": "Beginner→Expert", "icon": "🌐"},
    {"id": "LP-003", "title": "Docker & Containers Deep Dive", "topics": 40, "hours": 30, "level": "Beginner→Expert", "icon": "🐳"},
    {"id": "LP-004", "title": "Kubernetes Mastery", "topics": 65, "hours": 60, "level": "Beginner→Expert", "icon": "☸️"},
    {"id": "LP-005", "title": "Terraform & IaC", "topics": 30, "hours": 30, "level": "Beginner→Expert", "icon": "🏗️"},
    {"id": "LP-006", "title": "CI/CD & DevOps Practices", "topics": 35, "hours": 35, "level": "Beginner→Expert", "icon": "🔄"},
    {"id": "LP-007", "title": "AWS Cloud Architect", "topics": 55, "hours": 50, "level": "Beginner→Expert", "icon": "☁️"},
    {"id": "LP-008", "title": "Azure Cloud Engineer", "topics": 40, "hours": 45, "level": "Beginner→Expert", "icon": "🔷"},
    {"id": "LP-009", "title": "GCP Cloud Engineer", "topics": 35, "hours": 40, "level": "Beginner→Expert", "icon": "🟡"},
    {"id": "LP-010", "title": "Monitoring & Observability", "topics": 30, "hours": 35, "level": "Beginner→Expert", "icon": "📈"},
    {"id": "LP-011", "title": "Security & DevSecOps", "topics": 25, "hours": 30, "level": "Beginner→Expert", "icon": "🛡️"},
    {"id": "LP-012", "title": "Databases for DevOps", "topics": 30, "hours": 30, "level": "Beginner→Expert", "icon": "🗄️"},
    {"id": "LP-013", "title": "Nginx & Web Servers", "topics": 20, "hours": 20, "level": "Beginner→Expert", "icon": "🌍"},
    {"id": "LP-014", "title": "AIOps & MLOps", "topics": 20, "hours": 35, "level": "Intermediate→Expert", "icon": "🤖"},
    {"id": "LP-015", "title": "Interview Preparation", "topics": 12, "hours": 0, "level": "All Levels", "icon": "🎯"},
]

ERROR_CATALOG = [
    {"tool": "Kubernetes", "error": "CrashLoopBackOff", "severity": "HIGH", "category": "State", "hits": 15420},
    {"tool": "Kubernetes", "error": "ImagePullBackOff", "severity": "HIGH", "category": "Config", "hits": 12350},
    {"tool": "Kubernetes", "error": "OOMKilled", "severity": "CRITICAL", "category": "Resources", "hits": 9870},
    {"tool": "Docker", "error": "Port already in use", "severity": "MEDIUM", "category": "Networking", "hits": 8540},
    {"tool": "Terraform", "error": "State lock error", "severity": "HIGH", "category": "State", "hits": 7230},
    {"tool": "AWS", "error": "AccessDenied / IAM", "severity": "HIGH", "category": "Permissions", "hits": 11200},
    {"tool": "Linux", "error": "No space left on device", "severity": "CRITICAL", "category": "Resources", "hits": 6890},
    {"tool": "Nginx", "error": "502 Bad Gateway", "severity": "HIGH", "category": "Networking", "hits": 9100},
    {"tool": "PostgreSQL", "error": "Too many connections", "severity": "HIGH", "category": "Resources", "hits": 5670},
    {"tool": "Prometheus", "error": "High cardinality", "severity": "MEDIUM", "category": "Config", "hits": 4320},
    {"tool": "Redis", "error": "Connection refused", "severity": "HIGH", "category": "Networking", "hits": 6100},
    {"tool": "Elasticsearch", "error": "Cluster status RED", "severity": "CRITICAL", "category": "State", "hits": 3980},
]

TECH_STACK = {
    "Frontend": ["React 18", "Next.js 14", "TypeScript", "Tailwind CSS", "Monaco Editor", "xterm.js"],
    "Backend": ["Go 1.22", "Python 3.12/FastAPI", "Node.js 20"],
    "AI/ML": ["LangChain", "LangGraph", "Ollama", "vLLM", "sentence-transformers", "pgvector"],
    "Database": ["PostgreSQL 16 + Patroni", "Redis 7 Cluster", "ClickHouse", "Elasticsearch 8"],
    "Infra": ["Kubernetes 1.30+", "Helm 3", "ArgoCD", "Terraform", "Ansible"],
    "Observability": ["Prometheus", "Grafana", "Loki", "Tempo", "OpenTelemetry"],
}

MICROSERVICES = [
    {"name": "Frontend", "tech": "React 18 + Next.js", "ns": "devops-platform", "pods": "4", "res": "2vCPU/4GB"},
    {"name": "API Gateway", "tech": "Kong/Traefik", "ns": "devops-platform", "pods": "2", "res": "1vCPU/2GB"},
    {"name": "Auth Service", "tech": "Keycloak", "ns": "devops-platform", "pods": "2", "res": "2vCPU/4GB"},
    {"name": "Learning Engine", "tech": "Go", "ns": "learning-engine", "pods": "3", "res": "1vCPU/2GB"},
    {"name": "Lab Provisioner", "tech": "Go + k3s", "ns": "lab-system", "pods": "2+", "res": "Dynamic"},
    {"name": "Deployment Engine", "tech": "Python/FastAPI", "ns": "deployment-engine", "pods": "3", "res": "2vCPU/4GB"},
    {"name": "Troubleshoot AI", "tech": "Python/LangChain", "ns": "troubleshoot-ai", "pods": "4", "res": "4vCPU/8GB+GPU"},
    {"name": "Interview Engine", "tech": "Python/FastAPI", "ns": "interview-engine", "pods": "3", "res": "2vCPU/4GB"},
    {"name": "Log Analyzer", "tech": "Python + ES", "ns": "log-analyzer", "pods": "3", "res": "2vCPU/4GB"},
    {"name": "Config Vault", "tech": "Go", "ns": "config-vault", "pods": "2", "res": "1vCPU/2GB"},
    {"name": "AI/ML Service", "tech": "Python + Ollama", "ns": "ai-inference", "pods": "2+", "res": "GPU nodes"},
    {"name": "Search", "tech": "Elasticsearch", "ns": "data-layer", "pods": "3", "res": "2vCPU/4GB"},
]


# ─── Helpers ───
def sec_div(text):
    st.markdown(f'<div class="sec-div"><span class="sec-div-text">{text}</span><div class="sec-div-line"></div></div>', unsafe_allow_html=True)

def page_header(icon, title, subtitle):
    st.markdown(f'<div class="page-hdr"><h1>{icon} {title}</h1><p>{subtitle}</p></div>', unsafe_allow_html=True)

def metric_tile(value, label, c1, c2=None, trend="", tdir="neutral", spark_svg=""):
    c2 = c2 or c1
    trend_html = f'<div class="mt-trend {tdir}">{"↑" if tdir == "up" else "→"} {trend}</div>' if trend else ""
    st.markdown(f"""
    <div class="metric-tile">
        <div class="glow-orb" style="background: {c1};"></div>
        <div class="mt-label">{label}</div>
        <div class="mt-value" style="--c1: {c1}; --c2: {c2};">{value}</div>
        {trend_html}
    </div>""", unsafe_allow_html=True)

def dark_layout(fig, height=380, **kw):
    fig.update_layout(
        plot_bgcolor="rgba(3,7,18,0.8)", paper_bgcolor="rgba(10,15,30,0.8)",
        font=dict(color="#94a3b8", family="Inter", size=11),
        margin=dict(l=40, r=20, t=30, b=40), height=height,
        xaxis=dict(gridcolor="rgba(255,255,255,0.03)", zerolinecolor="rgba(255,255,255,0.03)"),
        yaxis=dict(gridcolor="rgba(255,255,255,0.03)", zerolinecolor="rgba(255,255,255,0.03)"),
        **kw,
    )
    return fig

def progress_ring_svg(pct, color, size=64, stroke=5):
    r = (size - stroke) / 2
    circ = 2 * math.pi * r
    offset = circ * (1 - pct / 100)
    return f"""<svg width="{size}" height="{size}" class="progress-ring">
        <circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="{stroke}"/>
        <circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke}"
            stroke-dasharray="{circ}" stroke-dashoffset="{offset}" stroke-linecap="round"
            style="transform: rotate(-90deg); transform-origin: center; transition: stroke-dashoffset 1s ease;"/>
        <text x="50%" y="50%" text-anchor="middle" dy="5" fill="{color}"
            style="font-family: 'Space Grotesk'; font-size: 14px; font-weight: 700;">{pct}%</text>
    </svg>"""


# ═══════════════════════════════════════════════════
# SIDEBAR
# ═══════════════════════════════════════════════════
with st.sidebar:
    # Logo
    st.markdown("""
    <div style="padding: 4px 0 18px; border-bottom: 1px solid rgba(255,255,255,0.04); margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 12px;
                        background: linear-gradient(135deg, #00d4aa, #06b6d4, #3b82f6);
                        display: flex; align-items: center; justify-content: center;
                        font-family: 'Space Grotesk', sans-serif; font-size: 18px;
                        font-weight: 800; color: #030712; box-shadow: 0 0 20px rgba(0,212,170,0.15);">S</div>
            <div>
                <div style="font-family: 'Space Grotesk', sans-serif; font-size: 15px;
                            color: #f1f5f9; font-weight: 700; letter-spacing: 0.3px;">SANTHIRA</div>
                <div style="font-size: 10px; color: #475569; letter-spacing: 0.5px;">DevOps Master Platform</div>
            </div>
        </div>
        <div style="margin-top: 12px; display: flex; align-items: center; gap: 6px;
                    background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.1);
                    border-radius: 8px; padding: 5px 10px;">
            <span class="status-pulse live"></span>
            <span style="font-size: 10.5px; color: #10b981; font-weight: 600;">All Systems Operational</span>
            <span style="font-size: 9px; color: #334155; margin-left: auto; font-family: 'JetBrains Mono', monospace;">v1.0</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown('<div class="sec-div"><span class="sec-div-text">Navigate</span><div class="sec-div-line"></div></div>', unsafe_allow_html=True)

    page = st.radio("Nav", [
        "🏠 Overview", "🏗️ Architecture", "📚 Learning Engine", "🚀 Deployment Engine",
        "🔧 Troubleshooter AI", "🎯 Interview Engine", "📊 Log Analyzer",
        "✨ 5-Point Expander", "🔐 Config Vault", "🏛️ Architecture Generator",
        "💰 Revenue & Pricing", "📋 API Specification",
    ], label_visibility="collapsed")

    st.markdown("---")

    # Build Progress
    st.markdown("""
    <div style="padding: 6px 4px 10px;">
        <div style="font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; margin-bottom: 10px;">Platform Build</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 11px; color: #94a3b8;">Phase 1 Progress</span>
            <span style="font-size: 11px; color: #00d4aa; font-family: 'JetBrains Mono', monospace;">38%</span>
        </div>
        <div style="height: 4px; background: rgba(255,255,255,0.04); border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; width: 38%; background: linear-gradient(90deg, #00d4aa, #06b6d4);
                        border-radius: 4px; box-shadow: 0 0 8px rgba(0,212,170,0.3);"></div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")

    # Profile
    st.markdown("""
    <div style="padding: 6px 2px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 10px;
                        background: linear-gradient(135deg, #8b5cf6, #ec4899);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 12px; font-weight: 700; color: white;
                        box-shadow: 0 0 12px rgba(139,92,246,0.2);">RM</div>
            <div>
                <div style="font-size: 12px; color: #f1f5f9; font-weight: 600;">Rajkumar Madhu</div>
                <div style="font-size: 10px; color: #475569;">Founder & CTO</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)


# ═══════════════════════════════════════════════════
# PAGE: OVERVIEW
# ═══════════════════════════════════════════════════
if page == "🏠 Overview":
    st.markdown(f"""
    <div class="hero-v3">
        <div class="hero-greeting">{greeting_icon} {greeting}, Rajkumar</div>
        <h1 class="hero-title-v3"><span class="hero-accent-v3">Santhira</span> DevOps Platform</h1>
        <p class="hero-sub-v3">Enterprise SaaS for Learning, Deployment, Troubleshooting, and Interview Mastery</p>
        <div class="hero-pills">
            <span class="hero-pill"><span class="pill-dot" style="background: #00d4aa;"></span> 8 Modules</span>
            <span class="hero-pill"><span class="pill-dot" style="background: #3b82f6;"></span> 16 Microservices</span>
            <span class="hero-pill"><span class="pill-dot" style="background: #8b5cf6;"></span> AI-Powered</span>
            <span class="hero-pill"><span class="pill-dot" style="background: #f59e0b;"></span> Self-Hosted</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Metrics row
    cols = st.columns(6)
    mdata = [
        ("517", "Topics", "#00d4aa", "#06b6d4", "+12 this week", "up"),
        ("520+", "Configs", "#3b82f6", "#8b5cf6", "Production ready", "neutral"),
        ("10K+", "Errors", "#ef4444", "#f59e0b", "+340 indexed", "up"),
        ("500+", "Interview Qs", "#f59e0b", "#ef4444", "15 categories", "neutral"),
        ("168", "Labs", "#8b5cf6", "#ec4899", "Hands-on", "neutral"),
        ("8", "Modules", "#06b6d4", "#00d4aa", "All active", "neutral"),
    ]
    for col, (v, l, c1, c2, t, td) in zip(cols, mdata):
        with col:
            metric_tile(v, l, c1, c2, t, td)

    st.markdown("<br>", unsafe_allow_html=True)

    # Quick Actions + Activity Feed side by side
    col_qa, col_af = st.columns([3, 2])

    with col_qa:
        sec_div("QUICK ACTIONS")
        qa_cols = st.columns(4)
        actions = [
            ("🔧", "Troubleshoot", "Paste an error"), ("📚", "Learn", "Start a path"),
            ("🚀", "Deploy", "Pick a tool"), ("🎯", "Interview", "Practice now"),
        ]
        for col, (icon, title, desc) in zip(qa_cols, actions):
            with col:
                st.markdown(f"""
                <div class="quick-action">
                    <span class="qa-icon">{icon}</span>
                    <div><div style="font-size: 13px; color: #f1f5f9; font-weight: 600;">{title}</div>
                    <div style="font-size: 10px; color: #475569;">{desc}</div></div>
                </div>""", unsafe_allow_html=True)

    with col_af:
        sec_div("RECENT ACTIVITY")
        activities = [
            ("#00d4aa", "Troubleshooter AI module — error catalog indexed to 10K+", "2h ago"),
            ("#3b82f6", "Deployment Engine — 12 new Helm templates added", "5h ago"),
            ("#8b5cf6", "Learning Engine — Kubernetes path updated to v1.30", "1d ago"),
            ("#f59e0b", "Config Vault — PostgreSQL 16 HA configs added", "2d ago"),
        ]
        for color, text, time_str in activities:
            st.markdown(f"""
            <div class="activity-item">
                <div class="activity-dot" style="background: {color};"></div>
                <div><div class="activity-text">{text}</div>
                <div class="activity-time">{time_str}</div></div>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Module Cards
    sec_div("CORE MODULES")
    for row_start in range(0, 8, 4):
        cols = st.columns(4)
        for i, col in enumerate(cols):
            idx = row_start + i
            if idx < len(MODULES):
                m = MODULES[idx]
                with col:
                    st.markdown(f"""
                    <div class="mod-card" style="--card-glow: {m['glow']}; --card-border: {m['border']};
                         --accent-grad: {m['grad']}; --icon-bg: {m['icon_bg']}; --icon-border: {m['icon_bdr']};">
                        <div class="mc-icon">{m['icon']}</div>
                        <div class="mc-title">{m['name']}</div>
                        <div class="mc-desc">{m['desc']}</div>
                        <div class="mc-footer">
                            <span class="mc-tag {m['tc']}">{m['tag']}</span>
                            <span class="mc-badge">{m['badge']}</span>
                        </div>
                    </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Coverage chart
    sec_div("CONTENT COVERAGE MATRIX")
    cats = ["Linux", "Networking", "Docker", "Kubernetes", "Terraform", "CI/CD", "AWS", "Azure", "GCP", "Monitoring", "Nginx", "Databases", "Security", "AIOps"]
    fig = go.Figure()
    fig.add_trace(go.Bar(name="Topics", x=cats, y=[45,35,40,65,30,35,55,40,35,30,20,30,25,20], marker_color="#00d4aa", marker_line_width=0))
    fig.add_trace(go.Bar(name="Configs", x=cats, y=[30,25,35,80,40,30,60,40,35,40,25,35,20,15], marker_color="#3b82f6", marker_line_width=0))
    fig.add_trace(go.Bar(name="Errors", x=cats, y=[60,40,50,80,40,35,60,40,35,40,25,45,30,20], marker_color="#ef4444", marker_line_width=0))
    dark_layout(fig, barmode="group", legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1))
    st.plotly_chart(fig, use_container_width=True)

    # Problem vs Solution
    col1, col2 = st.columns(2)
    with col1:
        sec_div("THE PROBLEM")
        for p in ["Fragmented learning across 20+ sources", "Scattered documentation & configs",
                   "No structured troubleshooting guidance", "Interview prep requires stitching from multiple platforms",
                   "Production issues → hours searching Stack Overflow"]:
            st.markdown(f'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;"><span style="color:#ef4444;font-size:13px;">✕</span><span style="font-size:12.5px;color:#94a3b8;">{p}</span></div>', unsafe_allow_html=True)
    with col2:
        sec_div("OUR SOLUTION")
        for t, d in [("Unified platform","learn, deploy, troubleshoot, interview prep"),("AI-powered","instant RCA, adaptive learning, mock interviews"),
                     ("10,000+ error catalog","with step-by-step fixes"),("500+ production configs","with environment profiles"),("Self-hosted","works air-gapped with Ollama")]:
            st.markdown(f'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;"><span style="color:#00d4aa;font-size:13px;">✓</span><span style="font-size:12.5px;color:#f1f5f9;font-weight:500;">{t}</span><span style="font-size:11.5px;color:#475569;">— {d}</span></div>', unsafe_allow_html=True)

    # Platform Build Progress Rings
    st.markdown("<br>", unsafe_allow_html=True)
    sec_div("PLATFORM BUILD PROGRESS")
    ring_cols = st.columns(8)
    ring_data = [
        ("Troubleshooter AI", 45, "#8b5cf6"), ("Learning Engine", 35, "#00d4aa"),
        ("Config Vault", 30, "#10b981"), ("Deployment Engine", 15, "#3b82f6"),
        ("Interview Engine", 10, "#f59e0b"), ("Log Analyzer", 5, "#ef4444"),
        ("5-Point Expander", 5, "#06b6d4"), ("Arch Generator", 5, "#ec4899"),
    ]
    for col, (name, pct, color) in zip(ring_cols, ring_data):
        with col:
            st.markdown(f"""
            <div style="text-align: center;">
                {progress_ring_svg(pct, color)}
                <div style="font-size: 11px; color: #94a3b8; margin-top: 8px; font-weight: 500;">{name}</div>
            </div>""", unsafe_allow_html=True)

    # Roadmap
    st.markdown("<br>", unsafe_allow_html=True)
    sec_div("PLATFORM ROADMAP — 2026")
    roadmap = pd.DataFrame([
        dict(Phase="Troubleshooter AI", Start="2026-01-01", Finish="2026-03-15", Module="Phase 1"),
        dict(Phase="Learning Engine", Start="2026-02-01", Finish="2026-04-30", Module="Phase 1"),
        dict(Phase="Config Vault", Start="2026-03-01", Finish="2026-04-15", Module="Phase 1"),
        dict(Phase="Deployment Engine", Start="2026-04-01", Finish="2026-06-30", Module="Phase 2"),
        dict(Phase="Interview Engine", Start="2026-04-15", Finish="2026-07-15", Module="Phase 2"),
        dict(Phase="Log Analyzer", Start="2026-06-01", Finish="2026-08-30", Module="Phase 3"),
        dict(Phase="5-Point Expander", Start="2026-07-01", Finish="2026-09-15", Module="Phase 3"),
        dict(Phase="Architecture Gen", Start="2026-08-01", Finish="2026-10-30", Module="Phase 4"),
        dict(Phase="Enterprise Launch", Start="2026-10-01", Finish="2026-12-31", Module="Phase 4"),
    ])
    fig_r = px.timeline(roadmap, x_start="Start", x_end="Finish", y="Phase", color="Module",
                        color_discrete_map={"Phase 1":"#00d4aa","Phase 2":"#3b82f6","Phase 3":"#8b5cf6","Phase 4":"#f59e0b"})
    dark_layout(fig_r, height=340, margin=dict(l=140,r=20,t=20,b=40),
                yaxis=dict(title="", autorange="reversed"), xaxis=dict(title=""),
                legend=dict(orientation="h", y=1.1, x=0.5, xanchor="center"))
    fig_r.update_traces(marker_line_width=0)
    st.plotly_chart(fig_r, use_container_width=True)

    # Tech stack
    sec_div("TECH STACK AT A GLANCE")
    tcols = st.columns(6)
    tech_items = [("🐍 Python 3.12","FastAPI + LangGraph"),("☸️ Kubernetes","1.30+ / Helm 3"),
                  ("🤖 Ollama","Self-hosted LLM"),("🗄️ PostgreSQL 16","+ pgvector"),
                  ("📊 Prometheus","Observability"),("🔄 ArgoCD","GitOps")]
    for col, (t, s) in zip(tcols, tech_items):
        with col:
            st.markdown(f'<div class="metric-tile" style="text-align:center;padding:14px;"><div style="font-size:13px;font-weight:600;color:#f1f5f9;">{t}</div><div style="font-size:10px;color:#475569;margin-top:4px;">{s}</div></div>', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════
# PAGE: ARCHITECTURE
# ═══════════════════════════════════════════════════
elif page == "🏗️ Architecture":
    page_header("🏗️", "Platform Architecture", "16 microservices · 13 Kubernetes namespaces · Multi-language backend")

    tab1, tab2, tab3, tab4 = st.tabs(["Microservices", "Tech Stack", "K8s Layout", "Data Flow"])

    with tab1:
        sec_div("MICROSERVICES ARCHITECTURE (16 SERVICES)")
        df = pd.DataFrame(MICROSERVICES)
        df.columns = ["Service", "Technology", "Namespace", "Pods", "Resources"]
        st.dataframe(df, use_container_width=True, hide_index=True, height=460)

        st.markdown("<br>", unsafe_allow_html=True)
        sec_div("SERVICE COMMUNICATION FLOW")
        labels = ["Client","API Gateway","Auth","Learning","Deploy","Troubleshoot AI","Interview","Log Analyzer","PostgreSQL","Redis","Ollama/vLLM","Kafka/NATS","Elasticsearch"]
        fig = go.Figure(data=[go.Sankey(
            node=dict(pad=15, thickness=20, line=dict(color="rgba(255,255,255,0.03)", width=0.5), label=labels,
                      color=["#3b82f6","#00d4aa","#8b5cf6","#00d4aa","#3b82f6","#ef4444","#f59e0b","#fbbf24","#8b5cf6","#ef4444","#00d4aa","#3b82f6","#f59e0b"]),
            link=dict(source=[0,1,1,1,1,1,1,2,3,4,5,6,7,5,5,3,4,6,7], target=[1,2,3,4,5,6,7,8,8,8,8,8,8,9,10,11,11,11,12],
                      value=[100,20,25,15,30,20,10,20,25,15,30,20,10,30,30,25,15,20,10], color="rgba(0,212,170,0.06)")
        )])
        dark_layout(fig, height=500, margin=dict(l=20,r=20,t=20,b=20))
        st.plotly_chart(fig, use_container_width=True)

        # Network Topology
        st.markdown("<br>", unsafe_allow_html=True)
        sec_div("SYSTEM ARCHITECTURE — NETWORK TOPOLOGY")
        fig_a = go.Figure()
        layers = {
            "Client":{"y":5,"nodes":[("Browser/CLI","#3b82f6"),("Mobile App","#3b82f6")],"c":"#3b82f6"},
            "Gateway":{"y":4,"nodes":[("API Gateway","#00d4aa"),("Auth","#8b5cf6"),("Rate Limiter","#f59e0b")],"c":"#00d4aa"},
            "Service":{"y":3,"nodes":[("Learning","#00d4aa"),("Deploy","#3b82f6"),("Troubleshoot AI","#ef4444"),("Interview","#f59e0b"),("Log Analyzer","#fbbf24")],"c":"#ef4444"},
            "AI":{"y":2,"nodes":[("Ollama LLM","#8b5cf6"),("Embeddings","#8b5cf6"),("Reranker","#8b5cf6")],"c":"#8b5cf6"},
            "Data":{"y":1,"nodes":[("PostgreSQL","#00d4aa"),("Redis","#ef4444"),("Elasticsearch","#fbbf24"),("Kafka","#3b82f6"),("ClickHouse","#f59e0b")],"c":"#10b981"},
        }
        ax,ay,al,ac,az = [],[],[],[],[]
        for ld in layers.values():
            n = len(ld["nodes"]); sp = 10/(n+1)
            for i,(nm,cl) in enumerate(ld["nodes"]):
                ax.append(sp*(i+1)); ay.append(ld["y"]); al.append(nm); ac.append(cl)
                az.append(40 if "AI" in nm or "Troubleshoot" in nm else 30)
        conns = [(0,3),(0,4),(1,3),(3,5),(3,6),(3,7),(3,8),(3,9),(4,5),(4,6),(4,7),(4,8),
                 (7,10),(7,11),(7,12),(8,10),(9,10),(5,13),(6,13),(7,13),(8,13),(9,13),
                 (5,14),(6,14),(7,14),(7,15),(9,15),(7,16),(9,16)]
        for s,t in conns:
            fig_a.add_trace(go.Scatter(x=[ax[s],ax[t]],y=[ay[s],ay[t]],mode="lines",
                line=dict(color="rgba(0,212,170,0.08)",width=1.5),hoverinfo="skip",showlegend=False))
        fig_a.add_trace(go.Scatter(x=ax,y=ay,mode="markers+text",
            marker=dict(size=az,color=ac,line=dict(width=2,color="#030712"),opacity=0.9),
            text=al,textposition="bottom center",textfont=dict(size=10,color="#f1f5f9"),hoverinfo="text",showlegend=False))
        for ln,ld in layers.items():
            fig_a.add_annotation(x=0.2,y=ld["y"],text=f"<b>{ln}</b>",showarrow=False,font=dict(size=10,color=ld["c"]),xanchor="left")
        dark_layout(fig_a, height=520, margin=dict(l=20,r=20,t=10,b=10),
                    xaxis=dict(showgrid=False,showticklabels=False,zeroline=False,range=[-0.5,11]),
                    yaxis=dict(showgrid=False,showticklabels=False,zeroline=False,range=[0.3,5.7]))
        st.plotly_chart(fig_a, use_container_width=True)

    with tab2:
        sec_div("TECHNOLOGY STACK")
        for layer, techs in TECH_STACK.items():
            st.markdown(f"**{layer}**")
            cols = st.columns(len(techs))
            for col, tech in zip(cols, techs):
                with col:
                    st.markdown(f'<div class="metric-tile" style="text-align:center;padding:12px;"><span style="font-size:12px;color:#f1f5f9;">{tech}</span></div>', unsafe_allow_html=True)
            st.markdown("")

    with tab3:
        sec_div("KUBERNETES CLUSTER LAYOUT (13 NAMESPACES)")
        ns_list = [
            ("devops-platform","API Gateway, Frontend, Auth","4 pods, 2vCPU/4GB","#00d4aa"),
            ("learning-engine","Learning API, Progress DB","3 pods, 1vCPU/2GB","#3b82f6"),
            ("lab-system","Lab Controller, k3s Provisioner","2 pods + dynamic","#8b5cf6"),
            ("deployment-engine","Template Renderer, Helm/TF","3 pods, 2vCPU/4GB","#f59e0b"),
            ("troubleshoot-ai","Error Parser, RCA, KG, LLM","4 pods, 4vCPU/8GB+GPU","#ef4444"),
            ("interview-engine","Q&A API, Scenario Gen, Mock","3 pods, 2vCPU/4GB","#fbbf24"),
            ("log-analyzer","Ingestion, Pattern, Reports","3 pods, 2vCPU/4GB","#10b981"),
            ("data-layer","PostgreSQL HA, Redis, ES","StatefulSets + PVCs","#8b5cf6"),
            ("ai-inference","Ollama/vLLM, Embeddings","GPU nodes, 2+ replicas","#00d4aa"),
            ("monitoring","Prometheus, Grafana, Loki, OTel","DaemonSet + StatefulSets","#3b82f6"),
        ]
        for ns,svc,res,color in ns_list:
            st.markdown(f"""
            <div class="flow-card" style="--fc-color:{color};display:flex;justify-content:space-between;align-items:center;">
                <div><span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:{color};font-weight:600;">{ns}</span>
                <span style="font-size:12px;color:#94a3b8;margin-left:12px;">{svc}</span></div>
                <span style="font-size:11px;color:#475569;font-family:'JetBrains Mono',monospace;">{res}</span>
            </div>""", unsafe_allow_html=True)

    with tab4:
        sec_div("DATA FLOW DIAGRAM")
        fig = px.sunburst(
            names=["Platform","Frontend","API Gateway","Auth","Learning","Deploy","Troubleshoot","Interview","Analyzer",
                   "React","Next.js","Kong","Rate Limit","Keycloak","JWT","Paths","Labs","Quiz","Helm","Terraform","Docker Compose",
                   "Parser","Classifier","RCA","Fix","Q&A","Mock","Scoring","Logs","Anomaly","Reports"],
            parents=["","Platform","Platform","Platform","Platform","Platform","Platform","Platform","Platform",
                     "Frontend","Frontend","API Gateway","API Gateway","Auth","Auth","Learning","Learning","Learning",
                     "Deploy","Deploy","Deploy","Troubleshoot","Troubleshoot","Troubleshoot","Troubleshoot",
                     "Interview","Interview","Interview","Analyzer","Analyzer","Analyzer"],
            values=[0]*9+[5]*22,
        )
        dark_layout(fig, height=500, margin=dict(t=20,b=20,l=20,r=20))
        fig.update_traces(marker=dict(colors=["#030712"]+["#00d4aa","#3b82f6","#8b5cf6","#00d4aa","#3b82f6","#ef4444","#f59e0b","#fbbf24"]+["#1f2937"]*22))
        st.plotly_chart(fig, use_container_width=True)

    sec_div("DATABASE SCHEMA (PostgreSQL 16 + pgvector)")
    schema = [
        {"Table":"users","Key Columns":"id, email, name, role, org_id, subscription, last_login"},
        {"Table":"organizations","Key Columns":"id, name, plan, seats, billing_email, sso_config"},
        {"Table":"error_catalog","Key Columns":"id, tool, error_pattern, root_cause, fix_steps[], severity, embedding(768)"},
        {"Table":"learning_paths","Key Columns":"id, title, category, difficulty, topics[], prerequisites[]"},
        {"Table":"user_progress","Key Columns":"id, user_id, path_id, topic_id, status, score, time_spent"},
        {"Table":"interview_questions","Key Columns":"id, topic_id, question, answer, difficulty, follow_ups[]"},
        {"Table":"configurations","Key Columns":"id, tool, environment, config_yaml, best_practices[]"},
        {"Table":"search_index","Key Columns":"id, entity_type, entity_id, title, content, embedding vector(768)"},
    ]
    st.dataframe(pd.DataFrame(schema), use_container_width=True, hide_index=True)


# ═══════════════════════════════════════════════════
# PAGE: LEARNING ENGINE
# ═══════════════════════════════════════════════════
elif page == "📚 Learning Engine":
    page_header("📚", "Learning Engine", "AI-powered adaptive learning with real-time labs, progress tracking, and certification prep")

    cols = st.columns(4)
    for col,(v,l) in zip(cols,[("15","Learning Paths"),("517","Total Topics"),("168","Hands-on Labs"),("500+","Hours Content")]):
        with col: metric_tile(v,l,"#00d4aa","#06b6d4")

    st.markdown("<br>", unsafe_allow_html=True)
    sec_div("15 LEARNING PATHS")

    for p in LEARNING_PATHS:
        with st.expander(f"{p['icon']} {p['title']} — {p['topics']} topics · {p['hours']}h · {p['level']}"):
            st.markdown(f"**Path ID**: `{p['id']}` | **Topics**: {p['topics']} | **Hours**: {p['hours']} | **Level**: {p['level']}")
            prog = random.randint(0,100)
            st.progress(prog/100, text=f"Sample Progress: {prog}%")
            for c in ["📖 Concept Explanation — Theory with real-world analogies & diagrams",
                "⚙️ Configuration — Production-ready configs with inline comments",
                "🧪 Hands-On Lab — Guided lab with pre-provisioned infra",
                "❌ Common Errors & Fixes — Top 10-20 errors with RCA",
                "🎯 Interview Questions — 10-30 questions per topic",
                "🌐 Real-Time Scenarios — 3-5 production walkthroughs",
                "📊 Architecture Diagrams — Visual data flow diagrams",
                "✅ Assessment Quiz — MCQs + hands-on challenges"]:
                st.markdown(f"  - {c}")

    st.markdown("<br>", unsafe_allow_html=True)
    sec_div("DEVOPS SKILL RADAR")
    rc = ["Linux","Networking","Docker","Kubernetes","Terraform","CI/CD","AWS","Monitoring","Security","Databases","Nginx","AIOps"]
    rv = [92,78,88,95,82,85,90,87,72,80,75,68]
    fig_r = go.Figure()
    fig_r.add_trace(go.Scatterpolar(r=rv+[rv[0]], theta=rc+[rc[0]], fill="toself", fillcolor="rgba(0,212,170,0.08)", line=dict(color="#00d4aa",width=2), name="Platform"))
    fig_r.add_trace(go.Scatterpolar(r=[60]*len(rc)+[60], theta=rc+[rc[0]], fill="toself", fillcolor="rgba(59,130,246,0.02)", line=dict(color="#3b82f6",width=1,dash="dot"), name="Industry Avg"))
    fig_r.update_layout(polar=dict(bgcolor="rgba(3,7,18,0.8)",radialaxis=dict(visible=True,range=[0,100],gridcolor="rgba(255,255,255,0.03)",tickfont=dict(size=9,color="#475569")),
        angularaxis=dict(gridcolor="rgba(255,255,255,0.03)",tickfont=dict(size=11,color="#f1f5f9"))),
        paper_bgcolor="rgba(10,15,30,0.8)",font=dict(color="#f1f5f9"),height=420,margin=dict(l=60,r=60,t=40,b=40),
        legend=dict(orientation="h",y=-0.05,x=0.5,xanchor="center"),showlegend=True)
    st.plotly_chart(fig_r, use_container_width=True)


# ═══════════════════════════════════════════════════
# PAGE: DEPLOYMENT ENGINE
# ═══════════════════════════════════════════════════
elif page == "🚀 Deployment Engine":
    page_header("🚀", "One-Click Deployment Engine", "Pre-built, production-tested deployment templates for 100+ tools")

    cols = st.columns(4)
    for col,(v,l) in zip(cols,[("100+","Tools"),("14","Categories"),("3","Env Profiles"),("20+","Fixes/Tool")]):
        with col: metric_tile(v,l,"#3b82f6","#8b5cf6")

    st.markdown("<br>", unsafe_allow_html=True)
    deploy_cats = {
        "🔍 Monitoring":["Prometheus","Grafana","Alertmanager","Loki","Tempo","Mimir"],
        "📝 Logging":["ELK Stack","Fluentd","Fluent Bit","Graylog","Loki + Promtail"],
        "🔄 CI/CD":["Jenkins","GitLab Runner","ArgoCD","FluxCD","Tekton","Drone CI"],
        "🗄️ Databases":["PostgreSQL HA","MySQL (Percona)","MongoDB","Redis Cluster","ClickHouse"],
        "📨 Queues":["Kafka (Strimzi)","RabbitMQ","NATS","Redis Streams","Pulsar"],
        "🔒 Security":["Vault","cert-manager","Falco","Trivy","OPA Gatekeeper","Kyverno"],
        "🌐 Service Mesh":["Istio","Linkerd","Consul Connect","Kuma"],
        "🚪 API Gateway":["Kong","Traefik","APISIX","Ambassador"],
        "🤖 AI/ML":["Ollama","vLLM","MLflow","Kubeflow","KServe","Triton"],
    }
    for cat,tools in deploy_cats.items():
        with st.expander(f"{cat} — {len(tools)} tools"):
            tcols = st.columns(min(len(tools),4))
            for i,tool in enumerate(tools):
                with tcols[i%4]:
                    st.markdown(f'<div class="metric-tile" style="text-align:center;padding:14px;margin-bottom:8px;"><div style="font-size:13px;font-weight:600;color:#f1f5f9;">{tool}</div><div style="font-size:10px;color:#475569;margin-top:3px;">Helm + TF</div></div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    sec_div("EACH TEMPLATE INCLUDES")
    tpl = [("✅ Prerequisites Checker","Validates cluster, resources, CRDs, permissions","#00d4aa"),
           ("📄 values.yaml","All configurable parameters with defaults","#3b82f6"),
           ("🌍 Environment Profiles","dev (minimal) · staging · prod (HA)","#8b5cf6"),
           ("🔒 Security Config","NetworkPolicies, RBAC, TLS, secrets","#ef4444"),
           ("📈 Monitoring","ServiceMonitor, Grafana dashboards, alerts","#f59e0b"),
           ("❤️ Health Checks","Liveness, readiness, startup probes","#ec4899"),
           ("⬆️ Upgrade Guide","Step-by-step upgrade + rollback","#06b6d4"),
           ("🔧 Troubleshooting","Top 20 errors with RCA and fix steps","#10b981")]
    for t,d,c in tpl:
        st.markdown(f'<div class="flow-card" style="--fc-color:{c};"><div class="fc-title">{t}</div><div class="fc-desc">{d}</div></div>', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════
# PAGE: TROUBLESHOOTER AI
# ═══════════════════════════════════════════════════
elif page == "🔧 Troubleshooter AI":
    page_header("🔧", "Intelligent Troubleshooter AI", "Paste any error → Instant RCA + fix steps. Coverage: 10,000+ errors across all tools.")

    cols = st.columns(4)
    for col,(v,l,c) in zip(cols,[("10K+","Error Catalog","#ef4444"),("12","Tools Covered","#3b82f6"),("8-Step","AI Pipeline","#8b5cf6"),("< 3s","Avg Response","#00d4aa")]):
        with col: metric_tile(v,l,c)

    st.markdown("<br>", unsafe_allow_html=True)
    tab1,tab2,tab3,tab4 = st.tabs(["🔍 Try It","⚙️ Pipeline","📊 Error Catalog","🧠 AI Architecture"])

    with tab1:
        sec_div("PASTE YOUR ERROR")
        err = st.text_area("Error",placeholder="Paste any error message, log snippet, or describe your issue...\n\nExample: Pod 'payment-svc-7d4f8b-xk2lm' CrashLoopBackOff",height=120,label_visibility="collapsed")
        c1,c2 = st.columns([1,4])
        with c1: tool_hint = st.selectbox("Tool",["Auto-detect","Kubernetes","Docker","Terraform","AWS","Linux","Nginx","PostgreSQL","Prometheus","Redis","Elasticsearch"])
        if st.button("🔍 Analyze Error",type="primary",use_container_width=True):
            if err:
                try:
                    if BACKEND_AVAILABLE and analyze_error is not None:
                        with st.spinner("🤖 Analyzing..."):
                            result = analyze_error(err, tool_hint)
                        
                        severity_label = result.classify.severity.value.upper()
                        severity_color = "#ef4444" if severity_label in ["CRITICAL", "HIGH"] else "#f59e0b"
                        
                        st.markdown("---")
                        sev_html = f'<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><span class="sev-high" style="background:{severity_color}">{severity_label} SEVERITY</span><span style="color:#f1f5f9;font-weight:600;">{result.parse.error_code or "Unknown Error"} — {result.parse.tool.value if result.parse.tool else "Unknown Tool"}</span></div>'
                        st.markdown(sev_html, unsafe_allow_html=True)
                        
                        if result.rca:
                            st.markdown("### 🎯 Root Cause Analysis")
                            st.markdown(result.rca.analysis)
                            if result.rca.causes:
                                rca_table = "| Cause | Probability | Evidence |\n|-------|------------|----------|\n"
                                for cause in result.rca.causes:
                                    pct = int(cause.probability * 100)
                                    rca_table += f"| **{cause.cause}** | {pct}% | {cause.evidence} |\n"
                                st.markdown(rca_table)
                        
                        if result.fix:
                            st.markdown("### 🔍 Diagnostic Commands")
                            cmd_text = ""
                            for step in result.fix.steps[:3]:
                                if step.command:
                                    cmd_text += step.command + "\n"
                            if cmd_text:
                                st.code(cmd_text, language="bash")
                            
                            st.markdown("### 🔧 Fix Steps")
                            for step in result.fix.steps:
                                color = "#00d4aa" if step.step_number <= 2 else "#f59e0b"
                                cmd_display = step.command[:80] + "..." if step.command and len(step.command) > 80 else (step.command or "")
                                st.markdown(f'<div class="flow-card" style="--fc-color:{color};"><div class="fc-title">{step.title}</div><div style="font-family:JetBrains Mono,monospace;font-size:12px;color:#3b82f6;margin:6px 0;">{cmd_display}</div><div class="fc-desc">✓ Verify: {step.verification}</div></div>', unsafe_allow_html=True)
                            
                            if result.fix.estimated_time:
                                st.caption(f"⏱️ Estimated time: {result.fix.estimated_time}")
                        
                        if result.prevention:
                            st.markdown("### 🛡️ Prevention")
                            for rule in result.prevention.monitoring_rules[:1]:
                                st.code(rule.config, language="yaml")
                            
                            if result.prevention.best_practices:
                                st.markdown("**Best Practices:**")
                                for bp in result.prevention.best_practices[:3]:
                                    st.markdown(f"- {bp}")
                        
                        st.caption(f"⚡ Analysis completed in {result.total_time_ms:.1f}ms")
                    else:
                        st.warning("Backend not available. Using demo mode.")
                        _show_demo_troubleshoot(err)
                except Exception as e:
                    st.error(f"Error analyzing: {str(e)}")
                    st.info("Showing demo results instead...")
                    _show_demo_troubleshoot(err)

    with tab2:
        sec_div("8-STEP AI TROUBLESHOOTING PIPELINE")
        for num,title,desc,c in [("01","INPUT","User pastes error, log, or description","#00d4aa"),("02","PARSE","Extract error code, tool, version, context","#3b82f6"),
            ("03","CLASSIFY","ML: config, networking, permissions, resources, state","#8b5cf6"),("04","MATCH","Search 10K+ catalog + knowledge graph + LLM","#f59e0b"),
            ("05","RCA","Root cause analysis with confidence & evidence","#ef4444"),("06","FIX","Ordered steps with commands & verification","#00d4aa"),
            ("07","PREVENT","Monitoring rules, CI/CD checks, best practices","#fbbf24"),("08","LEARN","Feed resolution back to knowledge graph","#8b5cf6")]:
            st.markdown(f'<div class="flow-card" style="--fc-color:{c};"><div class="fc-num" style="color:{c};">STEP {num} — {title}</div><div class="fc-desc">{desc}</div></div>', unsafe_allow_html=True)

        st.markdown("<br>", unsafe_allow_html=True)
        sec_div("LANGGRAPH STATE MACHINE")
        fig_f = go.Figure()
        fn = [("INPUT",1,8,"#3b82f6",38),("PARSE",3,8,"#00d4aa",38),("CLASSIFY",5,8,"#8b5cf6",38),("RETRIEVE",7,8,"#f59e0b",38),
              ("RCA\n(LLM)",8.5,6.5,"#ef4444",34),("FIX",7,5,"#00d4aa",38),("PREVENT",7,3.5,"#fbbf24",38),("FEEDBACK",7,2,"#8b5cf6",38),("END",7,0.8,"#475569",30)]
        for s,t in [(0,1),(1,2),(2,3),(3,4),(3,5),(4,5),(5,6),(6,7),(7,8)]:
            c = "rgba(239,68,68,0.35)" if (s==3 and t==4) else "rgba(0,212,170,0.25)"
            fig_f.add_trace(go.Scatter(x=[fn[s][1],fn[t][1]],y=[fn[s][2],fn[t][2]],mode="lines",line=dict(color=c,width=2.5),hoverinfo="skip",showlegend=False))
            fig_f.add_annotation(x=fn[t][1],y=fn[t][2],ax=fn[s][1],ay=fn[s][2],xref="x",yref="y",axref="x",ayref="y",showarrow=True,arrowhead=2,arrowsize=1.2,arrowwidth=2,arrowcolor=c)
        fig_f.add_annotation(x=7.8,y=7.2,text="score < 0.9<br><i>needs LLM</i>",showarrow=False,font=dict(size=9,color="#ef4444"))
        fig_f.add_annotation(x=6.5,y=6.8,text="score > 0.9<br><i>catalog hit</i>",showarrow=False,font=dict(size=9,color="#00d4aa"))
        for nm,x,y,c,sz in fn:
            fig_f.add_trace(go.Scatter(x=[x],y=[y],mode="markers+text",marker=dict(size=sz,color=c,line=dict(width=2,color="#030712"),opacity=0.9),
                text=[nm],textposition="middle center",textfont=dict(size=9,color="#030712",family="JetBrains Mono"),hoverinfo="text",showlegend=False))
        dark_layout(fig_f,height=480,margin=dict(l=10,r=10,t=10,b=10),xaxis=dict(showgrid=False,showticklabels=False,zeroline=False,range=[0,10]),yaxis=dict(showgrid=False,showticklabels=False,zeroline=False,range=[0,9.5]))
        st.plotly_chart(fig_f, use_container_width=True)

    with tab3:
        sec_div("ERROR CATALOG (10,000+ ERRORS)")
        ed = {"Kubernetes":1500,"Docker":800,"Terraform":700,"AWS":1200,"Linux":900,"Nginx":600,"PostgreSQL":800,"Prometheus":500,"Azure":700,"GCP":600,"Redis":500,"Elasticsearch":500}
        fig = go.Figure(data=[go.Bar(x=list(ed.values()),y=list(ed.keys()),orientation="h",
            marker_color=["#3b82f6","#00d4aa","#8b5cf6","#f59e0b","#ef4444","#fbbf24","#10b981","#ec4899","#3b82f6","#fbbf24","#ef4444","#8b5cf6"],
            text=list(ed.values()),textposition="outside")])
        dark_layout(fig,height=400,margin=dict(l=120,r=60,t=20,b=20))
        st.plotly_chart(fig, use_container_width=True)
        sec_div("SAMPLE CATALOG ENTRIES")
        st.dataframe(pd.DataFrame(ERROR_CATALOG), use_container_width=True, hide_index=True)

    with tab4:
        sec_div("AI AGENT ARCHITECTURE")
        c1,c2 = st.columns(2)
        with c1:
            st.markdown("**LangGraph Agent Nodes**")
            for n,d in [("ErrorParserNode","Extract tool, error code, context"),("ClassifierNode","Rule-based + LLM hybrid"),("RetrieverNode","pgvector + pg_trgm + RRF"),
                ("RCANode","Root cause with confidence"),("FixGeneratorNode","Ordered fix steps"),("PreventionNode","Monitoring + CI/CD checks"),("FeedbackNode","Knowledge graph update")]:
                st.markdown(f"- **`{n}`** — {d}")
        with c2:
            st.markdown("**Technology Stack**\n- **LangGraph** — State machine\n- **LangChain** — LLM chains\n- **Ollama** — Self-hosted LLM\n- **pgvector** — Semantic search\n- **pg_trgm** — Fuzzy matching\n- **FastAPI** — Async API + SSE\n- **NATS** — Event publishing\n- **Redis** — Response caching")
        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown("**Hybrid Search (Reciprocal Rank Fusion)**")
        st.code("# 1. Semantic: Embed → pgvector cosine → Top 10\n# 2. Keyword: pg_trgm + ts_vector → Top 10\n# 3. RRF: 1/(k+rank), k=60 → Merged Top 5\n# score > 0.9 → catalog direct | score < 0.9 → LLM RCA",language="python")


# ═══════════════════════════════════════════════════
# PAGE: INTERVIEW ENGINE
# ═══════════════════════════════════════════════════
elif page == "🎯 Interview Engine":
    page_header("🎯", "Interview Mastery Engine", "500+ questions, detailed answers, real scenarios, AI mock interviews")

    cols = st.columns(4)
    for col,(v,l) in zip(cols,[("500+","Questions"),("15","Topics"),("5","Exp Levels"),("AI","Mock Interviewer")]):
        with col: metric_tile(v,l,"#f59e0b","#ef4444")

    st.markdown("<br>", unsafe_allow_html=True)
    t1,t2 = st.tabs(["📝 Q&A Bank","🎙️ Mock Interview"])
    with t1:
        st.markdown("**Each Question Includes:**\n\n| Component | Details |\n|---|---|\n| Quick Answer | 2-3 sentence concise answer |\n| Detailed Answer | Full technical explanation |\n| Real-Time Scenario | Production story |\n| Follow-Up Questions | 3-5 likely follow-ups |\n| Commands/Config | Exact commands |\n| Common Mistakes | What candidates get wrong |")
        with st.expander("🔥 Sample: Design zero-downtime deployment for K8s payment service"):
            st.markdown("**Quick**: Rolling update + readiness probes + preStop hooks + PDB\n\n**Detailed**: maxSurge:1, maxUnavailable:0 + HTTP readiness + sleep 15 preStop + PDB minAvailable:2\n\n**Follow-Ups**: DB migrations? Canary? maxSurge vs maxUnavailable?\n\n**Mistakes**: maxUnavailable > 0 for critical | No preStop = dropped connections | No PDB = node drain kills all")
            st.code("strategy:\n  type: RollingUpdate\n  rollingUpdate:\n    maxSurge: 1\n    maxUnavailable: 0\nreadinessProbe:\n  httpGet: { path: /health/ready, port: 8080 }\nlifecycle:\n  preStop:\n    exec: { command: ['sleep', '15'] }",language="yaml")
    with t2:
        sec_div("AI MOCK INTERVIEW MODE")
        c1,c2,c3 = st.columns(3)
        with c1: st.selectbox("Role",["DevOps Engineer","SRE","Cloud Architect","Platform Engineer"])
        with c2: st.selectbox("Experience",["Junior (0-3yr)","Mid (3-7yr)","Senior (7-12yr)","Staff (12+yr)"])
        with c3: st.selectbox("Duration",["30 min","45 min","60 min"])
        if st.button("🎙️ Start Mock Interview",type="primary",use_container_width=True):
            st.info("🤖 AI Interviewer: questions, probing, challenges, real interview simulation.")
        st.markdown("**Scoring**: Technical Depth (0-10) · Communication (0-10) · Problem-Solving (0-10) · Architecture (0-10) · Hire/No-hire")


# ═══════════════════════════════════════════════════
# PAGE: LOG ANALYZER
# ═══════════════════════════════════════════════════
elif page == "📊 Log Analyzer":
    page_header("📊", "Log & Report Analyzer", "Upload any log file → AI analyzes and generates actionable insights")

    cols = st.columns(4)
    for col,(v,l) in zip(cols,[("9","Capabilities"),("AI","Engine"),("PDF","Export"),("Real-time","Streaming")]):
        with col: metric_tile(v,l,"#fbbf24","#f59e0b")

    st.markdown("<br>", unsafe_allow_html=True)
    st.file_uploader("Upload log file", type=["log","txt","json","csv","yaml"])

    sec_div("SAMPLE ANALYSIS OUTPUT")
    c1,c2 = st.columns(2)
    with c1:
        hrs = list(range(24)); errs = [12,8,5,3,2,4,15,45,62,38,25,18,14,11,9,7,22,55,71,43,28,19,15,11]
        fig_e = go.Figure()
        fig_e.add_trace(go.Scatter(x=hrs,y=errs,mode="lines+markers",line=dict(color="#00d4aa",width=2),marker=dict(size=4),fill="tozeroy",fillcolor="rgba(0,212,170,0.04)",name="Error Rate"))
        fig_e.add_trace(go.Scatter(x=[8,17,18],y=[errs[8],errs[17],errs[18]],mode="markers",marker=dict(size=12,color="#ef4444",symbol="circle-open",line=dict(width=2)),name="Anomaly"))
        dark_layout(fig_e,height=280,margin=dict(l=40,r=20,t=40,b=30),title=dict(text="Error Rate / Hour",font=dict(size=13,color="#f1f5f9")),legend=dict(orientation="h",y=1.15))
        st.plotly_chart(fig_e, use_container_width=True)
    with c2:
        fig_c = go.Figure(data=[go.Pie(labels=["Networking","Config","Resources","Permissions","State","Version"],values=[35,25,18,12,7,3],hole=0.6,
            marker=dict(colors=["#3b82f6","#00d4aa","#ef4444","#f59e0b","#8b5cf6","#fbbf24"]),textinfo="label+percent",textfont=dict(size=10))])
        dark_layout(fig_c,height=280,margin=dict(l=20,r=20,t=40,b=20),title=dict(text="Error Categories",font=dict(size=13,color="#f1f5f9")),showlegend=False)
        st.plotly_chart(fig_c, use_container_width=True)

    sec_div("9 ANALYSIS CAPABILITIES")
    for t,d,c in [("🔍 Pattern Detection","Recurring patterns, error clusters, trends","#00d4aa"),("🚨 Anomaly Detection","Statistical + ML anomaly detection","#ef4444"),
        ("🎯 Root Cause Analysis","Trace error chains across systems","#8b5cf6"),("⏱️ Timeline Reconstruction","Event timeline with correlations","#3b82f6"),
        ("📊 Resource Analysis","CPU, memory, disk, network patterns","#f59e0b"),("📈 Capacity Forecasting","Predict resource exhaustion","#06b6d4"),
        ("💰 Cost Analysis","Cloud cost, waste identification","#10b981"),("🐌 Performance Profiling","Slow queries, bottlenecks","#ec4899"),("📄 Report Generation","PDF/DOCX with charts","#fbbf24")]:
        st.markdown(f'<div class="flow-card" style="--fc-color:{c};"><div class="fc-title">{t}</div><div class="fc-desc">{d}</div></div>', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════
# PAGE: 5-POINT EXPANDER
# ═══════════════════════════════════════════════════
elif page == "✨ 5-Point Expander":
    page_header("✨", "5-Point Expander", "Enter 5 keywords → Platform generates complete documentation")

    sec_div("ENTER 5 KEYWORDS")
    cols = st.columns(5)
    kws = ["Kubernetes","HPA","Custom Metrics","KEDA","Scaling Strategy"]
    keywords = [col.text_input(f"KW{i+1}",value=kws[i],label_visibility="collapsed") for i,col in enumerate(cols)]
    if st.button("✨ Generate Documentation",type="primary",use_container_width=True):
        st.markdown("---")
        for t,d,c in [("📖 Concept Overview","Complete explanation + architecture diagram","#00d4aa"),("⚙️ Configuration Files","HPA YAML, KEDA ScaledObject, Prometheus Adapter","#3b82f6"),
            ("📋 Step-by-Step Guide","Install → Configure → Deploy → Test → Monitor","#8b5cf6"),("🏗️ Architecture Diagram","Pod → Metrics → HPA → Scale + KEDA flow","#f59e0b"),
            ("✅ Best Practices","Stabilization windows, PDB coordination","#10b981"),("❌ Errors & Fixes","HPA unknown metric, KEDA refused, flapping","#ef4444"),
            ("🎯 Interview Questions","10 Q&A on HPA, KEDA, custom metrics","#ec4899"),("🌐 Real Scenario","Black Friday: HPA + KEDA traffic spike","#06b6d4"),
            ("📋 Quick Reference","kubectl autoscale, HPA status, KEDA CRD","#fbbf24"),("⬇️ Download","YAML configs + DOCX/PDF guide","#475569")]:
            st.markdown(f'<div class="flow-card" style="--fc-color:{c};"><div class="fc-title">{t}</div><div class="fc-desc">{d}</div></div>', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════
# PAGE: CONFIG VAULT
# ═══════════════════════════════════════════════════
elif page == "🔐 Config Vault":
    page_header("🔐", "Configuration Vault", "500+ production-ready configs for every DevOps tool")

    cols = st.columns(4)
    for col,(v,l) in zip(cols,[("520+","Configs"),("14","Tools"),("3","Environments"),("100%","Annotated")]):
        with col: metric_tile(v,l,"#10b981","#00d4aa")

    st.markdown("<br>", unsafe_allow_html=True)
    for tool,desc in {"Prometheus":"prometheus.yml, alertmanager.yml, recording/alert rules","Grafana":"grafana.ini, provisioning, K8s dashboards",
        "Kubernetes":"Deployment, StatefulSet, DaemonSet, Service, Ingress, RBAC, PDB, HPA","Nginx":"nginx.conf (reverse proxy, LB, SSL, caching, rate limiting)",
        "Docker":"Dockerfile (multi-stage), docker-compose (dev/staging/prod)","Terraform":"main.tf, variables.tf, outputs.tf for VPC, EKS, RDS",
        "CI/CD":"Jenkinsfile, GitHub workflows, .gitlab-ci.yml, ArgoCD","Helm":"Chart.yaml, values.yaml (3 envs), templates/",
        "PostgreSQL":"postgresql.conf, pg_hba.conf, pgbouncer.ini","Redis":"redis.conf (standalone/sentinel/cluster)",
        "Elasticsearch":"elasticsearch.yml, jvm.options, ILM policies","Kafka":"server.properties, consumer/producer configs"}.items():
        with st.expander(f"⚙️ {tool}"):
            st.markdown(f"**Configurations**: {desc}")
            st.markdown("**Profiles**: `dev` · `staging` · `prod` (HA, hardened)")


# ═══════════════════════════════════════════════════
# PAGE: ARCHITECTURE GENERATOR
# ═══════════════════════════════════════════════════
elif page == "🏛️ Architecture Generator":
    page_header("🏛️", "Architecture Generator", "Describe requirements → Get full architecture with implementation guides")

    st.text_area("Describe your requirements",placeholder="Example: Highly available microservices for e-commerce, 10K req/sec, real-time inventory...",height=120)
    if st.button("🏛️ Generate Architecture",type="primary",use_container_width=True):
        st.info("Generates: system diagram, components, tech rationale, deployment topology, scaling strategy, implementation guide.")
    st.markdown("---")
    st.markdown("**163 pre-built architecture templates**")
    cols = st.columns(5)
    for i,t in enumerate(["Microservices","Event-Driven","CQRS","Serverless","Multi-Cloud","Zero-Trust","Data Pipeline","ML Platform","IoT Platform","Real-time Analytics"]):
        with cols[i%5]:
            st.markdown(f'<div class="metric-tile" style="text-align:center;padding:12px;margin-bottom:8px;"><span style="font-size:12px;color:#f1f5f9;">{t}</span></div>', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════
# PAGE: REVENUE & PRICING
# ═══════════════════════════════════════════════════
elif page == "💰 Revenue & Pricing":
    page_header("💰", "Revenue Model & Pricing", "Transparent pricing tiers with enterprise flexibility")

    sec_div("PRICING TIERS")
    cols = st.columns(4)
    tiers = [("Free","$0","Individual",["5 topics/day","Basic troubleshooter","10 Q&A/day","Community support"],"#475569","#334155"),
             ("Pro","$29/mo","Individual",["Unlimited access","Full troubleshooter","All Q&A + labs","Priority support"],"#00d4aa","#06b6d4"),
             ("Team","$19/user/mo","Up to 25",["Everything in Pro","Team dashboards","Skill assessments","Custom paths"],"#3b82f6","#8b5cf6"),
             ("Enterprise","Custom","Unlimited",["Private deploy","Custom integrations","SLA + dedicated","SSO/SAML"],"#8b5cf6","#ec4899")]
    for col,(n,p,tgt,feats,g1,g2) in zip(cols,tiers):
        with col:
            feat_html = "".join(f'<div style="font-size:12px;color:#94a3b8;padding:4px 0;display:flex;gap:6px;"><span style="color:{g1};">✓</span>{f}</div>' for f in feats)
            is_popular = ' <span style="font-size:9px;background:linear-gradient(135deg,#00d4aa,#06b6d4);color:#030712;padding:2px 8px;border-radius:10px;font-weight:700;margin-left:6px;">POPULAR</span>' if n=="Pro" else ""
            st.markdown(f"""
            <div class="grad-wrap" style="--g1:{g1};--g2:{g2};">
                <div class="grad-inner">
                    <div style="font-size:15px;font-weight:700;color:{g1};margin-bottom:4px;">{n}{is_popular}</div>
                    <div style="font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">{p}</div>
                    <div style="font-size:11px;color:#475569;margin-bottom:18px;">{tgt}</div>
                    {feat_html}
                    <div style="margin-top:18px;padding:10px;border-radius:10px;text-align:center;
                        background:linear-gradient(135deg,{g1},{g2});color:#030712;
                        font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.3px;">Get Started</div>
                </div>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    sec_div("REVENUE STREAMS — YEAR 1: $415,000")
    rd = {"Pro Subscriptions":120000,"Enterprise":100000,"Team Plans":80000,"Corporate Training":40000,"Consulting":30000,"Certifications":20000,"API Access":15000,"Marketplace":10000}
    fig = go.Figure(data=[go.Pie(labels=list(rd.keys()),values=list(rd.values()),hole=0.55,
        marker=dict(colors=["#00d4aa","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#fbbf24","#10b981","#ec4899"]),textinfo="label+percent",textfont=dict(size=11))])
    dark_layout(fig,height=400,margin=dict(t=20,b=20),annotations=[dict(text="$415K",x=0.5,y=0.5,font_size=24,font_color="#00d4aa",showarrow=False)])
    st.plotly_chart(fig, use_container_width=True)

    sec_div("MRR PROJECTION")
    mos = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    fig_m = go.Figure()
    fig_m.add_trace(go.Scatter(x=mos,y=[0,1000,4000,10000,18000,28000,40000,54000,66000,76000,84000,92000],mode="lines+markers",name="Optimistic",line=dict(color="#00d4aa",width=2.5),fill="tozeroy",fillcolor="rgba(0,212,170,0.04)"))
    fig_m.add_trace(go.Scatter(x=mos,y=[0,500,2000,5000,9000,14000,20000,27000,33000,38000,42000,46000],mode="lines+markers",name="Conservative",line=dict(color="#3b82f6",width=2,dash="dash")))
    dark_layout(fig_m,height=300,margin=dict(l=60,r=20,t=20,b=40),yaxis=dict(title="MRR ($)",tickprefix="$"),legend=dict(orientation="h",y=1.1,x=0.5,xanchor="center"))
    st.plotly_chart(fig_m, use_container_width=True)

    sec_div("INFRASTRUCTURE COST: $3,575 — $7,260/month")
    st.dataframe(pd.DataFrame([("K8s Cluster","3 master + 6 worker","$1,200—$2,400"),("GPU Nodes","2x A10G","$800—$1,600"),
        ("PostgreSQL HA","Multi-AZ","$400—$800"),("Redis Cluster","3-node","$300—$600"),
        ("Elasticsearch","3-node","$400—$800"),("Kafka","3 brokers","$300—$600")],columns=["Resource","Spec","Monthly Cost"]),use_container_width=True,hide_index=True)


# ═══════════════════════════════════════════════════
# PAGE: API SPECIFICATION
# ═══════════════════════════════════════════════════
elif page == "📋 API Specification":
    page_header("📋", "API Specification", "43 endpoints across all modules — RESTful + SSE streaming")

    api = [("Auth","POST","/api/v1/auth/login","Authenticate, return JWT"),("Auth","POST","/api/v1/auth/register","Register + email verification"),
        ("Auth","POST","/api/v1/auth/sso","SSO via SAML/OIDC"),("Learn","GET","/api/v1/paths","List learning paths"),
        ("Learn","GET","/api/v1/topics/:id","Full topic content"),("Learn","POST","/api/v1/progress","Update progress"),
        ("Labs","POST","/api/v1/labs/create","Provision sandboxed lab"),("Labs","POST","/api/v1/labs/:id/validate","Validate completion"),
        ("Deploy","GET","/api/v1/templates","List templates"),("Deploy","POST","/api/v1/deploy","Deploy to cluster"),
        ("Trouble","POST","/api/v1/troubleshoot","Submit error"),("Trouble","GET","/api/v1/errors/search","Search catalog"),
        ("Interview","GET","/api/v1/interview/questions","Get Qs"),("Interview","POST","/api/v1/interview/mock/start","Start mock"),
        ("Interview","POST","/api/v1/interview/mock/:id/answer","Submit answer"),("Analyzer","POST","/api/v1/analyze/logs","Upload + analyze"),
        ("Analyzer","GET","/api/v1/analyze/:id/report","Get report"),("Expand","POST","/api/v1/expand","Submit 5 points"),
        ("Config","GET","/api/v1/configs?tool=&env=","Get configs"),("Search","GET","/api/v1/search?q=","Full-text search"),
        ("Search","POST","/api/v1/search/semantic","Embedding search"),("Admin","GET","/api/v1/admin/analytics","Platform analytics")]
    df = pd.DataFrame(api, columns=["Module","Method","Endpoint","Description"])
    mf = st.multiselect("Filter by module", df["Module"].unique().tolist(), default=df["Module"].unique().tolist())
    st.dataframe(df[df["Module"].isin(mf)], use_container_width=True, hide_index=True, height=600)


# ═══════════════════════════════════════════════════
# FOOTER (all pages)
# ═══════════════════════════════════════════════════
st.markdown("""
<div style="margin-top: 60px; padding: 24px 0 12px; border-top: 1px solid rgba(255,255,255,0.04); text-align: center;">
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px;">
        <div style="width: 20px; height: 20px; border-radius: 6px;
                    background: linear-gradient(135deg, #00d4aa, #06b6d4);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 10px; font-weight: 800; color: #030712;">S</div>
        <span style="font-family: 'Space Grotesk', sans-serif; font-size: 12px; color: #475569; font-weight: 600; letter-spacing: 0.5px;">SANTHIRA</span>
    </div>
    <div style="font-size: 10.5px; color: #334155; font-family: 'JetBrains Mono', monospace;">
        Built by Rajkumar Madhu &middot; v1.0.0 &middot; &copy; 2026
    </div>
</div>
""", unsafe_allow_html=True)
