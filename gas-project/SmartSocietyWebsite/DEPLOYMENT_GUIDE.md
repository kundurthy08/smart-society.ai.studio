# Smart Society 3.0 — HAPPY HOMES PALACE-B Google Apps Script Deployment Guide

This folder (`/gas-project/SmartSocietyWebsite/`) contains the 17 Google Apps Script and HTML Service source files for deploying **HAPPY HOMES PALACE-B Owners Welfare Association** onto Google Apps Script with Google Sheets (`Smart_Society_Database`) and Google Drive storage.

## Included Files (17)
- `Code.gs`, `Auth.gs`, `Database.gs`
- `WebsiteContent.gs`, `Committee.gs`, `Gallery.gs`, `Announcements.gs`, `Complaints.gs`
- `Flats.gs`, `Billing.gs`, `Payments.gs`, `Receipts.gs`, `Reports.gs`
- `Index.html`, `Styles.html`, `Scripts.html`
- `appsscript.json`

## Setup & Deployment (`script.google.com`)
1. Open [https://script.google.com](https://script.google.com) and create a project named `SmartSocietyWebsite`.
2. Enable **Show "appsscript.json" manifest file in editor** under Project Settings and paste `appsscript.json`.
3. Add each `.gs` and `.html` file from this directory into the Apps Script editor.
4. Run `Database_getSpreadsheet()` once to authorize Sheets & Drive scopes and initialize `Smart_Society_Database` (18 worksheets including Community Website & Financial tables, plus pilot Flats `101`–`110`).
5. Add committee and resident Google emails in the `Users` tab (`President`, `Treasurer`, or `Resident` with `FlatID`).
6. Deploy as a **Web app** (`Deploy → New deployment`) with `ANYONE_WITH_GOOGLE_ACCOUNT` access and verified identity handling per `Auth.gs`.
