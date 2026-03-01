import React from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import MobileNav from './MobileNav';

const Layout = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Navigation Bar - Desktop */}
      <TopBar />

      {/* Main Content */}
      <main className="min-h-screen pt-24 pb-20 md:pb-8">
        <div className="px-6 md:px-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile Navigation - Bottom */}
      <MobileNav />
    </div>
  );
};

export default Layout;
