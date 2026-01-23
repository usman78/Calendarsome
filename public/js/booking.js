// Booking Wizard State
const bookingState = {
    currentStep: 1,
    clinicId: 1, // Default demo clinic
    patientStatus: null,
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
    initializeStep5();
    initializeStep6();

    // Set minimum date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateInput = document.getElementById('appointmentDate');
    if (dateInput) {
        dateInput.min = tomorrow.toISOString().split('T')[0];
    }
});

// Step 1: Patient Status
function initializeStep1() {
    const options = document.querySelectorAll('#step1 .option-card');
    const nextBtn = document.getElementById('step1Next');

    options.forEach(card => {
        card.addEventListener('click', () => {
            options.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            bookingState.patientStatus = card.dataset.value;
            nextBtn.disabled = false;
        });
    });

    nextBtn.addEventListener('click', () => goToStep(2));
}

// Step 2: Visit Category
function initializeStep2() {
    const options = document.querySelectorAll('#step2 .option-card');
    const nextBtn = document.getElementById('step2Next');
    const backBtn = document.getElementById('step2Back');

    options.forEach(card => {
        card.addEventListener('click', () => {
            options.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            bookingState.category = card.dataset.value;
            nextBtn.disabled = false;
        });
    });

    nextBtn.addEventListener('click', async () => {
        await loadAppointmentTypes();
        goToStep(3);
    });

    backBtn.addEventListener('click', () => goToStep(1));
}

// Step 3: Details & Photo
function initializeStep3() {
    const appointmentTypeSelect = document.getElementById('appointmentType');
    const symptomsText = document.getElementById('symptoms');
    const photoUploadArea = document.getElementById('photoUploadArea');
    const photoInput = document.getElementById('photoInput');
    const photoPreview = document.getElementById('photoPreview');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const nextBtn = document.getElementById('step3Next');
    const backBtn = document.getElementById('step3Back');

    // Photo upload
    photoUploadArea.addEventListener('click', () => photoInput.click());

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

    // Check for emergency keywords
    symptomsText.addEventListener('input', () => {
        bookingState.symptoms = symptomsText.value;
        checkEmergencyKeywords();
    });

    appointmentTypeSelect.addEventListener('change', () => {
        const selectedOption = appointmentTypeSelect.options[appointmentTypeSelect.selectedIndex];
        bookingState.appointmentTypeId = selectedOption.value;
        bookingState.appointmentTypeName = selectedOption.text;
    });

    nextBtn.addEventListener('click', () => goToStep(4));
    backBtn.addEventListener('click', () => goToStep(2));
}

// Step 4: Calendar & Time
function initializeStep4() {
    const dateInput = document.getElementById('appointmentDate');
    const nextBtn = document.getElementById('step4Next');
    const backBtn = document.getElementById('step4Back');

    dateInput.addEventListener('change', async () => {
        bookingState.appointmentDate = dateInput.value;
        await loadAvailableSlots();
    });

    nextBtn.addEventListener('click', () => {
        // Show payment or insurance section based on category
        if (bookingState.category === 'cosmetic') {
            document.getElementById('paymentSection').style.display = 'block';
            document.getElementById('insuranceSection').style.display = 'none';
        } else {
            document.getElementById('insuranceSection').style.display = 'block';
            document.getElementById('paymentSection').style.display = 'none';
        }
        goToStep(5);
    });

    backBtn.addEventListener('click', () => goToStep(3));
}

// Step 5: Contact Info
function initializeStep5() {
    const nextBtn = document.getElementById('step5Next');
    const backBtn = document.getElementById('step5Back');

    nextBtn.addEventListener('click', () => {
        bookingState.patientName = document.getElementById('patientName').value;
        bookingState.patientEmail = document.getElementById('patientEmail').value;
        bookingState.patientPhone = document.getElementById('patientPhone').value;

        if (!bookingState.patientName || !bookingState.patientEmail || !bookingState.patientPhone) {
            alert('Please fill in all contact information');
            return;
        }

        showAppointmentSummary();
        goToStep(6);
    });

    backBtn.addEventListener('click', () => goToStep(4));
}

// Step 6: Confirmation
function initializeStep6() {
    const confirmBtn = document.getElementById('confirmBooking');
    const backBtn = document.getElementById('step6Back');

    confirmBtn.addEventListener('click', async () => {
        await submitBooking();
    });

    backBtn.addEventListener('click', () => goToStep(5));
}

// Helper Functions
function goToStep(stepNumber) {
    // Update current step
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

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadAppointmentTypes() {
    try {
        const response = await fetch(`/api/appointment-types/${bookingState.clinicId}/${bookingState.category}`);
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('appointmentType');
            select.innerHTML = '<option value="">Select type...</option>';

            data.types.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.text = `${type.name} (${type.duration_mins} min)${type.requires_deposit ? ` - $${type.deposit_amount} deposit` : ''}`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading appointment types:', error);
        alert('Error loading appointment types. Please try again.');
    }
}

function checkEmergencyKeywords() {
    const emergencyKeywords = ['bleeding', 'rapidly growing', 'rapid growth', 'sudden', 'emergency', 'urgent', 'melanoma', 'black', 'severe pain'];
    const text = bookingState.symptoms.toLowerCase();

    bookingState.emergencyFlag = emergencyKeywords.some(keyword => text.includes(keyword));

    const alert = document.getElementById('emergencyAlert');
    if (bookingState.emergencyFlag) {
        alert.style.display = 'block';
    } else {
        alert.style.display = 'none';
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
                    document.getElementById('step4Next').disabled = false;
                });

                timeSlotsContainer.appendChild(slotDiv);
            });
        } else {
            timeSlotsContainer.innerHTML = '<p style="color: var(--gray-500);">No available slots for this date. Please try another day.</p>';
        }
    } catch (error) {
        console.error('Error loading slots:', error);
        alert('Error loading available times. Please try again.');
    } finally {
        showLoading(false);
    }
}

function showAppointmentSummary() {
    const summaryDiv = document.getElementById('appointmentSummary');
    const appointmentDateTime = new Date(bookingState.appointmentTime);

    summaryDiv.innerHTML = `
    <div style="background: var(--gray-50); padding: 1.5rem; border-radius: var(--radius-md);">
      <h3 style="margin-bottom: 1rem;">Appointment Details</h3>
      <p><strong>Type:</strong> ${bookingState.appointmentTypeName}</p>
      <p><strong>Date & Time:</strong> ${appointmentDateTime.toLocaleString()}</p>
      <p><strong>Category:</strong> ${bookingState.category === 'medical' ? 'Medical' : 'Cosmetic'}</p>
      <p><strong>Patient:</strong> ${bookingState.patientName}</p>
      <p><strong>Email:</strong> ${bookingState.patientEmail}</p>
      <p><strong>Phone:</strong> ${bookingState.patientPhone}</p>
      ${bookingState.category === 'cosmetic' ? '<p><strong>Deposit:</strong> $50.00 (authorized, charged only on no-show)</p>' : ''}
      ${bookingState.emergencyFlag ? '<p style="color: var(--danger);"><strong>⚠️ Emergency Flag:</strong> Clinic will be notified</p>' : ''}
    </div>
  `;
}

async function submitBooking() {
    try {
        showLoading(true);

        // First, upload photo if exists
        let photoUrl = null;
        if (bookingState.photoFile) {
            const formData = new FormData();
            formData.append('photo', bookingState.photoFile);

            const photoResponse = await fetch('/api/triage', {
                method: 'POST',
                body: formData
            });

            // For now, we'll handle photo separately
        }

        // Process triage
        const triageData = {
            clinicId: bookingState.clinicId,
            patientStatus: bookingState.patientStatus,
            category: bookingState.category,
            appointmentTypeId: bookingState.appointmentTypeId,
            symptoms: bookingState.symptoms,
            patientName: bookingState.patientName,
            patientEmail: bookingState.patientEmail,
            patientPhone: bookingState.patientPhone,
            insurancePhotoUrl: null // For MVP
        };

        // Create appointment
        const appointmentData = {
            patientId: null, // Will be created by triage
            clinicId: bookingState.clinicId,
            appointmentTypeId: bookingState.appointmentTypeId,
            appointmentDatetime: bookingState.appointmentTime,
            triageData: triageData,
            photoUrl: photoUrl,
            emergencyFlag: bookingState.emergencyFlag,
            cardToken: bookingState.category === 'cosmetic' ? bookingState.cardToken : null
        };

        // For MVP, we'll call the triage endpoint first
        const triageResponse = await fetch('/api/triage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(triageData)
        });

        const triageResult = await triageResponse.json();

        if (triageResult.success) {
            // Now create appointment
            appointmentData.patientId = triageResult.patientId;

            const appointmentResponse = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appointmentData)
            });

            const appointmentResult = await appointmentResponse.json();

            if (appointmentResult.success) {
                showSuccessScreen(appointmentResult);
            } else {
                throw new Error(appointmentResult.error || 'Failed to create appointment');
            }
        } else {
            throw new Error(triageResult.error || 'Failed to process triage');
        }
    } catch (error) {
        console.error('Booking error:', error);
        alert(`Error: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function showSuccessScreen(appointmentData) {
    const successDetails = document.getElementById('successDetails');
    const appointmentDateTime = new Date(bookingState.appointmentTime);

    successDetails.innerHTML = `
    <div style="background: var(--success); color: white; padding: 1.5rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <h3 style="color: white; margin-bottom: 0.5rem;">Appointment #${appointmentData.appointmentId}</h3>
      <p style="margin: 0;">${appointmentDateTime.toLocaleString()}</p>
    </div>
    <p style="color: var(--gray-600);">
      We've sent confirmation details to <strong>${bookingState.patientEmail}</strong>
    </p>
  `;

    // Hide all steps, show success
    document.querySelectorAll('.booking-step').forEach(step => step.style.display = 'none');
    document.getElementById('success').style.display = 'block';
    document.querySelector('.progress-bar').style.display = 'none';
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}
