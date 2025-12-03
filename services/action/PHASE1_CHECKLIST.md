# Phase 1 Completion Checklist

## ✅ Phase 1 Success Criteria

To ensure Phase 1 is complete and ready for Phase 2, you need to:

1. ✅ Fix TypeScript compilation errors
2. ✅ Verify core infrastructure works
3. ✅ Test browser automation
4. ✅ Validate safety mechanisms
5. ✅ Confirm backward compatibility
6. ✅ Start new server successfully

---

## Step-by-Step Validation

### Step 1: Fix TypeScript Compilation 🔧

**Check for errors:**
```bash
cd c:\Users\Hp\ellipsa\services\action
pnpm run typecheck
```

**Expected**: Should compile without errors. If you see errors, let me know and I'll fix them.

**Common fixes** (if needed):
- Missing `.js` extensions in imports
- Zod schema type issues
- Interface mismatches

---

### Step 2: Install Dependencies ⬇️

**Ensure all packages are installed:**
```bash
cd c:\Users\Hp\ellipsa\services\action
pnpm install
```

**Install Playwright browsers:**
```bash
npx playwright install chromium
```

**Expected**: 
- All dependencies installed
- Chromium browser downloaded (~200MB)

---

### Step 3: Run Unit Test Script 🧪

**Execute the test script:**
```bash
cd c:\Users\Hp\ellipsa\services\action
pnpm tsx src/test-actions.ts
```

**Expected Output:**
```
========================================
Testing Action Infrastructure
========================================

1. Initializing components...
2. Registering providers...
   - Providers registered: 1
   - Total actions: 6
   - By category: { browser: 6, email: 0, desktop: 0, api: 0 }

3. Available actions:
   - open_url (browser): Open a URL in browser
   - click (browser): Click an element by CSS selector
   - type_text (browser): Type text into an element
   - wait (browser): Wait for specified milliseconds
   - wait_for_selector (browser): Wait for element to appear
   - screenshot (browser): Take a screenshot of the page

4. Testing action validation...
   - Validation result: ALLOWED

5. Testing browser action execution...
   - Opening example.com and taking screenshot...
   - Action ID: act_1701612342_abc123
   - Status: completed
   - Duration: ~2000ms
   - Steps executed: 2
     1. open_url: success
     2. screenshot: success
        Screenshot captured (data:image/png;base64...

6. Testing safety validation...
   - Blocked domain test: PASS
   - Reason: Domain malware.example is blocked for security reasons

========================================
Test completed successfully!
========================================
```

**✅ Success Criteria:**
- Test completes without errors
- Browser provider initializes
- Actions execute successfully
- Screenshot is captured
- Safety validation blocks malicious domain

**❌ If Test Fails:**
- Check error message
- Verify Playwright is installed
- Ensure no firewall blocking localhost
- Share error log with me for debugging

---

### Step 4: Start New Server 🚀

**Start the new integrated server:**
```bash
cd c:\Users\Hp\ellipsa\services\action

# Start on different port to avoid conflict
$env:PORT=4005
pnpm tsx src/server.new.ts
```

**Expected Output:**
```
[Server] Loading environment from: c:\Users\Hp\ellipsa\services\action\.env
[Server] Initializing services...
[Server] Safety mode: permissive
[Server] Approval for destructive: true
[Server] Registered 1 providers
[Server] Available actions: 6
[BrowserProvider] Initialized
[Server] Email routes mounted at /api/emails
[Server] Action routes mounted at /action/v1/*
[Server] Services initialized successfully
========================================
🚀 Action Service running on port 4005
========================================
Health check: http://localhost:4005/health
OAuth URL: http://localhost:4005/auth/url
Action API: http://localhost:4005/action/v1/execute
Available actions: http://localhost:4005/action/v1/actions
========================================
```

**✅ Success Criteria:**
- Server starts without errors
- Port 4005 is listening
- All routes mounted successfully
- No crashes or warnings

**❌ If Server Fails to Start:**

**Error: "Cannot find module"**
- Run `pnpm install`
- Check import paths have `.js` extensions

**Error: "Port already in use"**
- Use different port: `$env:PORT=4006`
- OR stop the conflicting service

**Error: "Missing environment variable"**
- Copy `.env` file if missing
- Add required variables (see CONFIG.md)

---

### Step 5: Test API Endpoints 🌐

**Open a new terminal** (keep server running in first terminal)

**Test 1: Health Check**
```bash
curl http://localhost:4005/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-03T11:30:00.000Z",
  "services": {
    "action": "ready",
    "gmailConnected": false
  },
  "capabilities": {
    "totalProviders": 1,
    "totalActions": 6,
    "byCategory": {
      "browser": 6,
      "email": 0,
      "desktop": 0,
      "api": 0
    }
  }
}
```

**Test 2: List Available Actions**
```bash
curl http://localhost:4005/action/v1/actions
```

**Expected Response:**
```json
{
  "actions": [
    {
      "op": "open_url",
      "provider": "browser",
      "description": "Open a URL in browser",
      "argsSchema": { "url": "string (URL)" },
      "requiresApproval": false,
      "destructive": false,
      "category": "browser"
    },
    // ... 5 more actions
  ],
  "stats": {
    "totalProviders": 1,
    "totalActions": 6,
    "byCategory": { "browser": 6, "email": 0, "desktop": 0, "api": 0 }
  }
}
```

**Test 3: Execute Simple Action**
```bash
curl -X POST http://localhost:4005/action/v1/execute -H "Content-Type: application/json" -d "{\"plan\":[{\"op\":\"open_url\",\"args\":{\"url\":\"https://example.com\"}},{\"op\":\"screenshot\",\"args\":{}}]}"
```

**Expected Response:**
```json
{
  "action_id": "act_1701612342_abc123",
  "status": "completed",
  "steps": [
    {
      "op": "open_url",
      "status": "success",
      "output": { "url": "https://example.com" },
      "duration_ms": 1234
    },
    {
      "op": "screenshot",
      "status": "success",
      "screenshot": "data:image/png;base64,iVBORw0KGgoAAA...",
      "output": { "size_bytes": 45678 },
      "duration_ms": 500
    }
  ],
  "provenance": null,
  "started_at": "2025-12-03T11:30:00.000Z",
  "completed_at": "2025-12-03T11:30:02.000Z",
  "total_duration_ms": 1734
}
```

**Test 4: Validate Action Plan**
```bash
curl -X POST http://localhost:4005/action/v1/validate -H "Content-Type: application/json" -d "{\"plan\":[{\"op\":\"open_url\",\"args\":{\"url\":\"https://google.com\"}}]}"
```

**Expected Response:**
```json
{
  "allowed": true
}
```

**Test 5: Test Safety - Blocked Domain**
```bash
curl -X POST http://localhost:4005/action/v1/validate -H "Content-Type: application/json" -d "{\"plan\":[{\"op\":\"open_url\",\"args\":{\"url\":\"https://phishing-site.com\"}}]}"
```

**Expected Response:**
```json
{
  "allowed": false,
  "reason": "Domain phishing-site.com is blocked for security reasons"
}
```

**✅ All Tests Pass = API Working! ✅**

---

### Step 6: Verify Backward Compatibility ↩️

**Your existing email automation should still work!**

**Test: Email OAuth URL**
```bash
curl http://localhost:4005/auth/url
```

**Expected**: Returns OAuth URL for Gmail

**Test: Email Routes Exist**
```bash
curl http://localhost:4005/api/emails
```

**Expected**: Email routes respond (may need authentication)

**✅ Success Criteria:**
- Email routes still accessible
- OAuth flow unchanged
- No errors in existing email logic

---

### Step 7: Create Environment Configuration 📝

**Edit your `.env` file** in `services/action/.env`:

Add these new variables (if not present):
```bash
# Action Service - Phase 1 Config
ACTION_ALLOWLIST_MODE=permissive
ACTION_ALLOWLIST=mail.google.com,calendar.google.com,slack.com,notion.so,github.com
ACTION_BLOCKLIST=
ACTION_REQUIRE_APPROVAL_DESTRUCTIVE=true
ACTION_REQUIRE_APPROVAL_NEW_DOMAINS=true
ACTION_REQUIRE_APPROVAL_ALL=false
ACTION_RATE_LIMIT_PER_MINUTE=20
ACTION_RATE_LIMIT_PER_HOUR=200
ACTION_RATE_LIMIT_ENABLED=true
ACTION_AUDIT_ENABLED=true
ACTION_AUDIT_RETENTION_DAYS=90
```

**Keep your existing Gmail config:**
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4004/oauth2callback
OPENAI_API_KEY=...
```

---

### Step 8: Migration Decision ⚡

Once all tests pass, you have **2 options**:

#### Option A: Keep Both Servers Running (Recommended for Testing)

**Old server** (port 4004): Email automation
```bash
# Terminal 1
cd c:\Users\Hp\ellipsa\services\action
pnpm run dev
```

**New server** (port 4005): Action API
```bash
# Terminal 2
cd c:\Users\Hp\ellipsa\services\action
$env:PORT=4005
pnpm tsx src/server.new.ts
```

**Benefits:**
- Zero downtime
- Easy rollback
- Test both independently

#### Option B: Full Migration (When Confident)

**Replace old server:**
```bash
cd c:\Users\Hp\ellipsa\services\action\src

# Backup old server
mv server.ts server.backup.ts

# Activate new server
mv server.new.ts server.ts

# Restart
pnpm run dev
```

**Rollback if needed:**
```bash
mv server.ts server.new.ts
mv server.backup.ts server.ts
pnpm run dev
```

---

## 📋 Complete Phase 1 Checklist

Mark each item as you complete it:

### Prerequisites
- [ ] All dependencies installed (`pnpm install`)
- [ ] Playwright browsers installed (`npx playwright install chromium`)
- [ ] `.env` file configured with new ACTION_* variables

### Core Validation
- [ ] TypeScript compiles without errors (`pnpm run typecheck`)
- [ ] Test script passes (`pnpm tsx src/test-actions.ts`)
- [ ] Browser provider initializes successfully
- [ ] Actions execute and return results
- [ ] Safety validator blocks malicious domains

### Server Validation
- [ ] New server starts without errors
- [ ] Health endpoint returns correct stats
- [ ] `/action/v1/actions` lists 6 browser actions
- [ ] `/action/v1/execute` successfully runs actions
- [ ] `/action/v1/validate` correctly validates plans
- [ ] Email routes still accessible (backward compatibility)

### API Testing
- [ ] Can execute `open_url` action
- [ ] Can capture screenshots
- [ ] Safety validation blocks bad domains
- [ ] Safety validation allows good domains
- [ ] Rate limiting works (optional test)

### Documentation Review
- [ ] Read [README_NEW_ACTIONS.md](file:///c:/Users/Hp/ellipsa/services/action/README_NEW_ACTIONS.md)
- [ ] Review [CONFIG.md](file:///c:/Users/Hp/ellipsa/services/action/CONFIG.md)
- [ ] Understand migration path

---

## 🚨 Common Issues & Solutions

### Issue 1: "Module not found" errors

**Solution:**
```bash
cd c:\Users\Hp\ellipsa\services\action
pnpm install
```

### Issue 2: Playwright fails with "Browser not installed"

**Solution:**
```bash
npx playwright install chromium
npx playwright install-deps
```

### Issue 3: Port 4005 already in use

**Solution:**
```bash
# Check what's using the port
netstat -ano | findstr :4005

# Use different port
$env:PORT=4006
pnpm tsx src/server.new.ts
```

### Issue 4: TypeScript compilation errors

**Solution:**
- Share the error output with me
- I'll create fixes immediately
- Likely just import path issues

### Issue 5: Test script fails with timeout

**Solution:**
```bash
# Increase timeout or run headless=false to see browser
# Edit test-actions.ts and set continueOnError: true
```

### Issue 6: Actions return "pending_approval"

**Explanation**: This is **correct behavior** for destructive actions!
- Check the action type
- Destructive actions (send_email, etc.) require approval
- Browser actions should execute without approval

---

## ✅ Phase 1 Complete When...

You can confidently say:

1. ✅ **"The test script passes"** - All 6 tests green
2. ✅ **"The server starts successfully"** - No errors, all routes mounted
3. ✅ **"I can execute browser actions via API"** - curl commands work
4. ✅ **"Safety validation works"** - Blocks bad domains, allows good ones
5. ✅ **"Email automation still works"** - No regressions
6. ✅ **"I understand the architecture"** - Know what each component does

---

## 🎯 What Success Looks Like

**Terminal 1 (Test Script):**
```
✅ All tests passed - System is working!
```

**Terminal 2 (New Server):**
```
🚀 Action Service running on port 4005
No errors, all routes active
```

**Terminal 3 (API Test):**
```bash
$ curl http://localhost:4005/action/v1/execute -X POST ...
{
  "action_id": "act_...",
  "status": "completed",  # ← This is success!
  "steps": [...]
}
```

---

## 🚀 Ready for Phase 2 When...

**All Phase 1 checklist items are ✅**

Then we move to:
- **Phase 2:** Windows Desktop Automation (`WindowsProvider`)
- **Phase 3:** API Providers (Slack, Calendar, Notion)
- **Phase 4:** Memory integration (action history)
- **Phase 5:** Frontend integration (approval UI)

---

## 📞 Need Help?

If you encounter issues:

1. **Check the error message** - Copy the full output
2. **Check which step failed** - Test script vs. server vs. API
3. **Share the logs** - I can debug and fix immediately
4. **Try minimal config** - Disable features one by one to isolate

**Critical logs to share:**
- Terminal output from test script
- Server startup logs
- TypeScript error messages
- curl command responses

---

## Quick Start Command Sequence

**If you want to just run everything at once:**

```bash
# Terminal 1 - Install & Test
cd c:\Users\Hp\ellipsa\services\action
pnpm install
npx playwright install chromium
pnpm tsx src/test-actions.ts

# If test passes, start server in Terminal 2
$env:PORT=4005
pnpm tsx src/server.new.ts

# Then test API in Terminal 3
curl http://localhost:4005/health
curl http://localhost:4005/action/v1/actions
curl -X POST http://localhost:4005/action/v1/execute -H "Content-Type: application/json" -d "{\"plan\":[{\"op\":\"screenshot\",\"args\":{}}]}"
```

**If all 3 work = Phase 1 COMPLETE! 🎉**

---

**Next Step:** Run the test script and let me know the results!
