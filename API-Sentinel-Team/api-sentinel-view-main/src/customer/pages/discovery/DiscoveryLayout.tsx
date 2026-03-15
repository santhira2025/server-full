import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TabNav } from '@/components/layout/TabNav';

const DiscoveryLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split('/').filter(Boolean);
  // If we are at /discovery, segments is ["discovery"]. length is 1.
  // We want activeTab to be "" for index, or "parameters", etc.
  const activeTab = segments[1] || '';

  const tabs = [
    { key: '', label: 'API Catalogue' },
    { key: 'parameters', label: 'Parameter Catalogue' },
    { key: 'governance', label: 'API Governance' },
    { key: 'sequence', label: 'API Sequence Flow' },
    { key: 'tree', label: 'API Tree' },
  ];

  const handleTabChange = (key: string) => {
    navigate(key ? `/discovery/${key}` : '/discovery');
  };

  return (
    <div className="flex flex-col h-full animate-fade-in w-full">
      <div className="border-b border-border-subtle -mx-6 mb-6">
        <TabNav tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
      </div>

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
};

export default DiscoveryLayout;
