/**
 * Task Automation Service
 * 
 * Core automation engine for task management
 * Handles trigger evaluation, action execution, dependency management,
 * and workflow template instantiation
 */

const { getPool: getPoolByEnv } = require('../database-connections');
const { logger } = require('../utils/logger');

class TaskAutomationService {
  constructor() {
    this.pool = null;
  }

  /**
   * Initialize the service with a database pool
   */
  initialize(pool) {
    this.pool = pool;
  }

  /**
   * Get pool from request or environment
   */
  getPool(req = null) {
    if (req?.locationPool) {
      return req.locationPool;
    }
    if (this.pool) {
      return this.pool;
    }
    // Fallback to production pool
    return getPoolByEnv('production');
  }

  // ============================================
  // TRIGGER EVALUATION
  // ============================================

  /**
   * Evaluate automation rules for a status change trigger
   */
  async evaluateStatusChangeTriggers(taskId, oldStatus, newStatus, pool = null) {
    const dbPool = pool || this.pool;
    
    try {
      // Find matching automation rules
      const rulesQuery = `
        SELECT * FROM task_automation_rules
        WHERE trigger_type = 'status_change'
          AND is_enabled = true
          AND deleted_at IS NULL
          AND (max_executions IS NULL OR execution_count < max_executions)
          AND (
            trigger_config->>'from_status' IS NULL 
            OR trigger_config->>'from_status' = $1
          )
          AND (
            trigger_config->>'to_status' IS NULL 
            OR trigger_config->>'to_status' = $2
          )
      `;
      
      const { rows: rules } = await dbPool.query(rulesQuery, [oldStatus, newStatus]);
      
      // Get task details
      const taskQuery = `
        SELECT 
          i.*,
          b.name as board_name,
          b.branch_id,
          g.name as group_name
        FROM task_items i
        INNER JOIN task_boards b ON i.board_id = b.id
        INNER JOIN task_groups g ON i.group_id = g.id
        WHERE i.id = $1
      `;
      const { rows: taskRows } = await dbPool.query(taskQuery, [taskId]);
      
      if (taskRows.length === 0) {
        logger.info('Task not found for automation evaluation');
        return [];
      }
      
      const task = taskRows[0];
      const executedRules = [];
      
      // Execute each matching rule
      for (const rule of rules) {
        // Check if rule matches task's board/branch
        if (rule.board_id && rule.board_id !== task.board_id) {
          continue;
        }
        if (rule.branch_id && rule.branch_id !== task.branch_id) {
          continue;
        }
        
        // Check conditions
        if (rule.conditions && !this.evaluateConditions(rule.conditions, task)) {
          continue;
        }
        
        // Execute actions
        const result = await this.executeActions(
          rule.actions,
          task,
          { rule_id: rule.id, trigger_type: 'status_change', old_status: oldStatus, new_status: newStatus },
          dbPool
        );
        
        // Update rule execution count
        await dbPool.query(
          `UPDATE task_automation_rules 
           SET execution_count = execution_count + 1, 
               last_executed_at = NOW() 
           WHERE id = $1`,
          [rule.id]
        );
        
        executedRules.push({ rule, result });
      }
      
      return executedRules;
    } catch (error) {
      logger.error({ err: error }, 'Error evaluating status change triggers:');
      throw error;
    }
  }

  /**
   * Evaluate date-based triggers (called by background job)
   */
  async evaluateDateBasedTriggers(pool = null) {
    const dbPool = pool || this.pool;
    
    try {
      const now = new Date();
      
      // Get all active date-based rules
      const rulesQuery = `
        SELECT * FROM task_automation_rules
        WHERE trigger_type = 'date_based'
          AND is_enabled = true
          AND deleted_at IS NULL
          AND (max_executions IS NULL OR execution_count < max_executions)
      `;
      
      const { rows: rules } = await dbPool.query(rulesQuery);
      
      const executedRules = [];
      
      for (const rule of rules) {
        const config = rule.trigger_config;
        
        // Check if it's time to execute
        if (!this.shouldExecuteDateBasedRule(rule, now)) {
          continue;
        }
        
        // Find tasks that match the criteria
        const tasksQuery = this.buildDateBasedTaskQuery(rule);
        const { rows: tasks } = await dbPool.query(tasksQuery.query, tasksQuery.params);
        
        // Execute actions for each matching task
        for (const task of tasks) {
          // Check conditions
          if (rule.conditions && !this.evaluateConditions(rule.conditions, task)) {
            continue;
          }
          
          const result = await this.executeActions(
            rule.actions,
            task,
            { rule_id: rule.id, trigger_type: 'date_based', executed_at: now },
            dbPool
          );
          
          executedRules.push({ rule, task, result });
        }
        
        // Update rule execution count
        if (executedRules.length > 0) {
          await dbPool.query(
            `UPDATE task_automation_rules 
             SET execution_count = execution_count + 1, 
                 last_executed_at = NOW() 
             WHERE id = $1`,
            [rule.id]
          );
        }
      }
      
      return executedRules;
    } catch (error) {
      logger.error({ err: error }, 'Error evaluating date-based triggers:');
      throw error;
    }
  }

  /**
   * Trigger automation from external event
   */
  async triggerExternalEvent(eventType, eventData, pool = null) {
    const dbPool = pool || this.pool;
    
    try {
      // Find matching automation rules
      const rulesQuery = `
        SELECT * FROM task_automation_rules
        WHERE trigger_type = 'external_event'
          AND is_enabled = true
          AND deleted_at IS NULL
          AND (max_executions IS NULL OR execution_count < max_executions)
          AND trigger_config->>'event_type' = $1
      `;
      
      const { rows: rules } = await dbPool.query(rulesQuery, [eventType]);
      
      const executedRules = [];
      
      for (const rule of rules) {
        // Check if event matches filters
        const filters = rule.trigger_config.filters;
        if (filters && !this.evaluateFilters(filters, eventData)) {
          continue;
        }
        
        // Execute actions with event data as context
        const result = await this.executeActions(
          rule.actions,
          null, // no specific task for external events
          { 
            rule_id: rule.id, 
            trigger_type: 'external_event', 
            event_type: eventType,
            event_data: eventData 
          },
          dbPool
        );
        
        // Update rule execution count
        await dbPool.query(
          `UPDATE task_automation_rules 
           SET execution_count = execution_count + 1, 
               last_executed_at = NOW() 
           WHERE id = $1`,
          [rule.id]
        );
        
        executedRules.push({ rule, result });
      }
      
      return executedRules;
    } catch (error) {
      logger.error({ err: error }, 'Error triggering external event:');
      throw error;
    }
  }

  // ============================================
  // ACTION EXECUTION
  // ============================================

  /**
   * Execute automation actions
   */
  async executeActions(actions, task, context, pool) {
    const results = [];
    const createdTaskIds = [];
    
    for (const action of actions) {
      try {
        let result;
        
        switch (action.type) {
          case 'create_task':
            result = await this.executeCreateTask(action.config, task, context, pool);
            if (result.task_id) {
              createdTaskIds.push(result.task_id);
            }
            break;
            
          case 'update_field':
            result = await this.executeUpdateField(action.config, task, context, pool);
            break;
            
          case 'send_notification':
            result = await this.executeSendNotification(action.config, task, context, pool);
            break;
            
          case 'create_dependency':
            result = await this.executeCreateDependency(action.config, task, context, pool);
            break;
            
          case 'execute_workflow':
            result = await this.executeWorkflowTemplate(action.config, task, context, pool);
            if (result.created_task_ids) {
              createdTaskIds.push(...result.created_task_ids);
            }
            break;
            
          default:
            logger.warn(`Unknown action type: ${action.type}`);
            result = { error: 'Unknown action type' };
        }
        
        results.push({ action: action.type, result, success: !result.error });
      } catch (error) {
        logger.error({ err: error }, `Error executing action ${action.type}:`);
        results.push({ action: action.type, error: error.message, success: false });
      }
    }
    
    // Log automation execution
    await this.logAutomationExecution(context, results, createdTaskIds, pool);
    
    return { results, created_task_ids: createdTaskIds };
  }

  /**
   * Execute create task action
   */
  async executeCreateTask(config, sourceTask, context, pool) {
    try {
      // Substitute variables in task data
      const taskData = this.substituteVariables(config, sourceTask, context);
      
      // Determine board and group
      let boardId = taskData.board_id || sourceTask?.board_id;
      let groupId = taskData.group_id || sourceTask?.group_id;
      
      if (!boardId || !groupId) {
        throw new Error('Board ID and Group ID are required to create a task');
      }
      
      // Calculate due date if relative
      let dueDate = taskData.due_date;
      if (taskData.due_days_offset) {
        const baseDate = sourceTask?.due_date ? new Date(sourceTask.due_date) : new Date();
        dueDate = new Date(baseDate);
        dueDate.setDate(dueDate.getDate() + parseInt(taskData.due_days_offset));
      }
      
      // Get next position in group
      const posQuery = await pool.query(
        'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM task_items WHERE group_id = $1',
        [groupId]
      );
      const position = posQuery.rows[0].next_position;
      
      // Create task
      const query = `
        INSERT INTO task_items (
          board_id, group_id, name, description, status, priority,
          due_date, assignee_id, creator_id, position, tags, custom_fields
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `;
      
      const { rows } = await pool.query(query, [
        boardId,
        groupId,
        taskData.name || 'Automated Task',
        taskData.description || '',
        taskData.status || 'todo',
        taskData.priority || 'medium',
        dueDate || null,
        taskData.assignee_id || sourceTask?.assignee_id || null,
        'automation', // creator
        position,
        JSON.stringify(taskData.tags || []),
        JSON.stringify({ ...taskData.custom_fields, automated: true, source_rule: context.rule_id })
      ]);
      
      return { success: true, task_id: rows[0].id };
    } catch (error) {
      logger.error({ err: error }, 'Error creating task:');
      return { error: error.message };
    }
  }

  /**
   * Execute update field action
   */
  async executeUpdateField(config, task, context, pool) {
    if (!task) {
      return { error: 'No task provided for update' };
    }
    
    try {
      const updates = [];
      const values = [];
      let paramCount = 0;
      
      const allowedFields = ['status', 'priority', 'assignee_id', 'due_date', 'name', 'description'];
      
      for (const [field, value] of Object.entries(config)) {
        if (allowedFields.includes(field)) {
          paramCount++;
          updates.push(`${field} = $${paramCount}`);
          values.push(value);
        }
      }
      
      if (updates.length === 0) {
        return { error: 'No valid fields to update' };
      }
      
      paramCount++;
      values.push(task.id);
      
      const query = `
        UPDATE task_items
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING id
      `;
      
      await pool.query(query, values);
      
      return { success: true };
    } catch (error) {
      logger.error({ err: error }, 'Error updating task field:');
      return { error: error.message };
    }
  }

  /**
   * Execute send notification action
   */
  async executeSendNotification(config, task, context, pool) {
    try {
      // Determine recipient
      let recipientId = config.recipient_id;
      let recipientEmail = config.recipient_email;
      
      if (config.to === 'assignee' && task) {
        recipientId = task.assignee_id;
        recipientEmail = task.assignee_email;
      } else if (config.to === 'creator' && task) {
        recipientId = task.creator_id;
        recipientEmail = task.creator_email;
      }
      
      if (!recipientId && !recipientEmail) {
        return { error: 'No recipient specified' };
      }
      
      // Substitute variables in notification content
      const subject = this.substituteVariables({ text: config.subject }, task, context).text;
      const body = this.substituteVariables({ text: config.body }, task, context).text;
      
      // Insert notification into queue
      const query = `
        INSERT INTO task_notifications (
          task_id, notification_type, recipient_id, recipient_email,
          subject, body, template_name, template_data, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;
      
      const { rows } = await pool.query(query, [
        task?.id || null,
        config.notification_type || 'email',
        recipientId,
        recipientEmail,
        subject,
        body,
        config.template || null,
        JSON.stringify({ task, context }),
        'automation'
      ]);
      
      return { success: true, notification_id: rows[0].id };
    } catch (error) {
      logger.error({ err: error }, 'Error creating notification:');
      return { error: error.message };
    }
  }

  /**
   * Execute create dependency action
   */
  async executeCreateDependency(config, task, context, pool) {
    if (!task) {
      return { error: 'No task provided for dependency' };
    }
    
    try {
      const query = `
        INSERT INTO task_dependencies (
          task_id, depends_on_task_id, dependency_type, created_by
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (task_id, depends_on_task_id) DO NOTHING
        RETURNING id
      `;
      
      const { rows } = await pool.query(query, [
        task.id,
        config.depends_on_task_id,
        config.dependency_type || 'finish_to_start',
        'automation'
      ]);
      
      return { success: true, dependency_id: rows[0]?.id };
    } catch (error) {
      logger.error({ err: error }, 'Error creating dependency:');
      return { error: error.message };
    }
  }

  // ============================================
  // WORKFLOW TEMPLATE EXECUTION
  // ============================================

  /**
   * Execute a workflow template
   */
  async executeWorkflowTemplate(templateIdOrConfig, context, pool) {
    try {
      let template;
      
      // If config has template_id, fetch it
      if (typeof templateIdOrConfig === 'object' && templateIdOrConfig.template_id) {
        const { rows } = await pool.query(
          'SELECT * FROM task_workflow_templates WHERE id = $1 AND deleted_at IS NULL',
          [templateIdOrConfig.template_id]
        );
        
        if (rows.length === 0) {
          return { error: 'Template not found' };
        }
        
        template = rows[0];
      } else if (typeof templateIdOrConfig === 'string') {
        // Fetch template by ID
        const { rows } = await pool.query(
          'SELECT * FROM task_workflow_templates WHERE id = $1 AND deleted_at IS NULL',
          [templateIdOrConfig]
        );
        
        if (rows.length === 0) {
          return { error: 'Template not found' };
        }
        
        template = rows[0];
      } else {
        return { error: 'Invalid template configuration' };
      }
      
      const config = typeof templateIdOrConfig === 'object' ? templateIdOrConfig : {};
      
      // Determine board
      let boardId = config.board_id || context.event_data?.board_id;
      
      // If no board specified, create a new one or use default
      if (!boardId && template.default_board_name) {
        const boardQuery = `
          INSERT INTO task_boards (name, description, board_type, owner_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `;
        
        const { rows: boardRows } = await pool.query(boardQuery, [
          template.default_board_name,
          `Created from template: ${template.name}`,
          'kanban',
          context.event_data?.user_id || 'automation'
        ]);
        
        boardId = boardRows[0].id;
        
        // Create default groups
        if (template.default_groups) {
          for (let i = 0; i < template.default_groups.length; i++) {
            await pool.query(
              'INSERT INTO task_groups (board_id, name, position) VALUES ($1, $2, $3)',
              [boardId, template.default_groups[i], i]
            );
          }
        }
      }
      
      if (!boardId) {
        return { error: 'Board ID is required to execute workflow' };
      }
      
      // Create workflow instance
      const instanceQuery = `
        INSERT INTO task_workflow_instances (
          template_id, board_id, context_data, executed_by, status
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      
      const { rows: instanceRows } = await pool.query(instanceQuery, [
        template.id,
        boardId,
        JSON.stringify(context),
        context.event_data?.user_id || 'automation',
        'active'
      ]);
      
      const instanceId = instanceRows[0].id;
      const createdTaskIds = [];
      const taskIdMap = {}; // Map template task IDs to actual task IDs
      
      // Get groups for the board
      const { rows: groups } = await pool.query(
        'SELECT * FROM task_groups WHERE board_id = $1 ORDER BY position',
        [boardId]
      );
      
      const groupMap = {};
      groups.forEach(g => {
        groupMap[g.name.toLowerCase()] = g.id;
      });
      
      // Create tasks from template
      const templateTasks = template.template_data;
      
      for (const taskTemplate of templateTasks) {
        // Find group
        const groupName = taskTemplate.group?.toLowerCase() || 'to do';
        const groupId = groupMap[groupName] || groups[0]?.id;
        
        if (!groupId) {
          logger.warn('No group found for task, skipping');
          continue;
        }
        
        // Calculate due date
        let dueDate = null;
        if (taskTemplate.due_days_offset) {
          dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + parseInt(taskTemplate.due_days_offset));
        }
        
        // Substitute variables
        const substituted = this.substituteVariables(taskTemplate, null, context);
        
        // Get position
        const posQuery = await pool.query(
          'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM task_items WHERE group_id = $1',
          [groupId]
        );
        const position = posQuery.rows[0].next_position;
        
        // Create task
        const taskQuery = `
          INSERT INTO task_items (
            board_id, group_id, name, description, status, priority,
            due_date, assignee_id, creator_id, position, tags, custom_fields
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `;
        
        const { rows: taskRows } = await pool.query(taskQuery, [
          boardId,
          groupId,
          substituted.name,
          substituted.description || '',
          taskTemplate.status || 'todo',
          taskTemplate.priority || 'medium',
          dueDate,
          config.default_assignee || null,
          'automation',
          position,
          JSON.stringify(taskTemplate.tags || []),
          JSON.stringify({ 
            workflow_instance_id: instanceId,
            template_task_id: taskTemplate.id 
          })
        ]);
        
        const taskId = taskRows[0].id;
        createdTaskIds.push(taskId);
        
        if (taskTemplate.id) {
          taskIdMap[taskTemplate.id] = taskId;
        }
      }
      
      // Create dependencies
      for (const taskTemplate of templateTasks) {
        if (taskTemplate.dependencies && taskTemplate.id && taskIdMap[taskTemplate.id]) {
          const taskId = taskIdMap[taskTemplate.id];
          
          for (const depId of taskTemplate.dependencies) {
            if (taskIdMap[depId]) {
              await pool.query(
                `INSERT INTO task_dependencies (task_id, depends_on_task_id, created_by)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [taskId, taskIdMap[depId], 'automation']
              );
            }
          }
        }
      }
      
      // Update workflow instance with created tasks
      await pool.query(
        `UPDATE task_workflow_instances 
         SET created_task_ids = $1, status = $2, completed_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(createdTaskIds), 'completed', instanceId]
      );
      
      return { 
        success: true, 
        workflow_instance_id: instanceId,
        created_task_ids: createdTaskIds,
        board_id: boardId
      };
    } catch (error) {
      logger.error({ err: error }, 'Error executing workflow template:');
      return { error: error.message };
    }
  }

  // ============================================
  // DEPENDENCY MANAGEMENT
  // ============================================

  /**
   * Check if a task is blocked by dependencies
   */
  async isTaskBlocked(taskId, pool) {
    try {
      const query = `
        SELECT COUNT(*) as blocking_count
        FROM task_dependencies td
        INNER JOIN task_items ti ON td.depends_on_task_id = ti.id
        WHERE td.task_id = $1 
          AND ti.status != 'done'
          AND ti.deleted_at IS NULL
      `;
      
      const { rows } = await pool.query(query, [taskId]);
      return rows[0].blocking_count > 0;
    } catch (error) {
      logger.error({ err: error }, 'Error checking task dependencies:');
      return false;
    }
  }

  /**
   * Get blocking tasks for a task
   */
  async getBlockingTasks(taskId, pool) {
    try {
      const query = `
        SELECT 
          ti.*,
          td.dependency_type
        FROM task_dependencies td
        INNER JOIN task_items ti ON td.depends_on_task_id = ti.id
        WHERE td.task_id = $1 
          AND ti.status != 'done'
          AND ti.deleted_at IS NULL
      `;
      
      const { rows } = await pool.query(query, [taskId]);
      return rows;
    } catch (error) {
      logger.error({ err: error }, 'Error getting blocking tasks:');
      return [];
    }
  }

  /**
   * Auto-unblock tasks when a task is completed
   */
  async handleTaskCompletion(taskId, pool) {
    try {
      // Find tasks that were blocked by this task
      const query = `
        SELECT DISTINCT td.task_id
        FROM task_dependencies td
        WHERE td.depends_on_task_id = $1
      `;
      
      const { rows } = await pool.query(query, [taskId]);
      
      const unblockedTasks = [];
      
      for (const row of rows) {
        const isBlocked = await this.isTaskBlocked(row.task_id, pool);
        if (!isBlocked) {
          unblockedTasks.push(row.task_id);
          
          // Optionally send notification about unblocking
          await pool.query(
            `INSERT INTO task_notifications (
              task_id, notification_type, recipient_id, 
              subject, body, created_by
            )
            SELECT 
              $1, 'in_app', i.assignee_id,
              'Task Unblocked',
              'Your task "' || i.name || '" is now unblocked and ready to work on.',
              'automation'
            FROM task_items i
            WHERE i.id = $1 AND i.assignee_id IS NOT NULL`,
            [row.task_id]
          );
        }
      }
      
      return unblockedTasks;
    } catch (error) {
      logger.error({ err: error }, 'Error handling task completion dependencies:');
      return [];
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Evaluate conditions against task data
   */
  evaluateConditions(conditions, task) {
    if (!conditions || !Array.isArray(conditions)) {
      return true;
    }
    
    return conditions.every(condition => {
      const { field, operator, value } = condition;
      const taskValue = task[field];
      
      switch (operator) {
        case 'equals':
          return taskValue === value;
        case 'not_equals':
          return taskValue !== value;
        case 'contains':
          return Array.isArray(taskValue) && taskValue.includes(value);
        case 'not_contains':
          return !Array.isArray(taskValue) || !taskValue.includes(value);
        case 'greater_than':
          return taskValue > value;
        case 'less_than':
          return taskValue < value;
        default:
          return true;
      }
    });
  }

  /**
   * Evaluate filters against event data
   */
  evaluateFilters(filters, eventData) {
    if (!filters || typeof filters !== 'object') {
      return true;
    }
    
    return Object.entries(filters).every(([key, value]) => {
      return eventData[key] === value;
    });
  }

  /**
   * Check if a date-based rule should execute
   */
  shouldExecuteDateBasedRule(rule, now) {
    const config = rule.trigger_config;
    const lastExecuted = rule.last_executed_at ? new Date(rule.last_executed_at) : null;
    
    // Check schedule type
    if (config.schedule === 'daily') {
      // Execute once per day
      if (!lastExecuted) return true;
      const daysSinceLastExecution = (now - lastExecuted) / (1000 * 60 * 60 * 24);
      return daysSinceLastExecution >= 1;
    } else if (config.schedule === 'weekly') {
      if (!lastExecuted) return true;
      const daysSinceLastExecution = (now - lastExecuted) / (1000 * 60 * 60 * 24);
      return daysSinceLastExecution >= 7;
    } else if (config.schedule === 'once') {
      return !lastExecuted;
    }
    
    return false;
  }

  /**
   * Build query to find tasks matching date-based trigger
   */
  buildDateBasedTaskQuery(rule) {
    const config = rule.trigger_config;
    const conditions = ['i.deleted_at IS NULL'];
    const params = [];
    
    // Board filter
    if (rule.board_id) {
      params.push(rule.board_id);
      conditions.push(`i.board_id = $${params.length}`);
    }
    
    // Date-based filtering
    if (config.relative_to === 'due_date' && config.days_offset) {
      params.push(config.days_offset);
      conditions.push(`i.due_date = CURRENT_DATE + INTERVAL '${config.days_offset} days'`);
    }
    
    // Status filter
    if (config.status) {
      params.push(config.status);
      conditions.push(`i.status = $${params.length}`);
    }
    
    const query = `
      SELECT 
        i.*,
        b.name as board_name,
        g.name as group_name
      FROM task_items i
      INNER JOIN task_boards b ON i.board_id = b.id
      INNER JOIN task_groups g ON i.group_id = g.id
      WHERE ${conditions.join(' AND ')}
      LIMIT 100
    `;
    
    return { query, params };
  }

  /**
   * Substitute variables in template strings
   */
  substituteVariables(template, task, context) {
    const result = JSON.parse(JSON.stringify(template));
    
    const variables = {
      ...task,
      ...(context.event_data || {}),
      current_date: new Date().toISOString().split('T')[0]
    };
    
    const substitute = (str) => {
      if (typeof str !== 'string') return str;
      
      return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] !== undefined ? variables[key] : match;
      });
    };
    
    // Recursively substitute in all string fields
    const process = (obj) => {
      if (typeof obj === 'string') {
        return substitute(obj);
      } else if (Array.isArray(obj)) {
        return obj.map(process);
      } else if (obj && typeof obj === 'object') {
        const processed = {};
        for (const [key, value] of Object.entries(obj)) {
          processed[key] = process(value);
        }
        return processed;
      }
      return obj;
    };
    
    return process(result);
  }

  /**
   * Log automation execution
   */
  async logAutomationExecution(context, results, createdTaskIds, pool) {
    try {
      const status = results.every(r => r.success) ? 'success' : 
                     results.some(r => r.success) ? 'partial_success' : 'failed';
      
      const errorMessages = results
        .filter(r => r.error)
        .map(r => r.error)
        .join('; ');
      
      const query = `
        INSERT INTO task_automation_logs (
          rule_id, task_id, workflow_instance_id, trigger_type, 
          trigger_data, actions_performed, status, error_message, 
          created_task_ids
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      
      await pool.query(query, [
        context.rule_id || null,
        context.task_id || null,
        context.workflow_instance_id || null,
        context.trigger_type,
        JSON.stringify(context),
        JSON.stringify(results),
        status,
        errorMessages || null,
        JSON.stringify(createdTaskIds)
      ]);
    } catch (error) {
      logger.error({ err: error }, 'Error logging automation execution:');
    }
  }

  /**
   * Process notification queue (send pending notifications)
   */
  async processNotificationQueue(pool) {
    try {
      // Get pending notifications
      const query = `
        SELECT * FROM task_notifications
        WHERE status = 'pending'
          AND scheduled_for <= NOW()
          AND retry_count < max_retries
        ORDER BY scheduled_for ASC
        LIMIT 50
      `;
      
      const { rows: notifications } = await pool.query(query);
      
      const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
      const emailSender = getEmailSender();

      for (const notification of notifications) {
        try {
          if (notification.notification_type === 'email' && notification.recipient_email) {
            // Send email
            if (emailSender) {
              await emailSender.sendEmail({
                to: notification.recipient_email,
                subject: notification.subject,
                html: notification.body,
                tags: ['task-notification'],
              });
            } else {
              logger.warn({ notificationId: notification.id }, 'Brevo email sender not available — task notification not sent');
            }
            
            // Mark as sent
            await pool.query(
              'UPDATE task_notifications SET status = $1, sent_at = NOW() WHERE id = $2',
              ['sent', notification.id]
            );
          } else {
            // Other notification types (SMS, push) - mark as sent for now
            await pool.query(
              'UPDATE task_notifications SET status = $1, sent_at = NOW() WHERE id = $2',
              ['sent', notification.id]
            );
          }
        } catch (error) {
          logger.error({ err: error }, `Error sending notification ${notification.id}:`);
          
          // Update retry count or mark as failed
          if (notification.retry_count + 1 >= notification.max_retries) {
            await pool.query(
              'UPDATE task_notifications SET status = $1, failed_at = NOW(), failure_reason = $2 WHERE id = $3',
              ['failed', error.message, notification.id]
            );
          } else {
            await pool.query(
              'UPDATE task_notifications SET retry_count = retry_count + 1 WHERE id = $1',
              [notification.id]
            );
          }
        }
      }
      
      return notifications.length;
    } catch (error) {
      logger.error({ err: error }, 'Error processing notification queue:');
      return 0;
    }
  }
}

// Export singleton instance
module.exports = new TaskAutomationService();

