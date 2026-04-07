/**
 * Academy Coach AI Service - Earl the Squirrel
 *
 * RAG-based AI coaching assistant for Franchise Academy.
 * Uses Claude API with franchise documents and progress context.
 *
 * Features:
 * - Earl the Squirrel persona (wise mentor who teaches strategy)
 * - Document retrieval from academy_documents
 * - Progress-aware context injection
 * - Citation support for referenced documents
 * - Weekly budget controls (shared with completion rate AI)
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

// OpenAI Embedding Configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// Claude API pricing (as of Jan 2026)
const CLAUDE_PRICING = {
  'claude-sonnet-4-20250514': {
    input_per_1k: 0.003,
    output_per_1k: 0.015,
  },
  'claude-3-haiku-20240307': {
    input_per_1k: 0.00025,
    output_per_1k: 0.00125,
  }
};

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const WEEKLY_BUDGET_CENTS = 5000; // $50/week for coach

// Earl the Squirrel System Prompt
const EARL_SYSTEM_PROMPT = `You are Earl the Squirrel, the wise and encouraging AI coach of Acme Operations Franchise Academy. In the Acme Operations world, you're known for teaching the knights their famous "gallop-gallop-step to the side" movement dance, and you help everyone learn about attacking and defending strategies.

## Your Personality
- Wise and patient, like a trusted mentor who's seen many franchisees grow
- Use chess strategy metaphors naturally ("just like teaching a knight to gallop, every skill takes practice", "sometimes the best defense is a good setup")
- Energetic and encouraging - you're excited to help franchisees learn and grow
- Celebrate progress enthusiastically - every step forward matters!
- Give practical, step-by-step advice (you love teaching in clear, memorable ways)
- Be concise but thorough - respect their time
- When you don't know something, admit it and suggest who to contact (operations@acmeops.com)

## Your Knowledge
You have access to Acme Operations franchise documentation including:
- Operations manuals and SOPs
- Marketing strategies and templates
- Training materials (5-day training program)
- Financial guidance and pricing
- HR and staffing procedures
- The 90-day launch plan

## Guidelines
1. **Be Helpful**: Answer questions directly and provide specific guidance
2. **Stay On Topic**: Focus on franchise operations, marketing, training, and business building
3. **Cite Sources**: When referencing specific documents, mention them so franchisees can find more details
4. **Encourage Progress**: Reference their current journey progress when relevant
5. **Be Practical**: Provide actionable steps, not just theory (like teaching the knight's L-shape, break things down)
6. **Respect Boundaries**: Don't make up information - if unsure, say so

## Response Format
Your responses are rendered as markdown, so use proper markdown syntax:

- **Use bullet points** with "- " prefix for lists (always use dashes, not just line breaks)
- **Use headings** with "##" or "###" for sections
- **Bold important items** with **double asterisks**
- Keep responses scannable with clear visual hierarchy
- Use numbered lists (1. 2. 3.) for sequential steps
- Add blank lines between sections for readability
- Don't use emojis excessively (one or two is fine)

Example format:
## Section Title

Here's the key point to remember:

- **First item** - explanation here
- **Second item** - more details
- **Third item** - additional info

### Next Steps
1. Do this first
2. Then do this
3. Finally, complete this`;

class AcademyCoachService {
  constructor(pool) {
    this.pool = pool;
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.weeklyBudgetCents = parseInt(process.env.ACADEMY_COACH_BUDGET_CENTS || WEEKLY_BUDGET_CENTS);
  }

  /**
   * Check if vector search is available (requires OpenAI key and embeddings)
   */
  isVectorSearchAvailable() {
    return !!this.openaiKey;
  }

  /**
   * Generate embedding for a query using OpenAI
   */
  async generateQueryEmbedding(query) {
    if (!this.openaiKey) {
      return null;
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: EMBEDDING_MODEL,
          input: query,
          dimensions: EMBEDDING_DIMENSIONS
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to generate query embedding, falling back to text search');
      return null;
    }
  }

  /**
   * Format embedding array for PostgreSQL vector type
   */
  formatEmbeddingForPG(embedding) {
    return `[${embedding.join(',')}]`;
  }

  /**
   * Check if AI coach is available
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Get current week's AI spend for coach
   */
  async getCurrentWeekSpend() {
    try {
      const result = await this.pool.query(`
        SELECT COALESCE(SUM(
          CASE WHEN metadata->>'cost' IS NOT NULL
               THEN (metadata->>'cost')::numeric
               ELSE 0.01 -- Assume ~$0.01 per message if not tracked
          END
        ), 0) as total_spend
        FROM academy_messages
        WHERE role = 'assistant'
          AND created_at >= date_trunc('week', NOW())
      `);
      return parseFloat(result.rows[0].total_spend || 0);
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get coach spend, assuming 0');
      return 0;
    }
  }

  /**
   * Check if budget allows new request
   */
  async canMakeRequest(estimatedCost = 0.02) {
    const currentSpend = await this.getCurrentWeekSpend();
    const budgetDollars = this.weeklyBudgetCents / 100;
    return (currentSpend + estimatedCost) <= budgetDollars;
  }

  /**
   * Calculate cost estimate from token counts
   */
  calculateCost(inputTokens, outputTokens, model = DEFAULT_MODEL) {
    const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING[DEFAULT_MODEL];
    const inputCost = (inputTokens / 1000) * pricing.input_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_per_1k;
    return inputCost + outputCost;
  }

  /**
   * Search for relevant documents using vector similarity (preferred) or full-text search
   */
  async searchDocuments(query, limit = 5) {
    // Try vector similarity search first if available
    const queryEmbedding = await this.generateQueryEmbedding(query);

    if (queryEmbedding) {
      try {
        // Use vector similarity search on document chunks for better granularity
        const result = await this.pool.query(`
          SELECT DISTINCT ON (d.id)
            d.id,
            d.title,
            d.category,
            c.content,
            1 - (c.embedding <=> $1::vector) as similarity
          FROM academy_document_chunks c
          JOIN academy_documents d ON c.document_id = d.id
          WHERE d.is_published = true
            AND c.embedding IS NOT NULL
          ORDER BY d.id, c.embedding <=> $1::vector
          LIMIT $2
        `, [this.formatEmbeddingForPG(queryEmbedding), limit * 2]);

        // Re-sort by similarity and limit
        const sorted = result.rows
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        if (sorted.length > 0) {
          logger.debug({ query, results: sorted.length, method: 'vector' }, 'Vector search completed');
          return sorted;
        }
        // Fall through to text search if no vector results
      } catch (error) {
        logger.warn({ error: error.message }, 'Vector search failed, falling back to text search');
      }
    }

    // Fallback to PostgreSQL full-text search
    try {
      const result = await this.pool.query(`
        SELECT
          id,
          title,
          category,
          content,
          ts_rank(
            to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')),
            plainto_tsquery('english', $1)
          ) as rank
        FROM academy_documents
        WHERE is_published = true
          AND to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, ''))
              @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2
      `, [query, limit]);

      if (result.rows.length > 0) {
        logger.debug({ query, results: result.rows.length, method: 'fulltext' }, 'Full-text search completed');
        return result.rows;
      }
    } catch (error) {
      logger.warn({ error: error.message, query }, 'Full-text search failed, trying ILIKE');
    }

    // Final fallback to ILIKE search
    try {
      const fallbackResult = await this.pool.query(`
        SELECT id, title, category, content
        FROM academy_documents
        WHERE is_published = true
          AND (title ILIKE $1 OR content ILIKE $1)
        ORDER BY
          CASE WHEN title ILIKE $1 THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT $2
      `, [`%${query}%`, limit]);

      logger.debug({ query, results: fallbackResult.rows.length, method: 'ilike' }, 'ILIKE search completed');
      return fallbackResult.rows;
    } catch (fallbackError) {
      logger.error({ error: fallbackError.message }, 'All document search methods failed');
      return [];
    }
  }

  /**
   * Search for relevant modules (training content)
   */
  async searchModules(query, limit = 3) {
    try {
      const result = await this.pool.query(`
        SELECT
          m.id,
          m.title,
          m.description,
          m.content_type,
          p.title as phase_title,
          p.phase_number
        FROM academy_modules m
        JOIN academy_phases p ON m.phase_id = p.id
        WHERE m.title ILIKE $1
           OR m.description ILIKE $1
           OR (m.content::text ILIKE $1)
        ORDER BY p.phase_number, m.display_order
        LIMIT $2
      `, [`%${query}%`, limit]);

      return result.rows;
    } catch (error) {
      logger.warn({ error: error.message }, 'Module search failed');
      return [];
    }
  }

  /**
   * Get franchisee context for personalized responses
   */
  async getFranchiseeContext(franchiseId) {
    try {
      const result = await this.pool.query(`
        SELECT
          fp.franchise_id,
          fp.status,
          fp.current_phase,
          fp.total_points,
          fp.current_streak_days,
          fp.start_date,
          CASE
            WHEN fp.start_date IS NOT NULL
            THEN LEAST(90, EXTRACT(DAY FROM NOW() - fp.start_date)::int + 1)
            ELSE 0
          END as current_day,
          (SELECT COUNT(*) FROM academy_module_progress mp
           WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed') as modules_completed,
          (SELECT COUNT(*) FROM academy_modules m
           JOIN academy_phases p ON m.phase_id = p.id
           WHERE p.program_id = fp.program_id) as total_modules,
          (SELECT m.title FROM academy_module_progress mp
           JOIN academy_modules m ON mp.module_id = m.id
           WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed'
           ORDER BY mp.completed_at DESC LIMIT 1) as last_completed_module
        FROM academy_franchisee_progress fp
        JOIN academy_programs prog ON fp.program_id = prog.id
        WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
      `, [franchiseId]);

      return result.rows[0] || null;
    } catch (error) {
      logger.warn({ error: error.message, franchiseId }, 'Failed to get franchisee context');
      return null;
    }
  }

  /**
   * Get conversation history for context
   */
  async getConversationHistory(conversationId, limit = 10) {
    try {
      const result = await this.pool.query(`
        SELECT role, content, created_at
        FROM academy_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [conversationId, limit]);

      // Reverse to get chronological order
      return result.rows.reverse();
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get conversation history');
      return [];
    }
  }

  /**
   * Build context for the AI response
   */
  async buildContext(franchiseId, userMessage, conversationId = null) {
    // Search for relevant documents
    const documents = await this.searchDocuments(userMessage, 5);
    const modules = await this.searchModules(userMessage, 3);

    // Get franchisee context
    const franchiseeContext = await getFranchiseeContext(franchiseId);

    // Get conversation history if available
    let conversationHistory = [];
    if (conversationId) {
      conversationHistory = await this.getConversationHistory(conversationId, 6);
    }

    // Build context string
    let contextParts = [];

    // Franchisee progress context
    if (franchiseeContext) {
      const progressPct = franchiseeContext.total_modules > 0
        ? Math.round((franchiseeContext.modules_completed / franchiseeContext.total_modules) * 100)
        : 0;

      contextParts.push(`## Current Franchisee Progress
- Franchise: ${franchiseeContext.franchise_id}
- Status: ${franchiseeContext.status}
- Current Phase: ${franchiseeContext.current_phase}
- Day in Program: ${franchiseeContext.current_day} of 90
- Progress: ${progressPct}% complete (${franchiseeContext.modules_completed}/${franchiseeContext.total_modules} modules)
- Points: ${franchiseeContext.total_points}
- Streak: ${franchiseeContext.current_streak_days} days
${franchiseeContext.last_completed_module ? `- Last Completed: ${franchiseeContext.last_completed_module}` : ''}`);
    }

    // Relevant documents
    if (documents.length > 0) {
      contextParts.push(`## Relevant Documentation`);
      for (const doc of documents) {
        // Truncate content to avoid token explosion
        const content = doc.content?.substring(0, 1500) || '';
        contextParts.push(`### [${doc.title}] (${doc.category})
${content}${content.length >= 1500 ? '...' : ''}`);
      }
    }

    // Relevant training modules
    if (modules.length > 0) {
      contextParts.push(`## Relevant Training Modules`);
      for (const mod of modules) {
        contextParts.push(`- **${mod.title}** (Phase ${mod.phase_number}: ${mod.phase_title}): ${mod.description || ''}`);
      }
    }

    return {
      contextString: contextParts.join('\n\n'),
      documents,
      modules,
      franchiseeContext,
      conversationHistory
    };
  }

  /**
   * Make API call to Claude
   */
  async callClaude(systemPrompt, messages, model = DEFAULT_MODEL) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    try {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model,
        max_tokens: 1500,
        system: systemPrompt,
        messages
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 45000
      });

      const { content, usage } = response.data;
      const text = content[0]?.text || '';

      return {
        text,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        model
      };
    } catch (error) {
      logger.error({
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      }, 'Claude API call failed for coach');
      throw error;
    }
  }

  /**
   * Generate a response from King Chomper
   */
  async chat({
    franchiseId,
    conversationId,
    userMessage,
    userId
  }) {
    // Check if service is available
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'AI Coach is not configured. Please contact support.',
        fallback: true
      };
    }

    // Check budget
    if (!await this.canMakeRequest(0.03)) {
      return {
        success: false,
        error: 'AI Coach is temporarily unavailable. Please try again later.',
        budgetExceeded: true
      };
    }

    try {
      // Build context
      const context = await this.buildContext(franchiseId, userMessage, conversationId);

      // Build system prompt with context
      const systemPromptWithContext = `${EARL_SYSTEM_PROMPT}

${context.contextString}`;

      // Build messages array (include conversation history if available)
      const messages = [];

      // Add conversation history
      for (const msg of context.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      // Call Claude
      const result = await this.callClaude(systemPromptWithContext, messages);

      // Calculate cost
      const cost = this.calculateCost(result.inputTokens, result.outputTokens, result.model);

      // Build citations from referenced documents
      const citations = context.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        category: doc.category
      }));

      return {
        success: true,
        response: result.text,
        citations,
        metadata: {
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost,
          documentsSearched: context.documents.length,
          modulesSearched: context.modules.length,
          hasProgress: !!context.franchiseeContext
        }
      };
    } catch (error) {
      logger.error({
        error: error.message,
        franchiseId,
        conversationId
      }, 'Coach chat failed');

      return {
        success: false,
        error: 'I encountered an issue processing your question. Please try again.',
        technicalError: error.message
      };
    }
  }

  /**
   * Get suggested questions based on franchisee progress
   */
  async getSuggestedQuestions(franchiseId) {
    const context = await this.getFranchiseeContext(franchiseId);

    // Default suggestions
    const defaultSuggestions = [
      "What should I focus on this week?",
      "How do I schedule my first demo class?",
      "What marketing strategies work best?",
      "How do I find and hire tutors?"
    ];

    if (!context) {
      return defaultSuggestions;
    }

    // Phase-specific suggestions
    const phaseSuggestions = {
      1: [
        "What tools and accounts do I need to set up first?",
        "How do I complete my 5-day training effectively?",
        "What's the best way to introduce myself to my market?",
        "How should I price my lessons?"
      ],
      2: [
        "How do I run my first demo class?",
        "What's the best outreach strategy for schools?",
        "How do I convert trials to enrollments?",
        "What should I say when calling schools?"
      ],
      3: [
        "When should I start hiring tutors?",
        "How do I scale my marketing?",
        "What should I look for in my financial review?",
        "How do I maintain quality as I grow?"
      ]
    };

    const phase = context.current_phase || 1;
    return phaseSuggestions[phase] || defaultSuggestions;
  }

  /**
   * Get coach usage statistics
   */
  async getUsageStats() {
    const weeklySpend = await this.getCurrentWeekSpend();
    const budgetDollars = this.weeklyBudgetCents / 100;

    const statsResult = await this.pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as message_count
      FROM academy_messages
      WHERE role = 'assistant'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    return {
      is_available: this.isAvailable(),
      weekly_budget: budgetDollars,
      weekly_spend: weeklySpend,
      budget_remaining: Math.max(0, budgetDollars - weeklySpend),
      budget_percent_used: Math.min(100, (weeklySpend / budgetDollars) * 100),
      messages_by_day: statsResult.rows
    };
  }
}

// Helper function (extracted for reuse)
async function getFranchiseeContext(pool, franchiseId) {
  try {
    const result = await pool.query(`
      SELECT
        fp.franchise_id,
        fp.status,
        fp.current_phase,
        fp.total_points,
        fp.current_streak_days,
        fp.start_date,
        CASE
          WHEN fp.start_date IS NOT NULL
          THEN LEAST(90, EXTRACT(DAY FROM NOW() - fp.start_date)::int + 1)
          ELSE 0
        END as current_day,
        (SELECT COUNT(*) FROM academy_module_progress mp
         WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed') as modules_completed,
        (SELECT COUNT(*) FROM academy_modules m
         JOIN academy_phases p ON m.phase_id = p.id
         WHERE p.program_id = fp.program_id) as total_modules,
        (SELECT m.title FROM academy_module_progress mp
         JOIN academy_modules m ON mp.module_id = m.id
         WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed'
         ORDER BY mp.completed_at DESC LIMIT 1) as last_completed_module
      FROM academy_franchisee_progress fp
      JOIN academy_programs prog ON fp.program_id = prog.id
      WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
    `, [franchiseId]);

    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

module.exports = AcademyCoachService;
