import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../../components/layout/Sidebar';
import { TopBar } from '../../components/layout/TopBar';

const CustomerLayout: React.FC = () => {
  return (
    <div className="flex flex-row min-h-screen w-full overflow-hidden bg-bg-base text-text-primary">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <TopBar />
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default CustomerLayout;
