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
