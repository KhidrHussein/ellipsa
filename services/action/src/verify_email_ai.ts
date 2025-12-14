import { EmailLLMService } from './email/services/EmailLLMService.js';
import { config } from 'dotenv';
import path from 'path';

// Try to load from root .env
config({ path: path.resolve(process.cwd(), '../../.env') });

async function main() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('OPENAI_API_KEY not set');
        process.exit(1);
    }

    const service = new EmailLLMService(apiKey);

    const testCases = [
        {
            subject: "Urgent: Project Update Needed",
            summary: "I need to know the status of the project by EOD today. Please reply ASAP.",
            from: { address: "boss@company.com" }
        },
        {
            subject: "Team Lunch",
            summary: "Let's go to that pizza place on Friday. No need to reply if you're coming.",
            from: { address: "colleague@company.com" }
        },
        {
            subject: "Invoice #12345",
            summary: "Attached is your invoice. Please pay by end of month.",
            from: { address: "billing@vendor.com" }
        },
        {
            subject: "Newsletter",
            summary: "Here is your weekly digest of news.",
            from: { address: "news@letter.com" }
        }
    ];

    console.log("Starting verification...");

    for (const test of testCases) {
        console.log(`\nEvaluating: ${test.subject}`);
        const result = await service.evaluateAction({
            summary: test.summary,
            subject: test.subject,
            from: test.from,
            // Mock other required fields
            id: 'mock', threadId: 'mock', date: new Date(), actionRequired: false, priority: 'medium', categories: []
        } as any);

        console.log(`Action: ${result.action}`);
        console.log(`Reasoning: ${result.reasoning}`);
        if (result.action === 'REPLY') console.log(`Draft Intent: ${result.draftIntent}`);
        if (result.action === 'TASK') console.log(`Task: ${JSON.stringify(result.suggestedTask)}`);

        // Assertions
        if (test.subject.includes("Urgent") && result.action !== 'REPLY') console.warn("FAIL: Expected REPLY for urgent email");
        if (test.subject.includes("Newsletter") && result.action !== 'ARCHIVE' && result.action !== 'NONE') console.warn("FAIL: Expected ARCHIVE/NONE for newsletter");
    }
}

main().catch(console.error);
