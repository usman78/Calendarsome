// Booking Wizard State
const bookingState = {
    currentStep: 1,
    clinicId: 1, // Default demo clinic
    patientStatus: '',
    category: null,
    appointmentTypeId: null,
    appointmentTypeName: null,
    symptoms: '',
    photoFile: null,
    photoUrl: null,
    appointmentDate: null,
    appointmentTime: null,
    patientName: '',
    patientEmail: '',
    patientPhone: '',
    insuranceFile: null,
    cardToken: 'mock_card_4242',
    emergencyFlag: false
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeStep1();
    initializeStep2();
    initializeStep3();
    initializeStep4();

    // Set minimum date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateInput = document.getElementById('appointmentDate');
    if (dateInput) {
        dateInput.min = tomorrow.toISOString().split('T')[0];
    }

    // Add Start Over Link
    const container = document.querySelector('.container-narrow');
    if (container) {
        const startOverDiv = document.createElement('div');
        startOverDiv.className = 'text-center mt-3';
        startOverDiv.innerHTML = `
            <a href="#" class="text-sm text-gray-400 hover:text-danger" onclick="if(confirm('Start over? Current details will be lost.')) window.location.reload(); return false;">
                Start Over
            </a>
        `;
        container.appendChild(startOverDiv);
    }

    // Initial icon render
    if (window.lucide) lucide.createIcons();
});

// Step 1: Service Selection (The Hook)
function initializeStep1() {
    const categories = document.querySelectorAll('#step1 .option-card');
    const typeSelect = document.getElementById('appointmentType');
    const nextBtn = document.getElementById('step1Next');
    const serviceSelectionDiv = document.getElementById('serviceSelection');

    categories.forEach(card => {
        card.addEventListener('click', async () => {
            categories.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            bookingState.category = card.dataset.value;

            // Show type selection and load types
            serviceSelectionDiv.style.display = 'block';
            await loadAppointmentTypes();

            checkStep1Validity();
        });
    });

    typeSelect.addEventListener('change', () => {
        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        bookingState.appointmentTypeId = selectedOption.value;
        bookingState.appointmentTypeName = selectedOption.text;
        checkStep1Validity();
    });

    function checkStep1Validity() {
        nextBtn.disabled = !(bookingState.category && bookingState.appointmentTypeId);
    }

    nextBtn.addEventListener('click', () => {
        if (bookingState.category && bookingState.appointmentTypeId) {
            goToStep(2);
        }
    });
}

// Step 2: Availability (The Sinker)
function initializeStep2() {
    const dateInput = document.getElementById('appointmentDate');
    const nextBtn = document.getElementById('step2Next');
    const backBtn = document.getElementById('step2Back');

    dateInput.addEventListener('change', async () => {
        bookingState.appointmentDate = dateInput.value;
        await loadAvailableSlots();
    });

    nextBtn.addEventListener('click', () => {
        // Prepare Step 3 based on category
        const medicalDetails = document.getElementById('medicalDetails');
        if (bookingState.category === 'medical') {
            medicalDetails.style.display = 'block';
        } else {
            medicalDetails.style.display = 'none';
        }
        goToStep(3);
    });

    backBtn.addEventListener('click', () => goToStep(1));
}

// Step 3: Commitment (The Details)
function initializeStep3() {
    const statusBtns = document.querySelectorAll('.status-btn');
    const patientName = document.getElementById('patientName');
    const patientEmail = document.getElementById('patientEmail');
    const patientPhone = document.getElementById('patientPhone');
    const symptomsText = document.getElementById('symptoms');
    const photoUploadArea = document.getElementById('photoUploadArea');
    const photoInput = document.getElementById('photoInput');
    const photoPreview = document.getElementById('photoPreview');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const nextBtn = document.getElementById('step3Next');
    const backBtn = document.getElementById('step3Back');

    statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            statusBtns.forEach(b => b.classList.remove('btn-primary'));
            statusBtns.forEach(b => b.classList.add('btn-outline'));
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-primary');
            bookingState.patientStatus = btn.dataset.value;
        });
    });

    // Photo upload same as before
    if (photoUploadArea) {
        photoUploadArea.addEventListener('click', () => photoInput.click());
    }

    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                bookingState.photoFile = file;
                const reader = new FileReader();
                reader.onload = (e) => {
                    photoPreview.src = e.target.result;
                    photoPreview.style.display = 'block';
                    uploadPrompt.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    symptomsText.addEventListener('input', () => {
        bookingState.symptoms = symptomsText.value;
        checkEmergencyKeywords();
    });

    nextBtn.addEventListener('click', () => {
        bookingState.patientName = patientName.value;
        bookingState.patientEmail = patientEmail.value;
        bookingState.patientPhone = patientPhone.value;

        if (validateStep3()) {
            showAppointmentSummary();
            goToStep(4);
        }
    });

    backBtn.addEventListener('click', () => goToStep(2));
}

// Step 4: Confirm (The Finish)
function initializeStep4() {
    const confirmBtn = document.getElementById('confirmBooking');
    const backBtn = document.getElementById('step4Back');

    confirmBtn.addEventListener('click', async () => {
        await submitBooking();
    });

    backBtn.addEventListener('click', () => goToStep(3));
}

// Helper Functions
function goToStep(stepNumber) {
    bookingState.currentStep = stepNumber;

    // Hide all steps
    document.querySelectorAll('.booking-step').forEach(step => {
        step.classList.remove('active');
    });

    // Show current step
    document.getElementById(`step${stepNumber}`).classList.add('active');

    // Update progress bar
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        const num = index + 1;
        if (num < stepNumber) {
            step.classList.add('completed');
            step.classList.remove('active');
        } else if (num === stepNumber) {
            step.classList.add('active');
            step.classList.remove('completed');
        } else {
            step.classList.remove('active', 'completed');
        }
    });

    // Initialize icons for new step
    if (window.lucide) lucide.createIcons();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadAppointmentTypes() {
    try {
        const response = await fetch(`/api/appointment-types/${bookingState.clinicId}/${bookingState.category}`);
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('appointmentType');
            select.innerHTML = '<option value="">Select a service...</option>';

            data.types.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.text = `${type.name} (${type.duration_mins} min)`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading appointment types:', error);
        showError('Error loading services. Please try again.');
    }
}

async function loadAvailableSlots() {
    try {
        showLoading(true);
        const response = await fetch(`/api/available-slots?clinicId=${bookingState.clinicId}&appointmentTypeId=${bookingState.appointmentTypeId}&date=${bookingState.appointmentDate}`);
        const data = await response.json();

        const timeSlotsContainer = document.getElementById('timeSlots');
        timeSlotsContainer.innerHTML = '';

        if (data.success && data.slots.length > 0) {
            data.slots.forEach(slot => {
                const slotDiv = document.createElement('div');
                slotDiv.className = 'time-slot';
                slotDiv.textContent = slot.display;
                slotDiv.dataset.datetime = slot.datetime;

                slotDiv.addEventListener('click', () => {
                    document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                    slotDiv.classList.add('selected');
                    bookingState.appointmentTime = slot.datetime;
                    document.getElementById('step2Next').disabled = false;
                });

                timeSlotsContainer.appendChild(slotDiv);
            });
        } else {
            timeSlotsContainer.innerHTML = '<p style="color: var(--gray-500); grid-column: 1/-1; text-align: center;">No slots found for this date.</p>';
        }
    } catch (error) {
        console.error('Error loading slots:', error);
        showError('Error loading available times.');
    } finally {
        showLoading(false);
    }
}

function validateStep3() {
    clearErrorMessages();
    let isValid = true;
    let firstError = null;

    // Helper to set invalid state
    const setInvalid = (id, message) => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('is-invalid');
            // Add shake animation
            el.style.animation = 'none';
            el.offsetHeight; /* trigger reflow */
            el.style.animation = 'shake 0.5s';
        }
        isValid = false;
        if (!firstError) firstError = message;
    };

    const setValid = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('is-invalid');
    };

    // Check Patient Status (No ID, so just global check)
    if (!bookingState.patientStatus) {
        if (!firstError) firstError = 'Please select if you are a new or existing patient.';
        isValid = false;
    }

    // Check Full Name
    if (!bookingState.patientName.trim()) {
        setInvalid('patientName', 'Please enter your full name.');
    } else {
        setValid('patientName');
    }

    // Check Email
    if (!bookingState.patientEmail.trim() || !bookingState.patientEmail.includes('@')) {
        setInvalid('patientEmail', 'Please enter a valid email address.');
    } else {
        setValid('patientEmail');
    }

    // Check Phone
    if (!bookingState.patientPhone.trim()) {
        setInvalid('patientPhone', 'Please enter your phone number.');
    } else {
        setValid('patientPhone');
    }

    // Check Symptoms (Medical only)
    if (bookingState.category === 'medical') {
        if (!bookingState.symptoms.trim()) {
            setInvalid('symptoms', 'Please describe your symptoms.');
        } else {
            setValid('symptoms');
        }
    }

    if (!isValid && firstError) {
        showError(firstError);
    }

    return isValid;
}

function checkEmergencyKeywords() {
    const emergencyKeywords = ['bleeding', 'rapidly growing', 'rapid growth', 'sudden', 'emergency', 'urgent', 'melanoma', 'black', 'severe pain'];
    const text = bookingState.symptoms.toLowerCase();
    bookingState.emergencyFlag = emergencyKeywords.some(keyword => text.includes(keyword));

    const alert = document.getElementById('emergencyAlert');
    if (alert) {
        alert.style.display = bookingState.emergencyFlag ? 'block' : 'none';
    }
}

function showAppointmentSummary() {
    const summaryDiv = document.getElementById('appointmentSummary');
    const appointmentDateTime = new Date(bookingState.appointmentTime);

    summaryDiv.innerHTML = `
    <div style="background: var(--gray-50); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--gray-200);">
      <div class="flex justify-between mb-2">
        <span class="text-gray-500">Service:</span>
        <span class="font-semibold">${bookingState.appointmentTypeName}</span>
      </div>
      <div class="flex justify-between mb-2">
        <span class="text-gray-500">Date:</span>
        <span class="font-semibold">${appointmentDateTime.toLocaleDateString()}</span>
      </div>
      <div class="flex justify-between mb-2">
        <span class="text-gray-500">Time:</span>
        <span class="font-semibold">${appointmentDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <hr class="my-2 border-gray-200">
      <div class="flex justify-between">
        <span class="text-gray-500">Patient:</span>
        <span>${bookingState.patientName}</span>
      </div>
    </div>
  `;

    // Show payment section if cosmetic
    const paymentSection = document.getElementById('paymentSection');
    if (paymentSection) {
        paymentSection.style.display = bookingState.category === 'cosmetic' ? 'block' : 'none';
    }
}

async function submitBooking() {
    try {
        showLoading(true);

        // Simple photo upload simulation (placeholder)
        if (bookingState.photoFile) {
            // In a real app, we'd upload here. For now we just call triage.
        }

        const triageData = {
            clinicId: bookingState.clinicId,
            patientStatus: bookingState.patientStatus,
            category: bookingState.category,
            appointmentTypeId: bookingState.appointmentTypeId,
            symptoms: bookingState.symptoms,
            patientName: bookingState.patientName,
            patientEmail: bookingState.patientEmail,
            patientPhone: bookingState.patientPhone
        };

        const response = await fetch('/api/triage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(triageData)
        });

        const triageResult = await response.json();

        if (triageResult.success) {
            const appointmentData = {
                patientId: triageResult.patientId,
                clinicId: bookingState.clinicId,
                appointmentTypeId: bookingState.appointmentTypeId,
                appointmentDatetime: bookingState.appointmentTime,
                emergencyFlag: bookingState.emergencyFlag,
                cardToken: bookingState.category === 'cosmetic' ? bookingState.cardToken : null
            };

            const apptResponse = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appointmentData)
            });

            const apptResult = await apptResponse.json();

            if (apptResult.success) {
                showSuccessScreen(apptResult);
            } else {
                throw new Error(apptResult.error || 'Booking failed');
            }
        } else {
            throw new Error(triageResult.error || 'Triage failed');
        }
    } catch (error) {
        console.error('Error submitting booking:', error);
        showPersistentError(error.message);
    } finally {
        showLoading(false);
    }
}

function showSuccessScreen(data) {
    const successDetails = document.getElementById('successDetails');
    const dt = new Date(bookingState.appointmentTime);

    successDetails.innerHTML = `
        <div style="background: var(--primary); color: white; padding: 1.5rem; border-radius: var(--radius-md); margin-bottom: 1.5rem;">
            <p class="text-sm opacity-80 mb-1">Appointment Reference</p>
            <h3 class="text-2xl font-bold mb-2">#${data.appointmentId}</h3>
            <p>${dt.toLocaleDateString()} at ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
    `;

    document.querySelectorAll('.booking-step').forEach(s => s.style.display = 'none');
    document.getElementById('success').style.display = 'block';
    document.querySelector('.progress-bar').style.display = 'none';
    if (window.lucide) lucide.createIcons();
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.toggle('active', show);
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.id = 'validationError';
    errorDiv.className = 'alert alert-danger mb-3 animate-in';
    errorDiv.innerHTML = `<div class="flex gap-2"><i data-lucide="alert-circle" style="width: 20px; height: 20px;"></i> <span>${message}</span></div>`;

    const currentStep = document.querySelector('.booking-step.active .card');
    const firstBtn = currentStep.querySelector('button');
    currentStep.insertBefore(errorDiv, firstBtn.closest('div'));

    if (window.lucide) lucide.createIcons();
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showPersistentError(message) {
    showError(message);
    const err = document.getElementById('validationError');
    if (err) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary btn-sm mt-2';
        btn.textContent = 'Dismiss';
        btn.onclick = clearErrorMessages;
        err.appendChild(btn);
    }
}

function clearErrorMessages() {
    const err = document.getElementById('validationError');
    if (err) err.remove();
}
