import { chromium, Browser, Page } from 'playwright';
import { Action, StepResult } from '../schemas/action.schema';
import {
    IActionProvider,
    ExecutionContext,
    ProviderResult,
    ValidationResult,
    ActionCapability,
} from '../core/ActionProvider.interface';

/**
 * BrowserProvider handles browser automation using Playwright
 * Supports: open_url, click, type_text, wait, wait_for_selector, screenshot
 */
export class BrowserProvider implements IActionProvider {
    readonly name = 'browser';
    private browser: Browser | null = null;

    async initialize(): Promise<void> {
        console.log('[BrowserProvider] Initialized');
    }

    async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        console.log('[BrowserProvider] Cleaned up');
    }

    supports(action: Action): boolean {
        return [
            'open_url',
            'click',
            'type_text',
            'wait',
            'wait_for_selector',
            'screenshot',
        ].includes(action.op);
    }

    validate(action: Action): ValidationResult {
        if (!this.supports(action)) {
            return {
                allowed: false,
                reason: `Browser provider does not support action: ${action.op}`,
            };
        }

        // Validate open_url has valid URL
        if (action.op === 'open_url' && 'url' in action.args) {
            try {
                new URL(action.args.url as string);
            } catch (error) {
                return {
                    allowed: false,
                    reason: `Invalid URL: ${action.args.url}`,
                };
            }
        }

        return { allowed: true };
    }

    async execute(actions: Action[], context: ExecutionContext): Promise<ProviderResult> {
        const results: StepResult[] = [];
        let browser: Browser | null = null;
        let page: Page | null = null;

        try {
            // Launch browser
            browser = await chromium.launch({
                headless: context.headless ?? true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });

            const browserContext = await browser.newContext({
                viewport: { width: 1280, height: 720 },
            });

            page = await browserContext.newPage();

            // Execute each action
            for (const action of actions) {
                const actionStart = Date.now();

                try {
                    const result = await this.executeAction(page, action, context);
                    result.duration_ms = Date.now() - actionStart;
                    results.push(result);

                    console.log(`[BrowserProvider] ${action.op}: ${result.status} (${result.duration_ms}ms)`);

                    // Stop on failure if continueOnError is false
                    if (result.status === 'failed' && !context.continueOnError) {
                        console.log('[BrowserProvider] Stopping due to failure');
                        break;
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`[BrowserProvider] Error executing ${action.op}:`, errorMessage);

                    results.push({
                        op: action.op,
                        status: 'failed',
                        error: errorMessage,
                        duration_ms: Date.now() - actionStart,
                    });

                    if (!context.continueOnError) {
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('[BrowserProvider] Browser setup error:', error);
            throw error;
        } finally {
            // Cleanup
            if (page) await page.close().catch(() => { });
            if (browser) await browser.close().catch(() => { });
        }

        return { results };
    }

    private async executeAction(
        page: Page,
        action: Action,
        context: ExecutionContext
    ): Promise<StepResult> {
        const timeout = context.timeout ?? 30000;

        switch (action.op) {
            case 'open_url': {
                if ('url' in action.args && typeof action.args.url === 'string') {
                    await page.goto(action.args.url, {
                        waitUntil: 'domcontentloaded',
                        timeout,
                    });
                    return {
                        op: action.op,
                        status: 'success',
                        output: { url: action.args.url },
                    };
                }
                throw new Error('Invalid URL argument');
            }

            case 'click': {
                if ('selector' in action.args && typeof action.args.selector === 'string') {
                    await page.click(action.args.selector, { timeout });
                    return {
                        op: action.op,
                        status: 'success',
                        output: { selector: action.args.selector },
                    };
                }
                throw new Error('Invalid selector argument');
            }

            case 'type_text': {
                if (
                    'selector' in action.args &&
                    'text' in action.args &&
                    typeof action.args.selector === 'string' &&
                    typeof action.args.text === 'string'
                ) {
                    await page.fill(action.args.selector, action.args.text, { timeout });
                    return {
                        op: action.op,
                        status: 'success',
                        output: {
                            selector: action.args.selector,
                            textLength: action.args.text.length,
                        },
                    };
                }
                throw new Error('Invalid type_text arguments');
            }

            case 'wait': {
                if ('ms' in action.args && typeof action.args.ms === 'number') {
                    await page.waitForTimeout(action.args.ms);
                    return {
                        op: action.op,
                        status: 'success',
                        output: { waited_ms: action.args.ms },
                    };
                }
                throw new Error('Invalid wait argument');
            }

            case 'wait_for_selector': {
                if ('selector' in action.args && typeof action.args.selector === 'string') {
                    const selectorTimeout =
                        'timeout' in action.args &&
                            typeof action.args.timeout === 'number'
                            ? action.args.timeout
                            : 5000;

                    await page.waitForSelector(action.args.selector, {
                        timeout: selectorTimeout,
                    });
                    return {
                        op: action.op,
                        status: 'success',
                        output: { selector: action.args.selector },
                    };
                }
                throw new Error('Invalid wait_for_selector argument');
            }

            case 'screenshot': {
                const fullPage =
                    'fullPage' in action.args && typeof action.args.fullPage === 'boolean'
                        ? action.args.fullPage
                        : false;

                const buffer = await page.screenshot({ fullPage });
                const base64 = buffer.toString('base64');

                return {
                    op: action.op,
                    status: 'success',
                    screenshot: `data:image/png;base64,${base64}`,
                    output: { size_bytes: buffer.length },
                };
            }

            default:
                throw new Error(`Unsupported action: ${action.op}`);
        }
    }

    getCapabilities(): ActionCapability[] {
        return [
            {
                op: 'open_url',
                provider: this.name,
                description: 'Open a URL in browser',
                argsSchema: { url: 'string (URL)' },
                requiresApproval: false,
                destructive: false,
                category: 'browser',
            },
            {
                op: 'click',
                provider: this.name,
                description: 'Click an element by CSS selector',
                argsSchema: { selector: 'string (CSS selector)' },
                requiresApproval: false,
                destructive: false,
                category: 'browser',
            },
            {
                op: 'type_text',
                provider: this.name,
                description: 'Type text into an element',
                argsSchema: { selector: 'string (CSS selector)', text: 'string' },
                requiresApproval: false,
                destructive: false,
                category: 'browser',
            },
            {
                op: 'wait',
                provider: this.name,
                description: 'Wait for specified milliseconds',
                argsSchema: { ms: 'number (100-30000)' },
                requiresApproval: false,
                destructive: false,
                category: 'browser',
            },
            {
                op: 'wait_for_selector',
                provider: this.name,
                description: 'Wait for element to appear',
                argsSchema: { selector: 'string (CSS selector)', timeout: 'number (optional)' },
                requiresApproval: false,
                destructive: false,
                category: 'browser',
            },
            {
                op: 'screenshot',
                provider: this.name,
                description: 'Take a screenshot of the page',
                argsSchema: { path: 'string (optional)', fullPage: 'boolean (optional)' },
                requiresApproval: false,
                destructive: false,
                category: 'browser',
            },
        ];
    }
}
