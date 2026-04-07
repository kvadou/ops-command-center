const express = require('express');
const router = express.Router();
const multer = require('multer');
const cache = require('../utils/cache');
const { columnExists } = require('../utils/schema-cache');
const {
  cloudinary,
  jwt
} = global;

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all common image formats
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',
      'image/x-icon'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files are allowed.'), false);
    }
  }
});

// Helper function to ensure local_image_url column exists
async function ensureLocalImageUrlColumn(pool) {
  try {
    // Check if column exists (cached)
    const hasCol = await columnExists(pool, 'contractors', 'local_image_url');

    if (!hasCol) {
      // Column doesn't exist, add it
      await pool.query(`
        ALTER TABLE contractors 
        ADD COLUMN local_image_url TEXT;
      `);
      
      // Create index for better performance
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_contractors_local_image_url 
        ON contractors(local_image_url) 
        WHERE local_image_url IS NOT NULL;
      `);
      
      // Add comment
      await pool.query(`
        COMMENT ON COLUMN contractors.local_image_url IS 'URL of profile photo uploaded to our system (Cloudinary)';
      `);
      
      logger.info('✅ Added local_image_url column to contractors table');
    }
  } catch (error) {
    logger.error({ err: error }, '❌ Error ensuring local_image_url column exists:');
    throw error; // Re-throw so caller knows it failed
  }
}

// Helper function to create standardized public_id for tutor photos
function createTutorPhotoPublicId(contractorId, firstName, lastName) {
  // Sanitize names: remove special characters, spaces become hyphens, lowercase
  const sanitize = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  };
  
  const sanitizedFirst = sanitize(firstName);
  const sanitizedLast = sanitize(lastName);
  
  // Format: tutor-{contractorId}-{firstName}-{lastName}
  // Example: tutor-5046298-ian-acmeops
  const namePart = [sanitizedFirst, sanitizedLast].filter(Boolean).join('-');
  return `tutor-${contractorId}${namePart ? '-' + namePart : ''}`;
}

// Auth middleware
const auth = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

// Public onboarding endpoint - Upload tutor photo by email (for onboarding forms)
// POST /api/tutor-photo/onboarding - Public endpoint for tutor onboarding photo upload
router.post('/onboarding', upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const { email, onboardingToken } = req.body;
    const pool = getLocationPool(req);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file uploaded' });
    }
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required for onboarding photo upload' });
    }
    
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find contractor by email
    const { rows } = await pool.query(
      `SELECT contractor_id, first_name, last_name 
       FROM contractors 
       WHERE LOWER(email) = $1 
       LIMIT 1`,
      [normalizedEmail]
    );
    
    if (rows.length === 0) {
      // For onboarding, the contractor might not exist yet
      // Store the photo temporarily or wait for contractor creation
      // For now, return an error - you can implement a pending uploads table later
      return res.status(404).json({ 
        error: 'Tutor profile not found. Please complete the onboarding form first, then upload your photo.',
        code: 'CONTRACTOR_NOT_FOUND'
      });
    }
    
    const contractorId = rows[0].contractor_id;
    const firstName = rows[0].first_name;
    const lastName = rows[0].last_name;
    const publicId = createTutorPhotoPublicId(contractorId, firstName, lastName);
    
    // Ensure local_image_url column exists
    await ensureLocalImageUrlColumn(pool);
    
    // Upload to Cloudinary in tutor-photos folder with standardized filename
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'acme-ops/tutor-photos',
          public_id: publicId,
          overwrite: true,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });
    
    // Update database with local image URL
    await pool.query(
      `UPDATE contractors
       SET local_image_url = $1, updated_at = NOW()
       WHERE contractor_id = $2`,
      [result.secure_url, contractorId]
    );

    // Invalidate contractor caches
    await cache.clearCacheByPrefix('contractors');

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      contractorId: contractorId,
      message: 'Photo uploaded successfully during onboarding'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading tutor photo during onboarding:');
    res.status(500).json({ 
      error: 'Failed to upload photo',
      details: error.message 
    });
  }
}));

// POST /api/tutor-photo/by-email - Upload tutor photo by email (authenticated or with token)
router.post('/by-email', upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;
    const pool = getLocationPool(req);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file uploaded' });
    }
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find contractor by email
    const { rows } = await pool.query(
      `SELECT contractor_id, first_name, last_name 
       FROM contractors 
       WHERE LOWER(email) = $1 
       LIMIT 1`,
      [normalizedEmail]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found with this email address' });
    }
    
    const contractorId = rows[0].contractor_id;
    const firstName = rows[0].first_name;
    const lastName = rows[0].last_name;
    const publicId = createTutorPhotoPublicId(contractorId, firstName, lastName);
    
    // Ensure local_image_url column exists
    await ensureLocalImageUrlColumn(pool);
    
    // Upload to Cloudinary in tutor-photos folder with standardized filename
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'acme-ops/tutor-photos',
          public_id: publicId,
          overwrite: true,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });
    
    // Update database with local image URL
    await pool.query(
      `UPDATE contractors
       SET local_image_url = $1, updated_at = NOW()
       WHERE contractor_id = $2`,
      [result.secure_url, contractorId]
    );

    // Invalidate contractor caches
    await cache.clearCacheByPrefix('contractors');

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      contractorId: contractorId,
      message: 'Photo uploaded successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading tutor photo by email:');
    res.status(500).json({ 
      error: 'Failed to upload photo',
      details: error.message 
    });
  }
}));

// Helper function to create standardized public_id for tutor photos
function createTutorPhotoPublicId(contractorId, firstName, lastName) {
  // Sanitize names: remove special characters, spaces become hyphens, lowercase
  const sanitize = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  };
  
  const sanitizedFirst = sanitize(firstName);
  const sanitizedLast = sanitize(lastName);
  
  // Format: tutor-{contractorId}-{firstName}-{lastName}
  // Example: tutor-5046298-ian-acmeops
  const namePart = [sanitizedFirst, sanitizedLast].filter(Boolean).join('-');
  return `tutor-${contractorId}${namePart ? '-' + namePart : ''}`;
}

// POST /api/tutor-photo/:contractorId - Upload tutor profile photo (authenticated)
router.post('/:contractorId', auth, upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const { contractorId } = req.params;
    const pool = getLocationPool(req);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Get tutor's name from database for standardized filename
    const { rows } = await pool.query(
      `SELECT first_name, last_name 
       FROM contractors 
       WHERE contractor_id = $1 
       LIMIT 1`,
      [contractorId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found' });
    }
    
    const { first_name, last_name } = rows[0];
    const publicId = createTutorPhotoPublicId(contractorId, first_name, last_name);
    
    // Ensure local_image_url column exists
    await ensureLocalImageUrlColumn(pool);
    
    // Validate Cloudinary configuration
    const cloudinaryConfig = cloudinary.config();
    if (!cloudinaryConfig.cloud_name || !cloudinaryConfig.api_key || !cloudinaryConfig.api_secret) {
      logger.error({ data: {
        has_cloud_name: !!cloudinaryConfig.cloud_name,
        has_api_key: !!cloudinaryConfig.api_key,
        has_api_secret: !!cloudinaryConfig.api_secret
      } }, 'Cloudinary configuration missing:');
      return res.status(500).json({ 
        error: 'Cloudinary configuration error',
        details: 'Image upload service is not properly configured. Please contact support.'
      });
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: 'Invalid file type',
        details: `File type ${req.file.mimetype} is not supported. Please use JPEG, PNG, GIF, or WebP.`
      });
    }
    
    // Validate file size (10MB limit)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ 
        error: 'File too large',
        details: 'File size must be less than 10MB. Please compress your image.'
      });
    }
    
    // Upload to Cloudinary with standardized filename
    const result = await new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: 'acme-ops/tutor-photos',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto' }
        ]
      };
      
      const stream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            logger.error({ err: error }, 'Cloudinary upload error:');
            return reject(error);
          }
          if (!result || !result.secure_url) {
            return reject(new Error('Upload succeeded but no URL returned from Cloudinary'));
          }
          resolve(result);
        }
      );
      
      // Handle stream errors
      stream.on('error', (streamError) => {
        logger.error({ data: streamError }, 'Stream error during upload:');
        reject(streamError);
      });
      
      stream.end(req.file.buffer);
    });
    
    // Update database with local image URL
    await pool.query(
      `UPDATE contractors
       SET local_image_url = $1, updated_at = NOW()
       WHERE contractor_id = $2`,
      [result.secure_url, contractorId]
    );

    // Invalidate contractor caches
    await cache.clearCacheByPrefix('contractors');

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      message: 'Photo uploaded successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading tutor photo:');
    logger.error({ data: {
      message: error.message,
      code: error.code,
      http_code: error.http_code,
      name: error.name,
      stack: error.stack
    } }, 'Error details:');
    
    // Provide more helpful error messages based on error type
    let errorMessage = 'Failed to upload photo';
    let errorDetails = error.message;
    
    if (error.http_code === 401) {
      errorMessage = 'Cloudinary authentication failed. Please check API credentials.';
    } else if (error.http_code === 403) {
      errorMessage = 'Cloudinary access denied. Please check account permissions.';
    } else if (error.http_code === 429) {
      errorMessage = 'Upload rate limit exceeded. Please try again later.';
    } else if (error.message && error.message.includes('File size too large')) {
      errorMessage = 'File size too large. Please use an image smaller than 10MB.';
    } else if (error.message && error.message.includes('Invalid image')) {
      errorMessage = 'Invalid image format. Please use JPEG, PNG, or GIF.';
    } else if (error.message && error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Network error connecting to Cloudinary. Please check your internet connection.';
    } else if (error.code === 'ENOENT' || error.message && error.message.includes('File not found')) {
      errorMessage = 'File not found. Please select a file to upload.';
    }
    
    res.status(error.http_code || 500).json({ 
      error: errorMessage,
      details: errorDetails,
      code: error.code || error.http_code
    });
  }
}));

// DELETE /api/tutor-photo/:contractorId - Delete tutor profile photo
router.delete('/:contractorId', auth, asyncHandler(async (req, res) => {
  try {
    const { contractorId } = req.params;
    const pool = getLocationPool(req);
    
    // Get current image URL
    const { rows } = await pool.query(
      `SELECT local_image_url FROM contractors WHERE contractor_id = $1`,
      [contractorId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found' });
    }
    
    const imageUrl = rows[0].local_image_url;
    
    // Delete from Cloudinary if it exists
    // Try to extract public_id from URL, or construct it from contractor info
    if (imageUrl && imageUrl.includes('cloudinary.com')) {
      try {
        // Try to extract public_id from URL first
        let publicId = null;
        const urlMatch = imageUrl.match(/\/upload\/v\d+\/(.+?)(?:\.(jpg|jpeg|png|gif|webp))?$/i);
        if (urlMatch && urlMatch[1]) {
          publicId = urlMatch[1];
        } else {
          // Fallback: get tutor name and construct public_id
          const { rows: tutorRows } = await pool.query(
            `SELECT first_name, last_name FROM contractors WHERE contractor_id = $1 LIMIT 1`,
            [contractorId]
          );
          if (tutorRows.length > 0) {
            publicId = createTutorPhotoPublicId(contractorId, tutorRows[0].first_name, tutorRows[0].last_name);
            publicId = `acme-ops/tutor-photos/${publicId}`;
          } else {
            // Last resort: use old format
            publicId = `acme-ops/tutor-photos/tutor-${contractorId}`;
          }
        }
        
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        logger.error({ data: cloudinaryError }, 'Error deleting from Cloudinary:');
        // Continue even if Cloudinary deletion fails
      }
    }
    
    // Clear from database
    await pool.query(
      `UPDATE contractors
       SET local_image_url = NULL, updated_at = NOW()
       WHERE contractor_id = $1`,
      [contractorId]
    );

    // Invalidate contractor caches
    await cache.clearCacheByPrefix('contractors');

    res.json({
      success: true,
      message: 'Photo deleted successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting tutor photo:');
    res.status(500).json({ 
      error: 'Failed to delete photo',
      details: error.message 
    });
  }
}));

module.exports = router;

