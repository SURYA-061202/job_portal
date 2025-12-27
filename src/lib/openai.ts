import OpenAI from 'openai';

/**
 * Reads the OpenAI API key from the environment. In Vite you can expose it as
 * VITE_OPENAI_API_KEY; in a Node-only context use OPENAI_API_KEY.
 */
const apiKey =
  import.meta.env?.VITE_OPENAI_API_KEY ||
  (typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : '') ||
  '';

const openai = new OpenAI({
  apiKey,
  dangerouslyAllowBrowser: true,
});

export default openai; 