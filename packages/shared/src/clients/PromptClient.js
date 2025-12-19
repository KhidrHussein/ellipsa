import { ServiceClient } from './ServiceClient.js';
export class PromptClient extends ServiceClient {
    constructor(baseURL = 'http://localhost:4003') {
        super('PromptService', baseURL);
    }
    async draftEmail(request) {
        return this.request({
            method: 'POST',
            url: '/prompt/v1/email/draft',
            data: request,
        });
    }
    async evaluateEmail(request) {
        return this.request({
            method: 'POST',
            url: '/prompt/v1/email/evaluate',
            data: request,
        });
    }
    async generateBriefing(request) {
        return this.request({
            method: 'POST',
            url: '/prompt/v1/briefing',
            data: request,
        });
    }
    async summarize(content) {
        return this.request({
            method: 'POST',
            url: '/prompt/v1/summarize',
            data: { content }
        });
    }
}
//# sourceMappingURL=PromptClient.js.map