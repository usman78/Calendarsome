// Settings management logic
let currentSettings = {};
let originalStateString = '';

document.addEventListener('DOMContentLoaded', () => {
    // Check Auth
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Initialize UI
    if (window.lucide) lucide.createIcons();
    setupNavigation();
    loadSettings();

    // Warn on close
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});

function hasUnsavedChanges() {
    // Collect current state
    const currentState = {
        branding: {
            ...currentSettings.branding,
            clinicName: document.getElementById('clinicName').value,
            contactEmail: document.getElementById('clinicEmail').value,
            primaryColor: document.getElementById('primaryColor').value,
            welcomeMessage: document.getElementById('welcomeMessage').value
        },
        business_rules: {
            ...currentSettings.business_rules,
            allowSameDay: document.getElementById('allowSameDay').checked,
            minNoticeHours: parseInt(document.getElementById('minNoticeHours').value) || 0,
            maxBookingDays: parseInt(document.getElementById('maxBookingDays').value) || 90,

            // New Rules
            confirmationWindowHours: parseInt(document.getElementById('confirmationWindowHours')?.value) || 72,
            autoCancelHours: parseInt(document.getElementById('autoCancelHours')?.value) || 48,
            waitlistTimeoutMinutes: parseInt(document.getElementById('waitlistTimeoutMinutes')?.value) || 30,
            trackNoShows: document.getElementById('trackNoShows')?.checked || false
        },
        operating_hours: getOperatingHoursFromUI()
    };

    return JSON.stringify(currentState) !== originalStateString;
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (hasUnsavedChanges()) {
                if (!confirm('You have unsaved changes. Discard them?')) {
                    return;
                }
                // Reset to saved state if they discard
                populateUI(currentSettings);
            }

            // Update Nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Update Section
            const sectionId = item.dataset.section;
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
        });
    });

    // Color picker sync
    const colorPicker = document.getElementById('primaryColor');
    const colorText = document.getElementById('primaryColorText');

    if (colorPicker && colorText) {
        colorPicker.addEventListener('input', (e) => colorText.value = e.target.value);
        colorText.addEventListener('input', (e) => colorPicker.value = e.target.value);
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.success) {
            currentSettings = data.settings;
            // Ensure objects exist
            if (!currentSettings.business_rules) currentSettings.business_rules = {};
            if (!currentSettings.operating_hours) currentSettings.operating_hours = {};

            populateUI(currentSettings);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        alert('Failed to load settings');
    }
}

function populateUI(settings) {
    // Branding
    if (settings.branding) {
        document.getElementById('clinicName').value = settings.branding.clinicName || '';
        document.getElementById('clinicEmail').value = settings.branding.contactEmail || '';
        document.getElementById('primaryColor').value = settings.branding.primaryColor || '#0ea5e9';
        document.getElementById('primaryColorText').value = settings.branding.primaryColor || '#0ea5e9';
        document.getElementById('welcomeMessage').value = settings.branding.welcomeMessage || '';
    }

    // Business Rules
    const rules = settings.business_rules || {};
    document.getElementById('allowSameDay').checked = !!rules.allowSameDay;
    document.getElementById('minNoticeHours').value = rules.minNoticeHours || 0;
    document.getElementById('maxBookingDays').value = rules.maxBookingDays || 90;

    // New Rules fields (check if elements exist first, as HTML might not be updated yet)
    if (document.getElementById('confirmationWindowHours')) {
        document.getElementById('confirmationWindowHours').value = rules.confirmationWindowHours || 72;
        document.getElementById('autoCancelHours').value = rules.autoCancelHours || 48;
        document.getElementById('waitlistTimeoutMinutes').value = rules.waitlistTimeoutMinutes || 30;
        document.getElementById('trackNoShows').checked = !!rules.trackNoShows;
    }

    // Operating Hours
    if (settings.operating_hours) {
        renderOperatingHours(settings.operating_hours);
    }

    // Capture state for unsaved check
    // We construct the full object that saveSettings would produce
    const state = {
        branding: {
            ...settings.branding,
            clinicName: document.getElementById('clinicName').value,
            contactEmail: document.getElementById('clinicEmail').value,
            primaryColor: document.getElementById('primaryColor').value,
            welcomeMessage: document.getElementById('welcomeMessage').value
        },
        business_rules: {
            ...rules,
            allowSameDay: document.getElementById('allowSameDay').checked,
            minNoticeHours: parseInt(document.getElementById('minNoticeHours').value) || 0,
            maxBookingDays: parseInt(document.getElementById('maxBookingDays').value) || 90,
            // New Rules
            confirmationWindowHours: parseInt(document.getElementById('confirmationWindowHours')?.value) || 72,
            autoCancelHours: parseInt(document.getElementById('autoCancelHours')?.value) || 48,
            waitlistTimeoutMinutes: parseInt(document.getElementById('waitlistTimeoutMinutes')?.value) || 30,
            trackNoShows: document.getElementById('trackNoShows')?.checked || false
        },
        operating_hours: getOperatingHoursFromUI() // This function reads from DOM, so need to run render first (done above)
    };

    originalStateString = JSON.stringify(state);
}

function renderOperatingHours(hours) {
    // Handle Global Lunch Break
    if (document.getElementById('lunchBreakActive')) {
        const lunch = hours.lunchBreak || { active: false, start: '12:00', end: '13:00' };
        document.getElementById('lunchBreakActive').checked = lunch.active;
        document.getElementById('lunchStart').value = lunch.start;
        document.getElementById('lunchEnd').value = lunch.end;
        document.getElementById('lunchStart').disabled = !lunch.active;
        document.getElementById('lunchEnd').disabled = !lunch.active;

        document.getElementById('lunchBreakActive').addEventListener('change', (e) => {
            document.getElementById('lunchStart').disabled = !e.target.checked;
            document.getElementById('lunchEnd').disabled = !e.target.checked;
        });
    }

    const container = document.getElementById('hoursContainer');
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    container.innerHTML = days.map(day => {
        const dayConfig = hours[day] || { active: false, start: '09:00', end: '17:00' };

        return `
            <div class="hour-row">
                <div style="width: 100px; text-transform: capitalize; font-weight: 500;">${day}</div>
                <label class="toggle-switch">
                    <input type="checkbox" class="day-active" data-day="${day}" ${dayConfig.active ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <div class="flex gap-1 items-center" style="opacity: ${dayConfig.active ? 1 : 0.5}">
                    <input type="time" class="form-input day-start" data-day="${day}" value="${dayConfig.start}" ${!dayConfig.active ? 'disabled' : ''}>
                    <span>to</span>
                    <input type="time" class="form-input day-end" data-day="${day}" value="${dayConfig.end}" ${!dayConfig.active ? 'disabled' : ''}>
                </div>
            </div>
        `;
    }).join('');

    // Add listeners for open/close toggle
    container.querySelectorAll('.day-active').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const day = e.target.dataset.day;
            const inputs = container.querySelectorAll(`input[data-day="${day}"][type="time"]`);
            inputs.forEach(input => input.disabled = !e.target.checked);
            e.target.parentElement.nextElementSibling.style.opacity = e.target.checked ? 1 : 0.5;
        });
    });
}

async function saveSettings() {
    const token = localStorage.getItem('authToken');
    const updates = {
        branding: {
            ...currentSettings.branding,
            clinicName: document.getElementById('clinicName').value,
            contactEmail: document.getElementById('clinicEmail').value,
            primaryColor: document.getElementById('primaryColor').value,
            welcomeMessage: document.getElementById('welcomeMessage').value
        },
        business_rules: {
            ...currentSettings.business_rules,
            allowSameDay: document.getElementById('allowSameDay').checked,
            minNoticeHours: parseInt(document.getElementById('minNoticeHours').value) || 0,
            maxBookingDays: parseInt(document.getElementById('maxBookingDays').value) || 90,
            // New Rules
            confirmationWindowHours: parseInt(document.getElementById('confirmationWindowHours')?.value) || 72,
            autoCancelHours: parseInt(document.getElementById('autoCancelHours')?.value) || 48,
            waitlistTimeoutMinutes: parseInt(document.getElementById('waitlistTimeoutMinutes')?.value) || 30,
            trackNoShows: document.getElementById('trackNoShows')?.checked || false
        },
        operating_hours: getOperatingHoursFromUI()
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updates)
        });

        const data = await response.json();

        if (data.success) {
            alert('Settings saved successfully!');
            loadSettings(); // Reloads and resets the originalStateString
        } else {
            alert('Error saving settings: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Server error while saving');
    }
}

function getOperatingHoursFromUI() {
    const hours = { ...currentSettings.operating_hours };

    // Global Lunch
    if (document.getElementById('lunchBreakActive')) {
        hours.lunchBreak = {
            active: document.getElementById('lunchBreakActive').checked,
            start: document.getElementById('lunchStart').value,
            end: document.getElementById('lunchEnd').value
        };
    }

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    days.forEach(day => {
        const active = document.querySelector(`.day-active[data-day="${day}"]`).checked;
        const start = document.querySelector(`.day-start[data-day="${day}"]`).value;
        const end = document.querySelector(`.day-end[data-day="${day}"]`).value;

        hours[day] = { active, start, end };
    });

    return hours;
}
