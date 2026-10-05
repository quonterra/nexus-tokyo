/**
 * NEXUS TOKYO 予約 → Googleスプレッドシート 自動追記スクリプト（v3）
 *
 * - 予約が入ると「{月}月イベント(自動)」シートに1行追加（イベントごとにまとまります）
 * - キャンセルされた予約は行を残したまま、灰色＋取り消し線にします（人数・参加費の集計からは除外）
 *   あわせて「予約キャンセル履歴」シートにも記録します
 * - 新しいイベントは日付順の位置に追加します（直近のイベントが上に来ます）
 * - 開催日を過ぎたイベントは、毎日1回「終了イベント」シートへ自動で移動します
 * - 手書きの入力は消しません
 *     ・予約システム由来の行は「空欄のセルだけ」を埋め、すでに入力されたセルは上書きしません
 *     ・手書きで追加した行には一切触りません
 */

const TOKEN = 'ここに合言葉を貼り付け'; // Vercelの SHEETS_WEBHOOK_TOKEN と同じ値にする

const COL = { CHECK: 2, EVENT: 3, NAME: 4, SOURCE: 5, GENDER: 6, AGE: 7, FEE: 8, LINE_ADDED: 9, REFERRER: 10, SNS: 11, WHO: 12, GOAL: 13, LINE_NAME: 14 };
const SUMMARY_COL = 16; // P列: イベント名 / Q列: 人数
const ID_COL = 18;      // R列（非表示）: 予約ID
const STATUS_COL = 19;  // S列（非表示）: 「キャンセル」と入る
const HEADERS = ['参加', 'イベント名', '名前', '何経由', '性別', '年代', '参加費', '公式LINE\n追加', '紹介者', 'SNS', 'どんな人か', 'イベントのゴール', 'LINE表示名'];
const CANCEL_LABEL = 'キャンセル';
const ARCHIVE_SHEET = '終了イベント';

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
    } else if (body.action === 'archive') {
      return json_({ ok: true, moved: archiveFinished_(ss) });
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

function monthSheetName_(startsAtIso) {
  return Utilities.formatDate(new Date(startsAtIso), 'Asia/Tokyo', 'M') + '月イベント(自動)';
}

function monthSheet_(ss, startsAtIso) {
  const name = monthSheetName_(startsAtIso);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    setupSheet_(sh, Utilities.formatDate(new Date(startsAtIso), 'Asia/Tokyo', 'M'));
  }
  sh.hideColumns(ID_COL, 2); // 既存シートにも適用（R:予約ID, S:状態）
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
  sh.setFrozenRows(2);

  sh.getRange(3, COL.GENDER, 998, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['女性', '男性'], true).setAllowInvalid(true).build());
  sh.getRange(3, COL.SOURCE, 998, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['つなげーと', 'トリノワLINE', '口コミ', 'Nexus20', 'スレッズ', 'Instagram', 'その他'], true).setAllowInvalid(true).build());
}

/* ---------- 予約の追加・更新 ---------- */

function upsert_(ss, r) {
  const sh = monthSheet_(ss, r.startsAt);
  const existing = findRowById_(sh, r.id);
  if (existing > 0) {
    fillBlanks_(sh, existing, r); // 既存行は空欄だけ埋める（手書きは消さない）
  } else {
    const row = insertionRow_(sh, r.eventLabel);
    writeNewRow_(sh, row, r);
  }
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

// 同じイベントの最後の行（手書き行を含む）の直下に挿入。無ければ、1行あけて末尾に追加
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
    // 新しいイベント：日付順になる位置に挿入する（直近のイベントが上に来る）
    const t = labelTime_(label);
    if (t !== null) {
      for (let i = 0; i < labels.length; i++) {
        const lt = labelTime_(labels[i][0]);
        if (lt !== null && lt > t) {
          const row = i + 3;
          sh.insertRowsBefore(row, 2); // 新イベントの1行目 + 区切りの空白行
          const sep = sh.getRange(row + 1, 1, 1, COL.LINE_NAME);
          sep.clearContent().clearDataValidations().setFontColor('#000000').setFontLine('none').setBackground(null);
          return row;
        }
      }
    }
    return last + 2;
  }
  return 3;
}

function writeNewRow_(sh, row, r) {
  // 直前の行（キャンセルで灰色の行など）の書式を引き継がないよう、書式をリセットする
  sh.getRange(row, COL.CHECK, 1, COL.LINE_NAME - COL.CHECK + 1)
    .setFontColor('#000000').setFontLine('none').setBackground(null);
  sh.getRange(row, STATUS_COL).setValue('');
  sh.getRange(row, COL.CHECK).insertCheckboxes().setValue(false);
  sh.getRange(row, COL.LINE_ADDED).insertCheckboxes();
  sh.getRange(row, COL.EVENT, 1, COL.SNS - COL.EVENT + 1).setValues([[
    r.eventLabel, r.attendeeName, r.source, r.gender, r.ageGroup, r.fee, !!r.officialLineAdded, r.referrer, r.sns
  ]]);
  sh.getRange(row, COL.FEE).setNumberFormat('#,##0');
  sh.getRange(row, COL.LINE_NAME).setValue(r.lineDisplayName);
  sh.getRange(row, ID_COL).setValue(r.id);
}

// 既存の行：空欄のセルだけを予約データで埋める。入力済みのセルは触らない
function fillBlanks_(sh, row, r) {
  const target = {};
  target[COL.EVENT] = r.eventLabel;
  target[COL.NAME] = r.attendeeName;
  target[COL.SOURCE] = r.source;
  target[COL.GENDER] = r.gender;
  target[COL.AGE] = r.ageGroup;
  target[COL.FEE] = r.fee;
  target[COL.REFERRER] = r.referrer;
  target[COL.SNS] = r.sns;
  target[COL.LINE_NAME] = r.lineDisplayName;

  Object.keys(target).forEach(function (c) {
    const cell = sh.getRange(row, Number(c));
    const value = target[c];
    const current = cell.getValue();
    const isBlank = current === '' || (Number(c) === COL.FEE && current === 0);
    if (isBlank && value !== '' && value !== null && value !== undefined && !(Number(c) === COL.FEE && value === 0)) {
      cell.setValue(value);
    }
  });
}

/* ---------- 集計欄 ---------- */

function updateSummary_(sh) {
  const last = lastDataRow_(sh);
  sh.getRange(3, SUMMARY_COL, Math.max(sh.getMaxRows() - 2, 1), 2).clear();
  if (last < 3) return;

  const labels = sh.getRange(3, COL.EVENT, last - 2, 1).getValues().map(function (v) { return v[0]; }).filter(String);
  const unique = labels.filter(function (v, i) { return labels.indexOf(v) === i; });

  unique.forEach(function (label, i) {
    const r = 3 + i;
    sh.getRange(r, SUMMARY_COL).setValue(label);
    // 名前が入っていて、キャンセルでない行を数える
    sh.getRange(r, SUMMARY_COL + 1).setFormula('=COUNTIFS($C$3:$C,P' + r + ',$D$3:$D,"<>",$S$3:$S,"<>' + CANCEL_LABEL + '")');
  });
  const total = 3 + unique.length;
  sh.getRange(total, SUMMARY_COL).setValue('合計').setFontWeight('bold');
  sh.getRange(total, SUMMARY_COL + 1).setFormula('=SUM(Q3:Q' + (total - 1) + ')').setFontWeight('bold');
  sh.getRange(total + 1, SUMMARY_COL).setValue('参加費合計').setFontWeight('bold');
  sh.getRange(total + 1, SUMMARY_COL + 1).setFormula('=SUMIFS($H$3:$H,$S$3:$S,"<>' + CANCEL_LABEL + '")').setNumberFormat('#,##0').setFontWeight('bold');
}

/* ---------- キャンセル ---------- */

function cancel_(ss, r) {
  let sh = ss.getSheetByName(monthSheetName_(r.startsAt));
  let row = sh ? findRowById_(sh, r.id) : 0;
  if (row === 0) {
    // すでに「終了イベント」へ移動済みの場合はそちらを探す
    const arch = ss.getSheetByName(ARCHIVE_SHEET);
    if (arch) {
      const found = findRowById_(arch, r.id);
      if (found > 0) { sh = arch; row = found; }
    }
  }
  if (sh && row > 0) {
    sh.hideColumns(ID_COL, 2);
    // 行は消さずに、灰色＋取り消し線にする（入力済みの内容・手書きのメモはそのまま残る）
    sh.getRange(row, STATUS_COL).setValue(CANCEL_LABEL);
    sh.getRange(row, COL.CHECK, 1, COL.LINE_NAME - COL.CHECK + 1)
      .setFontColor('#9CA3AF').setFontLine('line-through').setBackground('#F3F4F6');
    if (sh.getName() !== ARCHIVE_SHEET) updateSummary_(sh);
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

/* ---------- 日付・終了イベントの移動 ---------- */

function todayJst_() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
}

// 「10/7 イベント名」の先頭の日付を、日本時間の日付(UTC零時で表現)にして返す。読み取れなければ null
function labelTime_(label) {
  const m = String(label).match(/^\s*(\d{1,2})\/(\d{1,2})(?:\s|$)/);
  if (!m) return null;
  const mon = Number(m[1]), day = Number(m[2]);
  const today = todayJst_();
  const y0 = new Date(today).getUTCFullYear();
  let best = null, bestDiff = Infinity;
  for (let y = y0 - 1; y <= y0 + 1; y++) {
    const t = Date.UTC(y, mon - 1, day);
    const diff = Math.abs(t - today);
    if (diff < bestDiff) { best = t; bestDiff = diff; }
  }
  return best;
}

function archiveSheet_(ss) {
  let arch = ss.getSheetByName(ARCHIVE_SHEET);
  if (!arch) {
    arch = ss.insertSheet(ARCHIVE_SHEET);
    arch.getRange('C1').setValue('終了イベント一覧').setFontWeight('bold');
    arch.getRange(2, 2, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#6B7280').setFontColor('#FFFFFF').setWrap(true).setVerticalAlignment('middle');
    const widths = { 1: 20, 2: 50, 3: 190, 4: 120, 5: 110, 6: 60, 7: 70, 8: 70, 9: 70, 10: 90, 11: 180, 12: 180, 13: 150, 14: 130 };
    Object.keys(widths).forEach(function (c) { arch.setColumnWidth(Number(c), widths[c]); });
    arch.setFrozenRows(2);
  }
  arch.hideColumns(ID_COL, 2);
  return arch;
}

// 開催日が昨日以前のイベントの行を「終了イベント」シートへ移す。移した行数を返す
function archiveFinished_(ss) {
  const today = todayJst_();
  let movedTotal = 0;

  ss.getSheets().forEach(function (sh) {
    if (!/^\d{1,2}月イベント\(自動\)$/.test(sh.getName())) return;
    const last = lastDataRow_(sh);
    if (last < 3) return;

    const labels = sh.getRange(3, COL.EVENT, last - 2, 1).getValues().map(function (v) { return v[0]; });

    // 終了したイベントの行を、連続した範囲（run）にまとめる
    const runs = [];
    labels.forEach(function (label, i) {
      const t = labelTime_(label);
      if (t === null || t >= today) return;
      const row = i + 3;
      const prev = runs[runs.length - 1];
      if (prev && prev.label === label && prev.start + prev.n === row) prev.n++;
      else runs.push({ start: row, n: 1, label: label, t: t });
    });
    if (runs.length === 0) return;

    const arch = archiveSheet_(ss);
    const ordered = runs.slice().sort(function (a, b) { return a.t - b.t || a.start - b.start; });
    let prevLabel = null;
    ordered.forEach(function (run) {
      const lastArch = lastDataRow_(arch);
      let dest = lastArch + 1;
      if (lastArch >= 3 && run.label !== prevLabel) dest += 1; // イベントの区切りに空白行
      sh.getRange(run.start, COL.CHECK, run.n, COL.LINE_NAME - COL.CHECK + 1).copyTo(arch.getRange(dest, COL.CHECK));
      sh.getRange(run.start, ID_COL, run.n, 2).copyTo(arch.getRange(dest, ID_COL));
      prevLabel = run.label;
      movedTotal += run.n;
    });

    // 元のシートから削除（下の行から消す）
    runs.slice().sort(function (a, b) { return b.start - a.start; }).forEach(function (run) {
      sh.deleteRows(run.start, run.n);
    });

    tidyBlankRows_(sh);
    updateSummary_(sh);
  });
  return movedTotal;
}

// 先頭や連続する空白行を取り除く
function tidyBlankRows_(sh) {
  const last = lastDataRow_(sh);
  if (last < 3) return;
  const vals = sh.getRange(3, COL.EVENT, last - 2, COL.LINE_NAME - COL.EVENT + 1).getValues();
  const blank = vals.map(function (row) { return row.every(function (v) { return v === ''; }); });
  for (let i = blank.length - 1; i >= 0; i--) {
    if (blank[i] && (i === 0 || blank[i - 1])) sh.deleteRow(i + 3);
  }
}
