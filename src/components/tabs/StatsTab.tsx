import React, { useState } from 'react';

export default function StatsTab() {
  const [search, setSearch] = useState('');
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Stats</h2>
      <input
        type="text"
        placeholder="Search..."
        className="w-full md:w-64 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        value={search}
        onChange={(e)=>setSearch(e.target.value)}
      />
    </div>
  );
} 