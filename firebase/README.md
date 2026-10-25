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
