import OpenAI from 'openai';

/**
 * Reads the OpenAI API key from the environment. In Vite you can expose it as
 * VITE_OPENAI_API_KEY; in a Node-only context use OPENAI_API_KEY.
 */
const apiKey =
  import.meta.env?.VITE_OPENAI_API_KEY ||
  (typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : '') ||
  '';

console.log('[DEBUG] OpenAI Config Check:');
console.log('- VITE_OPENAI_API_KEY present:', !!import.meta.env?.VITE_OPENAI_API_KEY);
console.log('- Process Env present:', typeof process !== 'undefined' && !!process.env?.OPENAI_API_KEY);
console.log('- Final API Key length:', apiKey.length);

if (!apiKey) {
  console.error(
    'CRITICAL: Missing OpenAI API Key. Please set VITE_OPENAI_API_KEY in your .env file in the project root.'
  );
}

const openai = new OpenAI({
  apiKey,
  dangerouslyAllowBrowser: true,
});

export const isOpenAIConfigured = () => !!apiKey;

export default openai; 