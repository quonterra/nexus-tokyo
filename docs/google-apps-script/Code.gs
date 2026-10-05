/**
 * NEXUS TOKYO 予約 → Googleスプレッドシート 自動追記スクリプト
 *
 * - 予約が入ると「{月}月イベント(自動)」シートに1行追加（イベントごとにまとめて並びます）
 * - キャンセルされるとその行を削除し、「予約キャンセル履歴」シートに記録します
 * - 手入力する列（参加チェック・どんな人か・イベントのゴール）は上書きしません
 */

const TOKEN = 'ここに合言葉を貼り付け'; // Vercelの SHEETS_WEBHOOK_TOKEN と同じ値にする

const COL = { CHECK: 2, EVENT: 3, NAME: 4, SOURCE: 5, GENDER: 6, AGE: 7, FEE: 8, LINE_ADDED: 9, REFERRER: 10, SNS: 11, WHO: 12, GOAL: 13, LINE_NAME: 14 };
const ID_COL = 18; // R列（非表示）: 予約ID
const SUMMARY_COL = 16; // P列: イベント名 / Q列: 人数
const HEADERS = ['参加', 'イベント名', '名前', '何経由', '性別', '年代', '参加費', '公式LINE\n追加', '紹介者', 'SNS', 'どんな人か', 'イベントのゴール', 'LINE表示名'];

function doGet() {
  return ContentService.createTextOutput('NEXUS TOKYO sheet webhook: ok');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return json_({ ok: false, error: 'unauthorized' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === 'upsert') {
      upsert_(ss, body.reservation);
    } else if (body.action === 'cancel') {
      cancel_(ss, body.reservation);
    } else if (body.action === 'bulk') {
      (body.reservations || []).forEach(function (r) { upsert_(ss, r); });
    } else {
      return json_({ ok: false, error: 'unknown action' });
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- シートの取得・初期化 ---------- */

function monthSheet_(ss, startsAtIso) {
  const month = Utilities.formatDate(new Date(startsAtIso), 'Asia/Tokyo', 'M');
  const name = month + '月イベント(自動)';
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    setupSheet_(sh, month);
  }
  return sh;
}

function setupSheet_(sh, month) {
  sh.getRange('C1').setValue(month + '月イベント参加者一覧').setFontWeight('bold');

  const header = sh.getRange(2, 2, 1, HEADERS.length);
  header.setValues([HEADERS]).setFontWeight('bold').setBackground('#E97135').setFontColor('#FFFFFF').setWrap(true).setVerticalAlignment('middle');

  sh.getRange(1, SUMMARY_COL).setValue('参加予定人数').setFontWeight('bold');
  sh.getRange(2, SUMMARY_COL, 1, 2).setValues([['イベント名', '人数']]).setFontWeight('bold').setBackground('#E97135').setFontColor('#FFFFFF');

  const widths = { 1: 20, 2: 50, 3: 190, 4: 120, 5: 110, 6: 60, 7: 70, 8: 70, 9: 70, 10: 90, 11: 180, 12: 180, 13: 150, 14: 130, 15: 20, 16: 190, 17: 60 };
  Object.keys(widths).forEach(function (c) { sh.setColumnWidth(Number(c), widths[c]); });
  sh.hideColumns(ID_COL);
  sh.setFrozenRows(2);

  sh.getRange(3, COL.GENDER, 998, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['女性', '男性'], true).setAllowInvalid(true).build());
  sh.getRange(3, COL.SOURCE, 998, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['つなげーと', 'トリノワLINE', '口コミ', 'Nexus20', 'スレッズ', 'Instagram', 'その他'], true).setAllowInvalid(true).build());
}

/* ---------- 予約の追加・更新 ---------- */

function upsert_(ss, r) {
  const sh = monthSheet_(ss, r.startsAt);
  let row = findRowById_(sh, r.id);
  const isUpdate = row > 0;
  if (!isUpdate) row = insertionRow_(sh, r.eventLabel);
  writeRow_(sh, row, r, isUpdate);
  updateSummary_(sh);
}

function lastDataRow_(sh) {
  const vals = sh.getRange(1, COL.EVENT, Math.max(sh.getMaxRows(), 3), 1).getValues();
  for (let i = vals.length - 1; i >= 2; i--) {
    if (vals[i][0] !== '') return i + 1;
  }
  return 2;
}

function findRowById_(sh, id) {
  const last = lastDataRow_(sh);
  if (last < 3) return 0;
  const ids = sh.getRange(3, ID_COL, last - 2, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 3;
  }
  return 0;
}

// 同じイベントの最後の行の直下に挿入。同じイベントが無ければ、1行あけて末尾に追加
function insertionRow_(sh, label) {
  const last = lastDataRow_(sh);
  if (last >= 3) {
    const labels = sh.getRange(3, COL.EVENT, last - 2, 1).getValues();
    let lastIdx = -1;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i][0] === label) lastIdx = i;
    }
    if (lastIdx >= 0) {
      const row = lastIdx + 3;
      sh.insertRowAfter(row);
      return row + 1;
    }
    return last + 2; // イベントの区切りに空白行を1行入れる
  }
  return 3;
}

function writeRow_(sh, row, r, isUpdate) {
  if (!isUpdate) {
    sh.getRange(row, COL.CHECK).insertCheckboxes();
    sh.getRange(row, COL.LINE_ADDED).insertCheckboxes();
    sh.getRange(row, COL.CHECK).setValue(false);
    sh.getRange(row, COL.WHO, 1, 2).setValues([['', '']]);
  }
  // イベント名〜SNS（手入力列の「参加」「どんな人か」「ゴール」は触らない）
  sh.getRange(row, COL.EVENT, 1, COL.SNS - COL.EVENT + 1).setValues([[
    r.eventLabel, r.attendeeName, r.source, r.gender, r.ageGroup, r.fee, !!r.officialLineAdded, r.referrer, r.sns
  ]]);
  sh.getRange(row, COL.FEE).setNumberFormat('#,##0');
  sh.getRange(row, COL.LINE_NAME).setValue(r.lineDisplayName);
  sh.getRange(row, ID_COL).setValue(r.id);
}

function updateSummary_(sh) {
  const last = lastDataRow_(sh);
  sh.getRange(3, SUMMARY_COL, Math.max(sh.getMaxRows() - 2, 1), 2).clear();
  if (last < 3) return;

  const labels = sh.getRange(3, COL.EVENT, last - 2, 1).getValues().map(function (v) { return v[0]; }).filter(String);
  const unique = labels.filter(function (v, i) { return labels.indexOf(v) === i; });

  unique.forEach(function (label, i) {
    const r = 3 + i;
    sh.getRange(r, SUMMARY_COL).setValue(label);
    sh.getRange(r, SUMMARY_COL + 1).setFormula('=COUNTIFS($C$3:$C,P' + r + ',$D$3:$D,"<>")');
  });
  const total = 3 + unique.length;
  sh.getRange(total, SUMMARY_COL).setValue('合計').setFontWeight('bold');
  sh.getRange(total, SUMMARY_COL + 1).setFormula('=SUM(Q3:Q' + (total - 1) + ')').setFontWeight('bold');
  sh.getRange(total + 1, SUMMARY_COL).setValue('参加費合計').setFontWeight('bold');
  sh.getRange(total + 1, SUMMARY_COL + 1).setFormula('=SUM($H$3:$H)').setNumberFormat('#,##0').setFontWeight('bold');
}

/* ---------- キャンセル ---------- */

function cancel_(ss, r) {
  const month = Utilities.formatDate(new Date(r.startsAt), 'Asia/Tokyo', 'M');
  const sh = ss.getSheetByName(month + '月イベント(自動)');
  if (sh) {
    const row = findRowById_(sh, r.id);
    if (row > 0) {
      sh.deleteRow(row);
      updateSummary_(sh);
    }
  }
  logCancel_(ss, r);
}

function logCancel_(ss, r) {
  let log = ss.getSheetByName('予約キャンセル履歴');
  if (!log) {
    log = ss.insertSheet('予約キャンセル履歴');
    log.getRange(1, 1, 1, 5).setValues([['キャンセル日時', 'イベント名', '名前', 'LINE表示名', '予約ID']])
      .setFontWeight('bold').setBackground('#E97135').setFontColor('#FFFFFF');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 150); log.setColumnWidth(2, 220); log.setColumnWidth(3, 130); log.setColumnWidth(4, 140);
  }
  log.appendRow([new Date(), r.eventLabel, r.attendeeName, r.lineDisplayName, r.id]);
  log.getRange(log.getLastRow(), 1).setNumberFormat('yyyy/MM/dd HH:mm');
}
