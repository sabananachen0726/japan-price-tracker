// shell/dom: advanced-data-actions. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "advanced-data-actions",
  "owns": [],
  "imports": ["saveFirebaseData"],
  "writes": []
};
export function register(context) {}
export function initialize(context) {
  // 清空資料

  document.getElementById("btnClearData").onclick = function () {
    if (confirm("警告！確定要清空雲端資料庫的所有商品主檔、條碼綁定與報價紀錄？")) {
      window.appData = {
        suppliers: ["SilkRoad", "Tencho"],
        mappings: {},
        products: {},
        itemToBarcode: {},
        quotes: [],
        masterImportBatches: [],
        finalPiContainers: {}
      };
      context.saveFirebaseData();
      alert("資料已清空！");
    }
  };
  // 載入 Demo 範例資料

  document.getElementById("btnLoadDemo").onclick = function () {
    if (confirm("載入範例資料將覆蓋現有內容，確定繼續？")) {
      window.appData = {
        suppliers: ["SilkRoad", "Tencho"],
        mappings: {
          "4901330112813": ["4901330119999"]
        },
        products: {
          "4901330112813": {
            itemCode: "WHH005",
            name: "Calbee 蝦條 白鹽味 70g",
            imgUrl: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=300"
          },
          "4901330122222": {
            itemCode: "WHH006",
            name: "Calbee 堅果餅乾 80g",
            imgUrl: ""
          }
        },
        itemToBarcode: {
          "WHH005": "4901330112813",
          "WHH006": "4901330122222"
        },
        quotes: [{
          id: "q1",
          barcode: "4901330112813",
          itemCode: "WHH005",
          supplier: "SilkRoad",
          price: 128.5,
          container: "CTN-2024-001",
          note: "特價箱規",
          date: "2024-05-10"
        }, {
          id: "q2",
          barcode: "4901330119999",
          itemCode: "WHH005",
          supplier: "Tencho",
          price: 125.0,
          container: "CTN-2024-002",
          note: "新條碼樣品",
          date: "2024-05-12"
        }, {
          id: "q3",
          barcode: "4901330122222",
          itemCode: "WHH006",
          supplier: "SilkRoad",
          price: 0,
          container: "CTN-2024-002",
          note: "等待報價",
          date: "2024-05-12"
        }],
        masterImportBatches: [],
        finalPiContainers: {}
      };
      context.saveFirebaseData();
      alert("範例資料載入成功！");
    }
  };
}
