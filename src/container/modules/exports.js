// container: exports. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "exports",
  "owns": [],
  "imports": ["D", "dateInfo", "norm", "persist", "stage", "today"],
  "writes": ["D"]
};
export function register(context) {}
export function initialize(context) {
  window.excel = () => {
    let rows = context.D.containers.map(c => {
      const dt = context.dateInfo(c);
      return {
        Container: c.code,
        Supplier: c.supplier,
        Status: c.archived ? 'Archive' : context.stage(c),
        Type: c.type,
        Destination: c.destination,
        ExpectedMonth: c.expectedMonth,
        '到港日': dt.portDate,
        '拆櫃日': dt.unloadDate,
        '已拆櫃確認': dt.unloadConfirmed ? 'Yes' : 'No',
        Version: c.version,
        TotalJPY: c.total,
        DepositPaid: c.depositPaid ? 'Yes' : 'No',
        BalancePaid: c.balancePaid ? 'Yes' : 'No',
        FinalList: c.finalListReceived ? 'Yes' : 'No',
        Checklist: `${context.D.settings.checklist.filter(x => c.checks[x]).length}/${context.D.settings.checklist.length}`,
        Notes: c.notes
      };
    });
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Containers');
    XLSX.writeFile(wb, `Kaisi_Container_Tracker_${context.today()}.xlsx`);
  };
  window.backup = () => {
    let a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(context.D, null, 2)], {
      type: "application/json"
    }));
    a.download = `Kaisi_Container_Tracker_Backup_${context.today()}.json`;
    a.click();
  };
  window.restore = async f => {
    if (!f) return;
    try {
      let j = JSON.parse(await f.text());
      if (!j.containers || !j.settings) throw 0;
      if (confirm("Restore 會覆蓋目前 Container Tracker Firebase 資料。確定？")) {
        context.D = j;
        context.norm();
        context.persist();
        render();
      }
    } catch (e) {
      alert("JSON 格式不正確");
    }
  };
}
