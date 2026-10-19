import { createWindowEvents } from "../core/events.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, getDocsFromServer, deleteDoc, deleteField, writeBatch, updateDoc, arrayUnion, arrayRemove, FieldPath } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
// Shared by master preview, product rows and import history.
import { createFeatureRuntime } from "../core/runtime.js";
import * as feature0 from "./modules/auth.js";
import * as feature1 from "./modules/app-state.js";
import * as feature2 from "./modules/utilities.js";
import * as feature3 from "./modules/logistics-dates.js";
import * as feature4 from "./modules/container-bridge.js";
import * as feature5 from "./modules/planner-bridge.js";
import * as feature6 from "./modules/frozen-header.js";
import * as feature7 from "./modules/frame-commands.js";
import * as feature8 from "./modules/work-orders.js";
import * as feature9 from "./modules/catalog-sync.js";
import * as feature10 from "./modules/customer-source.js";
import * as feature11 from "./modules/quote-data.js";
import * as feature12 from "./modules/data-modes.js";
import * as feature13 from "./modules/session.js";
import * as feature14 from "./modules/search-index.js";
import * as feature15 from "./modules/backups.js";
import * as feature16 from "./modules/exports.js";
import * as feature17 from "./modules/price-comparison.js";
import * as feature18 from "./modules/purchase-workbench.js";
import * as feature19 from "./modules/product-management.js";
import * as feature20 from "./modules/quote-container-management.js";
import * as feature21 from "./modules/pi-query.js";
import * as feature22 from "./modules/pi-batch-query.js";
import * as feature23 from "./modules/pi-import.js";
import * as feature24 from "./modules/pi-shelf-life.js";
import * as feature25 from "./modules/workspace.js";
import * as feature26 from "./modules/dom-bindings.js";
const features = [feature0, feature1, feature2, feature3, feature4, feature5, feature6, feature7, feature8, feature9, feature10, feature11, feature12, feature13, feature14, feature15, feature16, feature17, feature18, feature19, feature20, feature21, feature22, feature23, feature24, feature25, feature26];
const runtime = createFeatureRuntime(features, {
  imports: {
    events: createWindowEvents(window),
    initializeApp,
    getFirestore,
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    collection,
    getDocsFromServer,
    deleteDoc,
    deleteField,
    writeBatch,
    updateDoc,
    arrayUnion,
    arrayRemove,
    FieldPath,
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
  },
  exposeGlobals: false
});
runtime.start();
