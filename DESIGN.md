---
name: Half an Onion
description: A household kitchen planner with the typography and photography of a cookbook.
colors:
  primary: "#502b43"
  on-primary: "#fff7ee"
  background: "#faf7f0"
  surface: "#fffdf8"
  on-surface: "#352632"
  secondary-container: "#f0dadc"
  outline: "#d2c6bf"
---

# Half an Onion

## Type and photography

Instrument Serif sets the wordmark, headings, and calendar dates. The italic in “Onion” distinguishes the brand even in the compact mobile masthead. DM Sans carries controls, recipes within calendar cells, quantities, form fields, and status messages. Both faces are served locally for offline use.

The red-onion still life appears on the sign-in cover and the planner. Its cut face stays visible in both crops. Functional views such as Shopping and Pantry give their available space to household records.

## Layout and controls

The main navigation follows the same order at every width. A wide planner shows seven aligned dates. Below 1024px, each date gets an agenda row with room for meal names. Aubergine identifies today and primary actions. Pale rose identifies the active section or filter.

Group related controls with spacing and a change of surface. Use an outline where it identifies an editable field or a button. Give icon-only actions an accessible name. Keep the native dialog and its visible title for editing, and show quantities, participants, and purchase state beside the records they describe.

The shared tokens and layout rules live in `src/client/style.css`. Collection views, forms and sign-in use their corresponding stylesheets in the same directory.
