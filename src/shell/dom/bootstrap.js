import { createFeatureRuntime } from "../../core/runtime.js";
import * as feature0 from "./modules/startup.js";
import * as feature1 from "./modules/search-events.js";
import * as feature2 from "./modules/product-events.js";
import * as feature3 from "./modules/workbench-events.js";
import * as feature4 from "./modules/quote-entry.js";
import * as feature5 from "./modules/quick-quotes.js";
import * as feature6 from "./modules/system-settings-events.js";
import * as feature7 from "./modules/exports-events.js";
import * as feature8 from "./modules/quote-import.js";
import * as feature9 from "./modules/master-rollback.js";
import * as feature10 from "./modules/master-import.js";
import * as feature11 from "./modules/container-quote-events.js";
import * as feature12 from "./modules/advanced-data-actions.js";
import * as feature13 from "./modules/backup-restore.js";
const features = [feature0, feature1, feature2, feature3, feature4, feature5, feature6, feature7, feature8, feature9, feature10, feature11, feature12, feature13];
export function initializeDomFeatures(parent) {
  const runtime = createFeatureRuntime(features, {
    parent
  });
  runtime.start();
}
