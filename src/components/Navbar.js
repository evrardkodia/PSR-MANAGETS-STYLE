import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="bg-gray-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <div className="flex space-x-4">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                'px-3 py-2 rounded-md text-sm font-medium ' +
                (isActive ? 'bg-gray-700' : 'hover:bg-gray-700')
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/upload-beat"
              className={({ isActive }) =>
                'px-3 py-2 rounded-md text-sm font-medium ' +
                (isActive ? 'bg-gray-700' : 'hover:bg-gray-700')
              }
            >
              Upload Beat
            </NavLink>
            <NavLink
              to="/manage-beats"
              className={({ isActive }) =>
                'px-3 py-2 rounded-md text-sm font-medium ' +
                (isActive ? 'bg-gray-700' : 'hover:bg-gray-700')
              }
            >
              Manage Beats
            </NavLink>
            <NavLink
              to="/sty-player"
              className={({ isActive }) =>
                'px-3 py-2 rounded-md text-sm font-medium ' +
                (isActive ? 'bg-gray-700' : 'hover:bg-gray-700')
              }
            >
              Player Desktop
            </NavLink>
            <NavLink
              to="/sty-player-sm"
              className={({ isActive }) =>
                'px-3 py-2 rounded-md text-sm font-medium ' +
                (isActive ? 'bg-gray-700' : 'hover:bg-gray-700')
              }
            >
              Player Mobile
            </NavLink>
            <NavLink
              to="/auth"
              className={({ isActive }) =>
                'px-3 py-2 rounded-md text-sm font-medium ' +
                (isActive ? 'bg-gray-700' : 'hover:bg-gray-700')
              }
            >
              Auth
            </NavLink>
          </div>
        </div>
      </div>
    </nav>
  );
}
