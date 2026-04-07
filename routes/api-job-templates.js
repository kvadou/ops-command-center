const express = require("express");
const router = express.Router();

// Use proper RBAC middleware
const { requireAdmin, requireStaffOrAdmin } = require("../middleware/rbac");
const { requireAuth: auth } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Test route without middleware
router.get("/test", (req, res) => {
  logger.info("🧪 Test route hit!");
  res.json({ message: "Test route working", timestamp: new Date().toISOString() });
});

// GET /api/job-templates/categories - Get available categories
router.get("/categories", (req, res) => {
  const categories = ["Home", "Club", "School", "Community", "Online"];
  res.json({ categories });
});

// GET /api/job-templates/premade - Get premade template definitions
router.get("/premade", (req, res) => {
  const premadeTemplates = [
    {
      id: "home-trial",
      name: "Home Trial Lesson",
      description: "Template for home trial chess lessons",
      category: "Home",
      icon: "🏠",
      color: "#4CAF50",
      fields: ["client_name", "student_name", "subject", "address", "is_trial"],
    },
    {
      id: "home-regular",
      name: "Home Regular Lesson",
      description: "Template for regular home chess lessons",
      category: "Home",
      icon: "🏠",
      color: "#4CAF50",
      fields: ["client_name", "student_name", "subject", "address"],
    },
    {
      id: "club-session",
      name: "Club Session",
      description: "Template for chess club sessions",
      category: "Club",
      icon: "👥",
      color: "#2196F3",
      fields: ["class_name", "location", "day_of_week", "time", "subject"],
    },
    {
      id: "school-class",
      name: "School Class",
      description: "Template for school chess classes",
      category: "School",
      icon: "🏫",
      color: "#FF9800",
      fields: ["school_name", "subject", "semester", "section"],
    },
    {
      id: "community-program",
      name: "Community Program",
      description: "Template for community chess programs",
      category: "Community",
      icon: "🌍",
      color: "#9C27B0",
      fields: ["location", "subject", "semester", "section"],
    },
    {
      id: "online-trial",
      name: "Online Trial",
      description: "Template for online trial lessons",
      category: "Online",
      icon: "💻",
      color: "#607D8B",
      fields: ["client_name", "student_name", "subject", "timezone", "is_trial"],
    },
  ];
  res.json({ premadeTemplates });
});

// GET /api/job-templates/field-types - Get available field types for form builder
router.get("/field-types", (req, res) => {
  const fieldTypes = {
    text: {
      id: "text",
      name: "Single Line Text",
      icon: "A",
      description: "Single line text input",
      category: "basic",
    },
    textarea: {
      id: "textarea",
      name: "Paragraph Text",
      icon: "¶",
      description: "Multi-line text input",
      category: "basic",
    },
    select: {
      id: "select",
      name: "Dropdown",
      icon: "▼",
      description: "Dropdown selection",
      category: "basic",
    },
    number: {
      id: "number",
      name: "Number",
      icon: "123",
      description: "Numeric input",
      category: "basic",
    },
    checkbox: {
      id: "checkbox",
      name: "Checkbox",
      icon: "☑",
      description: "Checkbox input",
      category: "basic",
    },
    radio: {
      id: "radio",
      name: "Radio Buttons",
      icon: "●",
      description: "Radio button selection",
      category: "basic",
    },
    email: {
      id: "email",
      name: "Email",
      icon: "✉",
      description: "Email input with validation",
      category: "advanced",
    },
    phone: {
      id: "phone",
      name: "Phone",
      icon: "📞",
      description: "Phone number input",
      category: "advanced",
    },
    date: {
      id: "date",
      name: "Date",
      icon: "📅",
      description: "Date picker",
      category: "advanced",
    },
    time: {
      id: "time",
      name: "Time",
      icon: "🕐",
      description: "Time picker",
      category: "advanced",
    },
    file: {
      id: "file",
      name: "File Upload",
      icon: "📁",
      description: "File upload field",
      category: "advanced",
    },
    address: {
      id: "address",
      name: "Address",
      icon: "📍",
      description: "Address input",
      category: "advanced",
    },
    website: {
      id: "website",
      name: "Website",
      icon: "🌐",
      description: "Website URL input",
      category: "advanced",
    },
  };
  res.json({ fieldTypes });
});

// GET /api/job-templates/brick-variables - Get available brick variables
router.get("/brick-variables", (req, res) => {
  const brickVariables = {
    client_first_name: { label: "Client First Name", category: "client" },
    client_last_name: { label: "Client Last Name", category: "client" },
    client_full_name: { label: "Client Full Name", category: "client" },
    address: { label: "Address", category: "location" },
    subject: { label: "Subject", category: "lesson" },
    booking_type: { label: "Booking Type", category: "lesson" },
    timezone: { label: "Timezone", category: "location" },
    student_name: { label: "Student Name", category: "student" },
    start_date: { label: "Start Date", category: "schedule" },
    lesson_dates: { label: "Lesson Dates", category: "schedule" },
    age_group: { label: "Age Group", category: "student" },
    availability: { label: "Availability", category: "schedule" },
    duration: { label: "Duration", category: "lesson" },
    lesson_type: { label: "Lesson Type", category: "lesson" },
    parent_name: { label: "Parent Name", category: "client" },
    children_info: { label: "Children Info", category: "student" },
    client_notes: { label: "Client Notes", category: "notes" },
    teaching_notes: { label: "Teaching Notes", category: "notes" },
    tutors: { label: "Tutors", category: "lesson" },
    contact: { label: "Contact", category: "school" },
    school_name: { label: "School Name", category: "school" },
    class_name: { label: "Class Name", category: "school" },
    semester: { label: "Semester", category: "school" },
    section: { label: "Section", category: "school" },
    day_of_week: { label: "Day of Week", category: "schedule" },
    time: { label: "Time", category: "schedule" },
    location: { label: "Location", category: "location" },
    number_of_students: { label: "Number of Students", category: "student" },
    custom_field: { label: "Custom Field", category: "custom" },
  };
  res.json({ brickVariables });
});

// GET /api/job-templates/by-category - Get templates grouped by category
router.get("/by-category", asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const hostname = req.get("host") || req.hostname;
    let environment = "production";

    if (hostname.includes("staging")) {
      environment = "staging";
    } else if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
      environment = "local";
    } else {
      const subdomain = hostname.split(".")[0];
      switch (subdomain) {
        case "eastside":
          environment = "eastside";
          break;
        case "westside":
          environment = "westside";
          break;
        default:
          environment = "production";
      }
    }

    const userRole = req.user?.role || "staff";

    const result = await pool.query(
      `
      SELECT 
        jt.*,
        bc.id as brick_config_id,
        bc.brick_layout,
        bc.formatting_options,
        bc.variable_mappings
      FROM job_templates jt
      LEFT JOIN brick_configurations bc ON jt.id = bc.template_id
      WHERE jt.environment = $1
        AND jt.is_active = true
        AND jt.is_archived = false
        AND jt.visible_to_roles @> $2::jsonb
      ORDER BY jt.category, jt.name
    `,
      [environment, JSON.stringify([userRole])]
    );

    // Group by category
    const grouped = {
      Home: [],
      Online: [],
      School: [],
      Club: [],
      Community: []
    };

    result.rows.forEach(template => {
      const category = template.category || 'Other';
      if (grouped[category]) {
        grouped[category].push({
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          templateConfig: template.template_config,
          fieldConfig: template.field_config,
          brickEnabled: template.brick_enabled,
          brickLayout: template.brick_layout,
          variableMappings: template.variable_mappings,
          formattingOptions: template.formatting_options
        });
      }
    });

    res.json({ templates: grouped });
  } catch (error) {
    logger.error({ err: error }, "Error fetching templates by category:");
    res.status(500).json({ error: "Failed to fetch templates by category" });
  }
}));

// GET /api/job-templates - List all templates for current environment
router.get("/", asyncHandler(async (req, res) => {
  try {
    logger.info("🔍 Job templates request started");
    const pool = req.locationPool;
    const hostname = req.get("host") || req.hostname;
    let environment = "production";

    // Use the same logic as middleware for consistency
    if (hostname.includes("staging")) {
      environment = "staging";
    } else if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
      environment = "local";
    } else {
      const subdomain = hostname.split(".")[0];
      switch (subdomain) {
        case "eastside":
          environment = "eastside";
          break;
        case "westside":
          environment = "westside";
          break;
        case "join":
          environment = "production";
          break;
        default:
          environment = "production";
      }
    }

    logger.info(`🔍 Environment detected: ${environment}, Pool: ${pool ? 'exists' : 'null'}`);
    const userRole = req.user?.role || "staff";
    logger.info({ data: req.user }, `🔍 User role: ${userRole}, User object:`);

    const result = await pool.query(
      `
      SELECT 
        jt.*,
        bc.id as brick_config_id,
        bc.brick_layout,
        bc.formatting_options,
        bc.variable_mappings
      FROM job_templates jt
      LEFT JOIN brick_configurations bc ON jt.id = bc.template_id
      WHERE jt.environment = $1
        AND jt.is_active = true
        AND jt.is_archived = false
        AND jt.visible_to_roles @> $2::jsonb
      ORDER BY jt.category, jt.name
    `,
      [environment, JSON.stringify([userRole])]
    );

    logger.info(`🔍 Found ${result.rows.length} templates for environment ${environment} and role ${userRole}`);
    logger.info({ data: result.rows.map(r => ({ id: r.id, name: r.name, visible_to_roles: r.visible_to_roles })) }, `🔍 Template IDs:`);

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, "Error fetching job templates:");
    res.status(500).json({ error: "Failed to fetch job templates" });
  }
}));

// GET /api/job-templates/archived - Get archived templates (admin only)
// IMPORTANT: This must come BEFORE /:id route to avoid route conflicts
router.get("/archived", requireAdmin, asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const hostname = req.get("host") || req.hostname;
    let environment = "production";

    // Use the same logic as middleware for consistency
    if (hostname.includes("staging")) {
      environment = "staging";
    } else if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
      environment = "local";
    } else {
      const subdomain = hostname.split(".")[0];
      switch (subdomain) {
        case "eastside":
          environment = "eastside";
          break;
        case "westside":
          environment = "westside";
          break;
        case "join":
          environment = "production";
          break;
        default:
          environment = "production";
      }
    }

    const result = await pool.query(
      `
      SELECT 
        jt.*,
        bc.id as brick_config_id,
        bc.brick_layout,
        bc.formatting_options,
        bc.variable_mappings
      FROM job_templates jt
      LEFT JOIN brick_configurations bc ON jt.id = bc.template_id
      WHERE jt.environment = $1
        AND jt.is_archived = true
      ORDER BY jt.updated_at DESC, jt.category, jt.name
    `,
      [environment]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, "Error fetching archived job templates:");
    res.status(500).json({ error: "Failed to fetch archived job templates" });
  }
}));

// GET /api/job-templates/:id - Get single template by ID (Job Builder)
// Any authenticated user can view templates for job creation
router.get("/:id", auth, asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT 
        jt.*,
        bc.id as brick_config_id,
        bc.brick_layout,
        bc.formatting_options,
        bc.variable_mappings
      FROM job_templates jt
      LEFT JOIN brick_configurations bc ON jt.id = bc.template_id
      WHERE jt.id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, "Error fetching job template:");
    res.status(500).json({ error: "Failed to fetch job template" });
  }
}));

// POST /api/job-templates - Create new template (admin only)
router.post("/", requireAdmin, asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const hostname = req.get("host") || req.hostname;
    let environment = "production";

    // Use the same logic as GET route for consistency
    if (hostname.includes("staging")) {
      environment = "staging";
    } else if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
      environment = "local";
    } else {
      const subdomain = hostname.split(".")[0];
      switch (subdomain) {
        case "eastside":
          environment = "eastside";
          break;
        case "westside":
          environment = "westside";
          break;
        case "join":
          environment = "production";
          break;
        default:
          environment = "production";
      }
    }

    logger.info(`🔍 POST: Environment detected: ${environment}, Hostname: ${hostname}`);

    const {
      name,
      description,
      category,
      visibleToRoles,
      templateConfig,
      fieldConfig,
      brickEnabled,
      brickLayout,
      formattingOptions,
      variableMappings,
    } = req.body;

    // Log received data for debugging
    logger.info({ data: {
      name,
      category,
      hasTemplateConfig: !!templateConfig,
      hasFieldConfig: !!fieldConfig,
      brickEnabled,
      hasBrickLayout: !!brickLayout,
      hasFormattingOptions: !!formattingOptions,
      hasVariableMappings: !!variableMappings,
    } }, "Creating template with data:");
    logger.info({ data: req.body }, "Full request body:");

    // Validate required fields
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Template name is required" });
    }

    // Check if a template with this name already exists (including archived)
    const existingTemplate = await pool.query(
      `
      SELECT id, name, is_archived, category, created_at
      FROM job_templates
      WHERE name = $1 AND environment = $2
      LIMIT 1
      `,
      [name.trim(), environment]
    );

    if (existingTemplate.rows.length > 0) {
      const existing = existingTemplate.rows[0];
      const status = existing.is_archived ? "archived" : "active";
      return res.status(409).json({
        error: `A template with the name "${name}" already exists in this environment`,
        detail: `The template "${name}" (${status}) was created on ${new Date(existing.created_at).toLocaleDateString()}. Please use a different name or restore/edit the existing template.`,
        existingTemplate: {
          id: existing.id,
          name: existing.name,
          isArchived: existing.is_archived,
          category: existing.category,
        },
      });
    }

    const createdBy = req.user?.email || req.user?.id || "system";

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Insert template
      const templateResult = await pool.query(
        `
        INSERT INTO job_templates (
          name, description, category, environment,
          visible_to_roles, template_config, field_config,
          brick_enabled, is_active, is_archived, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `,
        [
          name,
          description,
          category,
          environment,
          JSON.stringify(visibleToRoles || ["admin", "staff"]),
          JSON.stringify(templateConfig || {}),
          JSON.stringify(fieldConfig || {}),
          brickEnabled !== false,
          true, // is_active - explicitly set to true
          false, // is_archived - explicitly set to false
          createdBy,
          createdBy,
        ]
      );

      const templateId = templateResult.rows[0].id;

      // Insert brick configuration if enabled
      if (brickEnabled !== false) {
        await pool.query(
          `
          INSERT INTO brick_configurations (
            template_id, brick_layout, formatting_options, variable_mappings
          )
          VALUES ($1, $2, $3, $4)
        `,
          [
            templateId,
            JSON.stringify(brickLayout || []),
            JSON.stringify(formattingOptions || {}),
            JSON.stringify(variableMappings || {}),
          ]
        );
      }

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Template created successfully",
        template: templateResult.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    logger.error({ err: error }, "Error creating job template:");
    logger.error({ error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    } }, "Error details:");
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: "A template with this name already exists in this environment",
        detail: error.detail || error.message
      });
    }
    
    if (error.code === '23502') { // Not null violation
      return res.status(400).json({ 
        error: "Required field is missing",
        detail: error.detail || error.message
      });
    }
    
    res.status(500).json({ 
      error: "Failed to create job template",
      message: error.message,
      detail: error.detail || error.message
    });
  }
}));

// PUT /api/job-templates/:id - Update template (admin only)
router.put("/:id", requireAdmin, asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const { id } = req.params;
    const {
      name,
      description,
      category,
      visibleToRoles,
      templateConfig,
      fieldConfig,
      brickEnabled,
      brickLayout,
      formattingOptions,
      variableMappings,
    } = req.body;

    const updatedBy = req.user?.email || req.user?.id || "system";

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Get current version
      const currentTemplate = await pool.query(
        "SELECT version, version_history FROM job_templates WHERE id = $1",
        [id]
      );

      if (currentTemplate.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ error: "Template not found" });
      }

      const currentVersion = currentTemplate.rows[0].version || 1;
      const versionHistory = currentTemplate.rows[0].version_history || [];

      // Add current version to history
      versionHistory.push({
        version: currentVersion,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
        changes: "Template updated",
      });

      // Update template
      const result = await pool.query(
        `
        UPDATE job_templates
        SET 
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          category = COALESCE($3, category),
          visible_to_roles = COALESCE($4, visible_to_roles),
          template_config = COALESCE($5, template_config),
          field_config = COALESCE($6, field_config),
          brick_enabled = COALESCE($7, brick_enabled),
          version = version + 1,
          version_history = $8,
          updated_by = $9,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
        RETURNING *
      `,
        [
          name,
          description,
          category,
          visibleToRoles ? JSON.stringify(visibleToRoles) : null,
          templateConfig ? JSON.stringify(templateConfig) : null,
          fieldConfig ? JSON.stringify(fieldConfig) : null,
          brickEnabled,
          JSON.stringify(versionHistory),
          updatedBy,
          id,
        ]
      );

      // Update brick configuration if provided
      if (brickLayout || formattingOptions || variableMappings) {
        const brickExists = await pool.query(
          "SELECT id FROM brick_configurations WHERE template_id = $1",
          [id]
        );

        if (brickExists.rows.length > 0) {
          await pool.query(
            `
            UPDATE brick_configurations
            SET 
              brick_layout = COALESCE($1, brick_layout),
              formatting_options = COALESCE($2, formatting_options),
              variable_mappings = COALESCE($3, variable_mappings),
              updated_at = CURRENT_TIMESTAMP
            WHERE template_id = $4
          `,
            [
              brickLayout ? JSON.stringify(brickLayout) : null,
              formattingOptions ? JSON.stringify(formattingOptions) : null,
              variableMappings ? JSON.stringify(variableMappings) : null,
              id,
            ]
          );
        } else {
          await pool.query(
            `
            INSERT INTO brick_configurations (
              template_id, brick_layout, formatting_options, variable_mappings
            )
            VALUES ($1, $2, $3, $4)
          `,
            [
              id,
              JSON.stringify(brickLayout || []),
              JSON.stringify(formattingOptions || {}),
              JSON.stringify(variableMappings || {}),
            ]
          );
        }
      }

      await pool.query("COMMIT");

      res.json({
        message: "Template updated successfully",
        template: result.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    logger.error({ err: error }, "Error updating job template:");
    res.status(500).json({ error: "Failed to update job template" });
  }
}));

// DELETE /api/job-templates/:id - Archive template (admin only)
router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE job_templates
      SET is_archived = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json({ message: "Template archived successfully" });
  } catch (error) {
    logger.error({ err: error }, "Error archiving job template:");
    res.status(500).json({ error: "Failed to archive job template" });
  }
}));

// POST /api/job-templates/:id/duplicate - Duplicate template (admin only)
router.post("/:id/duplicate", requireAdmin, asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const { id } = req.params;
    const { newName } = req.body;

    const createdBy = req.user?.email || req.user?.id || "system";

    // Start transaction
    await pool.query("BEGIN");

    try {
      // Get existing template
      const templateResult = await pool.query(
        "SELECT * FROM job_templates WHERE id = $1",
        [id]
      );

      if (templateResult.rows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ error: "Template not found" });
      }

      const existingTemplate = templateResult.rows[0];

      // Create duplicate
      // Ensure JSON fields are properly stringified if they're objects/arrays
      const visibleToRoles = typeof existingTemplate.visible_to_roles === 'string' 
        ? existingTemplate.visible_to_roles 
        : JSON.stringify(existingTemplate.visible_to_roles || ["admin", "staff"]);
      const templateConfig = typeof existingTemplate.template_config === 'string'
        ? existingTemplate.template_config
        : JSON.stringify(existingTemplate.template_config || {});
      const fieldConfig = typeof existingTemplate.field_config === 'string'
        ? existingTemplate.field_config
        : JSON.stringify(existingTemplate.field_config || {});

      const newTemplate = await pool.query(
        `
        INSERT INTO job_templates (
          name, description, category, environment,
          visible_to_roles, template_config, field_config,
          brick_enabled, is_active, is_archived, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `,
        [
          newName || `${existingTemplate.name} (Copy)`,
          existingTemplate.description,
          existingTemplate.category,
          existingTemplate.environment,
          visibleToRoles,
          templateConfig,
          fieldConfig,
          existingTemplate.brick_enabled,
          true, // is_active - explicitly set to true
          false, // is_archived - explicitly set to false
          createdBy,
          createdBy,
        ]
      );

      const newTemplateId = newTemplate.rows[0].id;

      // Duplicate brick configuration
      const brickResult = await pool.query(
        "SELECT * FROM brick_configurations WHERE template_id = $1",
        [id]
      );

      if (brickResult.rows.length > 0) {
        const existingBrick = brickResult.rows[0];
        // Ensure JSON fields are properly stringified if they're objects/arrays
        const brickLayout = typeof existingBrick.brick_layout === 'string'
          ? existingBrick.brick_layout
          : JSON.stringify(existingBrick.brick_layout || []);
        const formattingOptions = typeof existingBrick.formatting_options === 'string'
          ? existingBrick.formatting_options
          : JSON.stringify(existingBrick.formatting_options || {});
        const variableMappings = typeof existingBrick.variable_mappings === 'string'
          ? existingBrick.variable_mappings
          : JSON.stringify(existingBrick.variable_mappings || {});
        
        await pool.query(
          `
          INSERT INTO brick_configurations (
            template_id, brick_layout, formatting_options, variable_mappings
          )
          VALUES ($1, $2, $3, $4)
        `,
          [
            newTemplateId,
            brickLayout,
            formattingOptions,
            variableMappings,
          ]
        );
      }

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Template duplicated successfully",
        template: newTemplate.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    logger.error({ err: error }, "Error duplicating job template:");
    res.status(500).json({ error: "Failed to duplicate job template" });
  }
}));

// POST /api/job-templates/:id/unarchive - Unarchive template (admin only)
router.post("/:id/unarchive", requireAdmin, asyncHandler(async (req, res) => {
  try {
    const pool = req.locationPool;
    const { id } = req.params;
    const updatedBy = req.user?.email || req.user?.id || "system";

    const result = await pool.query(
      `
      UPDATE job_templates
      SET is_archived = false, updated_at = CURRENT_TIMESTAMP, updated_by = $2
      WHERE id = $1
      RETURNING *
    `,
      [id, updatedBy]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json({ 
      message: "Template restored successfully",
      template: result.rows[0]
    });
  } catch (error) {
    logger.error({ err: error }, "Error unarchiving job template:");
    res.status(500).json({ error: "Failed to restore job template" });
  }
}));

module.exports = router;

