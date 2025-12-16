# Integration Setup Guide

This guide explains how to configure the 3rd party integrations for Ellipsa.

## Configuration File
All configurations should be added to `services/action/.env` or the root `.env` file.

```bash
# Example .env configuration
PORT=4004

# Slack
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Notion
NOTION_CLIENT_ID=your_client_id
NOTION_CLIENT_SECRET=your_client_secret
NOTION_API_KEY=secret_your_api_key

# GitHub
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

---

## Slack Integration

**Recommended Method: Use App Manifest**

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**.
2. Select **From an app manifest**.
3. Select your workspace and click **Next**.
4. Choose **JSON** format and paste the contents of `services/action/slack_manifest.json` (or copy from below):

```json
{
    "_metadata": {
        "major_version": 1,
        "minor_version": 1
    },
    "display_information": {
        "name": "Ellipsa",
        "description": "Your AI Executive Assistant",
        "background_color": "#000000"
    },
    "features": {
        "bot_user": {
            "display_name": "Ellipsa",
            "always_online": true
        }
    },
    "oauth_config": {
        "redirect_urls": [
            "http://localhost:4004/auth/slack/callback"
        ],
        "scopes": {
            "bot": [
                "chat:write",
                "im:write",
                "channels:read",
                "users:read"
            ],
            "user": [
                "chat:write",
                "files:write",
                "channels:read",
                "groups:read",
                "im:read",
                "mpim:read",
                "users:read"
            ]
        }
    },
    "settings": {
        "org_deploy_enabled": false,
        "socket_mode_enabled": false,
        "token_rotation_enabled": false
    }
}
```

5. Click **Next** and then **Create**.
6. Under **Basic Information**, copy `Client ID` and `Client Secret` to your `.env` file.
7. **To Install the App**:
   - In the left sidebar, click on **Install App**.
   - Click the green **Install to Workspace** button.
   - Click **Allow** to authorize.
   - You will see two tokens: **Bot User OAuth Token** (`xoxb-...`) and **User OAuth Token** (`xoxp-...`).
   - Copy the **Bot User OAuth Token** (`xoxb-...`) to your `.env` as `SLACK_BOT_TOKEN`.
   - (The User token is for testing as you, but the app uses the Bot token for its own identity).

## Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new integration.
2. Select "Public integration" if you want to use OAuth (requires filling out a form usually, for internal use "Internal integration" gives you a key directly).
   - **Note**: The current implementation supports full OAuth. For internal testing without OAuth flow, you can just use `NOTION_API_KEY`.
3. If using OAuth:
   - set Redirect URI to `http://localhost:4004/auth/notion/callback`
   - Copy `Client ID` and `Client Secret`.
   - (You do **not** need to copy the "Authorization URL" shown on the screen; Ellipsa generates this automatically).
4. If using Internal Integration (simpler):
   - Copy the `Internal Integration Secret` to `NOTION_API_KEY`.
   - You must "Invite" this integration to pages you want it to access.

## GitHub Integration

1. Go to [GitHub Developer Settings](https://github.com/settings/developers).
2. Click on **OAuth Apps** in the left sidebar (do NOT select "GitHub Apps").
3. Click **New OAuth App**.
4. Set **Authorization callback URL** to `http://localhost:4004/auth/github/callback`.
   - Start the URL with `http://` (not https) since we are on localhost.
   - Leave **Enable Device Flow** unchecked.
5. Copy `Client ID` and `Client Secret` to your `.env` file.

## Verification

Run the verification script to check your configuration:

```bash
cd services/action
pnpm run verify
```
