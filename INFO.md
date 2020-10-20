The npm Vulnerability Scanner skill keeps your web and Node.js projects secure
and up to date using npm's `audit` and `update` commands. It scans for known
vulnerabilities and provides pull requests with fixes. 

`npm audit` performs a moment-in-time security review of your project’s 
dependency tree and can help you fix a vulnerability. `npm update`
identifies package dependencies that are out of date and updates them to the
latest available version that satisfies the constraints in your `package.json`.

This skill leverages these tools to:

-   Always make sure your dependencies are getting scanned for latest security
    vulnerabilities
-   Get help to fix those vulnerabilities by receiving pull requests with
    updates
-   Apply the same security review policy across your entire organization
-   Exclude certain dependencies from auditing and upgrades
-   Help to keep dependencies current and up-to-date

# Vulnerabilities annotated as GitHub Checks

![Vulnerability check annotations](docs/images/vuln-scanner-checks.png)

# New pull requests with vulnerability fixes

![Fixes pull request](docs/images/vuln-scanner-pr.png)

# Get notifications in Slack or Microsoft Teams

![Slack notifications](docs/images/vuln-scanner-slack-ios.png)

