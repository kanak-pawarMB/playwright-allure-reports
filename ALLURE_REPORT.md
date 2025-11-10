# Allure report publishing and access

This document explains how the GitHub Actions workflow publishes the Allure HTML report and how to access it.

Summary
- Workflow: `.github/workflows/playwright-allure.yml` runs Playwright tests, generates `allure-report/`, uploads artifacts and publishes the HTML to the `gh-pages` branch.
- Published site: GitHub Pages will serve the `allure-report` content from the `gh-pages` branch. URL: `https://<your-org-or-username>.github.io/<repo-name>/`

Preconditions
1. The workflow file is committed to the default branch (main/master).
2. For tests requiring credentials, set repository secrets: `GOOGLE_EMAIL`, `GOOGLE_PASSWORD`. (Repository → Settings → Secrets and variables → Actions)

How it publishes
- After tests finish, the job runs `npm run allure:generate` which produces `allure-report/`.
- The workflow then uses `peaceiris/actions-gh-pages` to push the `allure-report/` folder to the `gh-pages` branch.
- The action uses the built-in `repo_token` to commit the published report. No extra token is required.

Enable GitHub Pages (one-time in repo settings)
1. Go to your repository on GitHub.
2. Settings → Pages.
3. Under "Source", select the branch: `gh-pages` and folder: `/ (root)`.
4. Save. The site will be published shortly. The URL is shown on the same page.

Triggering the workflow
- The workflow runs on push to `main`/`master`, on pull requests, and can be triggered manually using the "Run workflow" button on the Actions page.

Manual local steps (if you want to publish manually)
1. Generate the report locally:

```powershell
npm run test:allure
npm run allure:generate
```

2. Create a zip or copy the `allure-report` folder and upload to where you want.

Downloading the report artifact from an Actions run
1. Go to your repository → Actions → "Playwright tests → Allure" workflow.
2. Open a completed run and find the Artifacts section.
3. Download the `allure-report` artifact and unzip locally. Open `index.html` in a browser.

Notes & security
- The published report will be public for public repositories. Avoid including sensitive data in the report.
- If your tests output any secrets accidentally into logs or attachments, scrub them before publishing.

Questions or follow-ups
- Want me to set up a custom domain, or change the publish branch? I can update the workflow.
- Want me to add a badge to the README that links to the latest published report? I can add that too.