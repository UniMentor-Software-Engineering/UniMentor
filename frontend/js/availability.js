// Tutor's availability calendar.
// CU-04: select free hours on the weekly grid, "Publish Slots" -> 60-minute AVAILABLE slots
//        (A1: overlapping or past hours are skipped and the tutor is told which ones).
// CU-05: click an available (green) slot, confirm "Delete Slot" -> the slot is blocked
//        (A1: if a student booked it meanwhile the API answers 409 and the grid refreshes).
// Every text from the API is written with textContent (NFR-02, XSS).
import { api } from './api.js';
import { currentUser, homeFor, logout, renderNav, showToast } from './session.js';
import { addDays, dayKey, el, sessionLabel, shortDayFormat, startOfWeek, timeFormat } from './dates.js';

const FIRST_HOUR = 7; // first row: 07:00-08:00
const LAST_HOUR = 22; // last row: 21:00-22:00
const DAYS = 7;

const grid = document.getElementById('week-grid');
const weekTitle = document.getElementById('week-title');
const selectionStatus = document.getElementById('selection-status');
const publishButton = document.getElementById('publish');
const clearButton = document.getElementById('clear-selection');

const dialog = document.getElementById('delete-dialog');
const deleteForm = document.getElementById('delete-form');
const deleteSummary = document.getElementById('delete-summary');
const deleteError = document.getElementById('delete-error');
const confirmDelete = document.getElementById('confirm-delete');

const state = {
  weekStart: startOfWeek(new Date()),
  slots: new Map(), // start ISO (ms) -> slot
  selected: new Set(), // start time in ms of selected free hours
  toDelete: null,
};

const weekRangeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function cellStart(dayIndex, hour) {
  const d = addDays(state.weekStart, dayIndex);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function slotText(slot) {
  if (slot.status === 'BOOKED') {
    return slot.student_first_name ? `Booked · ${slot.student_first_name}` : 'Booked';
  }
  if (slot.status === 'UNAVAILABLE') return 'Blocked';
  return 'Available';
}

function renderCell(start) {
  const ms = start.getTime();
  const slot = state.slots.get(ms);
  const button = el('button', undefined, 'cell');
  button.type = 'button';
  const label = `${shortDayFormat.format(start)} ${timeFormat.format(start)}`;

  if (slot) {
    button.classList.add(`cell-${slot.status.toLowerCase()}`);
    button.textContent = slotText(slot);
    button.setAttribute('aria-label', `${label}: ${slotText(slot)}`);
    const removable = slot.status === 'AVAILABLE' && ms > Date.now();
    button.disabled = !removable;
    if (removable) {
      button.title = 'Delete this slot';
      button.addEventListener('click', () => openDelete(slot));
    }
    return button;
  }

  // CU-04 business rule: no slots in the past.
  if (ms <= Date.now()) {
    button.classList.add('cell-past');
    button.disabled = true;
    button.setAttribute('aria-label', `${label}: past`);
    return button;
  }

  const isSelected = state.selected.has(ms);
  button.classList.toggle('cell-selected', isSelected);
  button.setAttribute('aria-pressed', String(isSelected));
  button.setAttribute('aria-label', `${label}: free`);
  if (isSelected) button.textContent = 'Selected';
  button.addEventListener('click', () => {
    if (state.selected.has(ms)) state.selected.delete(ms);
    else state.selected.add(ms);
    render();
  });
  return button;
}

function render() {
  const end = addDays(state.weekStart, DAYS - 1);
  weekTitle.textContent = `Week of ${weekRangeFormat.format(state.weekStart)} – ${weekRangeFormat.format(end)}`;

  const head = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', 'Time'));
  for (let day = 0; day < DAYS; day += 1) {
    const th = el('th', shortDayFormat.format(addDays(state.weekStart, day)));
    th.scope = 'col';
    if (dayKey(addDays(state.weekStart, day)) === dayKey(new Date())) th.classList.add('today');
    headRow.append(th);
  }
  head.append(headRow);

  const body = el('tbody');
  for (let hour = FIRST_HOUR; hour < LAST_HOUR; hour += 1) {
    const row = el('tr');
    const th = el('th', `${String(hour).padStart(2, '0')}:00`);
    th.scope = 'row';
    row.append(th);
    for (let day = 0; day < DAYS; day += 1) {
      const td = el('td');
      td.append(renderCell(cellStart(day, hour)));
      row.append(td);
    }
    body.append(row);
  }
  grid.replaceChildren(head, body);

  const count = state.selected.size;
  selectionStatus.textContent = count === 0
    ? 'No hours selected.'
    : `${count} hour${count === 1 ? '' : 's'} selected → ${count} slot${count === 1 ? '' : 's'} of 60 minutes.`;
  publishButton.disabled = count === 0;
  clearButton.disabled = count === 0;
}

async function loadWeek() {
  const from = state.weekStart.toISOString();
  const to = addDays(state.weekStart, DAYS).toISOString();
  try {
    const slots = await api.get(`/appointments/availability/me?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    state.slots = new Map(slots.map((slot) => [new Date(slot.start_time).getTime(), slot]));
  } catch (err) {
    state.slots = new Map();
    showToast(err.message, 'error');
  }
  render();
}

function goToWeek(weekStart) {
  state.weekStart = weekStart;
  loadWeek();
}

document.getElementById('prev-week').addEventListener('click', () => goToWeek(addDays(state.weekStart, -DAYS)));
document.getElementById('next-week').addEventListener('click', () => goToWeek(addDays(state.weekStart, DAYS)));
document.getElementById('this-week').addEventListener('click', () => goToWeek(startOfWeek(new Date())));
clearButton.addEventListener('click', () => {
  state.selected.clear();
  render();
});

// ---------- CU-04: publish ----------

// Consecutive selected hours become one interval; the backend splits it into 60-minute slots.
function selectedIntervals() {
  const hour = 3600000;
  const starts = [...state.selected].sort((a, b) => a - b);
  const intervals = [];
  starts.forEach((start) => {
    const last = intervals[intervals.length - 1];
    if (last && last.end === start) last.end = start + hour;
    else intervals.push({ start, end: start + hour });
  });
  return intervals;
}

const SKIP_REASONS = {
  OVERLAPPING_SLOT: 'overlaps an existing slot',
  PAST_SLOT: 'is in the past',
};

publishButton.addEventListener('click', async () => {
  publishButton.disabled = true;
  publishButton.textContent = 'Publishing…';
  let published = 0;
  const skipped = [];
  const errors = [];

  for (const interval of selectedIntervals()) {
    try {
      const result = await api.post('/appointments/availability', {
        startTime: new Date(interval.start).toISOString(),
        endTime: new Date(interval.end).toISOString(),
      });
      published += result.published.length;
      skipped.push(...result.skipped);
    } catch (err) {
      errors.push(err);
      if (err.code === 'TUTOR_NOT_ELIGIBLE') {
        document.getElementById('eligibility').hidden = false;
        break;
      }
    }
  }

  publishButton.textContent = 'Publish Slots';
  state.selected.clear();

  if (published > 0) showToast(`${published} slot${published === 1 ? '' : 's'} published.`);
  // A1: tell the tutor which segments were discarded.
  if (skipped.length > 0) {
    const detail = skipped
      .map((s) => `${sessionLabel(s.startTime, s.endTime)} ${SKIP_REASONS[s.reason] || 'was skipped'}`)
      .join('; ');
    showToast(`${skipped.length} hour${skipped.length === 1 ? ' was' : 's were'} skipped: ${detail}.`, 'error');
  }
  if (errors.length > 0) showToast(errors[0].message, 'error');

  loadWeek();
});

// ---------- CU-05: delete (block) ----------

function openDelete(slot) {
  state.toDelete = slot;
  deleteSummary.textContent = sessionLabel(slot.start_time, slot.end_time);
  deleteError.textContent = '';
  confirmDelete.disabled = false;
  dialog.showModal();
}

deleteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.toDelete) return;
  confirmDelete.disabled = true;
  try {
    await api.patch(`/appointments/availability/${encodeURIComponent(state.toDelete.id)}/block`);
    dialog.close();
    showToast('Slot removed. Students can no longer book it.');
  } catch (err) {
    // A1: booked meanwhile -> 409 with the message that points to "My Sessions".
    deleteError.textContent = err.message;
    if (err.code !== 'SLOT_ALREADY_BOOKED') confirmDelete.disabled = false;
  }
  // Step 5: the calendar updates immediately.
  loadWeek();
});

dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { state.toDelete = null; });

// On a phone only two or three days fit: start the scroller at today's column, not Monday.
function scrollToToday() {
  const scroller = document.querySelector('.week-scroll');
  const today = grid.querySelector('thead th.today');
  const timeColumn = grid.querySelector('thead th');
  if (!scroller || !today || scroller.scrollWidth <= scroller.clientWidth) return;
  scroller.scrollLeft = today.offsetLeft - timeColumn.offsetWidth;
}

// ---------- Start ----------

async function init() {
  const user = await currentUser();
  if (user.role !== 'TUTOR') {
    window.location.href = homeFor(user.role);
    return;
  }
  renderNav(user);
  document.getElementById('user-name').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('logout-button').addEventListener('click', logout);
  await loadWeek();
  scrollToToday();
}

init().catch((err) => showToast(err.message, 'error'));
