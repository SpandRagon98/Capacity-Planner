# Connect Capexity to the provided Google Sheet

The app uses the spreadsheet ID already supplied in `Code.gs`. The script creates a separate **Capexity Workspaces** tab and does not change existing tabs or cells.

1. Open [Google Apps Script](https://script.google.com/) while signed in as the spreadsheet owner.
2. Create a new project, replace its `Code.gs` content with this repository's `google-apps-script/Code.gs`, and save it as `Capexity storage`.
3. Choose **Deploy > New deployment > Web app**.
4. Set **Execute as** to yourself and **Who has access** to anyone with the link, then deploy.
5. Copy the deployment URL ending in `/exec`.
6. Open Capexity, go to **Settings > Google Sheets storage**, paste the URL, and choose **Connect**.

The script accepts only the two Capexity emails and the app access key. Keep the deployment URL private.

## Enable the optional Claude voice assistant

Voice commands use browser speech recognition for transcription and Claude Haiku for interpreting only the transcript. The Claude API key must **never** be pasted into Capexity, added to `Code.gs`, or committed to Git.

1. In your Apps Script project, replace `Code.gs` with the latest version from this repository.
2. Open **Project Settings → Script Properties** and add:
   - `ANTHROPIC_API_KEY`: a **new/rotated** Claude API key.
   - `CAPEXITY_VOICE_TOKEN`: a separate, randomly generated secret of at least 24 characters. Do **not** reuse the API key or your Capexity login password.
3. Save the properties. Choose **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the same `/exec` URL in Capexity. Google may ask you to authorize external requests because the script now calls the Claude API.
4. In Capexity, connect Google Sheets storage if it is not already connected. Click **Voice**, enter the **separate voice access token**, then start speaking. The microphone keeps listening through pauses until you say **“stop listening”**, **“recording band karo”**, or **“रिकॉर्डिंग बंद करो”**, or press **Stop**. Capexity then applies the full transcript. The token stays in this browser tab's session storage; it is not published with the app.
5. If Spandan and Mandhya both need voice control, each enters the same separate token in their own browser session.

Unambiguous commands such as “add task Buy milk” and “complete task Send report” are handled in the browser with **zero Claude tokens**. Other commands send a maximum 800-character transcript and up to 20 short task summaries per request. They use Claude Haiku with a 500-token output cap and a server-side limit of 40 requests per account per UTC day. Clear create/update commands apply automatically; deletions always require confirmation. The browser's speech recognition provider may process audio online, but Capexity sends only the resulting text to Apps Script/Claude.

**Security limitation:** Capexity's original shared-workspace login is a lightweight client-side gate, not a verified Google identity. The separate voice token is essential to prevent anyone with the public app code from spending Claude API credits. Keep both the `/exec` URL and voice token private. For a larger audience, replace this setup with proper identity-based authentication and server-side rate limiting.
