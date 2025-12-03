import { exec } from 'child_process';
import { promisify } from 'util';
import { Action, StepResult } from '../schemas/action.schema';
import {
    IActionProvider,
    ExecutionContext,
    ProviderResult,
    ValidationResult,
    ActionCapability,
} from '../core/ActionProvider.interface';

const execAsync = promisify(exec);

/**
 * WindowsProvider handles Windows desktop automation
 * Uses PowerShell for app launching and Windows APIs for keyboard/clipboard
 */
export class WindowsProvider implements IActionProvider {
    readonly name = 'windows';

    async initialize(): Promise<void> {
        // Verify we're on Windows
        if (process.platform !== 'win32') {
            throw new Error('WindowsProvider requires Windows operating system');
        }
        console.log('[WindowsProvider] Initialized');
    }

    async cleanup(): Promise<void> {
        console.log('[WindowsProvider] Cleaned up');
    }

    supports(action: Action): boolean {
        return [
            'open_app',
            'press_keys',
            'paste_text',
            'get_clipboard',
            'close_window',
            'get_active_window',
        ].includes(action.op);
    }

    validate(action: Action): ValidationResult {
        if (!this.supports(action)) {
            return {
                allowed: false,
                reason: `Windows provider does not support action: ${action.op}`,
            };
        }

        // Validate app names for open_app
        if (action.op === 'open_app' && 'app' in action.args) {
            const app = action.args.app as string;
            if (!app || app.trim().length === 0) {
                return {
                    allowed: false,
                    reason: 'App name cannot be empty',
                };
            }
        }

        return { allowed: true };
    }

    async execute(actions: Action[], context: ExecutionContext): Promise<ProviderResult> {
        const results: StepResult[] = [];

        for (const action of actions) {
            const actionStart = Date.now();

            try {
                const result = await this.executeAction(action, context);
                result.duration_ms = Date.now() - actionStart;
                results.push(result);

                console.log(`[WindowsProvider] ${action.op}: ${result.status} (${result.duration_ms}ms)`);

                if (result.status === 'failed' && !context.continueOnError) {
                    console.log('[WindowsProvider] Stopping due to failure');
                    break;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[WindowsProvider] Error executing ${action.op}:`, errorMessage);

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

        return { results };
    }

    private async executeAction(
        action: Action,
        context: ExecutionContext
    ): Promise<StepResult> {
        switch (action.op) {
            case 'open_app':
                return await this.openApp(action);

            case 'press_keys':
                return await this.pressKeys(action);

            case 'paste_text':
                return await this.pasteText(action);

            case 'get_clipboard':
                return await this.getClipboard(action);

            case 'close_window':
                return await this.closeWindow(action);

            case 'get_active_window':
                return await this.getActiveWindow(action);

            default:
                throw new Error(`Unsupported action: ${action.op}`);
        }
    }

    /**
     * Open an application using PowerShell
     */
    private async openApp(action: Action): Promise<StepResult> {
        if (!('app' in action.args) || typeof action.args.app !== 'string') {
            throw new Error('Invalid app argument');
        }

        const app = action.args.app as string;

        // Map common app names to executables
        const appMap: Record<string, string> = {
            'notepad': 'notepad.exe',
            'calculator': 'calc.exe',
            'paint': 'mspaint.exe',
            'explorer': 'explorer.exe',
            'cmd': 'cmd.exe',
            'powershell': 'powershell.exe',
            'chrome': 'chrome.exe',
            'edge': 'msedge.exe',
            'firefox': 'firefox.exe',
        };

        const executable = appMap[app.toLowerCase()] || app;

        // PowerShell command to start the application
        const psCommand = `Start-Process -FilePath "${executable}"`;

        try {
            await execAsync(`powershell.exe -Command "${psCommand}"`, {
                timeout: 5000,
            });

            return {
                op: action.op,
                status: 'success',
                output: { app: executable },
            };
        } catch (error) {
            throw new Error(`Failed to open ${app}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Simulate keyboard input using PowerShell and Windows Forms
     */
    private async pressKeys(action: Action): Promise<StepResult> {
        if (!('keys' in action.args) || typeof action.args.keys !== 'string') {
            throw new Error('Invalid keys argument');
        }

        const keys = action.args.keys as string;

        // PowerShell script to send keys
        const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Start-Sleep -Milliseconds 100
      [System.Windows.Forms.SendKeys]::SendWait("${this.escapeForSendKeys(keys)}")
    `;

        try {
            await execAsync(`powershell.exe -Command "${psScript.replace(/\n/g, '; ')}"`, {
                timeout: 5000,
            });

            return {
                op: action.op,
                status: 'success',
                output: { keys },
            };
        } catch (error) {
            throw new Error(`Failed to press keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Paste text to clipboard and optionally trigger Ctrl+V
     */
    private async pasteText(action: Action): Promise<StepResult> {
        if (!('text' in action.args) || typeof action.args.text !== 'string') {
            throw new Error('Invalid text argument');
        }

        const text = action.args.text as string;
        const autoTrigger = 'trigger' in action.args ? action.args.trigger : true;

        // PowerShell script to set clipboard and optionally paste
        const psScript = `
      Set-Clipboard -Value "${text.replace(/"/g, '""')}"
      ${autoTrigger ? 'Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 100; [System.Windows.Forms.SendKeys]::SendWait("^v")' : ''}
    `;

        try {
            await execAsync(`powershell.exe -Command "${psScript.replace(/\n/g, '; ')}"`, {
                timeout: 5000,
            });

            return {
                op: action.op,
                status: 'success',
                output: { textLength: text.length, triggered: autoTrigger },
            };
        } catch (error) {
            throw new Error(`Failed to paste text: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get current clipboard content
     */
    private async getClipboard(action: Action): Promise<StepResult> {
        const psCommand = 'Get-Clipboard';

        try {
            const { stdout } = await execAsync(`powershell.exe -Command "${psCommand}"`, {
                timeout: 3000,
            });

            const content = stdout.trim();

            return {
                op: action.op,
                status: 'success',
                output: { content, length: content.length },
            };
        } catch (error) {
            throw new Error(`Failed to get clipboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Close the active window using Alt+F4
     */
    private async closeWindow(action: Action): Promise<StepResult> {
        const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("%{F4}")
    `;

        try {
            await execAsync(`powershell.exe -Command "${psScript.replace(/\n/g, '; ')}"`, {
                timeout: 3000,
            });

            return {
                op: action.op,
                status: 'success',
            };
        } catch (error) {
            throw new Error(`Failed to close window: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get the title of the active window
     */
    private async getActiveWindow(action: Action): Promise<StepResult> {
        const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class WindowHelper {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          
          public static string GetActiveWindowTitle() {
            IntPtr handle = GetForegroundWindow();
            StringBuilder title = new StringBuilder(256);
            GetWindowText(handle, title, 256);
            return title.ToString();
          }
        }
"@
      [WindowHelper]::GetActiveWindowTitle()
    `;

        try {
            const { stdout } = await execAsync(`powershell.exe -Command "${psScript.replace(/\n/g, ' ')}"`, {
                timeout: 5000,
            });

            const title = stdout.trim();

            return {
                op: action.op,
                status: 'success',
                output: { title },
            };
        } catch (error) {
            throw new Error(`Failed to get active window: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Escape special characters for SendKeys
     */
    private escapeForSendKeys(keys: string): string {
        // SendKeys special characters that need escaping
        const specialChars = ['+', '^', '%', '~', '(', ')', '{', '}', '[', ']'];

        let escaped = keys;
        for (const char of specialChars) {
            escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `{${char}}`);
        }

        // Handle common shortcuts
        escaped = escaped.replace(/ctrl\+/gi, '^');
        escaped = escaped.replace(/alt\+/gi, '%');
        escaped = escaped.replace(/shift\+/gi, '+');

        return escaped;
    }

    getCapabilities(): ActionCapability[] {
        return [
            {
                op: 'open_app',
                provider: this.name,
                description: 'Open a Windows application',
                argsSchema: { app: 'string (app name or path)' },
                requiresApproval: false,
                destructive: false,
                category: 'desktop',
            },
            {
                op: 'press_keys',
                provider: this.name,
                description: 'Simulate keyboard input',
                argsSchema: { keys: 'string (keys to press, e.g., "Ctrl+S", "Alt+Tab")' },
                requiresApproval: false,
                destructive: false,
                category: 'desktop',
            },
            {
                op: 'paste_text',
                provider: this.name,
                description: 'Set clipboard and optionally paste',
                argsSchema: { text: 'string', trigger: 'boolean (optional, default true)' },
                requiresApproval: false,
                destructive: false,
                category: 'desktop',
            },
            {
                op: 'get_clipboard',
                provider: this.name,
                description: 'Get current clipboard content',
                argsSchema: {},
                requiresApproval: false,
                destructive: false,
                category: 'desktop',
            },
            {
                op: 'close_window',
                provider: this.name,
                description: 'Close the active window',
                argsSchema: {},
                requiresApproval: false,
                destructive: false,
                category: 'desktop',
            },
            {
                op: 'get_active_window',
                provider: this.name,
                description: 'Get the title of the active window',
                argsSchema: {},
                requiresApproval: false,
                destructive: false,
                category: 'desktop',
            },
        ];
    }
}
