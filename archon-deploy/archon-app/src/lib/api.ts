import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
    baseURL: `${API_BASE_URL}/api`,
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('archon_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const getStats = async () => {
    const { data } = await api.get('/dashboard/stats');
    return data;
};

export const createCheckoutSession = async (planId: string) => {
    const { data } = await api.post('/billing/checkout', { planId });
    return data.url;
};

export const getBillingStatus = async () => {
    const { data } = await api.get('/billing/status');
    return data;
};

export const createPortalSession = async () => {
    const { data } = await api.post('/billing/portal');
    return data.url;
};

export const cancelSubscription = async () => {
    const { data } = await api.post('/billing/cancel');
    return data;
};

export const reactivateSubscription = async () => {
    const { data } = await api.post('/billing/reactivate');
    return data;
};

// Repos
export const getRepos = async () => {
    const { data } = await api.get('/repos');
    return data.repos;
};

export const updateRepoSettings = async (repoId: string, settings: any) => {
    const { data } = await api.put(`/repos/${repoId}/settings`, settings);
    return data;
};

// Events
export const getEventLogs = async (limit = 50, offset = 0) => {
    const { data } = await api.get(`/events/logs?limit=${limit}&offset=${offset}`);
    return data.logs;
};

export const getReviews = async (limit = 50, offset = 0) => {
    const { data } = await api.get(`/events/reviews?limit=${limit}&offset=${offset}`);
    return data.reviews;
};

export const getReviewDetail = async (id: string) => {
    const { data } = await api.get(`/events/reviews/${id}`);
    return data.review;
};

// Coaching
export const getTeamReport = async () => {
    const { data } = await api.get('/coaching/team-report');
    return data.report;
};

export const getDevelopers = async () => {
    const { data } = await api.get('/coaching/developers');
    return data.developers;
};

export const getDeveloperDetail = async (login: string) => {
    const { data } = await api.get(`/coaching/developers/${login}`);
    return data;
};

// Team Management
export const getTeamMembers = async () => {
    const { data } = await api.get('/team/members');
    return data.members;
};

export const inviteTeamMember = async (githubLogin: string, email?: string) => {
    const { data } = await api.post('/team/invite', { githubLogin, email });
    return data;
};

export const updateMemberRole = async (memberId: string, role: string) => {
    const { data } = await api.put(`/team/members/${memberId}/role`, { role });
    return data;
};

export const removeMember = async (memberId: string) => {
    const { data } = await api.delete(`/team/members/${memberId}`);
    return data;
};

// Integration Webhooks
export const getWebhooks = async () => {
    const { data } = await api.get('/webhooks');
    return data.webhooks;
};

export const createWebhook = async (url: string, events: string[], secret?: string) => {
    const { data } = await api.post('/webhooks', { url, events, secret });
    return data.webhook;
};

export const updateWebhook = async (id: string, updates: { url?: string; events?: string[]; secret?: string; isActive?: boolean }) => {
    const { data } = await api.put(`/webhooks/${id}`, updates);
    return data.webhook;
};

export const deleteWebhook = async (id: string) => {
    const { data } = await api.delete(`/webhooks/${id}`);
    return data;
};

export const testWebhook = async (id: string) => {
    const { data } = await api.post(`/webhooks/${id}/test`);
    return data;
};

export const getWebhookDeliveries = async (id: string) => {
    const { data } = await api.get(`/webhooks/${id}/deliveries`);
    return data.deliveries;
};

export const retryWebhookDelivery = async (webhookId: string, deliveryId: string) => {
    const { data } = await api.post(`/webhooks/${webhookId}/deliveries/${deliveryId}/retry`);
    return data;
};

// Tasks
export const getTasks = async (limit = 50, offset = 0, status?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set('status', status);
    const { data } = await api.get(`/tasks?${params}`);
    return data.tasks;
};

export const getTaskDetail = async (id: string) => {
    const { data } = await api.get(`/tasks/${id}`);
    return data.task;
};

// Admin Overview (aggregated dashboard data)
export const getAdminOverview = async () => {
    const { data } = await api.get('/admin/overview');
    return data;
};

// Analytics
export const getAnalyticsReviews = async (days = 30) => {
    const { data } = await api.get(`/analytics/reviews?days=${days}`);
    return data;
};

export const getAnalyticsQuality = async () => {
    const { data } = await api.get('/analytics/quality');
    return data;
};

export const getAnalyticsDevelopers = async () => {
    const { data } = await api.get('/analytics/developers');
    return data;
};

export const getAnalyticsCosts = async (days = 30) => {
    const { data } = await api.get(`/analytics/costs?days=${days}`);
    return data;
};

export const getAnalyticsRepos = async (days = 30) => {
    const { data } = await api.get(`/analytics/repos?days=${days}`);
    return data;
};

// Reports
export const getReports = async (params?: { repo?: string; type?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.repo) qs.set('repo', params.repo)
    if (params?.type) qs.set('type', params.type)
    if (params?.limit) qs.set('limit', String(params.limit))
    const { data } = await api.get(`/reports?${qs.toString()}`)
    return data
}

export const getReport = async (id: string) => {
    const { data } = await api.get(`/reports/${id}`)
    return data
}

export const runReport = async (payload: { repoId: string; action: string; issueNumber?: number }) => {
    const { data } = await api.post('/reports/run', payload)
    return data
}

export const downloadReport = async (id: string): Promise<string> => {
    const token = localStorage.getItem('archon_token')
    const response = await fetch(`${API_BASE_URL}/api/reports/${id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error('Download failed')
    return response.text()
}

export const getReportTasks = async () => {
    const { data } = await api.get('/reports/tasks')
    return data
}

export default api;
