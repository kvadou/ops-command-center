const express = require("express");
const router = express.Router();
const { buildDeps } = require("../config/deps");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/rbac");
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Get database pool
const { pool } = buildDeps();

// Middleware to check admin access for write operations
const requireAdminAuth = [requireAuth, requireAdmin];

// GET /api/user-guide/collections - Get all collections
router.get("/collections", asyncHandler(async (req, res) => {
  try {
    const { published_only } = req.query;
    const query = published_only === "true"
      ? "SELECT * FROM guide_collections WHERE is_published = true ORDER BY order_index ASC"
      : "SELECT * FROM guide_collections ORDER BY order_index ASC";
    
    const result = await pool.query(query);
    res.json({ collections: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching collections:');
    // Check if table doesn't exist
    if (error.code === "42P01") {
      return res.status(500).json({ 
        error: "User guide tables not found. Please run the migration: migrations/create_user_guide_tables.sql",
        details: error.message 
      });
    }
    res.status(500).json({ 
      error: "Failed to fetch collections",
      details: error.message 
    });
  }
}));

// GET /api/user-guide/collections/:id - Get single collection with articles
router.get("/collections/:id", asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const collectionResult = await pool.query(
      "SELECT * FROM guide_collections WHERE id = $1",
      [id]
    );

    if (collectionResult.rows.length === 0) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const articlesResult = await pool.query(
      "SELECT * FROM guide_articles WHERE collection_id = $1 ORDER BY order_index ASC",
      [id]
    );

    res.json({
      collection: collectionResult.rows[0],
      articles: articlesResult.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching collection:');
    res.status(500).json({ error: "Failed to fetch collection" });
  }
}));

// POST /api/user-guide/collections - Create new collection (admin only)
router.post("/collections", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { title, description, icon, order_index, is_published } = req.body;
    
    const result = await pool.query(
      `INSERT INTO guide_collections (title, description, icon, order_index, is_published)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, description, icon, order_index || 0, is_published !== false]
    );

    res.status(201).json({ collection: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating collection:');
    res.status(500).json({ error: "Failed to create collection" });
  }
}));

// PUT /api/user-guide/collections/:id - Update collection (admin only)
router.put("/collections/:id", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, icon, order_index, is_published } = req.body;
    
    const result = await pool.query(
      `UPDATE guide_collections
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           icon = COALESCE($3, icon),
           order_index = COALESCE($4, order_index),
           is_published = COALESCE($5, is_published)
       WHERE id = $6
       RETURNING *`,
      [title, description, icon, order_index, is_published, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Collection not found" });
    }

    res.json({ collection: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating collection:');
    res.status(500).json({ error: "Failed to update collection" });
  }
}));

// PUT /api/user-guide/collections/reorder - Reorder collections (admin only)
router.put("/collections/reorder", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { collections } = req.body; // Array of { id, order_index }
    
    await pool.query("BEGIN");
    
    for (const item of collections) {
      await pool.query(
        "UPDATE guide_collections SET order_index = $1 WHERE id = $2",
        [item.order_index, item.id]
      );
    }
    
    await pool.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await pool.query("ROLLBACK");
    logger.error({ err: error }, 'Error reordering collections:');
    res.status(500).json({ error: "Failed to reorder collections" });
  }
}));

// DELETE /api/user-guide/collections/:id - Delete collection (admin only)
router.delete("/collections/:id", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM guide_collections WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting collection:');
    res.status(500).json({ error: "Failed to delete collection" });
  }
}));

// GET /api/user-guide/articles/:id - Get article with sections
router.get("/articles/:id", asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const articleResult = await pool.query(
      "SELECT * FROM guide_articles WHERE id = $1",
      [id]
    );

    if (articleResult.rows.length === 0) {
      return res.status(404).json({ error: "Article not found" });
    }

    const sectionsResult = await pool.query(
      "SELECT * FROM guide_sections WHERE article_id = $1 ORDER BY order_index ASC",
      [id]
    );

    res.json({
      article: articleResult.rows[0],
      sections: sectionsResult.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching article:');
    res.status(500).json({ error: "Failed to fetch article" });
  }
}));

// POST /api/user-guide/articles - Create new article (admin only)
router.post("/articles", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { collection_id, title, description, slug, order_index, is_published } = req.body;
    
    const result = await pool.query(
      `INSERT INTO guide_articles (collection_id, title, description, slug, order_index, is_published)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [collection_id, title, description, slug, order_index || 0, is_published !== false]
    );

    res.status(201).json({ article: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating article:');
    if (error.code === "23505") { // Unique violation
      return res.status(400).json({ error: "Article with this slug already exists in this collection" });
    }
    res.status(500).json({ error: "Failed to create article" });
  }
}));

// PUT /api/user-guide/articles/:id - Update article (admin only)
router.put("/articles/:id", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, slug, order_index, is_published } = req.body;
    
    const result = await pool.query(
      `UPDATE guide_articles
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           slug = COALESCE($3, slug),
           order_index = COALESCE($4, order_index),
           is_published = COALESCE($5, is_published)
       WHERE id = $6
       RETURNING *`,
      [title, description, slug, order_index, is_published, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Article not found" });
    }

    res.json({ article: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating article:');
    res.status(500).json({ error: "Failed to update article" });
  }
}));

// PUT /api/user-guide/articles/reorder - Reorder articles (admin only)
router.put("/articles/reorder", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { articles } = req.body;
    
    await pool.query("BEGIN");
    
    for (const item of articles) {
      await pool.query(
        "UPDATE guide_articles SET order_index = $1 WHERE id = $2",
        [item.order_index, item.id]
      );
    }
    
    await pool.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await pool.query("ROLLBACK");
    logger.error({ err: error }, 'Error reordering articles:');
    res.status(500).json({ error: "Failed to reorder articles" });
  }
}));

// DELETE /api/user-guide/articles/:id - Delete article (admin only)
router.delete("/articles/:id", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM guide_articles WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting article:');
    res.status(500).json({ error: "Failed to delete article" });
  }
}));

// GET /api/user-guide/sections/:id - Get single section
router.get("/sections/:id", asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM guide_sections WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Section not found" });
    }

    res.json({ section: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching section:');
    res.status(500).json({ error: "Failed to fetch section" });
  }
}));

// POST /api/user-guide/sections - Create new section (admin only)
router.post("/sections", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const {
      article_id,
      section_type,
      title,
      content,
      video_url,
      video_provider,
      image_url,
      code_content,
      code_language,
      order_index
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO guide_sections 
       (article_id, section_type, title, content, video_url, video_provider, image_url, code_content, code_language, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [article_id, section_type || "text", title, content, video_url, video_provider, image_url, code_content, code_language, order_index || 0]
    );

    res.status(201).json({ section: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating section:');
    res.status(500).json({ error: "Failed to create section" });
  }
}));

// PUT /api/user-guide/sections/:id - Update section (admin only)
router.put("/sections/:id", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      section_type,
      title,
      content,
      video_url,
      video_provider,
      image_url,
      code_content,
      code_language,
      order_index
    } = req.body;
    
    const result = await pool.query(
      `UPDATE guide_sections
       SET section_type = COALESCE($1, section_type),
           title = COALESCE($2, title),
           content = COALESCE($3, content),
           video_url = COALESCE($4, video_url),
           video_provider = COALESCE($5, video_provider),
           image_url = COALESCE($6, image_url),
           code_content = COALESCE($7, code_content),
           code_language = COALESCE($8, code_language),
           order_index = COALESCE($9, order_index)
       WHERE id = $10
       RETURNING *`,
      [section_type, title, content, video_url, video_provider, image_url, code_content, code_language, order_index, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Section not found" });
    }

    res.json({ section: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating section:');
    res.status(500).json({ error: "Failed to update section" });
  }
}));

// PUT /api/user-guide/sections/reorder - Reorder sections (admin only)
router.put("/sections/reorder", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { sections } = req.body;
    
    await pool.query("BEGIN");
    
    for (const item of sections) {
      await pool.query(
        "UPDATE guide_sections SET order_index = $1 WHERE id = $2",
        [item.order_index, item.id]
      );
    }
    
    await pool.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await pool.query("ROLLBACK");
    logger.error({ err: error }, 'Error reordering sections:');
    res.status(500).json({ error: "Failed to reorder sections" });
  }
}));

// DELETE /api/user-guide/sections/:id - Delete section (admin only)
router.delete("/sections/:id", ...requireAdminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM guide_sections WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting section:');
    res.status(500).json({ error: "Failed to delete section" });
  }
}));

module.exports = router;
