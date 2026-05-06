# Contract Document UI Design

## Decision

Use the adjusted B direction: keep the contract detail page as the main workspace, but make the document area a management hub rather than the place where large document forms are filled in.

## Layout

- Left side remains the contract list.
- Right side remains the selected contract detail.
- Inside the selected contract detail:
  - Contract/payment/special-term fields stay in the main detail column.
  - The document hub shows required and optional document rows with status and action buttons.
  - Document writing/editing opens in a wide right-side sheet.

## MySpider Reference

This follows MySpider's workflow rather than its exact WinForms layout:

1. Select a contract.
2. Choose a document type.
3. Open a document-specific input surface.
4. Save, attach, preview, or print from that document context.

MySpider generally used grids and separate forms/popups. The ERP UI keeps the same operational rhythm but avoids shrinking document writing into a narrow embedded panel.

## First Implementation Scope

- Show document templates from `ContractDocumentTemplate`.
- Group documents into required and optional rows.
- Match existing `ContractDocument` records by `templateId`.
- Open a wide sheet for creating or editing a contract document record.
- Store general fields: title, status, file URL, memo, metadata JSON.
- Keep regulated document-specific detail tables for a later phase.

## Out Of Scope

- Pixel-perfect MySpider clone.
- PDF report rendering.
- Full legal form editors for each regulated document.
- Print template designer.
