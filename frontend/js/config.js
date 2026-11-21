// Base URL of the backend API.
// Local development: Express on port 3000.
// Production: the same site. vercel.json forwards /api/* to the Render service (ADR 7), so
// the browser only talks to the Vercel domain and the session cookie is first-party.
// With the API on another site, browsers that block third-party cookies (Safari, private
// windows) dropped the cookie and every page after the login went back to login.html.
const PRODUCTION_API_URL = '/api';
const LOCAL_API_URL = 'http://localhost:3000/api';

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE_URL = isLocal ? LOCAL_API_URL : PRODUCTION_API_URL;

// Page shown when the session cookie is missing or expired (CU-11, A1).
export const LOGIN_PAGE = '/login.html';
