'use client';

import { useState } from 'react';
import { testAllConnections } from '@/lib/test-connections';

export default function TestPage() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      const testResults = await testAllConnections();
      setResults(testResults);
    } catch (error: any) {
      console.error('Test failed:', error);
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Connection Test</h1>
          
          <button
            onClick={handleTest}
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test All Connections'}
          </button>

          {results && (
            <div className="mt-6 space-y-4">
              <h2 className="text-lg font-semibold">Results:</h2>
              
              {results.error ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-red-800">Error: {results.error}</p>
                </div>
              ) : (
                <>
                  <div className={`border rounded-md p-4 ${
                    results.firebase?.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <h3 className="font-medium">Firebase</h3>
                    <p className={results.firebase?.success ? 'text-green-800' : 'text-red-800'}>
                      {results.firebase?.message}
                    </p>
                  </div>

                  <div className={`border rounded-md p-4 ${
                    results.supabase?.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <h3 className="font-medium">Supabase</h3>
                    <p className={results.supabase?.success ? 'text-green-800' : 'text-red-800'}>
                      {results.supabase?.message}
                    </p>
                  </div>

                  <div className={`border rounded-md p-4 ${
                    results.openai?.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <h3 className="font-medium">OpenAI</h3>
                    <p className={results.openai?.success ? 'text-green-800' : 'text-red-800'}>
                      {results.openai?.message}
                    </p>
                  </div>

                  <div className={`border rounded-md p-4 ${
                    results.allSuccessful ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <h3 className="font-medium">Overall Status</h3>
                    <p className={results.allSuccessful ? 'text-green-800' : 'text-yellow-800'}>
                      {results.allSuccessful ? 'All connections successful!' : 'Some connections failed'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 