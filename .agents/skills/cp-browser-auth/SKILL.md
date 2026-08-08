---
name: cp-browser-auth
description: Configure locally stored Esiljang/AIPartner and Budongsanbank credentials on demand and inject them into one exact Skill-owned agent-browser login tab. Use when any independent CP reader or manager Skill needs first-run account setup, account replacement, removal, status, or browser authentication without depending on an application project.
---

# CP Browser Auth

Own CP credential setup and browser login for independent Skills. Execute the
bundled scripts; never read, print, summarize, or edit the generated
`config.js` directly.

## Resolve credentials

1. Require one provider: `esiljang` or `budongsanbank`. Each provider has at
   most one saved account. Do not ask for an application, tenant, office,
   workflow, device, or any other identifier.
2. Run:

   ```bash
   node scripts/status.mjs --provider <provider>
   ```

3. If `hasCredentials=false`, run the setup script yourself:

   ```bash
   node scripts/configure.mjs --provider <provider>
   ```

   The script opens a one-time loopback setup page in the user's default
   browser. Wait for its terminal JSON result. The user only fills the form;
   never ask the user to run a command or paste a password into chat.
4. Require the final result `status=configured`. Retry status once, then fail
   with `credentials_missing` if the selected provider is still absent.

The generated `config.js` lives in the user's OS configuration directory, not
inside this Skill or a calling project. It stores at most one credential per
provider, is data-only, is written atomically with owner-only permissions where
supported, and may contain plaintext local credentials. Treat the entire file
as secret. Never copy, package, or inspect it with agent file tools. The config
store may upgrade its own older schema without returning credential values.

## Authenticate the Skill browser

1. Create a unique headed agent-browser session owned by the calling Skill.
2. Open the exact provider login URL:
   - `esiljang`: `https://www.aipartner.com/integrated/login?serviceCode=1000`
   - `budongsanbank`:
     `https://www.neonet.co.kr/novo-rebank/view/member/MemberLogin.neo?login_check=yes&return_url=/novo-rebank/index.neo`
3. Obtain the browser-level loopback CDP WebSocket with
   `agent-browser get cdp-url --json`.
4. Run:

   ```bash
   node scripts/login-browser.mjs \
     --provider <provider> \
     --browser-cdp-url <ws://127.0.0.1:.../devtools/browser/...>
   ```

5. Require `status=authenticated`, `browserOwner=skill`, the requested
   provider, and the expected authenticated URL. Continue all later browser
   work in that same agent-browser session.

The login script accepts only a loopback browser-level CDP URL, finds one exact
allowlisted provider tab, fills and submits the saved credentials, closes its
CDP connection, and returns only safe status metadata. It never returns a
password, cookie, token, browser profile, or storage state.

## Replace or remove credentials

- Re-run `configure.mjs` to replace a provider credential.
- Run the following only when the user explicitly requests removal:

  ```bash
  node scripts/remove.mjs --provider <provider>
  ```

## Fail closed

- Never pass usernames or passwords as command-line arguments, tool arguments,
  prompts, comments, logs, screenshots, or workflow payloads.
- Never open the setup URL inside an agent-controlled browser or snapshot its
  form. The setup script owns that page and opens the user's default browser.
- Never read `config.js` with shell, file, or model tools. Use only the bundled
  status, configure, login, and remove scripts.
- Never accept remote, page-level, credential-bearing, query-bearing, or
  non-loopback CDP URLs.
- Never inject Esiljang credentials outside `aipartner.com` or Budongsanbank
  credentials outside `neonet.co.kr`.
- Stop with `needs_input` on CAPTCHA, MFA, account selection, provider warning,
  or unexpected navigation. Do not store cookies or reusable browser state.
