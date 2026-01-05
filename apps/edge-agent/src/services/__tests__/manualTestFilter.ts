import { filterService } from '../FilterService';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASSED: ${message}`);
    }
}

console.log('Running FilterService Manual Tests...');

// Test 1: Apps
assert(filterService.shouldBlock('My Vault - 1Password'), 'Block 1Password in title');
assert(filterService.shouldBlock('Bitwarden'), 'Block Bitwarden app');
assert(!filterService.shouldBlock('Notepad'), 'Allow Notepad');

// Test 2: Domains
assert(filterService.shouldBlock('Chase Bank', 'Chrome', 'https://www.chase.com'), 'Block chase.com');
assert(!filterService.shouldBlock('Google', 'Chrome', 'https://google.com'), 'Allow google.com');

// Test 3: Keywords
assert(filterService.shouldBlock('Change Password'), 'Block "Password" keyword');

console.log('All tests passed!');
