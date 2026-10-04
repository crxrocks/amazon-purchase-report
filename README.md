# Amazon Purchase Report

A browser userscript that builds a date-filtered report from Amazon **Your Payments → Transactions**. It follows order links using the browser's existing Amazon session and displays products, individual prices, transaction totals, payment methods, and order links in one interface.

## Features

- Scans multiple Amazon Payments history pages for a selected date range
- Retrieves products and item prices from the associated Amazon order pages
- Groups products belonging to the same Amazon transaction
- Compares item subtotals with the transaction total
- Flags missing prices and differences caused by tax, shipping, promotions, or discounts
- Provides one transaction-level checkbox for YNAB reconciliation
- Saves checked state locally in each browser
- Hides fully checked transactions by default
- Copies the report or downloads it as CSV

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the [raw userscript](https://raw.githubusercontent.com/crxrocks/amazon-purchase-report/main/Amazon_Purchase_Report.user.js).
3. Approve the installation in the userscript manager.
4. Sign in to Amazon and open **Account → Your Payments → Transactions**.
5. Click **Amazon Purchase Report** in the lower-right corner.

The userscript manager uses the script's `@updateURL` and `@downloadURL` metadata to check this repository for newer versions.

## Privacy

The script runs only on Amazon's Payments transactions page. Purchase information is processed inside the browser and is not sent to GitHub or another service. Reconciliation state is stored in that browser's local storage and is not synchronized between computers.

## Updating the repository

Increase the `@version` value whenever the userscript changes, commit the updated file, and push it to the `main` branch. Installed copies can then detect the new version automatically.
