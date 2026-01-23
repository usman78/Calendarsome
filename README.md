# DermSchedule - Dermatology Booking System

A niche-specific booking platform for dermatology practices featuring smart triage, graduated commitment escalation, and automated waitlist management.

## Quick Start

### Prerequisites
- Node.js 16+ installed
- npm or yarn

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```
   
   > **Note**: If you get a PowerShell execution policy error on Windows, run:
   > ```powershell
   > Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   > ```
   > Then run `npm install` again.

2. **Start the Server**
   ```bash
   npm start
   ```
   
   The server will start on `http://localhost:3000`

3. **Access the Application**
   - **Landing Page**: http://localhost:3000
   - **Book Appointment**: http://localhost:3000/booking.html
   - **Admin Dashboard**: http://localhost:3000/admin.html

## Project Structure

```
calendersome/
├── backend/
│   ├── server.js                 # Express server & API routes
│   ├── config.js                 # Configuration
│   ├── database.js               # SQLite database setup
│   ├── controllers/
│   │   ├── triageController.js   # Triage logic
│   │   └── appointmentController.js
│   ├── services/
│   │   ├── confirmationService.js  # SMS confirmation flow
│   │   ├── waitlistService.js      # Waitlist with race condition prevention
│   │   ├── schedulerService.js     # Cron jobs
│   │   ├── paymentService.js       # Mock Stripe
│   │   └── smsService.js           # Mock SMS
│   └── utils/
│       ├── auditLogger.js          # HIPAA compliance logging
│       ├── photoUpload.js          # File upload handling
│       ├── seedDatabase.js         # Demo data
│       └── validators.js
├── public/
│   ├── index.html               # Landing page
│   ├── booking.html             # Multi-step booking wizard
│   ├── admin.html               # Clinic dashboard
│   └── styles.css               # Design system
└── uploads/                     # Patient photos (local storage for MVP)
```

## Key Features

### 1. Smart Triage
- Multi-step intake: Patient Status → Category (Medical/Cosmetic) → Details
- Emergency keyword detection (bleeding, melanoma, etc.)
- Photo upload for clinical context
- Automatic routing based on appointment type

###2. Graduated Commitment Escalation
- **T-72h**: First SMS confirmation request
- **T-48h**: Reminder if no response
- **T-24h**: Auto-cancel + waitlist blast

### 3. Waitlist Cascade with Race Condition Prevention
- Slot opens → SMS blast to top 5 waitlist patients
- First to claim gets it via database transaction
- 30-minute claim expiration window
- Other waitlist entries auto-expire

### 4. Deposit Management
- Cosmetic appointments require $50 deposit (configurable)
- Authorization at booking, charge on no-show
- Graduated refund policy:
  - >48h cancellation: Full refund
  - 24-48h: 50% refund
  - <24h: No refund

### 5. HIPAA-Ready Architecture
- Audit logging for all PHI access
- Notes for production migration (S3, encryption, etc.)
- Input validation and sanitization

## API Endpoints

### Triage
- `GET /api/appointment-types/:clinicId/:category` - Get appointment types
- `POST /api/triage` - Process triage submission

### Appointments
- `GET /api/available-slots` - Get available time slots
- `POST /api/appointments` - Create appointment
- `GET /api/appointments/:id` - Get appointment details
- `GET /api/appointments/clinic/:clinicId` - Get upcoming appointments
- `PATCH /api/appointments/:id/status` - Update status

### Confirmations
- `POST /api/confirmations/:id/respond` - Process YES/NO response

### Waitlist
- `POST /api/waitlist` - Add to waitlist
- `POST /api/waitlist/:id/claim` - Claim waitlist slot
- `GET /api/waitlist/position` - Get position in line

### Payments (Mock)
- `POST /api/payments/authorize` - Authorize deposit
- `POST /api/payments/:id/charge` - Charge deposit
- `POST /api/payments/:id/refund` - Refund deposit

### SMS (Admin)
- `GET /api/sms/logs` - View SMS history
- `GET /api/sms/pending` - Get pending confirmations
- `POST /api/sms/:id/respond` - Simulate patient response

## Production Checklist

Before deploying to production, address these items:

- [ ] **Authentication**: Implement JWT auth for admin dashboard
- [ ] **Database**: Migrate to encrypted PostgreSQL/MySQL
- [ ] **Photo Storage**: Migrate to AWS S3 with encryption
- [ ] **SMS**: Integrate real Twilio API
- [ ] **Payments**: Integrate real Stripe with webhooks
- [ ] **HTTPS**: Add SSL/TLS certificates
- [ ] **HIPAA**: Complete BAA with cloud providers
- [ ] **Monitoring**: Add error tracking (Sentry, LogRocket)
- [ ] **Rate Limiting**: Prevent API abuse
- [ ] **CORS**: Restrict to specific domains

## Configuration

Edit `backend/config.js` to customize:
- Port number
- Business hours
- Appointment duration
- Deposit amounts
- Emergency keywords
- Waitlist settings

## Development

To run in development mode with auto-reload:

```bash
npm run dev
```

## License

MIT (for demonstration purposes)

## Support

This is an MVP prototype. For production deployment consultation, contact the development team.
