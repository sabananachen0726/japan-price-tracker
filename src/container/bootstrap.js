import { createWindowEvents } from "../core/events.js";
import { createFeatureRuntime } from "../core/runtime.js";
import * as feature0 from "./modules/state.js";
import * as feature1 from "./modules/logistics-dates.js";
import * as feature2 from "./modules/host-bridge.js";
import * as feature3 from "./modules/workflow.js";
import * as feature4 from "./modules/overview.js";
import * as feature5 from "./modules/details.js";
import * as feature6 from "./modules/settings-and-todos.js";
import * as feature7 from "./modules/navigation.js";
import * as feature8 from "./modules/editor.js";
import * as feature9 from "./modules/editing-actions.js";
import * as feature10 from "./modules/exports.js";
import * as feature11 from "./modules/workspace.js";
const features = [feature0, feature1, feature2, feature3, feature4, feature5, feature6, feature7, feature8, feature9, feature10, feature11];
const runtime = createFeatureRuntime(features, {
  imports: {
    events: createWindowEvents(window)
  },
  exposeGlobals: true
});
runtime.start();
