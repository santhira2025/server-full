/* ============================================
   WhatsApp AI Sales Agent - Dashboard Logic
   Real-time data fetching, chart rendering, interactions
   ============================================ */

let allConversations = [];
let refreshInterval = null;

// ------------------------------------------
// Data Loading
// ------------------------------------------

async function loadAllData() {
    await Promise.all( [loadMetrics(), loadConversations()] );
}

async function loadMetrics() {
    try {
        const res = await fetch( "/dashboard/api/metrics" );
        const data = await res.json();
        if ( data.status !== "ok" ) return;

        const m = data.data;

        // KPI Values
        animateValue( "totalConversations", m.total_conversations );
        animateValue( "activeToday", m.active_today );
        animateValue( "totalMessages", m.total_messages );
        document.getElementById( "avgLeadScore" ).textContent = m.avg_lead_score;
        document.getElementById( "conversionRate" ).textContent = m.conversion_rate + "%";

        // Pipeline Funnel
        renderPipeline( m.leads_by_stage );

        // Sentiment
        renderSentiment( m.sentiment_breakdown );
    } catch ( e ) {
        console.error( "Metrics load error:", e );
    }
}

async function loadConversations() {
    try {
        const res = await fetch( "/dashboard/api/conversations" );
        const data = await res.json();
        if ( data.status !== "ok" ) return;

        allConversations = data.data || [];
        renderConversations( allConversations );
    } catch ( e ) {
        console.error( "Conversations load error:", e );
    }
}

// ------------------------------------------
// Rendering
// ------------------------------------------

function renderConversations( conversations ) {
    const tbody = document.getElementById( "conversationsTable" );

    if ( !conversations.length ) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No conversations yet. Waiting for WhatsApp messages…</td></tr>`;
        return;
    }

    tbody.innerHTML = conversations.map( c => {
        const name = c.customer_name || c.phone_number;
        const stage = c.lead_stage || "new";
        const score = c.lead_score || 0;
        const scoreColor = score > 70 ? "var(--green)" : score > 40 ? "var(--amber)" : "var(--red)";
        const sentiment = c.sentiment || "neutral";
        const sentimentIcon = sentiment === "positive" ? "🟢" : sentiment === "negative" ? "🔴" : "🔵";
        const msgs = c.total_messages || 0;
        const lastActive = c.last_message_at ? timeAgo( new Date( c.last_message_at ) ) : "Never";

        const preview = c.last_message_preview ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ c.last_message_preview }</div>` : "";
        return `
        <tr style="cursor:pointer" onclick="openChat('${ c.phone_number }','${ name }')">
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div class="avatar">${ name.charAt( 0 ).toUpperCase() }</div>
                    <div>
                        <div style="font-weight:600;font-size:13.5px">${ name }</div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${ c.phone_number }</div>
                        ${ preview }
                    </div>
                </div>
            </td>
            <td><span class="badge badge-${ stage }">${ stage.replace( "_", " " ) }</span></td>
            <td>
                <div class="score-bar">
                    <span class="score-num">${ score }</span>
                    <div class="score-track">
                        <div class="score-fill" style="width:${ score }%;background:${ scoreColor }"></div>
                    </div>
                </div>
            </td>
            <td><span style="text-transform:capitalize;font-size:13px">${ sentimentIcon } ${ sentiment }</span></td>
            <td style="font-weight:600">${ msgs }</td>
            <td style="color:var(--text-muted);font-size:12px">${ lastActive }</td>
            <td><button class="btn-view" onclick="event.stopPropagation();openChat('${ c.phone_number }','${ name }')"><i class="ri-chat-1-line"></i> Chat</button></td>
        </tr>`;
    } ).join( "" );
}

function renderPipeline( stageData ) {
    const container = document.getElementById( "pipelineFunnel" );
    const stages = ["new", "engaged", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
    const total = Object.values( stageData ).reduce( ( a, b ) => a + b, 0 ) || 1;

    container.innerHTML = stages.map( stage => {
        const count = stageData[stage] || 0;
        const pct = Math.round( ( count / total ) * 100 );
        return `
        <div class="funnel-bar">
            <span class="funnel-label">${ stage.replace( "_", " " ) }</span>
            <div class="funnel-track">
                <div class="funnel-fill ${ stage }" style="width:${ Math.max( pct, 2 ) }%">${ count }</div>
            </div>
        </div>`;
    } ).join( "" );
}

function renderSentiment( sentimentData ) {
    const container = document.getElementById( "sentimentBars" );
    const total = Object.values( sentimentData ).reduce( ( a, b ) => a + b, 0 ) || 1;
    const icons = { positive: "😊", neutral: "😐", negative: "😞" };

    container.innerHTML = ["positive", "neutral", "negative"].map( s => {
        const count = sentimentData[s] || 0;
        const pct = Math.round( ( count / total ) * 100 );
        return `
        <div class="sentiment-row">
            <span class="sentiment-icon-label">${ icons[s] } ${ s }</span>
            <div class="sentiment-track">
                <div class="sentiment-fill ${ s }" style="width:${ Math.max( pct, 2 ) }%"></div>
            </div>
            <span class="sentiment-pct">${ pct }%</span>
        </div>`;
    } ).join( "" );
}

// ------------------------------------------
// Chat Panel
// ------------------------------------------

async function openChat( phone, name ) {
    const panel = document.getElementById( "chatPanel" );
    document.getElementById( "chatContactName" ).textContent = name;
    document.getElementById( "chatContactNumber" ).textContent = phone;
    document.getElementById( "chatPanelAvatar" ).textContent = name.charAt( 0 ).toUpperCase();
    panel.dataset.phone = phone;
    panel.classList.add( "open" );

    // Load messages
    const res = await fetch( `/dashboard/api/conversations/${ phone }/messages` );
    const data = await res.json();
    const container = document.getElementById( "chatMessages" );

    if ( data.status === "ok" && data.messages ) {

        // Update toggle state
        const isPaused = data.conversation?.is_paused || false;
        document.getElementById( "aiToggle" ).checked = !isPaused;
        document.getElementById( "aiStatusText" ).textContent = isPaused ? "AI Paused" : "AI Active";
        document.getElementById( "aiStatusText" ).style.color = isPaused ? "var(--amber)" : "var(--green)";

        container.innerHTML = data.messages.map( msg => `
            <div class="msg ${ msg.direction === 'inbound' ? 'msg-in' : 'msg-out' }">
                <div class="msg-bubble">
                    <p>${ msg.content }</p>
                    <span class="msg-time">${ new Date( msg.timestamp ).toLocaleTimeString() }</span>
                    ${ msg.intent_detected ? `<span class="msg-intent">${ msg.intent_detected }</span>` : "" }
                </div>
            </div>
        `).join( "" );
        container.scrollTop = container.scrollHeight;
    } else {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">No messages yet</p>';
    }
}

function closeChatPanel() {
    document.getElementById( "chatPanel" ).classList.remove( "open" );
}

async function toggleAI() {
    const isChecked = document.getElementById( "aiToggle" ).checked;
    const phone = document.getElementById( "chatPanel" ).dataset.phone;
    if ( !phone ) return;

    const endpoint = isChecked ? "resume" : "pause";

    // Optimistic UI update
    document.getElementById( "aiStatusText" ).textContent = isChecked ? "AI Active" : "AI Paused";
    document.getElementById( "aiStatusText" ).style.color = isChecked ? "var(--green)" : "var(--amber)";

    try {
        await fetch( `/dashboard/api/conversations/${ phone }/${ endpoint }`, { method: "POST" } );
    } catch ( e ) {
        console.error( "Toggle error:", e );
        // Revert UI on failure
        document.getElementById( "aiToggle" ).checked = !isChecked;
    }
}

async function sendManualMessage() {
    const input = document.getElementById( "manualMessage" );
    const text = input.value.trim();
    const phone = document.getElementById( "chatPanel" ).dataset.phone;
    if ( !text || !phone ) return;

    input.value = "";
    input.disabled = true;

    try {
        await fetch( "/dashboard/api/send-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify( { phone_number: phone, message: text } ),
        } );
        // Reload chat after a short delay
        setTimeout( () => openChat( phone, document.getElementById( "chatContactName" ).textContent ), 1000 );
    } catch ( e ) {
        console.error( "Send error:", e );
    }

    input.disabled = false;
}

// ------------------------------------------
// Search / Filter
// ------------------------------------------

function filterConversations() {
    const query = document.getElementById( "searchInput" ).value.toLowerCase();
    const filtered = allConversations.filter( c =>
        ( c.customer_name || "" ).toLowerCase().includes( query ) ||
        c.phone_number.includes( query )
    );
    renderConversations( filtered );
}

// ------------------------------------------
// Navigation
// ------------------------------------------

function switchView( view, el ) {
    document.querySelectorAll( ".nav-link" ).forEach( n => n.classList.remove( "active" ) );
    if ( el ) el.classList.add( "active" );

    document.querySelector( ".kpi-grid" ).style.display = ( view === "overview" || view === "pipeline" ) ? "grid" : "none";
    document.querySelector( ".charts-row" ).style.display = ( view === "overview" || view === "pipeline" ) ? "grid" : "none";
    document.querySelector( ".table-section" ).style.display = ( view === "overview" || view === "conversations" ) ? "block" : "none";
    document.getElementById( "activitySection" ).style.display = view === "activity" ? "block" : "none";

    if ( view === "activity" ) loadActivity();
    document.getElementById( "pageTitle" ).textContent =
        view === "overview" ? "Sales Dashboard" :
            view === "conversations" ? "Conversations" :
                view === "pipeline" ? "Sales Pipeline" :
                    "Live Activity";
}

async function loadActivity() {
    try {
        const res = await fetch( "/dashboard/api/activity" );
        const data = await res.json();
        const container = document.getElementById( "activityFeed" );

        if ( data.status === "ok" && data.data ) {
            container.innerHTML = data.data.map( item => `
                <div class="activity-item">
                    <div>
                        <span class="direction ${ item.direction }">${ item.direction }</span>
                        <span style="margin-left:8px">${ item.phone_number }</span>
                    </div>
                    <div style="flex:1;margin:0 16px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                        ${ item.content }
                    </div>
                    <div style="color:var(--text-muted);font-size:11px">${ timeAgo( new Date( item.timestamp ) ) }</div>
                </div>
            `).join( "" );
        }
    } catch ( e ) {
        console.error( "Activity load error:", e );
    }
}

// ------------------------------------------
// Utilities
// ------------------------------------------

function animateValue( elementId, endValue ) {
    const el = document.getElementById( elementId );
    const start = parseInt( el.textContent ) || 0;
    const duration = 600;
    const startTime = performance.now();

    function update( currentTime ) {
        const elapsed = currentTime - startTime;
        const progress = Math.min( elapsed / duration, 1 );
        el.textContent = Math.round( start + ( endValue - start ) * progress );
        if ( progress < 1 ) requestAnimationFrame( update );
    }

    requestAnimationFrame( update );
}

function formatCurrency( amount ) {
    return new Intl.NumberFormat( "en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    } ).format( amount );
}

function timeAgo( date ) {
    const seconds = Math.floor( ( new Date() - date ) / 1000 );
    if ( seconds < 60 ) return "just now";
    if ( seconds < 3600 ) return Math.floor( seconds / 60 ) + "m ago";
    if ( seconds < 86400 ) return Math.floor( seconds / 3600 ) + "h ago";
    return Math.floor( seconds / 86400 ) + "d ago";
}

// ------------------------------------------
// Real-time WebSockets
// ------------------------------------------

function setupWebSocket() {
    loadAllData();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${ protocol }//${ window.location.host }/dashboard/ws`;
    const ws = new WebSocket( wsUrl );

    const statusDot = document.querySelector( '.status-dot' );
    const timerText = document.getElementById( "refreshTimer" );

    ws.onopen = () => {
        console.log( "WebSocket connected. Listening for real-time updates." );
        if ( statusDot ) {
            statusDot.style.background = 'var(--green)';
            statusDot.style.boxShadow = '0 0 10px var(--green)';
        }
        if ( timerText ) timerText.innerHTML = '<i class="ri-pulse-line"></i> Live Stream Connected';
    };

    ws.onmessage = ( event ) => {
        try {
            const msg = JSON.parse( event.data );
            if ( msg.type === "reload" ) {
                console.log( "Real-time update received!" );
                loadAllData();
                // If the chat panel is currently open and it matches the updated phone_number, refresh it
                const chatPanel = document.getElementById( "chatPanel" );
                if ( chatPanel.classList.contains( "open" ) && msg.data.phone_number === chatPanel.dataset.phone ) {
                    const currentName = document.getElementById( "chatContactName" ).textContent;
                    openChat( msg.data.phone_number, currentName );
                }
            }
        } catch ( e ) {
            console.error( e );
        }
    };

    ws.onclose = () => {
        console.log( "WebSocket disconnected. Reconnecting in 3s..." );
        if ( statusDot ) {
            statusDot.style.background = 'var(--red)';
            statusDot.style.boxShadow = '0 0 10px var(--red)';
        }
        if ( timerText ) timerText.innerHTML = '<i class="ri-error-warning-line"></i> Reconnecting...';
        setTimeout( setupWebSocket, 3000 );
    };
}

// Init
setupWebSocket();
// Polling fallback: refresh conversation list every 15s (handles multi-pod WebSocket gaps)
setInterval( loadAllData, 15000 );
