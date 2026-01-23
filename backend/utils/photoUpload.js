const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { logAudit } = require('./auditLogger');

/**
 * Photo Upload Handler
 * 
 * IMPORTANT: For MVP, this stores photos in local /uploads directory
 * For production with HIPAA compliance, migrate to:
 * - AWS S3 with encryption
 * - Pre-signed URLs with expiration
 * - Access logging
 * - Automatic deletion policies
 */

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp_randomstring_original.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `photo_${uniqueSuffix}${ext}`);
    }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
    const allowedTypes = config.uploads.allowedTypes;

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`), false);
    }
};

// Create multer upload instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: config.uploads.maxFileSize
    }
});

/**
 * Middleware for single photo upload
 */
const uploadSinglePhoto = upload.single('photo');

/**
 * Middleware for insurance card upload
 */
const uploadInsuranceCard = upload.single('insuranceCard');

/**
 * Get photo URL after upload
 */
function getPhotoUrl(req) {
    if (!req.file) return null;

    // Log access
    logAudit({
        action: 'CREATE',
        tableName: 'photo_uploads',
        newValue: { filename: req.file.filename, size: req.file.size }
    }).catch(err => console.error('Audit log error:', err));

    return `/uploads/${req.file.filename}`;
}

/**
 * Delete photo (for cleanup or patient request)
 */
async function deletePhoto(photoUrl) {
    try {
        if (!photoUrl) return { success: false, error: 'No photo URL provided' };

        const filename = path.basename(photoUrl);
        const filepath = path.join(uploadsDir, filename);

        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);

            await logAudit({
                action: 'DELETE',
                tableName: 'photo_uploads',
                oldValue: { filename }
            });

            console.log(`[PHOTO] Deleted: ${filename}`);
            return { success: true };
        }

        return { success: false, error: 'Photo not found' };
    } catch (error) {
        console.error('Error deleting photo:', error);
        throw error;
    }
}

/**
 * Production TODO: Migrate to S3
 * 
 * const AWS = require('aws-sdk');
 * const s3 = new AWS.S3({ encryption: 'AES256' });
 * 
 * async function uploadToS3(file) {
 *   const params = {
 *     Bucket: process.env.S3_BUCKET,
 *     Key: `patient-photos/${Date.now()}-${file.originalname}`,
 *     Body: file.buffer,
 *     ServerSideEncryption: 'AES256',
 *     ContentType: file.mimetype,
 *     Metadata: {
 *       'uploaded-by': 'system',
 *       'retention-days': '90'
 *     }
 *   };
 *   
 *   const result = await s3.upload(params).promise();
 *   
 *   // Generate pre-signed URL (expires in 1 hour)
 *   const signedUrl = s3.getSignedUrl('getObject', {
 *     Bucket: params.Bucket,
 *     Key: params.Key,
 *     Expires: 3600
 *   });
 *   
 *   return { url: result.Location, signedUrl };
 * }
 */

module.exports = {
    uploadSinglePhoto,
    uploadInsuranceCard,
    getPhotoUrl,
    deletePhoto
};
