// Admin Dashboard State
let appointmentsData = [];
let smsLogsData = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadDashboardData();

    // Refresh data every 30 seconds
    setInterval(loadDashboardData, 30000);
});

// Tab switching
function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}Tab`).classList.add('active');
        });
    });
}

// Load all dashboard data
async function loadDashboardData() {
    await Promise.all([
        loadAppointments(),
        loadSMSLogs(),
        loadStats()
    ]);
}

// Load appointments
async function loadAppointments() {
    try {
        const response = await fetch('/api/appointments/clinic/1?limit=50');
        const data = await response.json();

        if (data.success) {
            appointmentsData = data.appointments;
            renderAppointmentsTable();
        }
    } catch (error) {
        console.error('Error loading appointments:', error);
    }
}

// Render appointments table
function renderAppointmentsTable() {
    const tbody = document.getElementById('appointmentsTableBody');

    if (appointmentsData.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--gray-500);">
          No upcoming appointments
        </td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = appointmentsData.map(apt => {
        const datetime = new Date(apt.appointment_datetime);
        const rowClass = apt.emergency_flag ? 'emergency-row' : '';

        return `
      <tr class="${rowClass}">
        <td>#${apt.id}</td>
        <td>
          ${apt.patient_name}
          ${apt.emergency_flag ? '<span class="badge badge-emergency" style="margin-left: 0.5rem;">URGENT</span>' : ''}
        </td>
        <td>${apt.type_name}</td>
        <td>${datetime.toLocaleString()}</td>
        <td>${getStatusBadge(apt.status, apt.confirmation_status)}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.875rem;" onclick="viewAppointment(${apt.id})">
            View
          </button>
          ${apt.status === 'pending' ? `
            <button class="btn btn-success" style="padding: 0.5rem 1rem; font-size: 0.875rem; margin-left: 0.5rem;" onclick="markAsConfirmed(${apt.id})">
              Confirm
            </button>
          ` : ''}
        </td>
      </tr>
    `;
    }).join('');
}

// Get status badge HTML
function getStatusBadge(status, confirmationStatus) {
    const badges = {
        pending: `<span class="badge badge-pending">Pending</span>`,
        confirmed: `<span class="badge badge-confirmed">Confirmed</span>`,
        completed: `<span class="badge" style="background: var(--primary);">Completed</span>`,
        'no-show': `<span class="badge badge-noshow">No-Show</span>`,
        cancelled: `<span class="badge badge-cancelled">Cancelled</span>`
    };

    return badges[status] || status;
}

// View appointment details
async function viewAppointment(appointmentId) {
    try {
        const response = await fetch(`/api/appointments/${appointmentId}`);
        const data = await response.json();

        if (data.success) {
            const apt = data.appointment;
            const datetime = new Date(apt.appointment_datetime);

            let triageData = {};
            try {
                triageData = JSON.parse(apt.triage_data);
            } catch (e) {
                triageData = {};
            }

            const detailsHtml = `
        <div style="line-height: 1.8;">
          <p><strong>Appointment ID:</strong> #${apt.id}</p>
          <p><strong>Patient:</strong> ${apt.patient_name}</p>
          <p><strong>Email:</strong> ${apt.email}</p>
          <p><strong>Phone:</strong> ${apt.phone}</p>
          <p><strong>Type:</strong> ${apt.type_name} (${apt.category})</p>
          <p><strong>Date & Time:</strong> ${datetime.toLocaleString()}</p>
          <p><strong>Duration:</strong> ${apt.duration_mins} minutes</p>
          <p><strong>Status:</strong> ${getStatusBadge(apt.status)}</p>
          ${apt.deposit_amount > 0 ? `<p><strong>Deposit:</strong> $${apt.deposit_amount}</p>` : ''}
          ${apt.emergency_flag ? '<p style="color: var(--danger);"><strong>⚠️ EMERGENCY FLAG</strong></p>' : ''}
          
          <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid var(--gray-200);">
          
          <h4 style="margin-bottom: 0.5rem;">Triage Information</h4>
          ${triageData.symptoms ? `<p><strong>Symptoms:</strong> ${triageData.symptoms}</p>` : ''}
          ${apt.photo_url ? `
            <div style="margin-top: 1rem;">
              <strong>Patient Photo:</strong><br>
              <img src="${apt.photo_url}" style="max-width: 100%; border-radius: var(--radius-md); margin-top: 0.5rem;">
            </div>
          ` : ''}
        </div>
        
        <div style="margin-top: 2rem; display: flex; gap: 0.5rem;">
          ${apt.status === 'confirmed' ? `
            <button class="btn btn-success" onclick="markAsCompleted(${apt.id})">Mark as Completed</button>
            <button class="btn btn-danger" onclick="markAsNoShow(${apt.id})">Mark as No-Show</button>
          ` : ''}
          <button class="btn btn-secondary" onclick="closeModal('appointmentModal')">Close</button>
        </div>
      `;

            document.getElementById('appointmentDetails').innerHTML = detailsHtml;
            document.getElementById('appointmentModal').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading appointment:', error);
        alert('Error loading appointment details');
    }
}

// Load SMS logs
async function loadSMSLogs() {
    try {
        const response = await fetch('/api/sms/logs?limit=20');
        const data = await response.json();

        if (data.success) {
            smsLogsData = data.logs;
            renderSMSLogs();
        }
    } catch (error) {
        console.error('Error loading SMS logs:', error);
    }
}

// Render SMS logs
function renderSMSLogs() {
    const container = document.getElementById('smsLogContainer');

    if (smsLogsData.length === 0) {
        container.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 2rem;">No SMS messages yet</p>';
        return;
    }

    container.innerHTML = smsLogsData.map(sms => {
        const sentTime = new Date(sms.sent_at).toLocaleString();
        const hasResponse = sms.response !== null;

        return `
      <div class="sms-log-item ${hasResponse ? 'response' : 'sent'}">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <strong>${sms.recipient_phone}</strong>
          <span style="font-size: 0.875rem;">${sentTime}</span>
        </div>
        <div style="margin-bottom: 0.5rem;">
          <span class="badge" style="background: var(--gray-700);">${sms.type}</span>
          ${sms.appointment_id ? `<span style="margin-left: 0.5rem; font-size: 0.875rem;">Apt #${sms.appointment_id}</span>` : ''}
        </div>
        <p style="margin: 0.5rem 0; font-size: 0.875rem;">${sms.message}</p>
        ${hasResponse ? `
          <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.3);">
            <strong>Response:</strong> ${sms.response} (${new Date(sms.responded_at).toLocaleString()})
          </div>
        ` : `
          <button class="btn btn-primary" style="margin-top: 0.5rem; padding: 0.5rem 1rem; font-size: 0.875rem;" onclick="respondToSMS(${sms.id}, ${sms.appointment_id})">
            Simulate Response
          </button>
        `}
      </div>
    `;
    }).join('');
}

// Respond to SMS
function respondToSMS(smsId, appointmentId) {
    const modalContent = `
    <div>
      <p style="margin-bottom: 1.5rem;">Simulate a patient response to this SMS confirmation:</p>
      
      <div style="display: flex; gap: 1rem;">
        <button class="btn btn-success btn-lg" style="flex: 1;" onclick="sendSMSResponse(${smsId}, ${appointmentId}, 'YES')">
          ✓ YES (Confirm)
        </button>
        <button class="btn btn-danger btn-lg" style="flex: 1;" onclick="sendSMSResponse(${smsId}, ${appointmentId}, 'NO')">
          ✗ NO (Cancel)
        </button>
      </div>
      
      <button class="btn btn-secondary" style="margin-top: 1rem; width: 100%;" onclick="closeModal('smsModal')">
        Close
      </button>
    </div>
  `;

    document.getElementById('smsModalContent').innerHTML = modalContent;
    document.getElementById('smsModal').classList.add('active');
}

// Send SMS response
async function sendSMSResponse(smsId, appointmentId, response) {
    try {
        // Log the SMS response
        await fetch(`/api/sms/${smsId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response })
        });

        // Process confirmation
        if (appointmentId) {
            await fetch(`/api/confirmations/${appointmentId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response })
            });
        }

        closeModal('smsModal');

        // Reload data
        await loadDashboardData();

        alert(`Response "${response}" processed successfully!`);
    } catch (error) {
        console.error('Error sending response:', error);
        alert('Error processing response');
    }
}

// Load stats
async function loadStats() {
    const todayTotal = appointmentsData.length;
    const pending = appointmentsData.filter(a => a.status === 'pending').length;
    const confirmed = appointmentsData.filter(a => a.status === 'confirmed').length;
    const emergency = appointmentsData.filter(a => a.emergency_flag === 1).length;

    document.getElementById('statTodayTotal').textContent = todayTotal;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statConfirmed').textContent = confirmed;
    document.getElementById('statEmergency').textContent = emergency;
}

// Mark appointment as confirmed
async function markAsConfirmed(appointmentId) {
    try {
        await fetch(`/api/appointments/${appointmentId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'confirmed' })
        });

        await loadDashboardData();
        alert('Appointment confirmed!');
    } catch (error) {
        console.error('Error confirming appointment:', error);
        alert('Error confirming appointment');
    }
}

// Mark as completed
async function markAsCompleted(appointmentId) {
    if (confirm('Mark this appointment as completed?')) {
        try {
            await fetch(`/api/appointments/${appointmentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed' })
            });

            closeModal('appointmentModal');
            await loadDashboardData();
            alert('Appointment marked as completed!');
        } catch (error) {
            console.error('Error:', error);
            alert('Error updating appointment');
        }
    }
}

// Mark as no-show
async function markAsNoShow(appointmentId) {
    if (confirm('Mark this appointment as no-show? Deposit will be charged if applicable.')) {
        try {
            await fetch(`/api/appointments/${appointmentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'no-show' })
            });

            // Charge deposit if needed
            await fetch(`/api/payments/${appointmentId}/charge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'no-show' })
            });

            closeModal('appointmentModal');
            await loadDashboardData();
            alert('Appointment marked as no-show. Deposit charged if applicable.');
        } catch (error) {
            console.error('Error:', error);
            alert('Error updating appointment');
        }
    }
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal on background click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
