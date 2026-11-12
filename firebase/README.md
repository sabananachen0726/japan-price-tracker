# Firestore configuration

Production project: japan-price-tracker (Spark).

The deployed single-field exemption is recorded in firestore.indexes.json:
app_data / rows disables ascending, descending, and array indexes. Child map
fields inherit this exemption. The application reads order_inventory_v1 by
document ID; it never queries rows subfields. This configuration changes no
permissions and keeps the entire MYOB snapshot in one document.

This exemption was applied and verified in Firebase Console on 2026-10-26.
The GitHub Pages workflow only publishes the website; it does not apply Firebase
index settings. Keep the exemption when recreating or migrating the database.

Without the exemption the former four fields per item created 40,376 index
entries for 5,047 items, above Firestore's 40,000 limit. The writer now omits
empty name/barcode fields as an additional safeguard.

## Storage v2 (V4.23.0): quotes and PIs in their own documents

`app_data/main_config` reached Firestore's 1 MiB document limit (928 KB on
2026-11-12: products 395 KB, quotes 375 KB, PIs 97 KB). Storage v2 keeps:

| Document | Contents |
| --- | --- |
| `app_data/main_config` | products, mappings, suppliers, master import history, customer protection, non-derivable item links, `storageVersion: 2` |
| `app_data/quotes_v1` | `quotes`, `updatedAt` |
| `app_data/pi_containers_v1` | `finalPiContainers`, `updatedAt` |

`firestore.rules` allows the two new documents (read: approved users; write:
Admin, fixed keys) and refuses any `main_config` write whose result still holds
`quotes` or `finalPiContainers`, so a page that was not refreshed cannot write
the old layout back.

Rollout order (the site works in v1 until step 3):

1. Deploy the site (GitHub Pages).
2. Firebase Console → Firestore → Rules: publish `firebase/firestore.rules`.
   From here until step 3, saves to `main_config` are refused.
3. An Admin reloads the site in LIVE, downloads a full backup from the banner,
   then presses 升級儲存方式. One transaction writes both new documents and
   removes the moved fields from `main_config`.
4. Everyone reloads the site.

To roll back before step 3, publish the previous rules again. After step 3, a
full backup restore writes the three documents.
