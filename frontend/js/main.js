// Landing page: checks the frontend -> API -> database integration through api.js.
import { api } from './api.js';

function setBadge(element, ok, text) {
  element.textContent = text;
  element.className = `badge ${ok ? 'badge-success' : 'badge-danger'}`;
}

async function checkStatus() {
  const apiStatus = document.getElementById('api-status');
  const dbStatus = document.getElementById('db-status');

  try {
    await api.get('/health');
    setBadge(apiStatus, true, 'online');
  } catch (err) {
    setBadge(apiStatus, false, err.message);
    setBadge(dbStatus, false, 'unknown');
    return;
  }

  try {
    await api.get('/health/db');
    setBadge(dbStatus, true, 'online');
  } catch (err) {
    setBadge(dbStatus, false, err.message);
  }
}

checkStatus();
