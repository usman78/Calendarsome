// Configuration for the dermatology booking system
module.exports = {
  // Server configuration
  port: process.env.PORT || 3001,

  // Database configuration
  database: {
    filename: './backend/derm_bookings.db'
  },

  // File upload configuration
  uploads: {
    directory: './uploads',
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/jpg']
  },

  // Mock payment settings (simulating Stripe)
  payment: {
    mockMode: true,
    defaultDepositAmount: 50.00,
    platformFeePercent: 0, // 0% for MVP, 100% goes to clinic
    currency: 'USD'
  },

  // Mock SMS settings
  sms: {
    mockMode: true,
    confirmationWindow: {
      firstReminder: 72 * 60 * 60 * 1000, // 72 hours in milliseconds
      secondReminder: 48 * 60 * 60 * 1000, // 48 hours
      autoCancelTime: 24 * 60 * 60 * 1000  // 24 hours
    }
  },

  // Appointment types and their settings
  appointmentTypes: {
    medical: {
      requiresInsurance: true,
      requiresDeposit: false,
      types: ['Rash/Irritation', 'Mole Check', 'Acne Follow-up', 'Eczema/Psoriasis', 'Skin Infection']
    },
    cosmetic: {
      requiresInsurance: false,
      requiresDeposit: true,
      depositAmount: 50.00,
      types: ['Botox/Fillers', 'Chemical Peel', 'Laser Treatment', 'Scar Removal', 'Microneedling']
    }
  },

  // Emergency keywords for photo flagging
  emergencyKeywords: [
    'bleeding',
    'rapidly growing',
    'rapid growth',
    'sudden appearance',
    'color change',
    'black',
    'melanoma',
    'severe pain',
    'urgent',
    'emergency'
  ],

  // Waitlist settings
  waitlist: {
    maxNotifications: 5, // Notify top 5 on waitlist
    responseWindow: 30 * 60 * 1000 // 30 minutes to claim slot
  },

  // Clinic settings (would be per-clinic in production)
  clinic: {
    name: 'Demo Dermatology Clinic',
    timezone: 'America/New_York',
    businessHours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '10:00', end: '14:00' },
      sunday: null // closed
    },
    appointmentDuration: 30 // minutes per slot
  }
};
