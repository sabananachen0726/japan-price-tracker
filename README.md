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
