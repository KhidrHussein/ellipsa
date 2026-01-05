export class FilterService {
    private static instance: FilterService;
    private blockedApps: Set<string>;
    private blockedDomains: Set<string>;

    private constructor() {
        this.blockedApps = new Set([
            '1Password',
            'LastPass',
            'KeePass',
            'Bitwarden',
            'Dashlane',
            'Enpass',
            'RoboForm',
            'NordPass',
            'Keeper'
        ]);

        this.blockedDomains = new Set([
            'chase.com',
            'bankofamerica.com',
            'wellsfargo.com',
            'paypal.com',
            'citi.com',
            'americanexpress.com',
            'capitalone.com',
            'usbank.com',
            'pnc.com',
            'td.com',
            'schwab.com',
            'fidelity.com',
            'vanguard.com',
            'stripe.com',
            'wise.com',
            'revolut.com'
        ]);
    }

    public static getInstance(): FilterService {
        if (!FilterService.instance) {
            FilterService.instance = new FilterService();
        }
        return FilterService.instance;
    }

    public shouldBlock(title: string, appName?: string, url?: string): boolean {
        const lowerTitle = title.toLowerCase();
        const lowerAppName = appName?.toLowerCase() || '';
        const lowerUrl = url?.toLowerCase() || '';

        // Check blocked apps
        for (const app of this.blockedApps) {
            const lowerApp = app.toLowerCase();
            if (lowerAppName.includes(lowerApp) || lowerTitle.includes(lowerApp)) {
                return true;
            }
        }

        // Check blocked domains
        for (const domain of this.blockedDomains) {
            if (lowerUrl.includes(domain) || lowerTitle.includes(domain)) {
                return true;
            }
        }

        // Heuristics for window titles that often indicate sensitive content
        const sensitiveKeywords = [
            'sign in',
            'log in',
            'login',
            'password',
            'bank',
            'vault',
            'wallet',
            'credit card',
            'checkout',
            'payment'
        ];

        // Only apply strict keywords if we strongly suspect a sensitive context or if the user enabled "strict mode"
        // For now, we'll be conservative and mostly rely on explicit domain/app names, 
        // but checking for "Password" in title is usually a safe block.
        if (lowerTitle.includes('password') || lowerTitle.includes('vault')) {
            return true;
        }

        return false;
    }

    public addToBlocklist(item: string, type: 'app' | 'domain'): void {
        if (type === 'app') {
            this.blockedApps.add(item);
        } else {
            this.blockedDomains.add(item);
        }
    }

    public removeFromBlocklist(item: string, type: 'app' | 'domain'): void {
        if (type === 'app') {
            this.blockedApps.delete(item);
        } else {
            this.blockedDomains.delete(item);
        }
    }

    public getBlocklist(): { apps: string[], domains: string[] } {
        return {
            apps: Array.from(this.blockedApps),
            domains: Array.from(this.blockedDomains)
        };
    }
}

export const filterService = FilterService.getInstance();
