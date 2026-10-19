// Base URL of the backend API.
// Local development: Express on port 3000. Production: the Render service (ADR 7).
// TODO: replace the production URL with the real one after creating the Render service.
const PRODUCTION_API_URL = 'https://unimentor-api.onrender.com/api';
const LOCAL_API_URL = 'http://localhost:3000/api';

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE_URL = isLocal ? LOCAL_API_URL : PRODUCTION_API_URL;

// Page shown when the session cookie is missing or expired (CU-11, A1).
export const LOGIN_PAGE = '/login.html';
