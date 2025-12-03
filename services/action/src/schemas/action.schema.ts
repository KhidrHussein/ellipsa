import { z } from 'zod';

// ============================================================================
// Base Action Schemas
// ============================================================================

// Browser Actions
const OpenUrlActionSchema = z.object({
    op: z.literal('open_url'),
    args: z.object({
        url: z.string().url(),
    }),
});

const ClickActionSchema = z.object({
    op: z.literal('click'),
    args: z.object({
        selector: z.string(),
    }),
});

const TypeTextActionSchema = z.object({
    op: z.literal('type_text'),
    args: z.object({
        selector: z.string(),
        text: z.string(),
    }),
});

const WaitActionSchema = z.object({
    op: z.literal('wait'),
    args: z.object({
        ms: z.number().min(100).max(30000),
    }),
});

const WaitForSelectorActionSchema = z.object({
    op: z.literal('wait_for_selector'),
    args: z.object({
        selector: z.string(),
        timeout: z.number().optional().default(5000),
    }),
});

const ScreenshotActionSchema = z.object({
    op: z.literal('screenshot'),
    args: z.object({
        path: z.string().optional(),
        fullPage: z.boolean().optional().default(false),
    }),
});

// Email Actions
const SendEmailActionSchema = z.object({
    op: z.literal('send_email'),
    args: z.object({
        to: z.array(z.string().email()),
        subject: z.string(),
        body: z.string(),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
        threadId: z.string().optional(),
        attachments: z.array(z.object({
            filename: z.string(),
            content: z.string(), // base64
            contentType: z.string(),
        })).optional(),
    }),
});

const DraftEmailActionSchema = z.object({
    op: z.literal('draft_email'),
    args: z.object({
        to: z.array(z.string().email()),
        subject: z.string().optional(),
        context: z.object({
            conversationHistory: z.array(z.any()).optional(),
            tone: z.enum(['formal', 'casual', 'friendly', 'professional']).optional(),
            additionalContext: z.string().optional(),
        }).optional(),
    }),
});

const MarkEmailReadActionSchema = z.object({
    op: z.literal('mark_email_read'),
    args: z.object({
        emailId: z.string(),
    }),
});

// Desktop Actions (Windows focus)
const OpenAppActionSchema = z.object({
    op: z.literal('open_app'),
    args: z.object({
        app: z.string(), // Application name or path
    }),
});

const PasteTextActionSchema = z.object({
    op: z.literal('paste_text'),
    args: z.object({
        text: z.string(),
        trigger: z.boolean().optional().default(true),
    }),
});

const PressKeysActionSchema = z.object({
    op: z.literal('press_keys'),
    args: z.object({
        keys: z.string(), // e.g., "ctrl+c", "alt+tab"
    }),
});

const GetClipboardActionSchema = z.object({
    op: z.literal('get_clipboard'),
    args: z.object({}),
});

const CloseWindowActionSchema = z.object({
    op: z.literal('close_window'),
    args: z.object({}),
});

const GetActiveWindowActionSchema = z.object({
    op: z.literal('get_active_window'),
    args: z.object({}),
});

// API Actions - Slack
const SlackMessageActionSchema = z.object({
    op: z.literal('slack_message'),
    args: z.object({
        channel: z.string(),
        text: z.string(),
        threadTs: z.string().optional(),
    }),
});

const SlackReplyActionSchema = z.object({
    op: z.literal('slack_reply'),
    args: z.object({
        channel: z.string(),
        text: z.string(),
        threadTs: z.string(),
    }),
});

const SlackDMActionSchema = z.object({
    op: z.literal('slack_dm'),
    args: z.object({
        userId: z.string(),
        text: z.string(),
    }),
});

// API Actions - Calendar
const CreateCalendarEventActionSchema = z.object({
    op: z.literal('create_calendar_event'),
    args: z.object({
        summary: z.string(),
        start: z.string(), // ISO 8601
        end: z.string(), // ISO 8601
        attendees: z.array(z.string().email()).optional(),
        description: z.string().optional(),
        location: z.string().optional(),
    }),
});

const ListCalendarEventsActionSchema = z.object({
    op: z.literal('list_calendar_events'),
    args: z.object({
        timeMin: z.string().optional(),
        timeMax: z.string().optional(),
        maxResults: z.number().optional(),
    }),
});

const UpdateCalendarEventActionSchema = z.object({
    op: z.literal('update_calendar_event'),
    args: z.object({
        eventId: z.string(),
        summary: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        description: z.string().optional(),
    }),
});

const DeleteCalendarEventActionSchema = z.object({
    op: z.literal('delete_calendar_event'),
    args: z.object({
        eventId: z.string(),
    }),
});

// API Actions - Notion
const NotionCreatePageActionSchema = z.object({
    op: z.literal('notion_create_page'),
    args: z.object({
        parentId: z.string(),
        title: z.string(),
        content: z.array(z.any()).optional(),
    }),
});

const NotionUpdatePageActionSchema = z.object({
    op: z.literal('notion_update_page'),
    args: z.object({
        pageId: z.string(),
        properties: z.record(z.any()),
    }),
});

const NotionQueryDatabaseActionSchema = z.object({
    op: z.literal('notion_query_database'),
    args: z.object({
        databaseId: z.string(),
        filter: z.record(z.any()).optional(),
    }),
});

const NotionCreateDatabaseEntryActionSchema = z.object({
    op: z.literal('notion_create_database_entry'),
    args: z.object({
        databaseId: z.string(),
        properties: z.record(z.any()),
    }),
});

// API Actions - GitHub
const GitHubCreateIssueActionSchema = z.object({
    op: z.literal('github_create_issue'),
    args: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
        title: z.string(),
        body: z.string().optional(),
        labels: z.array(z.string()).optional(),
    }),
});

const GitHubCreatePRActionSchema = z.object({
    op: z.literal('github_create_pr'),
    args: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
        title: z.string(),
        head: z.string(),
        base: z.string(),
        body: z.string().optional(),
    }),
});

const GitHubCommentActionSchema = z.object({
    op: z.literal('github_comment_issue'),
    args: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
        issueNumber: z.number(),
        body: z.string(),
    }),
});

const GitHubCloseIssueActionSchema = z.object({
    op: z.literal('github_close_issue'),
    args: z.object({
        owner: z.string().optional(),
        repo: z.string().optional(),
        issueNumber: z.number(),
    }),
});

// ============================================================================
// Union Type for All Actions
// ============================================================================

export const ActionSchema = z.discriminatedUnion('op', [
    // Browser
    OpenUrlActionSchema,
    ClickActionSchema,
    TypeTextActionSchema,
    WaitActionSchema,
    WaitForSelectorActionSchema,
    ScreenshotActionSchema,

    // Email
    SendEmailActionSchema,
    DraftEmailActionSchema,
    MarkEmailReadActionSchema,

    // Desktop
    OpenAppActionSchema,
    PasteTextActionSchema,
    PressKeysActionSchema,
    GetClipboardActionSchema,
    CloseWindowActionSchema,
    GetActiveWindowActionSchema,

    // API - Slack
    SlackMessageActionSchema,
    SlackReplyActionSchema,
    SlackDMActionSchema,

    // API - Calendar
    CreateCalendarEventActionSchema,
    ListCalendarEventsActionSchema,
    UpdateCalendarEventActionSchema,
    DeleteCalendarEventActionSchema,

    // API - Notion
    NotionCreatePageActionSchema,
    NotionUpdatePageActionSchema,
    NotionQueryDatabaseActionSchema,
    NotionCreateDatabaseEntryActionSchema,

    // API - GitHub
    GitHubCreateIssueActionSchema,
    GitHubCreatePRActionSchema,
    GitHubCommentActionSchema,
    GitHubCloseIssueActionSchema,
]);

// ============================================================================
// Action Plan Schema
// ============================================================================

export const ProvenanceSchema = z.object({
    origin_event_id: z.string().optional(),
    prompt_id: z.string().optional(),
    user_id: z.string().optional(),
    source: z.string().optional(),
    timestamp: z.string().optional(),
});

export const ActionPlanSchema = z.object({
    agent_id: z.string().optional(),
    plan: z.array(ActionSchema).min(1).max(50), // Limit to 50 steps
    provenance: ProvenanceSchema.optional(),
    context: z.record(z.unknown()).optional(),
});

// ============================================================================
// Execution Result Schemas
// ============================================================================

export const StepResultSchema = z.object({
    op: z.string(),
    status: z.enum(['success', 'failed', 'skipped']),
    error: z.string().optional(),
    output: z.record(z.unknown()).optional(),
    duration_ms: z.number().optional(),
    screenshot: z.string().optional(), // base64
});

export const ExecutionResultSchema = z.object({
    action_id: z.string(),
    status: z.enum(['completed', 'failed', 'partial', 'pending_approval']),
    steps: z.array(StepResultSchema),
    provenance: ProvenanceSchema.optional(),
    started_at: z.string(),
    completed_at: z.string().optional(),
    total_duration_ms: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type Action = z.infer<typeof ActionSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type StepResult = z.infer<typeof StepResultSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// Helper type to extract specific action types
export type OpenUrlAction = z.infer<typeof OpenUrlActionSchema>;
export type ClickAction = z.infer<typeof ClickActionSchema>;
export type TypeTextAction = z.infer<typeof TypeTextActionSchema>;
export type SendEmailAction = z.infer<typeof SendEmailActionSchema>;
export type DraftEmailAction = z.infer<typeof DraftEmailActionSchema>;
// ... add more as needed

// ============================================================================
// Validation Functions
// ============================================================================

export function validateActionPlan(data: unknown): ActionPlan {
    return ActionPlanSchema.parse(data);
}

export function validateAction(data: unknown): Action {
    return ActionSchema.parse(data);
}

export function validateExecutionResult(data: unknown): ExecutionResult {
    return ExecutionResultSchema.parse(data);
}
