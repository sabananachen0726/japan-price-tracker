import { createWindowEvents } from "../core/events.js";
import { createFeatureRuntime } from "../core/runtime.js";
import * as feature0 from "./modules/state.js";
import * as feature1 from "./modules/draft-recovery.js";
import * as feature2 from "./modules/units.js";
import * as feature3 from "./modules/customer-orders.js";
import * as feature4 from "./modules/incoming-stock.js";
import * as feature5 from "./modules/purchase-calculation.js";
import * as feature6 from "./modules/table-filters.js";
import * as feature7 from "./modules/planning-view.js";
import * as feature8 from "./modules/product-details.js";
import * as feature9 from "./modules/work-orders.js";
import * as feature10 from "./modules/planning-events.js";
import * as feature11 from "./modules/work-order-actions.js";
import * as feature12 from "./modules/sheet-reader.js";
import * as feature13 from "./modules/catalog-sync.js";
import * as feature14 from "./modules/product-management.js";
import * as feature15 from "./modules/import-dialog.js";
import * as feature16 from "./modules/product-exports.js";
import * as feature17 from "./modules/status-import.js";
import * as feature18 from "./modules/shelf-life-import.js";
import * as feature19 from "./modules/inventory-import.js";
import * as feature20 from "./modules/host-bridge.js";
import * as feature21 from "./modules/settings-import.js";
import * as feature22 from "./modules/dialog-position.js";
import * as feature23 from "./modules/sales-worker.js";
import * as feature24 from "./modules/sales-core.js";
import * as feature25 from "./modules/sales-state.js";
import * as feature26 from "./modules/monthly-sales.js";
import * as feature27 from "./modules/sales-view.js";
import * as feature28 from "./modules/sales-import.js";
import * as feature29 from "./modules/sales-events.js";
import * as feature30 from "./modules/workspace.js";
const features = [feature0, feature1, feature2, feature3, feature4, feature5, feature6, feature7, feature8, feature9, feature10, feature11, feature12, feature13, feature14, feature15, feature16, feature17, feature18, feature19, feature20, feature21, feature22, feature23, feature24, feature25, feature26, feature27, feature28, feature29, feature30];
const runtime = createFeatureRuntime(features, {
  imports: {
    events: createWindowEvents(window)
  },
  exposeGlobals: true
});
runtime.start();
