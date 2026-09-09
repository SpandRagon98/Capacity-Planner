# Connect Capexity to the provided Google Sheet

The app uses the spreadsheet ID already supplied in `Code.gs`. The script creates a separate **Capexity Workspaces** tab and does not change existing tabs or cells.

1. Open [Google Apps Script](https://script.google.com/) while signed in as the spreadsheet owner.
2. Create a new project, replace its `Code.gs` content with this repository's `google-apps-script/Code.gs`, and save it as `Capexity storage`.
3. Choose **Deploy > New deployment > Web app**.
4. Set **Execute as** to yourself and **Who has access** to anyone with the link, then deploy.
5. Copy the deployment URL ending in `/exec`.
6. Open Capexity, go to **Settings > Google Sheets storage**, paste the URL, and choose **Connect**.

The script accepts only the two Capexity emails and the app access key. Keep the deployment URL private.
