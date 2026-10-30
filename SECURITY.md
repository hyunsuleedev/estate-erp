# Security

Please report vulnerabilities using GitHub's **Security → Report a vulnerability** feature. Do not post credentials, customer records, or exploit details in public issues.

## Credentials and data

- Keep server credentials in environment variables or deployment secrets. Commit only empty or clearly fictional `.env.example` values.
- Every `VITE_*` variable is included in browser code. Only public browser identifiers belong there; restrict allowed origins in the provider dashboard.
- Do not commit customer exports, call recordings, browser session files, database dumps, or screenshots containing personal data.
- If a real credential is exposed, revoke or rotate it first; deleting a file does not remove it from Git history.

## Local secret check

Run Gitleaks before publishing branches:

```sh
gitleaks git . --log-opts="--all" --redact
```

A clean automated scan does not replace application security testing.
