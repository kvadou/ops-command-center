const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getPool: getPoolByEnv } = require('../database-connections');
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});
const taskAutomationService = require('../services/task-automation-service');
const cache = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Helper function to get pool from request or determine environment
function getPool(req) {
  // Try to get pool from request (set by location-db middleware)
  if (req.locationPool) {
    return req.locationPool;
  }
  
  // Fallback: determine environment from request or use local
  const hostname = req.get('host') || req.hostname || '';
  let env = 'local';
  
  if (hostname.includes('eastside')) {
    env = 'eastside';
  } else if (hostname.includes('westside')) {
    env = 'westside';
  } else if (process.env.NODE_ENV === 'production' || hostname.includes('herokuapp.com')) {
    env = 'production';
  } else if (process.env.NODE_ENV === 'staging') {
    env = 'staging';
  }
  
  return getPoolByEnv(env);
}

/**
 * Task Management API Routes
 * 
 * Monday.com-style task management system
 * Handles:
 * - Boards, Groups, Items
 * - Comments, Updates, Subscribers
 * - Dependencies
 */

// Get all boards (filtered by branch and user access)
router.get('/boards', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { branch_id, archived } = req.query;
    const userBranch = req.query.branch_id || req.user?.branch_id || 'main';
    const userId = req.user?.id?.toString() || req.user?.email;

    const cacheKey = `tasks:boards:${userId}:${userBranch}:${archived}`;

    const boards = await cache.getOrSet(cacheKey, async () => {
      let whereConditions = ['deleted_at IS NULL'];
      let queryParams = [];
      let paramCount = 0;

      // Branch filtering
      if (userBranch && userBranch !== 'main') {
        paramCount++;
        whereConditions.push(`(branch_id = $${paramCount} OR branch_id IS NULL)`);
        queryParams.push(userBranch);
      }

      // Archived filter
      if (archived === 'true') {
        whereConditions.push('is_archived = true');
      } else if (archived === 'false' || !archived) {
        whereConditions.push('is_archived = false');
      }

      const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

      const query = `
        SELECT
          b.*,
          u.email as owner_email,
          u.first_name as owner_first_name,
          u.last_name as owner_last_name,
          (SELECT COUNT(*) FROM task_items WHERE board_id = b.id AND deleted_at IS NULL) as item_count
        FROM task_boards b
        LEFT JOIN users u ON b.owner_id = u.id::text OR b.owner_id = u.email
        ${whereClause}
        ORDER BY b.created_at DESC
      `;

      const { rows } = await pool.query(query, queryParams);
      return rows;
    }, 60);

    res.json({ boards });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching boards:');
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
}));

// Create a new board
router.post('/boards', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { name, description, board_type = 'kanban', branch_id } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Board name is required' });
    }

    const ownerId = req.user?.id?.toString() || req.user?.email;
    const userBranch = branch_id || req.user?.branch_id || 'main';

    const query = `
      INSERT INTO task_boards (name, description, board_type, branch_id, owner_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      name.trim(),
      description?.trim() || null,
      board_type,
      userBranch === 'main' ? null : userBranch,
      ownerId
    ]);

    const board = rows[0];

    // Create default groups for the new board
    const defaultGroups = [
      { name: 'To Do', position: 0 },
      { name: 'In Progress', position: 1 },
      { name: 'Done', position: 2 }
    ];

    for (const group of defaultGroups) {
      await pool.query(
        'INSERT INTO task_groups (board_id, name, position) VALUES ($1, $2, $3)',
        [board.id, group.name, group.position]
      );
    }

    // Clear cache for this user
    await cache.clearCacheByPrefix(`tasks:boards:${ownerId}`);

    res.status(201).json({ board: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating board:');
    res.status(500).json({ error: 'Failed to create board' });
  }
}));

// Get board with groups and items
router.get('/boards/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    // Get board
    const boardQuery = `
      SELECT 
        b.*,
        u.email as owner_email,
        u.first_name as owner_first_name,
        u.last_name as owner_last_name
      FROM task_boards b
      LEFT JOIN users u ON b.owner_id = u.id::text OR b.owner_id = u.email
      WHERE b.id = $1 AND b.deleted_at IS NULL
    `;
    const { rows: boardRows } = await pool.query(boardQuery, [id]);
    
    if (boardRows.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    const board = boardRows[0];
    
    // Get groups
    const groupsQuery = `
      SELECT *
      FROM task_groups
      WHERE board_id = $1 AND deleted_at IS NULL
      ORDER BY position ASC, created_at ASC
    `;
    const { rows: groups } = await pool.query(groupsQuery, [id]);
    
    // Get custom fields for the board
    const fieldsQuery = `
      SELECT *
      FROM task_custom_fields
      WHERE board_id = $1 AND deleted_at IS NULL
      ORDER BY position ASC, created_at ASC
    `;
    const { rows: customFields } = await pool.query(fieldsQuery, [id]);
    board.custom_fields = customFields;
    
      // --- BATCH APPROACH: Replace N+1 nested loops with 4 batch queries ---
      // Previously: for each group -> query items -> for each item -> query field values + subitems
      // A board with 5 groups x 20 items = ~205 sequential queries, risking Heroku H12 timeout.
      // Now: 4 total queries regardless of board size, assembled in JS.

      const groupIds = groups.map(g => g.id);

      // Batch query 1: Fetch ALL top-level items for all groups in the board at once
      let allItems = [];
      if (groupIds.length > 0) {
        const itemsQuery = `
          SELECT
            i.*,
            u1.email as assignee_email,
            u1.first_name as assignee_first_name,
            u1.last_name as assignee_last_name,
            u2.email as creator_email,
            u2.first_name as creator_first_name,
            u2.last_name as creator_last_name,
            (SELECT COUNT(*) FROM task_comments WHERE item_id = i.id AND deleted_at IS NULL) as comment_count,
            (SELECT COUNT(*) FROM task_subscribers WHERE item_id = i.id) as subscriber_count,
            (SELECT COUNT(*) FROM task_items WHERE parent_item_id = i.id AND deleted_at IS NULL) as subitem_count
          FROM task_items i
          LEFT JOIN users u1 ON i.assignee_id = u1.id::text OR i.assignee_id = u1.email
          LEFT JOIN users u2 ON i.creator_id = u2.id::text OR i.creator_id = u2.email
          WHERE i.group_id = ANY($1) AND i.deleted_at IS NULL AND i.parent_item_id IS NULL
          ORDER BY i.position ASC, i.created_at ASC
        `;
        const { rows } = await pool.query(itemsQuery, [groupIds]);
        allItems = rows;
      }

      const itemIds = allItems.map(i => i.id);

      // Batch queries 2 & 3: Fetch ALL field values and ALL subitems in parallel
      let allFieldValues = [];
      let allSubitems = [];
      if (itemIds.length > 0) {
        const [fieldValuesResult, subitemsResult] = await Promise.all([
          // Batch query 2: ALL field values for all items at once
          pool.query(`
            SELECT
              fv.*,
              cf.name as field_name,
              cf.field_type,
              cf.field_subtype,
              cf.field_config
            FROM task_item_field_values fv
            INNER JOIN task_custom_fields cf ON fv.field_id = cf.id
            WHERE fv.item_id = ANY($1) AND cf.deleted_at IS NULL
          `, [itemIds]),
          // Batch query 3: ALL subitems for all items at once
          pool.query(`
            SELECT
              i.*,
              u1.email as assignee_email,
              u1.first_name as assignee_first_name,
              u1.last_name as assignee_last_name
            FROM task_items i
            LEFT JOIN users u1 ON i.assignee_id = u1.id::text OR i.assignee_id = u1.email
            WHERE i.parent_item_id = ANY($1) AND i.deleted_at IS NULL
            ORDER BY i.position ASC, i.created_at ASC
          `, [itemIds])
        ]);
        allFieldValues = fieldValuesResult.rows;
        allSubitems = subitemsResult.rows;
      }

      // --- Assemble the nested structure in JavaScript ---
      // Index field values by item_id for O(1) lookup
      const fieldValuesByItemId = new Map();
      for (const fv of allFieldValues) {
        if (!fieldValuesByItemId.has(fv.item_id)) {
          fieldValuesByItemId.set(fv.item_id, []);
        }
        fieldValuesByItemId.get(fv.item_id).push(fv);
      }

      // Index subitems by parent_item_id for O(1) lookup
      const subitemsByParentId = new Map();
      for (const si of allSubitems) {
        if (!subitemsByParentId.has(si.parent_item_id)) {
          subitemsByParentId.set(si.parent_item_id, []);
        }
        subitemsByParentId.get(si.parent_item_id).push(si);
      }

      // Attach field values and subitems to each item
      for (const item of allItems) {
        item.custom_field_values = fieldValuesByItemId.get(item.id) || [];
        item.subitems = subitemsByParentId.get(item.id) || [];
      }

      // Index items by group_id and attach to groups
      const itemsByGroupId = new Map();
      for (const item of allItems) {
        if (!itemsByGroupId.has(item.group_id)) {
          itemsByGroupId.set(item.group_id, []);
        }
        itemsByGroupId.get(item.group_id).push(item);
      }

      for (const group of groups) {
        group.items = itemsByGroupId.get(group.id) || [];
      }
    
    board.groups = groups;
    res.json({ board });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching board:');
    res.status(500).json({ error: 'Failed to fetch board' });
  }
}));

// Create a new group
router.post('/boards/:boardId/groups', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { boardId } = req.params;
    const { name, position, color } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    // Get max position if not provided
    let groupPosition = position;
    if (groupPosition === undefined || groupPosition === null) {
      const maxPosQuery = await pool.query(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM task_groups WHERE board_id = $1',
        [boardId]
      );
      groupPosition = parseInt(maxPosQuery.rows[0].next_position);
    }
    
    const query = `
      INSERT INTO task_groups (board_id, name, position, color)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [boardId, name.trim(), groupPosition, color || null]);
    res.status(201).json({ group: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating group:');
    res.status(500).json({ error: 'Failed to create group' });
  }
}));

// Update a group (for position, name, etc.)
router.patch('/groups/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const allowedFields = ['name', 'position', 'color'];
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        paramCount++;
        updateFields.push(`${field} = $${paramCount}`);
        updateValues.push(updates[field]);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    paramCount++;
    updateValues.push(id);
    
    const query = `
      UPDATE task_groups
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, updateValues);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({ group: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating group:');
    res.status(500).json({ error: 'Failed to update group' });
  }
}));

// Create a new task item
router.post('/boards/:boardId/items', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { boardId } = req.params;
    const {
      group_id,
      name,
      description,
      status = 'todo',
      priority = 'medium',
      due_date,
      start_date,
      assignee_id,
      position,
      tags = [],
      custom_fields = {}
    } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    
    if (!group_id) {
      return res.status(400).json({ error: 'Group ID is required' });
    }
    
    const creatorId = req.user?.id?.toString() || req.user?.email;
    
    // Get max position if not provided
    let itemPosition = position;
    if (itemPosition === undefined || itemPosition === null) {
      const maxPosQuery = await pool.query(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM task_items WHERE group_id = $1',
        [group_id]
      );
      itemPosition = parseInt(maxPosQuery.rows[0].next_position);
    }
    
    const query = `
      INSERT INTO task_items (
        board_id, group_id, name, description, status, priority,
        due_date, start_date, assignee_id, creator_id, position,
        tags, custom_fields
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      boardId,
      group_id,
      name.trim(),
      description?.trim() || null,
      status,
      priority,
      due_date || null,
      start_date || null,
      assignee_id || null,
      creatorId,
      itemPosition,
      JSON.stringify(tags),
      JSON.stringify(custom_fields)
    ]);
    
    // Get full item with user info
    const itemQuery = `
      SELECT 
        i.*,
        u1.email as assignee_email,
        u1.first_name as assignee_first_name,
        u1.last_name as assignee_last_name,
        u2.email as creator_email,
        u2.first_name as creator_first_name,
        u2.last_name as creator_last_name
      FROM task_items i
      LEFT JOIN users u1 ON i.assignee_id = u1.id::text OR i.assignee_id = u1.email
      LEFT JOIN users u2 ON i.creator_id = u2.id::text OR i.creator_id = u2.email
      WHERE i.id = $1
    `;
    const { rows: itemRows } = await pool.query(itemQuery, [rows[0].id]);
    
    res.status(201).json({ item: itemRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating item:');
    res.status(500).json({ error: 'Failed to create item' });
  }
}));

// Delete a task item (soft delete)
router.delete('/items/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    const query = `
      UPDATE task_items
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting task:');
    res.status(500).json({ error: 'Failed to delete task' });
  }
}));

// Update a task item
router.patch('/items/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const updates = req.body;
    
    // Get current task state for automation triggers
    const currentQuery = 'SELECT status FROM task_items WHERE id = $1';
    const { rows: currentRows } = await pool.query(currentQuery, [id]);
    const oldStatus = currentRows[0]?.status;
    
    // Build dynamic update query
    const allowedFields = [
      'name', 'description', 'status', 'priority', 'due_date', 'start_date',
      'assignee_id', 'position', 'group_id', 'tags', 'custom_fields'
    ];
    
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        paramCount++;
        if (field === 'tags' || field === 'custom_fields') {
          updateFields.push(`${field} = $${paramCount}::jsonb`);
          updateValues.push(JSON.stringify(updates[field]));
        } else {
          updateFields.push(`${field} = $${paramCount}`);
          updateValues.push(updates[field]);
        }
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    paramCount++;
    updateValues.push(id);
    
    const query = `
      UPDATE task_items
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, updateValues);
    
    // Get full item with user info
    const itemQuery = `
      SELECT 
        i.*,
        u1.email as assignee_email,
        u1.first_name as assignee_first_name,
        u1.last_name as assignee_last_name,
        u2.email as creator_email,
        u2.first_name as creator_first_name,
        u2.last_name as creator_last_name
      FROM task_items i
      LEFT JOIN users u1 ON i.assignee_id = u1.id::text OR i.assignee_id = u1.email
      LEFT JOIN users u2 ON i.creator_id = u2.id::text OR i.creator_id = u2.email
      WHERE i.id = $1
    `;
    const { rows: itemRows } = await pool.query(itemQuery, [rows[0].id]);
    
    // Trigger automations if status changed
    const newStatus = updates.status;
    if (newStatus && oldStatus && newStatus !== oldStatus) {
      // Run automation in background (don't wait for it)
      taskAutomationService.initialize(pool);
      taskAutomationService.evaluateStatusChangeTriggers(id, oldStatus, newStatus, pool)
        .catch(err => logger.error({ err }, 'Error evaluating status change triggers'));
      
      // Handle task completion dependencies
      if (newStatus === 'done') {
        taskAutomationService.handleTaskCompletion(id, pool)
          .catch(err => logger.error({ err }, 'Error handling task completion'));
      }
    }
    
    res.json({ item: itemRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating item:');
    res.status(500).json({ error: 'Failed to update item' });
  }
}));

// Get user's tasks (assigned or created)
router.get('/my-tasks', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { status, priority, due_soon } = req.query;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    let whereConditions = [
      'i.deleted_at IS NULL',
      `(i.assignee_id = $1 OR i.creator_id = $1)`
    ];
    let queryParams = [userId];
    let paramCount = 1;
    
    if (status) {
      paramCount++;
      whereConditions.push(`i.status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (priority) {
      paramCount++;
      whereConditions.push(`i.priority = $${paramCount}`);
      queryParams.push(priority);
    }
    
    if (due_soon === 'true') {
      whereConditions.push(`i.due_date IS NOT NULL AND i.due_date <= NOW() + INTERVAL '7 days' AND i.status != 'done'`);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    const query = `
      SELECT 
        i.*,
        b.name as board_name,
        g.name as group_name,
        u1.email as assignee_email,
        u1.first_name as assignee_first_name,
        u1.last_name as assignee_last_name,
        u2.email as creator_email,
        u2.first_name as creator_first_name,
        u2.last_name as creator_last_name
      FROM task_items i
      INNER JOIN task_boards b ON i.board_id = b.id
      INNER JOIN task_groups g ON i.group_id = g.id
      LEFT JOIN users u1 ON i.assignee_id = u1.id::text OR i.assignee_id = u1.email
      LEFT JOIN users u2 ON i.creator_id = u2.id::text OR i.creator_id = u2.email
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN i.due_date IS NOT NULL AND i.status != 'done' THEN 0 ELSE 1 END,
        i.due_date ASC,
        i.created_at DESC
      LIMIT 50
    `;
    
    const { rows } = await pool.query(query, queryParams);
    res.json({ tasks: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching my tasks:');
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
}));

// Get comments for a task item (with replies and reactions)
router.get('/items/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    // Get top-level comments
    const commentsQuery = `
      SELECT 
        c.*,
        u.email as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url
      FROM task_comments c
      LEFT JOIN users u ON c.author_id = u.id::text OR c.author_id = u.email
      WHERE c.item_id = $1 AND c.deleted_at IS NULL AND c.parent_comment_id IS NULL
      ORDER BY c.created_at ASC
    `;
    
    const { rows: comments } = await pool.query(commentsQuery, [id]);
    
    // Get replies for each comment
    for (const comment of comments) {
      const repliesQuery = `
        SELECT 
          c.*,
          u.email as author_email,
          u.first_name as author_first_name,
          u.last_name as author_last_name,
          NULL as author_image_url
        FROM task_comments c
        LEFT JOIN users u ON c.author_id = u.id::text OR c.author_id = u.email
        WHERE c.parent_comment_id = $1 AND c.deleted_at IS NULL
        ORDER BY c.created_at ASC
      `;
      const { rows: replies } = await pool.query(repliesQuery, [comment.id]);
      comment.replies = replies;
      
      // Get reactions for each comment
      const reactionsQuery = `
        SELECT 
          r.*,
          u.email as user_email,
          u.first_name as user_first_name
        FROM task_comment_reactions r
        LEFT JOIN users u ON r.user_id = u.id::text OR r.user_id = u.email
        WHERE r.comment_id = $1
        ORDER BY r.created_at ASC
      `;
      const { rows: reactions } = await pool.query(reactionsQuery, [comment.id]);
      comment.reactions = reactions;
      
      // Also get reactions for replies
      for (const reply of replies) {
        const replyReactionsQuery = `
          SELECT 
            r.*,
            u.email as user_email,
            u.first_name as user_first_name
          FROM task_comment_reactions r
          LEFT JOIN users u ON r.user_id = u.id::text OR r.user_id = u.email
          WHERE r.comment_id = $1
          ORDER BY r.created_at ASC
        `;
        const { rows: replyReactions } = await pool.query(replyReactionsQuery, [reply.id]);
        reply.reactions = replyReactions;
      }
    }
    
    res.json({ comments });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching comments:');
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
}));

// Add a comment to a task item (or reply to a comment)
router.post('/items/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { content, parent_comment_id } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    
    const authorId = req.user?.id?.toString() || req.user?.email;
    
    const query = `
      INSERT INTO task_comments (item_id, parent_comment_id, author_id, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [id, parent_comment_id || null, authorId, content.trim()]);
    
    // Create update log entry
    await pool.query(
      `INSERT INTO task_updates (item_id, author_id, update_type, field_name, new_value)
       VALUES ($1, $2, 'comment', 'comment', $3)`,
      [id, authorId, content.trim().substring(0, 100)]
    );
    
    // Get full comment with author info
    const commentQuery = `
      SELECT 
        c.*,
        u.email as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url
      FROM task_comments c
      LEFT JOIN users u ON c.author_id = u.id::text OR c.author_id = u.email
      WHERE c.id = $1
    `;
    const { rows: commentRows } = await pool.query(commentQuery, [rows[0].id]);
    
    res.status(201).json({ comment: commentRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating comment:');
    res.status(500).json({ error: 'Failed to create comment' });
  }
}));

// Update a comment
router.patch('/comments/:commentId', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    
    // Verify ownership
    const checkQuery = await pool.query(
      'SELECT author_id FROM task_comments WHERE id = $1',
      [commentId]
    );
    
    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    if (checkQuery.rows[0].author_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit this comment' });
    }
    
    const updateQuery = `
      UPDATE task_comments
      SET content = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const { rows } = await pool.query(updateQuery, [content.trim(), commentId]);
    
    // Get full comment with author info
    const commentQuery = `
      SELECT 
        c.*,
        u.email as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url
      FROM task_comments c
      LEFT JOIN users u ON c.author_id = u.id::text OR c.author_id = u.email
      WHERE c.id = $1
    `;
    const { rows: commentRows } = await pool.query(commentQuery, [rows[0].id]);
    
    res.json({ comment: commentRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating comment:');
    res.status(500).json({ error: 'Failed to update comment' });
  }
}));

// Delete a comment (soft delete)
router.delete('/comments/:commentId', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { commentId } = req.params;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    // Verify ownership
    const checkQuery = await pool.query(
      'SELECT author_id FROM task_comments WHERE id = $1',
      [commentId]
    );
    
    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    if (checkQuery.rows[0].author_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }
    
    await pool.query(
      'UPDATE task_comments SET deleted_at = NOW() WHERE id = $1',
      [commentId]
    );
    
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting comment:');
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}));

// Add reaction to a comment
router.post('/comments/:commentId/reactions', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { commentId } = req.params;
    const { emoji } = req.body;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }
    
    const query = `
      INSERT INTO task_comment_reactions (comment_id, user_id, emoji)
      VALUES ($1, $2, $3)
      ON CONFLICT (comment_id, user_id, emoji) DO NOTHING
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [commentId, userId, emoji]);
    
    if (rows.length === 0) {
      // Reaction already exists, remove it (toggle)
      await pool.query(
        'DELETE FROM task_comment_reactions WHERE comment_id = $1 AND user_id = $2 AND emoji = $3',
        [commentId, userId, emoji]
      );
      return res.json({ reaction: null, removed: true });
    }
    
    res.status(201).json({ reaction: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error adding reaction:');
    res.status(500).json({ error: 'Failed to add reaction' });
  }
}));

// Get updates/activity for a task item
router.get('/items/:id/updates', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    const query = `
      SELECT 
        u.*,
        usr.email as author_email,
        usr.first_name as author_first_name,
        usr.last_name as author_last_name
      FROM task_updates u
      LEFT JOIN users usr ON u.author_id = usr.id::text OR u.author_id = usr.email
      WHERE u.item_id = $1
      ORDER BY u.created_at DESC
      LIMIT 50
    `;
    
    const { rows } = await pool.query(query, [id]);
    res.json({ updates: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching updates:');
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
}));

// ============================================
// FILE ATTACHMENTS ENDPOINTS
// ============================================

// Upload file attachment to task
router.post('/items/:id/attachments', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const uploaderId = req.user?.id?.toString() || req.user?.email;
    const fileSize = file.size;
    const ONE_MB = 1024 * 1024;
    
    // Determine storage type based on file size
    const storageType = fileSize < ONE_MB ? 'database' : 'cloudinary';
    
    let attachmentData = {
      item_id: id,
      uploader_id: uploaderId,
      filename: file.originalname,
      original_filename: file.originalname,
      file_size: fileSize,
      mime_type: file.mimetype,
      storage_type: storageType
    };
    
    if (storageType === 'database') {
      // Store in database
      attachmentData.file_data = file.buffer;
      attachmentData.cloudinary_public_id = null;
      attachmentData.cloudinary_url = null;
    } else {
      // Upload to Cloudinary
      const { cloudinary } = global;
      
      // Convert buffer to base64 data URI
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      
      // Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(base64Data, {
        folder: 'task_attachments',
        resource_type: 'auto',
        public_id: `task_${id}_${Date.now()}`
      });
      
      attachmentData.file_data = null;
      attachmentData.cloudinary_public_id = uploadResult.public_id;
      attachmentData.cloudinary_url = uploadResult.secure_url;
    }
    
    // Insert into database
    const query = `
      INSERT INTO task_attachments (
        item_id, uploader_id, filename, original_filename, 
        file_size, mime_type, storage_type, file_data, 
        cloudinary_public_id, cloudinary_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, item_id, filename, original_filename, file_size, mime_type, 
                storage_type, cloudinary_url, created_at
    `;
    
    const { rows } = await pool.query(query, [
      attachmentData.item_id,
      attachmentData.uploader_id,
      attachmentData.filename,
      attachmentData.original_filename,
      attachmentData.file_size,
      attachmentData.mime_type,
      attachmentData.storage_type,
      attachmentData.file_data,
      attachmentData.cloudinary_public_id,
      attachmentData.cloudinary_url
    ]);
    
    // Get uploader info
    const attachmentQuery = `
      SELECT 
        a.id, a.item_id, a.filename, a.original_filename, a.file_size, 
        a.mime_type, a.storage_type, a.cloudinary_url, a.created_at,
        u.email as uploader_email,
        u.first_name as uploader_first_name,
        u.last_name as uploader_last_name
      FROM task_attachments a
      LEFT JOIN users u ON a.uploader_id = u.id::text OR a.uploader_id = u.email
      WHERE a.id = $1
    `;
    const { rows: attachmentRows } = await pool.query(attachmentQuery, [rows[0].id]);
    
    res.status(201).json({ attachment: attachmentRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading attachment:');
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
}));

// Get all attachments for a task
router.get('/items/:id/attachments', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    const query = `
      SELECT 
        a.id, a.item_id, a.filename, a.original_filename, a.file_size, 
        a.mime_type, a.storage_type, a.cloudinary_url, a.created_at,
        u.email as uploader_email,
        u.first_name as uploader_first_name,
        u.last_name as uploader_last_name
      FROM task_attachments a
      LEFT JOIN users u ON a.uploader_id = u.id::text OR a.uploader_id = u.email
      WHERE a.item_id = $1 AND a.deleted_at IS NULL
      ORDER BY a.created_at DESC
    `;
    
    const { rows } = await pool.query(query, [id]);
    res.json({ attachments: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching attachments:');
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
}));

// Download attachment
router.get('/attachments/:attachmentId/download', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { attachmentId } = req.params;
    
    const query = `
      SELECT * FROM task_attachments 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    
    const { rows } = await pool.query(query, [attachmentId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = rows[0];
    
    if (attachment.storage_type === 'database') {
      // Serve from database
      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_filename}"`);
      res.send(attachment.file_data);
    } else {
      // Redirect to Cloudinary URL
      res.redirect(attachment.cloudinary_url);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error downloading attachment:');
    res.status(500).json({ error: 'Failed to download attachment' });
  }
}));

// Delete attachment
router.delete('/attachments/:attachmentId', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { attachmentId } = req.params;
    
    // Get attachment info first
    const selectQuery = `
      SELECT * FROM task_attachments 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    
    const { rows } = await pool.query(selectQuery, [attachmentId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = rows[0];
    
    // If stored in Cloudinary, delete from there
    if (attachment.storage_type === 'cloudinary' && attachment.cloudinary_public_id) {
      try {
        const { cloudinary } = global;
        await cloudinary.uploader.destroy(attachment.cloudinary_public_id);
      } catch (cloudinaryError) {
        logger.error({ data: cloudinaryError }, 'Error deleting from Cloudinary:');
        // Continue with soft delete even if Cloudinary delete fails
      }
    }
    
    // Soft delete from database
    const deleteQuery = `
      UPDATE task_attachments 
      SET deleted_at = NOW()
      WHERE id = $1
      RETURNING id
    `;
    
    await pool.query(deleteQuery, [attachmentId]);
    
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting attachment:');
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
}));

// ============================================
// AUTOMATION & WORKFLOW ENDPOINTS
// ============================================

// Get all automation rules
router.get('/automation/rules', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { board_id, trigger_type, is_enabled } = req.query;
    
    let whereConditions = ['deleted_at IS NULL'];
    let queryParams = [];
    let paramCount = 0;
    
    if (board_id) {
      paramCount++;
      whereConditions.push(`(board_id = $${paramCount} OR board_id IS NULL)`);
      queryParams.push(board_id);
    }
    
    if (trigger_type) {
      paramCount++;
      whereConditions.push(`trigger_type = $${paramCount}`);
      queryParams.push(trigger_type);
    }
    
    if (is_enabled !== undefined) {
      whereConditions.push(`is_enabled = ${is_enabled === 'true'}`);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    const query = `
      SELECT 
        ar.*,
        u.email as creator_email,
        u.first_name as creator_first_name,
        u.last_name as creator_last_name,
        (SELECT COUNT(*) FROM task_automation_logs WHERE rule_id = ar.id) as execution_count_total
      FROM task_automation_rules ar
      LEFT JOIN users u ON ar.created_by = u.id::text OR ar.created_by = u.email
      ${whereClause}
      ORDER BY ar.created_at DESC
    `;
    
    const { rows } = await pool.query(query, queryParams);
    res.json({ rules: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching automation rules:');
    res.status(500).json({ error: 'Failed to fetch automation rules' });
  }
}));

// Create automation rule
router.post('/automation/rules', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const {
      name,
      description,
      board_id,
      branch_id,
      trigger_type,
      trigger_config,
      conditions,
      actions,
      max_executions
    } = req.body;
    
    if (!name || !trigger_type || !actions) {
      return res.status(400).json({ error: 'Name, trigger_type, and actions are required' });
    }
    
    const createdBy = req.user?.id?.toString() || req.user?.email;
    
    const query = `
      INSERT INTO task_automation_rules (
        name, description, board_id, branch_id, trigger_type,
        trigger_config, conditions, actions, max_executions, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      name,
      description || null,
      board_id || null,
      branch_id || null,
      trigger_type,
      JSON.stringify(trigger_config || {}),
      JSON.stringify(conditions || []),
      JSON.stringify(actions),
      max_executions || null,
      createdBy
    ]);
    
    res.status(201).json({ rule: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating automation rule:');
    res.status(500).json({ error: 'Failed to create automation rule' });
  }
}));

// Update automation rule
router.put('/automation/rules/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'name', 'description', 'is_enabled', 'trigger_config', 
      'conditions', 'actions', 'max_executions'
    ];
    
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        paramCount++;
        if (['trigger_config', 'conditions', 'actions'].includes(field)) {
          updateFields.push(`${field} = $${paramCount}::jsonb`);
          updateValues.push(JSON.stringify(updates[field]));
        } else {
          updateFields.push(`${field} = $${paramCount}`);
          updateValues.push(updates[field]);
        }
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    paramCount++;
    updateValues.push(id);
    
    const query = `
      UPDATE task_automation_rules
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, updateValues);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }
    
    res.json({ rule: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating automation rule:');
    res.status(500).json({ error: 'Failed to update automation rule' });
  }
}));

// Delete automation rule
router.delete('/automation/rules/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    const query = `
      UPDATE task_automation_rules
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }
    
    res.json({ success: true, message: 'Automation rule deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting automation rule:');
    res.status(500).json({ error: 'Failed to delete automation rule' });
  }
}));

// Get automation logs
router.get('/automation/logs', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { rule_id, task_id, status, limit = 50 } = req.query;
    
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;
    
    if (rule_id) {
      paramCount++;
      whereConditions.push(`rule_id = $${paramCount}`);
      queryParams.push(rule_id);
    }
    
    if (task_id) {
      paramCount++;
      whereConditions.push(`task_id = $${paramCount}`);
      queryParams.push(task_id);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`status = $${paramCount}`);
      queryParams.push(status);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    paramCount++;
    queryParams.push(parseInt(limit));
    
    const query = `
      SELECT 
        al.*,
        ar.name as rule_name
      FROM task_automation_logs al
      LEFT JOIN task_automation_rules ar ON al.rule_id = ar.id
      ${whereClause}
      ORDER BY al.executed_at DESC
      LIMIT $${paramCount}
    `;
    
    const { rows } = await pool.query(query, queryParams);
    res.json({ logs: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching automation logs:');
    res.status(500).json({ error: 'Failed to fetch automation logs' });
  }
}));

// Get workflow templates
router.get('/workflows/templates', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { category, is_active = 'true' } = req.query;
    const userBranch = req.user?.branch_id || 'main';
    
    let whereConditions = ['deleted_at IS NULL'];
    let queryParams = [];
    let paramCount = 0;
    
    if (is_active !== undefined) {
      whereConditions.push(`is_active = ${is_active === 'true'}`);
    }
    
    if (category) {
      paramCount++;
      whereConditions.push(`category = $${paramCount}`);
      queryParams.push(category);
    }
    
    // Include global templates and branch-specific templates
    if (userBranch && userBranch !== 'main') {
      paramCount++;
      whereConditions.push(`(branch_id IS NULL OR branch_id = $${paramCount})`);
      queryParams.push(userBranch);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    const query = `
      SELECT 
        wt.*,
        u.email as creator_email,
        u.first_name as creator_first_name,
        u.last_name as creator_last_name,
        (SELECT COUNT(*) FROM task_workflow_instances WHERE template_id = wt.id) as execution_count
      FROM task_workflow_templates wt
      LEFT JOIN users u ON wt.created_by = u.id::text OR wt.created_by = u.email
      ${whereClause}
      ORDER BY wt.category, wt.name
    `;
    
    const { rows } = await pool.query(query, queryParams);
    res.json({ templates: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching workflow templates:');
    res.status(500).json({ error: 'Failed to fetch workflow templates' });
  }
}));

// Execute workflow template
router.post('/workflows/:templateId/execute', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { templateId } = req.params;
    const { board_id, context_data, default_assignee } = req.body;
    
    // Initialize automation service with pool
    taskAutomationService.initialize(pool);
    
    // Prepare context
    const context = {
      event_data: {
        board_id,
        user_id: req.user?.id?.toString() || req.user?.email,
        ...context_data
      }
    };
    
    const config = {
      template_id: templateId,
      board_id,
      default_assignee
    };
    
    // Execute workflow
    const result = await taskAutomationService.executeWorkflowTemplate(config, context, pool);
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    res.status(201).json({ 
      success: true,
      workflow_instance_id: result.workflow_instance_id,
      created_task_ids: result.created_task_ids,
      board_id: result.board_id
    });
  } catch (error) {
    logger.error({ err: error }, 'Error executing workflow template:');
    res.status(500).json({ error: 'Failed to execute workflow template' });
  }
}));

// Create workflow template
router.post('/workflows/templates', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const {
      name,
      description,
      category,
      icon,
      template_data,
      default_board_name,
      default_groups,
      branch_id
    } = req.body;
    
    if (!name || !template_data) {
      return res.status(400).json({ error: 'Name and template_data are required' });
    }
    
    const createdBy = req.user?.id?.toString() || req.user?.email;
    
    const query = `
      INSERT INTO task_workflow_templates (
        name, description, category, icon, template_data,
        default_board_name, default_groups, branch_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      name,
      description || null,
      category || null,
      icon || null,
      JSON.stringify(template_data),
      default_board_name || null,
      default_groups ? JSON.stringify(default_groups) : null,
      branch_id || null,
      createdBy
    ]);
    
    res.status(201).json({ template: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating workflow template:');
    res.status(500).json({ error: 'Failed to create workflow template' });
  }
}));

// ============================================
// SUBITEMS ENDPOINTS
// ============================================

// Get subitems for a task
router.get('/items/:itemId/subitems', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    
    const query = `
      SELECT 
        i.*,
        u1.email as assignee_email,
        u1.first_name as assignee_first_name,
        u1.last_name as assignee_last_name,
        u2.email as creator_email,
        u2.first_name as creator_first_name,
        u2.last_name as creator_last_name,
        (SELECT COUNT(*) FROM task_comments WHERE item_id = i.id AND deleted_at IS NULL) as comment_count,
        (SELECT COUNT(*) FROM task_items WHERE parent_item_id = i.id AND deleted_at IS NULL) as subitem_count
      FROM task_items i
      LEFT JOIN users u1 ON i.assignee_id = u1.id::text OR i.assignee_id = u1.email
      LEFT JOIN users u2 ON i.creator_id = u2.id::text OR i.creator_id = u2.email
      WHERE i.parent_item_id = $1 AND i.deleted_at IS NULL
      ORDER BY i.position ASC, i.created_at ASC
    `;
    
    const { rows } = await pool.query(query, [itemId]);
    res.json({ subitems: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching subitems:');
    res.status(500).json({ error: 'Failed to fetch subitems' });
  }
}));

// Create subitem
router.post('/items/:itemId/subitems', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    const {
      name,
      description,
      status = 'todo',
      priority = 'medium',
      due_date,
      assignee_id,
      position
    } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Subitem name is required' });
    }
    
    // Get parent item to get board_id and group_id
    const parentQuery = await pool.query(
      'SELECT board_id, group_id FROM task_items WHERE id = $1',
      [itemId]
    );
    
    if (parentQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Parent item not found' });
    }
    
    const parent = parentQuery.rows[0];
    const creatorId = req.user?.id?.toString() || req.user?.email;
    
    // Get max position if not provided
    let itemPosition = position;
    if (itemPosition === undefined || itemPosition === null) {
      const maxPosQuery = await pool.query(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM task_items WHERE parent_item_id = $1',
        [itemId]
      );
      itemPosition = parseInt(maxPosQuery.rows[0].next_position);
    }
    
    const query = `
      INSERT INTO task_items (
        board_id, group_id, parent_item_id, name, description, status, priority,
        due_date, assignee_id, creator_id, position
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      parent.board_id,
      parent.group_id,
      itemId,
      name.trim(),
      description?.trim() || null,
      status,
      priority,
      due_date || null,
      assignee_id || null,
      creatorId,
      itemPosition
    ]);
    
    // Get full item with user info
    const itemQuery = `
      SELECT 
        i.*,
        u1.email as assignee_email,
        u1.first_name as assignee_first_name,
        u1.last_name as assignee_last_name,
        u2.email as creator_email,
        u2.first_name as creator_first_name,
        u2.last_name as creator_last_name
      FROM task_items i
      LEFT JOIN users u1 ON i.assignee_id = u1.id::text OR i.assignee_id = u1.email
      LEFT JOIN users u2 ON i.creator_id = u2.id::text OR i.creator_id = u2.email
      WHERE i.id = $1
    `;
    const { rows: itemRows } = await pool.query(itemQuery, [rows[0].id]);
    
    res.status(201).json({ subitem: itemRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating subitem:');
    res.status(500).json({ error: 'Failed to create subitem' });
  }
}));

// ============================================
// RELATIONS ENDPOINTS
// ============================================

// Get relations for a task item
router.get('/items/:itemId/relations', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    
    // Get relations where this item is the source
    const relationsQuery = `
      SELECT 
        r.*,
        ti.name as related_item_name,
        ti.status as related_item_status,
        tb.name as related_board_name,
        u.email as created_by_email,
        u.first_name as created_by_first_name
      FROM task_item_relations r
      LEFT JOIN task_items ti ON r.related_item_id = ti.id
      LEFT JOIN task_boards tb ON r.related_board_id = tb.id
      LEFT JOIN users u ON r.created_by = u.id::text OR r.created_by = u.email
      WHERE r.item_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
    `;
    
    const { rows: relations } = await pool.query(relationsQuery, [itemId]);
    
    // Get reverse relations (where this item is the target)
    const reverseRelationsQuery = `
      SELECT 
        r.*,
        ti.name as item_name,
        ti.status as item_status,
        u.email as created_by_email,
        u.first_name as created_by_first_name
      FROM task_item_relations r
      LEFT JOIN task_items ti ON r.item_id = ti.id
      LEFT JOIN users u ON r.created_by = u.id::text OR r.created_by = u.email
      WHERE r.related_item_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
    `;
    
    const { rows: reverseRelations } = await pool.query(reverseRelationsQuery, [itemId]);
    
    res.json({ 
      relations,
      reverse_relations: reverseRelations
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching relations:');
    res.status(500).json({ error: 'Failed to fetch relations' });
  }
}));

// Create relation
router.post('/items/:itemId/relations', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    const {
      related_item_id,
      related_board_id,
      relation_type = 'link',
      external_url,
      external_title
    } = req.body;
    
    if (!related_item_id && !related_board_id && !external_url) {
      return res.status(400).json({ error: 'Must provide related_item_id, related_board_id, or external_url' });
    }
    
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const query = `
      INSERT INTO task_item_relations (
        item_id, related_item_id, related_board_id, relation_type,
        external_url, external_title, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      itemId,
      related_item_id || null,
      related_board_id || null,
      relation_type,
      external_url || null,
      external_title || null,
      userId
    ]);
    
    res.status(201).json({ relation: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating relation:');
    res.status(500).json({ error: 'Failed to create relation' });
  }
}));

// Delete relation
router.delete('/relations/:relationId', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { relationId } = req.params;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    // Verify ownership
    const checkQuery = await pool.query(
      'SELECT created_by FROM task_item_relations WHERE id = $1 AND deleted_at IS NULL',
      [relationId]
    );
    
    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Relation not found' });
    }
    
    if (checkQuery.rows[0].created_by !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this relation' });
    }
    
    await pool.query(
      'UPDATE task_item_relations SET deleted_at = NOW() WHERE id = $1',
      [relationId]
    );
    
    res.json({ success: true, message: 'Relation deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting relation:');
    res.status(500).json({ error: 'Failed to delete relation' });
  }
}));

// Get task dependencies
router.get('/items/:id/dependencies', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    // Get dependencies (tasks this task depends on)
    const dependsOnQuery = `
      SELECT 
        td.*,
        ti.name as task_name,
        ti.status as task_status,
        ti.priority as task_priority,
        ti.due_date as task_due_date
      FROM task_dependencies td
      INNER JOIN task_items ti ON td.depends_on_task_id = ti.id
      WHERE td.task_id = $1 AND ti.deleted_at IS NULL
    `;
    
    // Get blocked tasks (tasks that depend on this task)
    const blockingQuery = `
      SELECT 
        td.*,
        ti.name as task_name,
        ti.status as task_status,
        ti.priority as task_priority,
        ti.due_date as task_due_date
      FROM task_dependencies td
      INNER JOIN task_items ti ON td.task_id = ti.id
      WHERE td.depends_on_task_id = $1 AND ti.deleted_at IS NULL
    `;
    
    const [dependsOnResult, blockingResult] = await Promise.all([
      pool.query(dependsOnQuery, [id]),
      pool.query(blockingQuery, [id])
    ]);
    
    // Initialize automation service to check if task is blocked
    taskAutomationService.initialize(pool);
    const isBlocked = await taskAutomationService.isTaskBlocked(id, pool);
    
    res.json({ 
      depends_on: dependsOnResult.rows,
      blocking: blockingResult.rows,
      is_blocked: isBlocked
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching task dependencies:');
    logger.error({ data: id }, 'Task ID:');
    logger.error({ data: {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    } }, 'Error details:');
    
    // Provide more specific error messages
    let errorMessage = 'Failed to fetch task dependencies';
    if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
      errorMessage = 'Database schema mismatch: task_dependencies table has incorrect column names. Please run the migration.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// Add task dependency
router.post('/items/:id/dependencies', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { depends_on_task_id, dependency_type = 'finish_to_start' } = req.body;
    
    if (!depends_on_task_id) {
      return res.status(400).json({ error: 'depends_on_task_id is required' });
    }
    
    const createdBy = req.user?.id?.toString() || req.user?.email;
    
    const query = `
      INSERT INTO task_dependencies (
        task_id, depends_on_task_id, dependency_type, created_by
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (task_id, depends_on_task_id) DO NOTHING
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      id,
      depends_on_task_id,
      dependency_type,
      createdBy
    ]);
    
    if (rows.length === 0) {
      return res.status(409).json({ error: 'Dependency already exists' });
    }
    
    res.status(201).json({ dependency: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating task dependency:');
    
    if (error.message && error.message.includes('no_self_dependency')) {
      return res.status(400).json({ error: 'A task cannot depend on itself' });
    }
    
    res.status(500).json({ error: 'Failed to create task dependency' });
  }
}));

// Delete task dependency
router.delete('/dependencies/:dependencyId', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { dependencyId } = req.params;
    
    const query = `
      DELETE FROM task_dependencies
      WHERE id = $1
      RETURNING id
    `;
    
    const { rows } = await pool.query(query, [dependencyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Dependency not found' });
    }
    
    res.json({ success: true, message: 'Dependency deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting task dependency:');
    res.status(500).json({ error: 'Failed to delete task dependency' });
  }
}));

// ============================================
// TIME TRACKING ENDPOINTS
// ============================================

// Get time entries for a task
router.get('/items/:itemId/time-entries', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    
    const query = `
      SELECT 
        te.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name
      FROM task_time_entries te
      LEFT JOIN users u ON te.user_id = u.id::text OR te.user_id = u.email
      WHERE te.item_id = $1 AND te.deleted_at IS NULL
      ORDER BY te.start_time DESC, te.created_at DESC
    `;
    
    const { rows } = await pool.query(query, [itemId]);
    res.json({ time_entries: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching time entries:');
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
}));

// Create time entry
router.post('/items/:itemId/time-entries', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    const {
      start_time,
      end_time,
      duration_seconds,
      notes,
      is_billable = true,
      hourly_rate
    } = req.body;
    
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const query = `
      INSERT INTO task_time_entries (
        item_id, user_id, start_time, end_time, duration_seconds,
        notes, is_billable, hourly_rate
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      itemId,
      userId,
      start_time || null,
      end_time || null,
      duration_seconds || null,
      notes || null,
      is_billable,
      hourly_rate || null
    ]);
    
    // Get full entry with user info
    const entryQuery = `
      SELECT 
        te.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name
      FROM task_time_entries te
      LEFT JOIN users u ON te.user_id = u.id::text OR te.user_id = u.email
      WHERE te.id = $1
    `;
    const { rows: entryRows } = await pool.query(entryQuery, [rows[0].id]);
    
    res.status(201).json({ time_entry: entryRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating time entry:');
    res.status(500).json({ error: 'Failed to create time entry' });
  }
}));

// Update time entry
router.patch('/time-entries/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    // Verify ownership
    const checkQuery = await pool.query(
      'SELECT user_id FROM task_time_entries WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    
    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    
    if (checkQuery.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit this time entry' });
    }
    
    const allowedFields = ['start_time', 'end_time', 'duration_seconds', 'notes', 'is_billable', 'hourly_rate'];
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        paramCount++;
        updateFields.push(`${field} = $${paramCount}`);
        updateValues.push(updates[field]);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    paramCount++;
    updateValues.push(id);
    
    const query = `
      UPDATE task_time_entries
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, updateValues);
    
    // Get full entry with user info
    const entryQuery = `
      SELECT 
        te.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name
      FROM task_time_entries te
      LEFT JOIN users u ON te.user_id = u.id::text OR te.user_id = u.email
      WHERE te.id = $1
    `;
    const { rows: entryRows } = await pool.query(entryQuery, [rows[0].id]);
    
    res.json({ time_entry: entryRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating time entry:');
    res.status(500).json({ error: 'Failed to update time entry' });
  }
}));

// Delete time entry
router.delete('/time-entries/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    // Verify ownership
    const checkQuery = await pool.query(
      'SELECT user_id FROM task_time_entries WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    
    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    
    if (checkQuery.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this time entry' });
    }
    
    await pool.query(
      'UPDATE task_time_entries SET deleted_at = NOW() WHERE id = $1',
      [id]
    );
    
    res.json({ success: true, message: 'Time entry deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting time entry:');
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
}));

// Get time reports
router.get('/time-reports', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { 
      item_id, 
      user_id, 
      start_date, 
      end_date,
      group_by = 'day' // 'day', 'week', 'month', 'user', 'item'
    } = req.query;
    
    let whereConditions = ['te.deleted_at IS NULL'];
    let queryParams = [];
    let paramCount = 0;
    
    if (item_id) {
      paramCount++;
      whereConditions.push(`te.item_id = $${paramCount}`);
      queryParams.push(item_id);
    }
    
    if (user_id) {
      paramCount++;
      whereConditions.push(`te.user_id = $${paramCount}`);
      queryParams.push(user_id);
    }
    
    if (start_date) {
      paramCount++;
      whereConditions.push(`te.start_time >= $${paramCount}`);
      queryParams.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      whereConditions.push(`te.start_time <= $${paramCount}`);
      queryParams.push(end_date);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    let groupByClause = '';
    let selectFields = `
      SUM(COALESCE(te.duration_seconds, 0)) as total_seconds,
      COUNT(*) as entry_count,
      SUM(CASE WHEN te.is_billable THEN COALESCE(te.duration_seconds, 0) ELSE 0 END) as billable_seconds
    `;
    
    switch (group_by) {
      case 'day':
        groupByClause = 'GROUP BY DATE(te.start_time)';
        selectFields = `DATE(te.start_time) as period, ${selectFields}`;
        break;
      case 'week':
        groupByClause = 'GROUP BY DATE_TRUNC(\'week\', te.start_time)';
        selectFields = `DATE_TRUNC('week', te.start_time) as period, ${selectFields}`;
        break;
      case 'month':
        groupByClause = 'GROUP BY DATE_TRUNC(\'month\', te.start_time)';
        selectFields = `DATE_TRUNC('month', te.start_time) as period, ${selectFields}`;
        break;
      case 'user':
        groupByClause = 'GROUP BY te.user_id, u.email, u.first_name, u.last_name';
        selectFields = `te.user_id, u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name, ${selectFields}`;
        break;
      case 'item':
        groupByClause = 'GROUP BY te.item_id, ti.name';
        selectFields = `te.item_id, ti.name as item_name, ${selectFields}`;
        break;
    }
    
    const query = `
      SELECT ${selectFields}
      FROM task_time_entries te
      LEFT JOIN users u ON te.user_id = u.id::text OR te.user_id = u.email
      LEFT JOIN task_items ti ON te.item_id = ti.id
      ${whereClause}
      ${groupByClause}
      ORDER BY period DESC
    `;
    
    const { rows } = await pool.query(query, queryParams);
    
    // Format results
    const formatted = rows.map(row => ({
      ...row,
      total_hours: (row.total_seconds / 3600).toFixed(2),
      billable_hours: (row.billable_seconds / 3600).toFixed(2)
    }));
    
    res.json({ reports: formatted });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching time reports:');
    res.status(500).json({ error: 'Failed to fetch time reports' });
  }
}));

// Get or create time estimate for a task
router.get('/items/:itemId/time-estimate', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    
    const query = `
      SELECT 
        te.*,
        u.email as estimated_by_email,
        u.first_name as estimated_by_first_name,
        u.last_name as estimated_by_last_name
      FROM task_time_estimates te
      LEFT JOIN users u ON te.estimated_by = u.id::text OR te.estimated_by = u.email
      WHERE te.item_id = $1
    `;
    
    const { rows } = await pool.query(query, [itemId]);
    
    if (rows.length === 0) {
      return res.json({ estimate: null });
    }
    
    res.json({ estimate: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching time estimate:');
    res.status(500).json({ error: 'Failed to fetch time estimate' });
  }
}));

// Create or update time estimate
router.post('/items/:itemId/time-estimate', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    const { estimated_hours } = req.body;
    
    if (!estimated_hours || estimated_hours <= 0) {
      return res.status(400).json({ error: 'Estimated hours must be greater than 0' });
    }
    
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const query = `
      INSERT INTO task_time_estimates (item_id, estimated_hours, estimated_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (item_id)
      DO UPDATE SET 
        estimated_hours = $2,
        estimated_by = $3,
        updated_at = NOW()
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [itemId, estimated_hours, userId]);
    
    res.json({ estimate: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error saving time estimate:');
    res.status(500).json({ error: 'Failed to save time estimate' });
  }
}));

// Trigger external event (for integrations)
router.post('/automation/trigger/:eventType', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { eventType } = req.params;
    const eventData = req.body;
    
    // Initialize automation service
    taskAutomationService.initialize(pool);
    
    // Trigger automation
    const results = await taskAutomationService.triggerExternalEvent(eventType, eventData, pool);
    
    res.json({ 
      success: true,
      triggered_rules: results.length,
      results
    });
  } catch (error) {
    logger.error({ err: error }, 'Error triggering external event:');
    res.status(500).json({ error: 'Failed to trigger automation' });
  }
}));

// ============================================
// CUSTOM FIELDS ENDPOINTS
// ============================================

// Get all custom fields for a board
router.get('/boards/:boardId/fields', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { boardId } = req.params;
    
    const query = `
      SELECT *
      FROM task_custom_fields
      WHERE board_id = $1 AND deleted_at IS NULL
      ORDER BY position ASC, created_at ASC
    `;
    
    const { rows } = await pool.query(query, [boardId]);
    res.json({ fields: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching custom fields:');
    res.status(500).json({ error: 'Failed to fetch custom fields' });
  }
}));

// Create a new custom field
router.post('/boards/:boardId/fields', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { boardId } = req.params;
    const {
      name,
      field_type,
      field_subtype,
      position,
      is_required,
      default_value,
      field_config
    } = req.body;
    
    if (!name || !field_type) {
      return res.status(400).json({ error: 'Name and field_type are required' });
    }
    
    // Get max position if not provided
    let fieldPosition = position;
    if (fieldPosition === undefined || fieldPosition === null) {
      const maxPosQuery = await pool.query(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM task_custom_fields WHERE board_id = $1 AND deleted_at IS NULL',
        [boardId]
      );
      fieldPosition = parseInt(maxPosQuery.rows[0].next_position);
    }
    
    const query = `
      INSERT INTO task_custom_fields (
        board_id, name, field_type, field_subtype, position,
        is_required, default_value, field_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      boardId,
      name.trim(),
      field_type,
      field_subtype || null,
      fieldPosition,
      is_required || false,
      default_value || null,
      JSON.stringify(field_config || {})
    ]);
    
    res.status(201).json({ field: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating custom field:');
    res.status(500).json({ error: 'Failed to create custom field' });
  }
}));

// Update a custom field
router.patch('/fields/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'name', 'field_type', 'field_subtype', 'position',
      'is_required', 'default_value', 'field_config'
    ];
    
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        paramCount++;
        if (field === 'field_config') {
          updateFields.push(`${field} = $${paramCount}::jsonb`);
          updateValues.push(JSON.stringify(updates[field]));
        } else {
          updateFields.push(`${field} = $${paramCount}`);
          updateValues.push(updates[field]);
        }
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    paramCount++;
    updateValues.push(id);
    
    const query = `
      UPDATE task_custom_fields
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, updateValues);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Custom field not found' });
    }
    
    res.json({ field: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating custom field:');
    res.status(500).json({ error: 'Failed to update custom field' });
  }
}));

// Delete a custom field (soft delete)
router.delete('/fields/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    
    const query = `
      UPDATE task_custom_fields
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Custom field not found' });
    }
    
    // Also delete all field values for this field
    await pool.query(
      'DELETE FROM task_item_field_values WHERE field_id = $1',
      [id]
    );
    
    res.json({ success: true, message: 'Custom field deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting custom field:');
    res.status(500).json({ error: 'Failed to delete custom field' });
  }
}));

// Get field values for a task item
router.get('/items/:itemId/field-values', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    
    const query = `
      SELECT 
        fv.*,
        cf.name as field_name,
        cf.field_type,
        cf.field_subtype,
        cf.field_config
      FROM task_item_field_values fv
      INNER JOIN task_custom_fields cf ON fv.field_id = cf.id
      WHERE fv.item_id = $1 AND cf.deleted_at IS NULL
      ORDER BY cf.position ASC
    `;
    
    const { rows } = await pool.query(query, [itemId]);
    res.json({ field_values: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching field values:');
    res.status(500).json({ error: 'Failed to fetch field values' });
  }
}));

// Update field values for a task item
router.patch('/items/:itemId/field-values', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { itemId } = req.params;
    const { field_values } = req.body; // Array of {field_id, value} objects
    
    if (!Array.isArray(field_values)) {
      return res.status(400).json({ error: 'field_values must be an array' });
    }
    
    const results = [];
    
    for (const fv of field_values) {
      const { field_id, value } = fv;
      
      if (!field_id) {
        continue;
      }
      
      // Get field definition to determine which column to update
      const fieldQuery = await pool.query(
        'SELECT field_type, field_subtype FROM task_custom_fields WHERE id = $1 AND deleted_at IS NULL',
        [field_id]
      );
      
      if (fieldQuery.rows.length === 0) {
        continue;
      }
      
      const field = fieldQuery.rows[0];
      
      // Determine which value column to use based on field type
      let valueColumn = 'text_value';
      let valueToStore = value;
      
      if (field.field_type === 'number') {
        valueColumn = 'number_value';
        valueToStore = value !== null && value !== undefined ? parseFloat(value) : null;
      } else if (field.field_type === 'date' || field.field_type === 'datetime') {
        valueColumn = 'date_value';
        valueToStore = value ? new Date(value) : null;
      } else if (field.field_type === 'checkbox') {
        valueColumn = 'boolean_value';
        valueToStore = Boolean(value);
      } else if (['status', 'people', 'tags', 'relation'].includes(field.field_type)) {
        valueColumn = 'json_value';
        valueToStore = JSON.stringify(value);
      } else {
        valueColumn = 'text_value';
        valueToStore = value ? String(value) : null;
      }
      
      // Upsert field value
      const upsertQuery = `
        INSERT INTO task_item_field_values (item_id, field_id, ${valueColumn})
        VALUES ($1, $2, $3)
        ON CONFLICT (item_id, field_id)
        DO UPDATE SET ${valueColumn} = $3, updated_at = NOW()
        RETURNING *
      `;
      
      const { rows } = await pool.query(upsertQuery, [itemId, field_id, valueToStore]);
      results.push(rows[0]);
    }
    
    res.json({ field_values: results });
  } catch (error) {
    logger.error({ err: error }, 'Error updating field values:');
    res.status(500).json({ error: 'Failed to update field values' });
  }
}));

module.exports = router;

