# Japan Price Tracker — V4.13.0 模組化原始碼

## GitHub 自動部署

本儲存庫保存完整模組化原始碼。網站網址：
https://sabananachen0726.github.io/japan-price-tracker/

修改 `src/` 後提交至 `main`，GitHub Actions 會自動安裝固定版本套件、執行 `npm run check`，並把產生的 `dist/` 部署到 GitHub Pages。測試或建置失敗時不會部署。

部署流程位於 `.github/workflows/deploy.yml`，進度可在儲存庫的 **Actions** 頁查看，亦可使用 **Run workflow** 手動重新部署。Pages 的發布來源需設為 **GitHub Actions**。

`dist/` 是自動建置結果，不需提交；請在 `src/` 修改模組。

## 日常使用

開啟線上網站，沿用原本的登入及資料。部署檔案已拆分：小型 `index.html`、`assets/` 中的獨立 JS／CSS、`planner.html`、`container.html`，以及 `data/planner-seed.json`。子頁面在需要時載入；資產檔名包含內容雜湊，避免更新後沿用舊的 JS／CSS 快取。

正常操作從主頁進入，讓子頁面沿用主頁的權限與資料同步。請勿只上傳 `index.html`：部署時必須包含整個 `dist/`。

本機預覽需透過 HTTP 伺服器提供整個 `dist/`（例如 `python -m http.server 8080 --directory dist`），再開啟 `http://localhost:8080/`；不支援直接雙擊 HTML 的 `file://` 模式。

## 原始碼位置

| 目錄 | 負責內容 |
| --- | --- |
| `src/core` | 模組啟動順序、狀態存取契約、視窗訊息訂閱 |
| `src/shell/modules` | Firebase／登入、資料同步、價格、PI、備份、主頁切換 |
| `src/shell/dom/modules` | 各項功能的按鈕及表單事件，於 DOM 就緒時啟動 |
| `src/shell/dom/domain` | 可獨立測試的日本商品主檔解析 |
| `src/planner/modules` | 訂貨計算、商品設定、各類匯入、銷售及工作單 |
| `src/planner/domain` | 不依賴畫面的月銷彙總、單位解析、背景檔案解析器 |
| `src/container/modules` | 貨櫃進度、待辦、表單、檢查清單 |
| 各應用的 `views` | 個別頁面的 HTML |
| 各應用的 `styles` | 樣式 |
| `src/planner/data` | 既有內建快照與圖片對照資料 |
| `tests` | 模組契約、業務規則、相容性與瀏覽器回歸測試 |

每個應用的 `bootstrap.js` 是入口。`architecture.json` 與各應用的 `dependencies.json` 是建置時產生的依賴清單。

## 建置

使用 Node.js 20 或更新版本，在此資料夾執行：

```bash
npm ci
npm run build
```

產出完整 `dist/`。三個 HTML 頁面分別引用獨立的 JS 和 CSS；主頁以相對網址載入訂貨及貨櫃子頁面，不再嵌入 Base64 子應用。內建快照也獨立為 JSON，於訂貨模組啟動前讀取。相對路徑支援 GitHub Pages 的 `/japan-price-tracker/` 子目錄。

固定版本的套件及 `package-lock.json` 已隨附。執行中的網頁仍使用原本的 Firebase、Bootstrap 與 SheetJS 載入方式。

## 修改模組

每個功能檔案包含三個介面：

- `definition`：`owns` 宣告本模組擁有的狀態／函式；`imports` 宣告讀取的依賴；`writes` 宣告允許變更的名稱。
- `register(context)`：只登錄函式，不操作畫面、不讀取 Firebase。
- `initialize(context)`：依 `bootstrap.js` 的順序建立狀態及綁定事件。

啟動時先完成所有函式登錄，再逐一初始化，保留既有函式提升及執行順序。讀取未宣告的依賴、重複宣告、初始化前讀取或覆寫常數，會明確報錯。

這次採用受控的共享 context 以保留既有欄位及流程；功能之間仍有明列的狀態依賴。訂貨與貨櫃子頁面的 HTML 事件處理器保留相容層。新增功能時，優先把純計算放入 `domain`，避免擴大共享狀態。

視窗訊息統一經 `src/core/events.js` 訂閱；原本的訊息來源、角色與模式檢查仍由對應功能處理。

銷售背景解析器必須可以單獨執行，因為它會序列化後放進 Worker。不要為建置開啟會注入外部命名輔助函式的 `keepNames` 選項。

## 測試

```bash
npm run check
npx playwright install chromium
npm run test:browser
npm run test:e2e
```

`check` 會建置並執行模組、計算與 HTML／CSS／內建資料相容性測試。

瀏覽器測試使用假的 Firebase 回應，實際操作完整網頁，不會寫入正式資料。預設包含小型 gzip 銷售資料，驗證背景解析、KAISI 排除、退貨扣回及商品範圍。

`test:e2e` 是完整功能稽核：登入／角色、頁面導覽、廠商、條碼關聯、商品 CRUD 與合成 Excel 匯入、報價與比價、LIVE／TEST 隔離、庫存與商品設定匯入、工作單與留言、貨櫃／待辦／歸檔、帳號管理及儲存失敗重試。逐案例結果與失敗原因自動寫入 `test-results/e2e-audit.md`／`.json`；GitHub Actions 會保留報告，測試失敗時阻擋部署。

可用 `JPT_REPORT_FILE` 指定 Markdown 輸出位置，或用 `JPT_E2E_FILTER`（案例編號正規表示式）重測特定案例。稽核使用合成資料，不涵蓋正式 Firebase Security Rules 或第三方真實帳號。

要另外驗證實際匯入檔，可設定以下環境變數再執行 `npm run test:browser`：

- `JPT_MASTER_FILE`：商品主檔 Excel 完整路徑。
- `JPT_HISTORY_FILE`：歷史 CSV／CSV.GZ 完整路徑。
- `JPT_CURRENT_FILE`：最新 XLSM／XLSX 完整路徑。
- `JPT_CHROME_PATH`：選填，已安裝 Chromium 的執行檔路徑。

大型原始銷售檔未放入此原始碼包。`tests/vendor` 只供離線重現前端測試，不是新增的正式網頁依賴。

## 相容性

這次重構保留既有 Firebase 專案、文件名稱、本機儲存鍵、PI 欄位、月銷算法與角色權限。畫面結構、樣式及內建資料以既有 V4.12.0 的指紋驗證。

完整備份的 `backupVersion` 維持 `4.12.0`，因為備份格式未變；應用版本則為 V4.13.0。請勿為了重構而重設資料或重新建立 Firebase 專案。

UI workflow update: the approved HTML/CSS snapshot hashes were refreshed for the shared-data status, submitted-proposal entry and single-scroll container editor. E2E UI-01 through UI-09 cover typing, local/shared deletion, permission denial, failed deletion, navigation and repeated scroll restoration.

Next UI update: note-only items are retained in submitted proposals and Excel; “只看已填寫” includes quantity or notes. Default product order is stable; adopting a suggestion does not rebuild the table. Container details use summaries, collapsible sections, a pinned host toolbar and inline save/retry feedback. Saving keeps the detail page open. UX-01 through UX-07 cover these flows.

2026-10-21 procurement update: four optional sales columns (six-month averages unchanged), a separate maxStock in sales units, nearest whole-box suggestions capped by that limit, MYOB-only unit conversion, projected sales-unit stock, import-overridable shelf locks, Admin unread inactive notifications, editable display names for old/new comments, and per-product PI search rows. Legacy safety values are not reused as limits.

Rapid tab navigation now switches panes immediately to avoid overlapping fade callbacks. Quantity edits update only the affected projected-stock cell.

## V4.17.0：共用採購單與查詢

- 訂貨規劃可勾選「顯示已提交數量」，在原本訂量框下方顯示與雲端最新成功提交箱數的差異；相同時隱藏，提交成功後更新基準。
- 未修改的工作單自動接收雲端更新。有本機修改且雲端版本變動時，保留草稿並暫停提交，先比較箱數、商品備註及工作設定。比較預設採用雲端；僅勾選的項目才帶入本機值。
- 提交使用 Firestore transaction 檢查原始版本，監聽尚未收到更新時仍可拒絕過期提交。獨立留言不造成箱數衝突；留言與其他工作單不被覆蓋。
- 本機恢復資料保留版本基準；缺少基準的舊草稿必須先比較。比較前草稿另留本機存檔，可下載 JSON 備份，不會自動上傳雲端。
- 部署後請所有同事重新整理網站，讓已開啟的舊程式一起更新。新版的提交檢查無法限制仍在執行舊版程式的寫入；本次沒有變更正式 Firebase Rules。
- 停用通知對話框可匯出全部通知為 Excel，包含品號、商品名稱、人員、Brisbane 時間及目前帳號的已讀狀態。
- PI 商品查詢停止輸入 350ms 後執行，Enter 立即查詢、清空立即重置；中文輸入組字期間不搜尋。商品配對索引在每次搜尋中共用，資料更新後重新建立，避免過期配對。

測試：`npm run check`、`npm run test:browser`、`npm run test:e2e`。新增 `order-version.test.mjs` 與 `order-sync.e2e.cjs`，以模擬 Firebase 驗證衝突、交易重試、逐項比較、草稿恢復、箱數差異、匯出與搜尋觸發。瀏覽器測試不寫入正式 Firebase。

## V4.18.0：PI 匯入與客訂分配

- Excel 貼上以完整儲存格解析（含引號、換行及空白列），清理品號／條碼前後空白並列出前後值。確認預覽後才匯入；任何異常列都阻擋整批，不略過後部分覆蓋。
- PI 商品查詢及批次查詢預設排除已實際到貨的貨櫃；勾選「包含已到貨紀錄」才列出歷史，ETA 已過不視為到貨。
- 各未到貨櫃顯示 PI 箱數、指定該櫃的客訂、剩餘可用量與店名箱數；未指定及其他貨櫃客訂另列，不重複扣除。未知單位不猜算，超額分配標紅。
- Admin 可至「資料匯入中心 → 待確認資料」排查既有 PI、匯出問題清單或返回該櫃／單位設定。排查不寫入；勾選識別欄位後須預覽及確認，修正交易拒絕過期 PI，不改箱數、價格、Final 或物流日期。已遺失或錯位的資料仍需原 Excel 核對。
- 內部採購建議不計入在途；可沿用下載保存 Version 0、整理交廠商後刪除的流程，沒有新增封存功能。匯入入口集中，查詢頁保留捷徑。

新增 `pi-workflow.test.mjs`、`pi-workflow.e2e.cjs` 驗證解析邊界、整批阻擋、預覽取消、歷史修正衝突、到貨篩選與權限。測試使用合成資料，不會排查或修改正式 PI。

## V4.18.1：通知批次操作與 PI 清理回饋

停用通知加入「全部已讀」（目前帳號）及「全部已處理／刪除通知」（所有同事共用）。刪除須確認，交易只移除按下時已有的通知及對應已讀標記；保留後來新增的通知、商品停用狀態、訂貨設定及工作單。失敗不清空通知，可原處重試。

歷史 PI 清理的進度、失敗原因及重試按鈕直接顯示在確認彈窗中；版本比較忽略 Firestore map 欄位順序，但仍拒絕真實數值或列順序變更。待確認資料只由資料匯入中心進入，移除 PI 查詢頁捷徑。

## V4.19.0：集中資料管理與手機版

「資料匯入中心 → 資料管理」依櫃號列出 PI、物流、報價及採購工作單，預設皆不勾選；選取後共用同一個刪除預覽。各頁必要捷徑及商品／報價的單筆與多筆刪除都沿用此流程。僅 Admin 可操作；確認前顯示範圍、箱數、關聯與保留資料，客訂只提醒、不刪除或搬移。只刪物流、保留 PI 時另提醒入倉判定來源可能改變。

正式刪除在 Firestore transaction 重新核對選取資料的內容，遇到更新拒絕整批；只寫選取欄位，其他貨櫃及文件中無關設定保留。失敗於同一彈窗顯示原因並可重試。刪除共享工作單後清除本瀏覽器該單草稿，避免立即重新提交舊數量；刪除當前物流紀錄後退出該櫃編輯。商品主檔刪除保留 PI 與報價並重建品號索引。

LIVE 不提供整份清空；TEST 本機清空集中於進階區，同時清空主頁與訂貨測試資料。範例載入也只允許 TEST。停用通知保持原有全部已讀／全部已處理，不新增單筆刪除。

900px 以下使用觸控導覽、表格卡片、清楚的資料標籤與可捲動彈窗；訂貨卡片優先顯示商品、月銷、在途、建議與訂量，其餘按「更多資料」展開。輸入節點及資料算法保持原流程，桌面寬度規則不變。測試包括取消、單類與多類刪除、關聯保留、交易衝突、失敗重試、TEST/LIVE 隔離、權限、手機輸入與桌面版回歸，均使用合成資料。

V4.20.0：關聯品號可同卡比價，各自保留歷史與採購操作；報價日期仍保留。訂貨列加強滑鼠與鍵盤聚光燈，新增尚可賣月數及品名銷售浮窗。規格回報送至資料匯入中心的待確認資料，由 Admin 核對及標記。重新匯入 CSV 與含 Items 的 XLSM 才會建立出清與最後出貨明細；原本的已保存月銷仍可讀取。

## V4.21.0：和風介面、上批出清改為依到倉批次、自動匯入與客找保護頁

- **統一樣式**：`src/shared/theme.css` 在三個頁面（主頁、訂貨、貨櫃）最後載入，統一色票（米白底、深藍主色、朱紅重點）、字體與元件外觀；各頁舊的藍灰色碼已對應到同一色票。表格貼齊畫面寬度，不再左右捲動；訂貨表在 1180px 以下自動改為卡片，按「更多資料」展開其餘欄位。
- **上批出清**（`src/planner/domain/product-indicators.js`）：以實際到倉（received）且含該品號的 PI 為批次界線，只計算「上一次到倉～最近一次到倉」之間的銷售；只有一次到倉紀錄時，看到倉前 6 個月。成交價 ≤ BaseSellingPrice × 70% 算出清，出清量達 30% 才標示。沒有到倉紀錄時不標示，浮窗說明原因。較早月份以月資料按天數估算，近 3～4 個月使用逐日資料。月銷扣除出清量的規則不變。
- **標籤**：「上批出清 N%」朱紅實心、「滯銷 N 週」山吹色實心、「客找保護」綠框，該列左側加色條；整列聚光燈改為深藍，避免和滯銷色混淆。
- **資料匯入中心**：新增「拖放檔案・自動辨識」（`src/shared/import-detect.js`、`src/shell/import-hub.js`），依檔名、工作表與標題列判斷類型，交給原有匯入器顯示預覽，確認後才寫入。也可貼上含標題列的表格自動辨識。分類簡化為「匯入檔案／貼上・手動輸入／整理」，移除編號。
- **客找商品保護**：移到「商品管理 → 客找保護」（`src/shell/protection-manager.js`、`src/shared/protection-batch.js`）。可一次貼上多個料號（整欄、逗號分隔，或料號⇥店家⇥確認日三欄），預覽每筆結果後於同一次交易儲存；儲存前重新讀取並核對，資料若被他人更新則整批不寫入。單次放行與保護規則不變。Firebase Rules 未修改。
- 其他：版本號統一為 V4.21.0；最新銷售按鈕改名「選擇最新銷售檔」；訂貨設定的月銷顯示到小數兩位；MYOB「清空全部庫存」移到右側並維持確認。

新增 `planner-indicators`、`protection-batch`、`import-detect` 單元測試；`compatibility.json` 已依新版畫面更新。

## V4.22.0：客訂 Final 加訂（唯讀）

- 客訂表狀態分類（`src/shared/customer-demand.js`）：`Final`＝客人預訂，加在本櫃訂量上提交；`已分配貨櫃`＝從本櫃訂量分給店家，不另外加；含「取消」不顯示；`已出貨`不顯示；其他（待處理、已訂待回覆、通知Sab、追Serena…）為處理中，只顯示筆數。
- 訂貨規劃客訂欄**唯讀**，依目前櫃號＋Item Code 帶入，櫃號比對只看英文字母與數字。明細預設收合。本櫃訂量下方顯示「合計提交＝本櫃＋Final」。已分配超過本櫃訂量時紅字提醒。
- 提交時，Final 箱數依店家存入工作單的 `customerFinal`，客訂來源存入 `customerSource`（live／cache／none）。客找保護期間只接受保護店家的 Final，`commitOrderDraft` 在交易內再檢查一次。只計「箱」，非箱單位另外列出。
- 建議量（`orderNeed`）不再扣除目前這一櫃的客訂。其他櫃與未分櫃的客訂照舊扣除；PI 查詢的可用量計算不變。
- 已提交採購建議、Excel（QTY＝合計，另附本櫃訂量／Final 客訂／Final 店家）與 Supplier CSV 都分列顯示。

## V4.23.0：分開存放報價與 PI（Storage v2）

`main_config` 已達 Firestore 單一文件 1 MiB 上限（928 KB）。報價移到 `app_data/quotes_v1`，PI 移到 `app_data/pi_containers_v1`；主文件只留商品、對照、廠商、客找保護等。三份一起讀（`src/shell/modules/data-modes.js`）、一起存（`src/shared/app-storage.js` 的 `addAppDataWrites`）。刪除與 PI 修正會寫到該欄位所在的文件。itemToBarcode 讀取時由商品主檔推算，只存推算不到的少數對照。
搬移由 Admin 在「資料匯入中心」上方按「升級儲存方式」執行，一次交易完成。上線順序與新規則見 `firebase/README.md`、`firebase/firestore.rules`。
