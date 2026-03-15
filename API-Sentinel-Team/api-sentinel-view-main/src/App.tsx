import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import Login from "./pages/Login";
import AccessRestricted from "./pages/AccessRestricted";
import NotFound from "./pages/NotFound";
import CustomerLayout from "./customer/layouts/CustomerLayout";
import Organization from "./customer/pages/organization/Organization";
import Dashboard from "./customer/pages/dashboard/Dashboard";
import DiscoveryLayout from "./customer/pages/discovery/DiscoveryLayout";
import ApiCatalogue from "./customer/pages/discovery/ApiCatalogue";
import ParameterCatalogue from "./customer/pages/discovery/ParameterCatalogue";
import ApiGovernance from "./customer/pages/discovery/ApiGovernance";
import ApiSequenceFlow from "./customer/pages/discovery/ApiSequenceFlow";
import ApiTree from "./customer/pages/discovery/ApiTree";
import TestingLayout from "./customer/pages/testing/TestingLayout";
import Vulnerabilities from "./customer/pages/testing/Vulnerabilities";
import TestDashboard from "./customer/pages/testing/TestDashboard";
import TestConfiguration from "./customer/pages/testing/TestConfiguration";
import TestInspector from "./customer/pages/testing/TestInspector";
import ProtectionLayout from "./customer/pages/protection/ProtectionLayout";
import SecurityEvents from "./customer/pages/protection/SecurityEvents";
import ThreatActors from "./customer/pages/protection/ThreatActors";
import EnforcementHistory from "./customer/pages/protection/EnforcementHistory";
import PolicyConfiguration from "./customer/pages/protection/PolicyConfiguration";
import ProtectionSettings from "./customer/pages/protection/ProtectionSettings";
import Reports from "./customer/pages/reports/Reports";
import ThreatIntelligence from "./customer/pages/intelligence/ThreatIntelligence";
import LiveFeed from "./customer/pages/live/LiveFeed";
import AlertCenter from "./customer/pages/alerts/AlertCenter";
import BlockList from "./customer/pages/protection/BlockList";

import SettingsPage from "./admin/pages/settings/SettingsPage";
import UserManagement from "./admin/pages/settings/UserManagement";
import AuditLogs from "./admin/pages/settings/AuditLogs";
import AddApplication from "./admin/pages/settings/AddApplication";
import SystemHealthLayout from "./admin/pages/system-health/SystemHealthLayout";
import ControllerHealth from "./admin/pages/system-health/ControllerHealth";
import SensorHealth from "./admin/pages/system-health/SensorHealth";
import EnforcerHealth from "./admin/pages/system-health/EnforcerHealth";
import OperationsDashboard from "./admin/pages/operations/OperationsDashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 5_000,
      refetchIntervalInBackground: true,
      staleTime: 5_000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/access-restricted" element={<AccessRestricted />} />

              {/* Customer Portal - Protected */}
              <Route element={<ProtectedRoute><CustomerLayout /></ProtectedRoute>}>
                <Route path="/organization" element={<Organization />} />
                <Route path="/dashboard" element={<Dashboard />} />

                <Route path="/discovery" element={<DiscoveryLayout />}>
                  <Route index element={<ApiCatalogue />} />
                  <Route path="parameters" element={<ParameterCatalogue />} />
                  <Route path="governance" element={<ApiGovernance />} />
                  <Route path="sequence" element={<ApiSequenceFlow />} />
                  <Route path="tree" element={<ApiTree />} />
                </Route>

                <Route path="/testing" element={<TestingLayout />}>
                  <Route index element={<Vulnerabilities />} />
                  <Route path="dashboard" element={<TestDashboard />} />
                  <Route path="configuration" element={<TestConfiguration />} />
                  <Route path="inspector" element={<TestInspector />} />
                </Route>

                <Route path="/protection" element={<ProtectionLayout />}>
                  <Route index element={<SecurityEvents />} />
                  <Route path="threats" element={<ThreatActors />} />
                  <Route path="enforcement" element={<EnforcementHistory />} />
                  <Route path="policy" element={<PolicyConfiguration />} />
                  <Route path="settings" element={<ProtectionSettings />} />
                </Route>

                <Route path="/reports" element={<Reports />} />
                <Route path="/intelligence" element={<ThreatIntelligence />} />
                <Route path="/live" element={<LiveFeed />} />
                <Route path="/alerts" element={<AlertCenter />} />
                <Route path="/blocklist" element={<BlockList />} />
                <Route path="/operations" element={<OperationsDashboard />} />
                <Route path="/add-application" element={<AddApplication />} />

                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/users" element={<UserManagement />} />
                <Route path="/settings/audit-logs" element={<AuditLogs />} />
                <Route path="/system-health" element={<SystemHealthLayout />}>
                  <Route index element={<ControllerHealth />} />
                  <Route path="controllers" element={<ControllerHealth />} />
                  <Route path="sensors" element={<SensorHealth />} />
                  <Route path="enforcers" element={<EnforcerHealth />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
