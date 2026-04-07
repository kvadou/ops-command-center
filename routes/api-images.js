const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  Appointment,
  auth,
  axios,
  cloudinary,
  ColourGroup,
  db,
  delay,
  GRAVITY_FORMS_API_BASE_URL,
  jwt,
  KLAVIYO_API_KEY,
  LABEL_ID,
  limitedGet,
  Location,
  pool,
  rateLimitRetry,
  sequelize,
  Service,
  stripe,
  transporter,
  TUTORCRUNCHER_API_BASE,
  tutorCruncherAPI
} = global;

const cache = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});
router.get('/', asyncHandler(async (req, res) => {
  try {
    // Check if Cloudinary is properly configured
    if (!cloudinary.config().api_key || cloudinary.config().api_key === 'your_cloudinary_key') {
      logger.info('Cloudinary not configured, returning empty array');
      res.json([]);
      return;
    }
    
    const { folder } = req.query;
    
    // Build prefix based on folder filter
    let prefix = 'acme-ops/';
    if (folder && folder !== 'all') {
      prefix = `acme-ops/${folder}/`;
    }
    
    const resources = await cloudinary.api.resources({
      type: 'upload',
      prefix: prefix,
      max_results: 500,
      context: true
    });
    
    // Map resources to include folder information
    const images = resources.resources.map(resource => {
      // Extract folder from public_id (format: acme-ops/folder-name/filename)
      const parts = resource.public_id.split('/');
      const folderName = parts.length > 2 ? parts[1] : 'general';
      
      return {
        url: resource.secure_url,
        publicId: resource.public_id,
        folder: folderName,
        displayName: resource.context?.custom?.display_name || null,
        createdAt: resource.created_at,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        bytes: resource.bytes
      };
    });
    
    // If no folder filter, also get all images from acme-ops root
    if (!folder || folder === 'all') {
      const rootResources = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'acme-ops/',
        max_results: 500,
        context: true
      });
      
      // Get unique images (avoid duplicates from subfolders)
      const existingUrls = new Set(images.map(img => img.url));
      rootResources.resources.forEach(resource => {
        // Only add if it's directly in acme-ops root (no subfolder)
        const parts = resource.public_id.split('/');
        if (parts.length === 2 && !existingUrls.has(resource.secure_url)) {
          images.push({
            url: resource.secure_url,
            publicId: resource.public_id,
            folder: 'general',
            displayName: resource.context?.custom?.display_name || null,
            createdAt: resource.created_at,
            format: resource.format,
            width: resource.width,
            height: resource.height,
            bytes: resource.bytes
          });
        }
      });
    }
    
    res.json(images);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching images from Cloudinary:');
    // Return empty array instead of error to prevent frontend issues
    res.json([]);
  }
}));

// GET /api/images/folders - Get list of all folders
router.get('/folders', asyncHandler(async (req, res) => {
  try {
    if (!cloudinary.config().api_key || cloudinary.config().api_key === 'your_cloudinary_key') {
      res.json({ folders: [] });
      return;
    }
    
    // Get all resources to extract folder structure
    const resources = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'acme-ops/',
      max_results: 500
    });
    
    // Extract unique folders from public_ids
    const folders = new Set();
    folders.add('general'); // Default folder
    
    resources.resources.forEach(resource => {
      const parts = resource.public_id.split('/');
      if (parts.length > 2) {
        folders.add(parts[1]); // Add folder name (second part after acme-ops)
      }
    });
    
    // Define standard folder categories (always include these)
    const standardFolders = [
      { id: 'general', name: 'General', description: 'General purpose images' },
      { id: 'tutor-photos', name: 'Tutor Photos', description: 'Tutor profile pictures' },
      { id: 'service-images', name: 'Service Images', description: 'Service/club images for booking forms' },
      { id: 'booking-forms', name: 'Booking Forms', description: 'Images used in booking forms' },
      { id: 'marketing', name: 'Marketing', description: 'Marketing and promotional images' },
      { id: 'events', name: 'Events', description: 'Event-related images' },
      { id: 'other', name: 'Other', description: 'Other miscellaneous images' }
    ];
    
    // Always include standard folders, even if they have 0 images
    standardFolders.forEach(standard => {
      if (!folders.has(standard.id)) {
        folders.add(standard.id);
      }
    });
    
    // Build folder list with counts
    const folderList = Array.from(folders).map(folderId => {
      const standard = standardFolders.find(f => f.id === folderId);
      const count = resources.resources.filter(r => {
        const parts = r.public_id.split('/');
        if (folderId === 'general') {
          return parts.length === 2; // Directly in acme-ops root
        }
        return parts.length > 2 && parts[1] === folderId;
      }).length;
      
      return {
        id: folderId,
        name: standard ? standard.name : folderId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        description: standard ? standard.description : `${folderId} images`,
        count
      };
    });
    
    // Sort by name
    folderList.sort((a, b) => {
      if (a.id === 'general') return -1;
      if (b.id === 'general') return 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json({ folders: folderList });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching folders:');
    res.json({ folders: [] });
  }
}));
router.post('/', upload.single('image'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }
    
    const { folder = 'general' } = req.body;
    
    // Build folder path
    let folderPath = 'acme-ops';
    if (folder && folder !== 'general') {
      folderPath = `acme-ops/${folder}`;
    }
    
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: folderPath
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });
    
    // Extract folder name from public_id for response
    const parts = result.public_id.split('/');
    const folderName = parts.length > 2 ? parts[1] : 'general';
    
    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      folder: folderName,
      message: 'Image uploaded successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading image:');
    res.status(500).json({
      error: 'Failed to upload image',
      details: error.message
    });
  }
}));

router.delete('/', asyncHandler(async (req, res) => {
  const {
    imagePublicId,
    image: imageUrl
  } = req.body;
  
  try {
    let publicId = imagePublicId;
    
    // If we received a full URL instead of public ID, extract the public ID
    if (!publicId && imageUrl) {
      try {
        // Cloudinary URLs format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{folder}/{public_id}.{format}
        // Extract the path after /upload/ and remove version if present
        const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.(jpg|jpeg|png|gif|webp))?$/i);
        if (match) {
          publicId = match[1];
        } else {
          return res.status(400).json({
            error: 'Invalid image URL. Could not extract public ID.'
          });
        }
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid image URL. Could not extract public ID.',
          details: parseError.message
        });
      }
    }
    
    if (!publicId) {
      return res.status(400).json({
        error: 'Either imagePublicId or image (URL) is required'
      });
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result === 'ok') {
      res.json({
        message: 'Image deleted successfully'
      });
    } else {
      res.status(500).json({
        error: 'Failed to delete image from Cloudinary',
        result: result.result
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error deleting image from Cloudinary:');
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}));

// GET /api/images/usage/:imageUrl - Get where an image is being used
router.get('/usage', asyncHandler(async (req, res) => {
  try {
    const { imageUrl } = req.query;
    
    if (!imageUrl) {
      return res.status(400).json({
        error: 'imageUrl query parameter is required'
      });
    }

    // Decode URL if needed
    const decodedUrl = decodeURIComponent(imageUrl);
    
    // Check Services table
    const servicesResult = await pool.query(
      `SELECT "serviceId", name, "publicVisible" 
       FROM "Services" 
       WHERE image = $1 
       ORDER BY name`,
      [decodedUrl]
    );
    
    // Check Contractors table (tutor photos)
    const contractorsResult = await pool.query(
      `SELECT contractor_id, first_name, last_name, email 
       FROM contractors 
       WHERE local_image_url = $1 
       ORDER BY first_name, last_name`,
      [decodedUrl]
    );
    
    // Format usage data
    const usage = {
      services: servicesResult.rows.map(row => ({
        id: row.serviceId,
        name: row.name,
        type: 'service',
        publicVisible: row.publicVisible
      })),
      tutors: contractorsResult.rows.map(row => ({
        id: row.contractor_id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
        type: 'tutor',
        email: row.email
      })),
      totalCount: servicesResult.rows.length + contractorsResult.rows.length
    };
    
    res.json(usage);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching image usage:');
    res.status(500).json({
      error: 'Failed to fetch image usage',
      details: error.message
    });
  }
}));

// POST /api/images/replace - Replace an image and update all references
router.post('/replace', upload.single('newImage'), asyncHandler(async (req, res) => {
  try {
    const { oldImageUrl, replaceInServices, replaceInTutors } = req.body;
    
    if (!oldImageUrl) {
      return res.status(400).json({
        error: 'oldImageUrl is required'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        error: 'No new image file uploaded'
      });
    }
    
    const { folder = 'general' } = req.body;
    
    // Build folder path (try to maintain same folder as old image, or use specified folder)
    let folderPath = 'acme-ops';
    if (folder && folder !== 'general') {
      folderPath = `acme-ops/${folder}`;
    } else {
      // Try to extract folder from old image URL
      try {
        const oldParts = oldImageUrl.match(/\/upload\/v\d+\/(.+?)\//);
        if (oldParts && oldParts[1]) {
          const oldPathParts = oldParts[1].split('/');
          if (oldPathParts.length > 1) {
            folderPath = `acme-ops/${oldPathParts[1]}`;
          }
        }
      } catch (e) {
        // Use default if extraction fails
      }
    }
    
    // Upload new image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: folderPath
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });
    
    const newImageUrl = uploadResult.secure_url;
    const decodedOldUrl = decodeURIComponent(oldImageUrl);
    
    let updatedServices = 0;
    let updatedTutors = 0;
    
    // Update Services if requested
    if (replaceInServices === 'true' || replaceInServices === true) {
      const servicesResult = await pool.query(
        `UPDATE "Services" 
         SET image = $1, "updatedAt" = NOW() 
         WHERE image = $2 
         RETURNING "serviceId", name`,
        [newImageUrl, decodedOldUrl]
      );
      updatedServices = servicesResult.rows.length;
    }
    
    // Update Contractors if requested
    if (replaceInTutors === 'true' || replaceInTutors === true) {
      const contractorsResult = await pool.query(
        `UPDATE contractors
         SET local_image_url = $1, updated_at = NOW()
         WHERE local_image_url = $2
         RETURNING contractor_id, first_name, last_name`,
        [newImageUrl, decodedOldUrl]
      );
      updatedTutors = contractorsResult.rows.length;

      // Invalidate contractor caches if any were updated
      if (updatedTutors > 0) {
        await cache.clearCacheByPrefix('contractors');
      }
    }

    res.json({
      success: true,
      newImageUrl,
      oldImageUrl: decodedOldUrl,
      updatedServices,
      updatedTutors,
      message: `Image replaced successfully. Updated ${updatedServices} service(s) and ${updatedTutors} tutor(s).`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error replacing image:');
    res.status(500).json({
      error: 'Failed to replace image',
      details: error.message
    });
  }
}));

// PUT /api/images/rename - Set a display name for an image (stored as Cloudinary context metadata)
router.put('/rename', asyncHandler(async (req, res) => {
  try {
    const { publicId, displayName } = req.body;

    if (!publicId) {
      return res.status(400).json({ error: 'publicId is required' });
    }

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'displayName is required' });
    }

    // Set display_name in Cloudinary context metadata
    await cloudinary.uploader.add_context(
      `display_name=${displayName.trim()}`,
      [publicId]
    );

    logger.info({ publicId, displayName: displayName.trim() }, 'Image renamed');

    res.json({
      success: true,
      publicId,
      displayName: displayName.trim(),
      message: `Image renamed to "${displayName.trim()}"`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error renaming image:');
    res.status(500).json({
      error: 'Failed to rename image',
      details: error.message
    });
  }
}));

// POST /api/images/move - Move an image to a different folder in Cloudinary
router.post('/move', asyncHandler(async (req, res) => {
  try {
    const { publicId, targetFolder } = req.body;

    if (!publicId || !targetFolder) {
      return res.status(400).json({
        error: 'publicId and targetFolder are required'
      });
    }

    // Build new public_id with target folder
    const filename = publicId.split('/').pop();
    const newPublicId = targetFolder === 'general'
      ? `acme-ops/${filename}`
      : `acme-ops/${targetFolder}/${filename}`;

    if (publicId === newPublicId) {
      return res.json({ success: true, message: 'Image is already in this folder', publicId });
    }

    // Cloudinary rename (move) the resource
    const result = await cloudinary.uploader.rename(publicId, newPublicId);

    // Update any Services referencing the old URL (match by public_id portion)
    const servicesResult = await pool.query(
      `UPDATE "Services"
       SET image = $1, "updatedAt" = NOW()
       WHERE image LIKE $2
       RETURNING "serviceId", name`,
      [result.secure_url, `%${publicId}%`]
    );

    logger.info({ publicId, newPublicId, updatedServices: servicesResult.rows.length }, 'Image moved to new folder');

    res.json({
      success: true,
      oldPublicId: publicId,
      newPublicId: result.public_id,
      newUrl: result.secure_url,
      updatedServices: servicesResult.rows.length,
      message: `Image moved to ${targetFolder}. Updated ${servicesResult.rows.length} service(s).`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error moving image:');
    res.status(500).json({
      error: 'Failed to move image',
      details: error.message
    });
  }
}));

module.exports = router;