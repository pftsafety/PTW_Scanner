// ============================================================
// Code.gs — HLL PTW System v5 | Pure API Backend
// Deploy → Execute as: Me | Access: Anyone
// ============================================================

const SHEETS = {
  PERMITS:       'Permits',
  USERS:         'Users',
  APPROVALS:     'Approvals',
  GAS_TESTS:     'GasTests',
  NOTIFICATIONS: 'Notifications'
};

const STATUS = {
  PENDING_WORKER_ACK:'Pending Worker Acknowledgement',
  PENDING_ACCEPTOR: 'Pending Acceptor',
  PENDING_SAFETY:   'Pending Safety',
  ACTIVE:           'Active',
  PENDING_DUTY:     'Pending Duty Officer',
  PENDING_CLOSURE:  'Pending Closure',
  CLOSED:           'Closed',
  CANCELLED:        'Cancelled'
};

// Users sheet columns (1-indexed):
// A:Email  B:Name  C:Role  D:Department  E:CardNo  F:Designation
// G:PasswordHash  H:MustChangePw  I:Status  J:RegisteredAt

// Permits sheet columns 1–29 + 30:ExtraJSON (includes confined space, excavation, comments)

// ── API Router ────────────────────────────────────────────────
// ============================================================
// Code.gs — HLL PTW System v5 | Pure API Backend
// ============================================================

function doPost(e) {
  try {
    const req     = JSON.parse(e.postData.contents);
    const action  = req.action  || '';
    const payload = req.payload || {};
    
    // ── 1. PUBLIC ACTIONS (Main Index Login/Signup) ───────────
    const PUBLIC = ['login', 'setPassword', 'signUp'];
    
    // ── 2. SCANNER ACTIONS (Completely Public Scanner App) ────
    const SCANNER = [
      'getPermitByNo', 'getInductionByCert', 'searchInduction', 'recordWorkerScan',
      'jobPerformerSign', 'recordWorkerAck', 'getWorkerScans', 'ackDailyWorker',
      'searchPermits', 'getActivePermitsForScanner'
    ];
    
    let userEmail = '';
    
    // ── 3. ROUTING & ROUTE SECURITY CHECK ─────────────────────
    if (PUBLIC.includes(action)) {
      // Login/Signup path: No token required
      userEmail = (payload.email || '').trim().toLowerCase();
    } else if (SCANNER.includes(action)) {
      // Scanner path: Use token if available, otherwise safely default to guest supervisor account
      userEmail = validateSession_(req.sessionToken) || 'scanner@guest';
    } else {
      // Dashboard path: Strict session check required
      userEmail = validateSession_(req.sessionToken);
      if (!userEmail) throw new Error('Session expired. Please sign in again.');
    }
    
    let result;
    switch (action) {
      case 'login':                result = login_(payload);                       break;
      case 'signUp':               result = signUp_(payload);                      break;
      case 'setPassword':          result = setPassword_(payload);                 break;
      case 'changePassword':       result = changePassword_(payload, userEmail);   break;
      case 'getAllUsers':          result = getAllUsers_();                        break;
      case 'getAdminUsers':        result = getAdminUsers_(userEmail);             break;
      case 'adminCreateUser':      result = adminCreateUser_(payload, userEmail);  break;
      case 'updateUser':           result = updateUser_(payload, userEmail);       break;
      case 'adminResetPw':         result = adminResetPw_(payload, userEmail);     break;
      case 'getNotifications':     result = getNotifications_(userEmail);          break;
      case 'markNotificationsRead':result = markRead_(payload, userEmail);         break;
      case 'sendBroadcast':        result = broadcast_(payload, userEmail);        break;
      case 'getDashboardStats':    result = getDashboardStats_();                  break;
      case 'getAllPermits':        result = getAllPermits_();                      break;
      case 'getMyPermits':         result = getMyPermits_(userEmail);              break;
      case 'getPermitByNo':              result = getPermitByNo_(payload.permitNo);       break;
      case 'searchPermits':              result = searchPermits_(payload.query);           break;
      case 'getActivePermitsForScanner': result = getActivePermitsForScanner_();          break;
      case 'createPermit':         result = createPermit_(payload, userEmail);     break;
      case 'approvePermit':        result = approvePermit_(payload, userEmail);    break;
      case 'rejectPermit':         result = rejectPermit_(payload, userEmail);     break;
      case 'cancelPermit':         result = cancelPermit_(payload, userEmail);     break;
      case 'jobPerformerSign':     result = jobPerformerSign_(payload, userEmail); break;
      case 'closePermit':          result = closePermit_(payload, userEmail);      break;
      case 'addGasTest':           result = addGasTest_(payload, userEmail);       break;
      case 'getGasTests':          result = getGasTests_(payload.permitNo);        break;
      case 'getApprovalLog':       result = getApprovalLog_(payload.permitNo);     break;
      case 'updatePermit':         result = updatePermit_(payload, userEmail);    break;
      case 'recordWorkerAck':      result = recordWorkerAck_(payload, userEmail);  break;
      case 'addPermitItems':       result = addPermitItems_(payload, userEmail);  break;
      case 'searchInduction':      result = searchInduction(payload);              break;
      case 'getInductionByCert':   result = getInductionByCert(payload);           break;
      case 'getActiveInductees':   result = getActiveInductees(payload);           break;
      case 'saveSignature':        result = saveSignature_(payload, userEmail);    break;
      case 'getSignatures':        result = getSignatures(payload);                break;
      case 'getSignatureImages':   result = getSignatureImages_(payload);          break;
      case 'recordWorkerScan':     result = recordWorkerScan(payload, userEmail);  break;
      case 'getWorkerScans':       result = getWorkerScans(payload);               break;
      case 'addDailyEntry':        result = addDailyEntry_(payload, userEmail);     break;
      case 'ackDailyWorker':       result = ackDailyWorker_(payload, userEmail);    break;
      case 'approveDailyEntry':    result = approveDailyEntry_(payload, userEmail); break;
      case 'getDailyEntries':      result = getDailyEntries_(payload);              break;
      case 'deleteDailyEntry':     result = deleteDailyEntry_(payload, userEmail);  break;
      case 'getPermitForSubApproval':      result = getPermitForSubApproval_(payload, userEmail);     break;
      case 'substituteAcceptorApprove':    result = substituteAcceptorApprove_(payload, userEmail);   break;
      default: throw new Error('Unknown action: ' + action);
    }
    
    // ── 4. RESPOND MATCHING FRONTEND CONTRACT ─────────────────
    return respond_({ ok: true, result: result });
    
  } catch (err) {
    console.error(err.message);
    return respond_({ ok: false, error: err.message });
  }
}

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'main';
  const sUrl = ScriptApp.getService().getUrl();

  // ── PWA Manifest ─────────────────────────────────────────────
  if (page === 'manifest') {
    const manifest = {
      name:             'HLL PTW Scanner',
      short_name:       'HLL Scanner',
      description:      'HLL Lifecare Ltd – Permit to Work Worker QR Scanner',
      start_url:        sUrl + '?page=scanner',
      scope:            sUrl + '?page=scanner',
      display:          'standalone',
      orientation:      'portrait',
      background_color: '#0f172a',
      theme_color:      '#0f172a',
      icons: [
        // Chrome requires minimum 192×192 for install prompt
        // 512×512 required for splash screen
        {
          src:   'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">' +
            '<rect width="192" height="192" rx="36" fill="#0f172a"/>' +
            '<text x="96" y="120" font-family="Arial,sans-serif" font-size="90" font-weight="bold" ' +
            'text-anchor="middle" fill="#3b82f6">H</text>' +
            '</svg>'
          ),
          sizes: '192x192',
          type:  'image/svg+xml',
          purpose: 'any maskable'
        },
        {
          src:   'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
            '<rect width="512" height="512" rx="80" fill="#0f172a"/>' +
            '<text x="256" y="330" font-family="Arial,sans-serif" font-size="260" font-weight="bold" ' +
            'text-anchor="middle" fill="#3b82f6">H</text>' +
            '</svg>'
          ),
          sizes: '512x512',
          type:  'image/svg+xml',
          purpose: 'any maskable'
        }
      ]
    };
    return ContentService
      .createTextOutput(JSON.stringify(manifest))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Standalone scanner page ──────────────────────────────────
  if (page === 'scanner') {
    const template = HtmlService.createTemplateFromFile('Scanner');
    template.scriptUrl = sUrl;
    template.permitNo  = (e.parameter.permitNo  || '').toString().trim();
    template.entryId   = (e.parameter.entryId   || '').toString().trim();
    return template.evaluate()
      .setTitle('HLL PTW — Scanner')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
  }

  // ── Main app ─────────────────────────────────────────────────
  const template = HtmlService.createTemplateFromFile('Index');
  template.scriptUrl = sUrl;
  return template.evaluate()
    .setTitle('HLL PTW System – Peroorkada')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/2x/apps_script_48dp.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Helper: include another .html file (e.g. CSS/JS partials) inside Index.html
// Usage inside html: <?!= include('Styles') ?>
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sessions ──────────────────────────────────────────────────
function createSession_(email) {
  const token = Utilities.getUuid().replace(/-/g,'');
  const exp   = Date.now() + 8*60*60*1000;
  PropertiesService.getScriptProperties()
    .setProperty('sess_'+token, JSON.stringify({ email, exp }));
  return token;
}

function validateSession_(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('sess_'+token);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (Date.now() > s.exp) { PropertiesService.getScriptProperties().deleteProperty('sess_'+token); return null; }
    return s.email;
  } catch(e) { return null; }
}

// ── Password hashing ──────────────────────────────────────────
// Format name with designation and role in brackets
function nameWithDesig_(user) {
  if (!user) return '—';
  const parts = [];
  if (user.designation) parts.push(user.designation);
  if (user.role && user.role !== user.designation) parts.push(user.role);
  if (user.department) parts.push(user.department);
  return user.name + (parts.length ? ' (' + parts.join(', ') + ')' : '');
}

function hashPw_(pw) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw, Utilities.Charset.UTF_8)
    .map(b => ('0'+(b&0xff).toString(16)).slice(-2)).join('');
}

// Roles are stored as comma-separated string e.g. "Originator,Acceptor"
function hasRole_(roleStr, role) {
  if (!roleStr) return false;
  return roleStr.split(',').map(r=>r.trim()).includes(role);
}
function primaryRole_(roleStr) {
  if (!roleStr) return 'Originator';
  return roleStr.split(',')[0].trim();
}
function rolesArray_(roleStr) {
  if (!roleStr) return ['Originator'];
  return roleStr.split(',').map(r=>r.trim()).filter(Boolean);
}

// ── Auth ──────────────────────────────────────────────────────
function login_(p) {
  const email = (p.email||'').trim().toLowerCase();
  const pw    = (p.password||'').trim();
  if (!email) throw new Error('Email is required.');
  if (!pw)    throw new Error('Password is required.');
  const data = getSheet_(SHEETS.USERS).getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').trim().toLowerCase() !== email) continue;
    if ((data[i][8]||'Active').toString() === 'Inactive') throw new Error('Account deactivated. Contact admin.');
    const hash = (data[i][6]||'').toString().trim();
    if (!hash) return { firstLogin:true, email:data[i][0], name:data[i][1] };
    if (hashPw_(pw) !== hash) throw new Error('Incorrect password.');
    const roleStr=(data[i][2]||'Originator').toString();
    const user = { email:data[i][0], name:data[i][1],
      role: primaryRole_(roleStr), roles: rolesArray_(roleStr),
      department:data[i][3], cardNo:data[i][4]||'', designation:data[i][5]||'',
      mustChange: data[i][7]===true||String(data[i][7]).toUpperCase()==='TRUE' };
    return { user, token: createSession_(user.email) };
  }
  throw new Error('Email not registered. Please sign up or contact admin.');
}

// NEW ACCOUNTS → role = 'Originator' (can also act as Acceptor — checked by permit logic)
function signUp_(p) {
  const email  = (p.email||'').trim().toLowerCase();
  const name   = (p.name||'').trim();
  const dept   = (p.department||'').trim();
  const cardNo = (p.cardNo||'').trim();
  const desig  = (p.designation||'').trim();
  const pw     = (p.password||'').trim();
  const pw2    = (p.confirm||'').trim();
  if (!email)  throw new Error('Email is required.');
  if (!name)   throw new Error('Full name is required.');
  if (!desig)  throw new Error('Designation is required.');
  if (!dept)   throw new Error('Department / Section is required.');
  if (!cardNo) throw new Error('Card No. is required.');
  if (!pw)     throw new Error('Password is required.');
  if (pw!==pw2)      throw new Error('Passwords do not match.');
  if (pw.length < 6) throw new Error('Password must be at least 6 characters.');
  const sheet = getSheet_(SHEETS.USERS);
  const data  = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').trim().toLowerCase()===email)
      throw new Error('An account with this email already exists. Please sign in.');
  }
  // Default role = Originator; can also serve as Acceptor in permits (see getAllUsers_)
  sheet.appendRow([email, name, 'Originator', dept, cardNo, desig, hashPw_(pw), false, 'Active', new Date()]);
  const user = { email, name, role:'Originator', department:dept, cardNo, designation:desig };
  return { user, token: createSession_(email) };
}

function setPassword_(p) {
  const email = (p.email||'').trim().toLowerCase();
  const pw    = (p.password||'').trim();
  const pw2   = (p.confirm||'').trim();
  if (!email) throw new Error('Email required.');
  if (!pw)    throw new Error('Password required.');
  if (pw!==pw2)      throw new Error('Passwords do not match.');
  if (pw.length < 6) throw new Error('Minimum 6 characters.');
  const sheet = getSheet_(SHEETS.USERS), data = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').trim().toLowerCase()!==email) continue;
    if ((data[i][6]||'').toString().trim()) throw new Error('Password already set. Use Change Password.');
    sheet.getRange(i+1,7).setValue(hashPw_(pw));
    sheet.getRange(i+1,8).setValue(false);
    const user={email:data[i][0],name:data[i][1],role:data[i][2],department:data[i][3],cardNo:data[i][4]||'',designation:data[i][5]||''};
    return { user, token: createSession_(user.email) };
  }
  throw new Error('Email not found.');
}

function changePassword_(p, userEmail) {
  const oldPw = (p.oldPassword||'').trim();
  const newPw = (p.newPassword||'').trim();
  const conf  = (p.confirm||'').trim();
  if (!oldPw) throw new Error('Current password required.');
  if (!newPw) throw new Error('New password required.');
  if (newPw!==conf)      throw new Error('Passwords do not match.');
  if (newPw.length < 6)  throw new Error('Minimum 6 characters.');
  const sheet = getSheet_(SHEETS.USERS), data = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').toLowerCase()!==userEmail.toLowerCase()) continue;
    if (hashPw_(oldPw)!==(data[i][6]||'').toString()) throw new Error('Current password incorrect.');
    sheet.getRange(i+1,7).setValue(hashPw_(newPw));
    sheet.getRange(i+1,8).setValue(false);
    return { ok:true };
  }
  throw new Error('User not found.');
}

// ── User management ───────────────────────────────────────────
function getAdminUsers_(userEmail) {
  const me=getUser_(userEmail);
  if (!me.roles.includes('Admin')) throw new Error('Admin access required.');
  return getSheet_(SHEETS.USERS).getDataRange().getValues().slice(1).map((r,i)=>({
    rowNum:i+2, email:(r[0]||'').toString(), name:(r[1]||'').toString(),
    role: primaryRole_((r[2]||'Originator').toString()),
    roles: rolesArray_((r[2]||'Originator').toString()),
    department:(r[3]||'').toString(), cardNo:(r[4]!==undefined&&r[4]!==null?r[4]:'').toString(),
    designation:(r[5]||'').toString(),
    hasPassword:!!(r[6]||'').toString().trim(),
    status:(r[8]||'Active').toString(), registeredAt:r[9]?r[9].toString():''
  }));
}


function adminCreateUser_(payload, userEmail) {
  const me = getUser_(userEmail);
  if (!me.roles.includes('Admin')) throw new Error('Admin access required.');
  const { name, email, roles, designation, department, cardNo, password } = payload;
  if (!name||!name.trim())   throw new Error('Name is required.');
  if (!email||!email.trim()) throw new Error('Email is required.');
  const cleanEmail = email.trim().toLowerCase();
  const sheet = getSheet_(SHEETS.USERS);
  const data  = sheet.getDataRange().getValues();
  // Check if already exists
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').toLowerCase()===cleanEmail) throw new Error('User with this email already exists.');
  }
  const rolesStr = Array.isArray(roles) ? roles.join(',') : (roles||'Originator');
  const pwHash   = password ? hashPw_(password) : '';
  const mustChange = !password;
  sheet.appendRow([
    cleanEmail, name.trim(), rolesStr,
    department||'', cardNo||'', designation||'',
    pwHash, mustChange, 'Active', new Date()
  ]);
  return { ok:true };
}

function updateUser_(p, userEmail) {
  const me=getUser_(userEmail);
  if (!me.roles.includes('Admin')) throw new Error('Admin access required.');
  const target=(p.email||'').trim().toLowerCase();
  const sheet=getSheet_(SHEETS.USERS), data=sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').toLowerCase()!==target) continue;
    const row=i+1;
    // Accept either roles array or single role string
    if (p.roles !== undefined) {
      const rolesStr = Array.isArray(p.roles) ? p.roles.join(',') : p.roles;
      sheet.getRange(row,3).setValue(rolesStr);
    } else if (p.role !== undefined) {
      sheet.getRange(row,3).setValue(p.role);
    }
    if (p.department  !==undefined) sheet.getRange(row,4).setValue(p.department);
    if (p.cardNo      !==undefined) sheet.getRange(row,5).setValue(p.cardNo);
    if (p.designation !==undefined) sheet.getRange(row,6).setValue(p.designation);
    if (p.status      !==undefined) sheet.getRange(row,9).setValue(p.status);
    return { ok:true };
  }
  throw new Error('User not found.');
}

function adminResetPw_(p, userEmail) {
  if (getUser_(userEmail).role!=='Admin') throw new Error('Admin access required.');
  const target=(p.email||'').trim().toLowerCase();
  const pw=(p.newPassword||'').trim();
  if (!pw||pw.length<6) throw new Error('Password must be at least 6 characters.');
  const sheet=getSheet_(SHEETS.USERS), data=sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').toLowerCase()!==target) continue;
    sheet.getRange(i+1,7).setValue(hashPw_(pw));
    sheet.getRange(i+1,8).setValue(false);
    return { ok:true };
  }
  throw new Error('User not found.');
}

// ── Notifications ─────────────────────────────────────────────
function pushNotif_(toEmail, permitNo, stage, message) {
  if (!toEmail) return;
  try { getSheet_(SHEETS.NOTIFICATIONS).appendRow([Utilities.getUuid(), toEmail, permitNo||'', stage||'', message||'', false, new Date()]); }
  catch(e) { console.error('Notif err:'+e.message); }
}

function getNotifications_(userEmail) {
  const s=getSheet_(SHEETS.NOTIFICATIONS);
  if (!s||s.getLastRow()<=1) return { items:[], unread:0 };
  const items = s.getDataRange().getValues()
    .filter((r,i)=>i>0&&(r[1]||'').toLowerCase()===userEmail.toLowerCase())
    .reverse().slice(0,60)
    .map(r=>({ id:r[0], permitNo:r[2], stage:r[3], message:r[4],
               isRead:r[5]===true||String(r[5]).toUpperCase()==='TRUE', createdAt:r[6]?r[6].toString():'' }));
  return { items, unread:items.filter(n=>!n.isRead).length };
}

function markRead_(p, userEmail) {
  const s=getSheet_(SHEETS.NOTIFICATIONS);
  if (!s||s.getLastRow()<=1) return { ok:true };
  const data=s.getDataRange().getValues(), ids=p.ids||[], all=p.all===true;
  for (let i=1;i<data.length;i++) {
    if ((data[i][1]||'').toLowerCase()!==userEmail.toLowerCase()) continue;
    if (all||ids.includes(data[i][0])) s.getRange(i+1,6).setValue(true);
  }
  return { ok:true };
}

function broadcast_(p, userEmail) {
  if (getUser_(userEmail).role!=='Admin') throw new Error('Admin access required.');
  const msg=(p.message||'').trim(), target=p.role||'all';
  if (!msg) throw new Error('Message is required.');
  let count=0;
  const data=getSheet_(SHEETS.USERS).getDataRange().getValues().slice(1);
  for (const u of data) {
    if ((u[8]||'Active')!=='Active') continue;
    if (target!=='all'&&u[2]!==target) continue;
    pushNotif_(u[0],'','broadcast','📢 '+msg);
    count++;
  }
  return { sent:count };
}

// ── Setup ─────────────────────────────────────────────────────
function onOpen() {
  // Hard safety check: If there is no active UI context, exit immediately 
  // before Google throws an interface compilation exception.
  try {
    var ui = SpreadsheetApp.getUi();
    if (!ui) return; 
    
    ui.createMenu('⚙️ PTW System')
      .addItem('🔧 Initial Setup (Run Once)', 'setupSpreadsheet')
      .addSeparator()
      .addItem('📧 Test Email','testEmail_')
      .addToUi();
  } catch (uiError) {
    // Fail silently when accessed via external GitHub Pages API fetch
    Logger.log('UI skipped cleanly during API execution loop.');
  }
}

function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  makeSheet_(ss, SHEETS.PERMITS, [
    'Permit No','Type','Status','Job Description','Work Area',
    'Originator Name','Originator Email','Originator Dept',
    'Acceptor Name','Acceptor Email','Safety Name','Safety Email',
    'Contractor Details','Hazards (JSON)','PPE Controls (JSON)',
    'Supporting Permits (JSON)','Valid From','Valid To',
    'Originator Sign Time','Remarks','Acceptor Sign Time',
    'Safety Sign Time','Job Start Time','Job Stop Time',
    'Confined Space No','Excavation No','Isolation No',
    'Created At','Updated At','Extra Fields (JSON)'
  ], '#0f172a');
  const uSheet = makeSheet_(ss, SHEETS.USERS,
    ['Email','Name','Role','Department','Card No','Designation','Password Hash','Must Change Password','Status','Registered At'],
    '#0f172a');
  if (uSheet.getLastRow()===1)
    uSheet.appendRow(['admin@hll.com','System Admin','Admin','IT','A001','Administrator','',false,'Active',new Date()]);
  uSheet.hideColumns(7);
  makeSheet_(ss, SHEETS.APPROVALS, ['Permit No','Role','Name','Email','Action','Comments','Timestamp'], '#0f172a');
  makeSheet_(ss, SHEETS.GAS_TESTS, ['Permit No','Day','O2 Level (%)','HC Level (%)','Toxic Level (PPM)','Tested By','Timestamp'], '#0f172a');
  makeSheet_(ss, SHEETS.NOTIFICATIONS, ['ID','To Email','Permit No','Stage','Message','Is Read','Created At'], '#0f172a');
  makeSheet_(ss, 'Signatures', [
    'Permit No','Role','Signer Name','Signer Email','Signature Data (base64)','Timestamp','Action','Comments'
  ], '#0f172a');
  makeSheet_(ss, 'WorkerScans', [
    'Permit No','Cert No','Worker Name','Contractor','Scan Type','Timestamp','Scanned By'
  ], '#0f172a');

  Logger.log('✅ PTW Setup complete! Admin: admin@hll.com');
  // Run complete — check Execution log for confirmation
}

function makeSheet_(ss, name, headers, color) {
  let s=ss.getSheetByName(name);
  if (!s) s=ss.insertSheet(name);
  if (s.getLastRow()===0) s.appendRow(headers);
  s.getRange(1,1,1,headers.length).setBackground(color||'#0f172a').setFontColor('#fff').setFontWeight('bold').setFontSize(11);
  s.setFrozenRows(1);
  return s;
}


// ── Induction Database ─────────────────────────────────────────
// CONFIGURE: Set INDUCTION_SS_ID to the Spreadsheet ID of your induction form response sheet
// (The ID is the long string in the Google Sheets URL: /spreadsheets/d/SPREADSHEET_ID/edit)
const INDUCTION_SS_ID = '19GgWZ22eepYRWR3WgSLAMY7GwBHQyHvirw6LZEF746o';
// Sheet name in that spreadsheet (default Google Form sheet name)
const INDUCTION_SHEET_NAME = 'Form_Responses';  // Actual tab name from your sheet
// Col: 1=Timestamp, 2=Name, 3=Contractor Firm, 5=Email, 9=CertNo, 10=Expiry, 11=Status

function getInductionRecords_(search) {
  try {
    let sheet;
    if (INDUCTION_SS_ID && INDUCTION_SS_ID !== 'YOUR_INDUCTION_SPREADSHEET_ID_HERE') {
      const ss = SpreadsheetApp.openById(INDUCTION_SS_ID);
      // Try configured name first, then common variations
      sheet = ss.getSheetByName(INDUCTION_SHEET_NAME)
           || ss.getSheetByName('Form Responses 1')
           || ss.getSheetByName('Form_Responses')
           || ss.getSheetByName('Form Responses')
           || ss.getSheets()[0];  // fallback: first sheet
    } else {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INDUCTION_SHEET_NAME)
           || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    }
    if (!sheet) { console.error('Induction sheet not found'); return []; }
    if (sheet.getLastRow() <= 1) { console.log('Induction sheet empty'); return []; }
    console.log('Reading induction from sheet: '+sheet.getName()+' rows: '+sheet.getLastRow());
    const data = sheet.getDataRange().getValues();
    const now  = new Date();
    const results = [];
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const name       = (r[1]  || '').toString().trim();
      const contractor = (r[2]  || '').toString().trim();
      const email      = (r[3]  || '').toString().trim();  // Col D = Email Address
      const mobile     = (r[4]  || '').toString().trim();  // Col E = Mobile
      const certNo     = (r[8]  || '').toString().trim();  // Col I = System_Cert_No
      const status     = (r[10] || '').toString().trim();
      if (!name && !certNo) continue;

      // Parse expiry — column J (r[9]) can be a Date object OR a string like "19/07/2026"
      let expiryDate = null, valid = false, expiryDisplay = '—';
      const rawVal = r[9];
      if (rawVal) {
        if (rawVal instanceof Date) {
          // Google Sheets returned a proper Date object — use it directly
          expiryDate = rawVal;
        } else {
          const s = rawVal.toString().trim();
          if (s) {
            // Try dd/MM/yyyy
            const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (ddmm) {
              expiryDate = new Date(parseInt(ddmm[3]), parseInt(ddmm[2])-1, parseInt(ddmm[1]));
            } else {
              // Fallback: let JS parse whatever string it is
              expiryDate = new Date(s);
            }
          }
        }
        if (expiryDate && !isNaN(expiryDate.getTime())) {
          // Set to end-of-day so today counts as valid
          expiryDate.setHours(23, 59, 59, 0);
          valid = expiryDate > now;
          // Format as DD/MMM/YYYY for display
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          expiryDisplay = String(expiryDate.getDate()).padStart(2,'0')+'/'+months[expiryDate.getMonth()]+'/'+expiryDate.getFullYear();
        }
      }

      // Filter by search term
      const q = (search||'').toLowerCase();
      if (q && !name.toLowerCase().includes(q) && !certNo.toLowerCase().includes(q)
          && !contractor.toLowerCase().includes(q)
          && !(mobile||'').includes(q) && !email.toLowerCase().includes(q)) continue;
      results.push({ name, contractor, email, certNo, expiry: expiryDisplay, valid, rowNum: i+1 });
    }
    return results;
  } catch(e) {
    console.error('Induction read error: '+e.message);
    return [];
  }
}

function searchInduction(payload) {
  try {
    const results = getInductionRecords_(payload.search || '');
    return results;
  } catch(e) {
    throw new Error('Induction search failed: '+e.message);
  }
}

function getInductionByCert(payload) {
  const records = getInductionRecords_('');
  const cert = (payload.certNo || '').trim().toLowerCase();
  
  // Compares lowercase against lowercase to remove case issues entirely
  return records.find(r => (r.certNo || '').toString().trim().toLowerCase() === cert) || null;
}

function getActiveInductees(payload) {
  // Returns all valid (non-expired) induction records for worker selection
  return getInductionRecords_(payload.search || '').filter(r => r.valid);
}

// ── Signatures ─────────────────────────────────────────────────
// Signatures sheet: PermitNo | Role | SignerName | SignerEmail | SignatureData | Timestamp | Action | Comments

function saveSignature_(payload, userEmail) {
  const user = getUser_(userEmail);
  const sheet = getSheet_('Signatures');
  if (!sheet) throw new Error('Signatures sheet not found. Please re-run Setup.');
  sheet.appendRow([
    payload.permitNo,
    payload.role,
    user.name,
    user.email,
    payload.signatureData || '',
    new Date(),
    payload.action || 'Signed',
    payload.comments || ''
  ]);
  return { ok: true };
}

function saveSignature(payload, userEmail) {
  return saveSignature_(payload, userEmail);
}

function getSignatures(payload) {
  const sheet = getSheet_('Signatures');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getDataRange().getValues()
    .filter((r, i) => i > 0 && r[0] === payload.permitNo)
    .map(r => ({
      permitNo: r[0], role: r[1], name: r[2], email: r[3],
      hasSignature: !!(r[4] && r[4].length > 10),
      time: r[5] ? r[5].toString() : '',
      action: r[6], comments: r[7]
    }));
}

// Full signature data — includes base64 PNG for display/print
function getSignatureImages_(payload) {
  const sheet = getSheet_('Signatures');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getDataRange().getValues()
    .filter((r, i) => i > 0 && r[0] === payload.permitNo)
    .map(r => ({
      permitNo:      r[0],
      role:          r[1],
      name:          r[2],
      email:         r[3],
      signatureData: (r[4] && r[4].length > 10) ? r[4].toString() : '',
      hasSignature:  !!(r[4] && r[4].length > 10),
      time:          r[5] ? r[5].toString() : '',
      action:        r[6],
      comments:      r[7] || ''
    }));
}

// ── Worker QR scan entry ────────────────────────────────────────
function recordWorkerScan(payload, userEmail) {
  // Record that a worker's QR was scanned for a specific permit
  const sheet = getSheet_('WorkerScans');
  if (!sheet) throw new Error('WorkerScans sheet not found. Please re-run Setup.');
  sheet.appendRow([
    payload.permitNo,
    payload.certNo,
    payload.workerName,
    payload.contractor,
    payload.scanType || 'Entry',  // Entry | Start | Stop
    new Date(),
    userEmail
  ]);
  return { ok: true };
}

function getWorkerScans(payload) {
  const sheet = getSheet_('WorkerScans');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getDataRange().getValues()
    .filter((r, i) => i > 0 && r[0] === payload.permitNo)
    .map(r => ({ permitNo:r[0], certNo:r[1], workerName:r[2], contractor:r[3], scanType:r[4], time:r[5]?r[5].toString():'', scannedBy:r[6] }));
}

function testEmail_() {
  const me=Session.getActiveUser().getEmail();
  sendEmail_(me,'[PTW TEST] Email OK','<p>HLL PTW email working correctly.</p>');
  Logger.log('Test email sent to '+me);
}

// ── Helpers ───────────────────────────────────────────────────
function getSheet_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function tp_(s,d) { try { return typeof s==='string'?JSON.parse(s):(s||d); } catch(e) { return d; } }
function genNo_() {
  const n=Math.max(getSheet_(SHEETS.PERMITS).getLastRow(),1);
  return 'PTW-'+new Date().getFullYear()+'-'+String(n).padStart(4,'0');
}
function getUser_(email) {
  const data=getSheet_(SHEETS.USERS).getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||'').toLowerCase()===email.toLowerCase()) {
      const roleStr=(data[i][2]||'Originator').toString();
      return {
        email:data[i][0], name:data[i][1],
        role: primaryRole_(roleStr),   // primary role for display/logging
        roles: rolesArray_(roleStr),   // all roles for permission checks
        roleStr,
        department:data[i][3], cardNo:data[i][4]||'', designation:data[i][5]||''
      };
    }
  }
  throw new Error('User not found: '+email);
}

// All active users returned — new Originator accounts appear in both Originator & Acceptor dropdowns
function getAllUsers_() {
  return getSheet_(SHEETS.USERS).getDataRange().getValues().slice(1)
    .filter(r=>(r[8]||'Active')==='Active')
    .map(r=>({ email:r[0], name:r[1], role:r[2], department:r[3], designation:r[5]||'' }));
}

// ── Permit CRUD ───────────────────────────────────────────────
function createPermit_(fd, userEmail) {
  const user = getUser_(userEmail);
  const now = new Date(), no = genNo_();
  const validTo = new Date(fd.validFrom); validTo.setDate(validTo.getDate()+7);
  
  const extras = {
    durationDays: fd.durationDays||'1', durationFrom: fd.durationFrom||'', durationTo: fd.durationTo||'',
    contractorEmergency: fd.contractorEmergency||'',
    competentPartyRequired: fd.competentPartyRequired||'No', competentPartyCert: fd.competentPartyCert||'',
    medicalCertRequired: fd.medicalCertRequired||'NA', medicalCertDetails: fd.medicalCertDetails||'',
    otherContractors: fd.otherContractors||'', engineeringEquipment: fd.engineeringEquipment||'',
    safetyHarnessNo: fd.safetyHarnessNo||'', additionalPrecautions: fd.additionalPrecautions||'',
    tbt: fd.tbt||{}, workersOnSite: fd.workersOnSite||[], workEntries: fd.workEntries||[],
    confinedSpace: fd.confinedSpace||null,
    excavation: fd.excavation||null,
    approvalComments: []
  };

  // ── FIX: Changed 3rd parameter from STATUS.PENDING_ACCEPTOR to STATUS.PENDING_WORKER_ACK ──
  getSheet_(SHEETS.PERMITS).appendRow([
    no, fd.type, STATUS.PENDING_WORKER_ACK, fd.jobDescription, fd.workArea,
    user.name, user.email, fd.originatorDept||user.department,
    fd.acceptorName, fd.acceptorEmail, fd.safetyName, fd.safetyEmail,
    fd.contractorDetails||'', JSON.stringify(fd.hazards||[]), JSON.stringify(fd.ppeControls||[]),
    JSON.stringify(fd.supporting||{}), new Date(fd.validFrom), validTo,
    now,'','','','','','','','', now,now, JSON.stringify(extras)
  ]);
  
  log_(no, 'Originator', user, 'Created & Signed — Awaiting Worker QR Signatures', fd.originatorComments||'');
  
  if (fd.originatorSignature && fd.originatorSignature.length > 10) {
    try {
      const sigSheet = getSheet_('Signatures');
      if (sigSheet) sigSheet.appendRow([no,'Originator',user.name,user.email,fd.originatorSignature,new Date(),'Signed','Created']);
    } catch(e){ console.error('Sig save:',e); }
  }
  
  // ── FIX: Notify the originator/performers that worker scanning is now active ──
  notify_(no, user.email, user.name, 'pending_worker_ack', user.name, fd.jobDescription, fd.workArea, null, user);
  
  return { permitNo: no };
}

function getAllPermits_() {
  const s=getSheet_(SHEETS.PERMITS);
  if (s.getLastRow()<=1) return [];
  return s.getRange(2,1,s.getLastRow()-1,30).getValues().map((r,i)=>r2o_(r,i+2));
}
function getMyPermits_(email) {
  // Safety Dept and Duty Officer see all permits
  const user = getUser_(email);
  if (user.roles && (user.roles.includes('Admin')||user.roles.includes('Safety Officer')||user.roles.includes('Safety Dept')||user.roles.includes('Duty Officer'))) return getAllPermits_();
  return getAllPermits_().filter(p=>p.originatorEmail===email||p.acceptorEmail===email||p.safetyEmail===email);
}
function getPermitByNo_(no) {
  if (!no) return null;
  const target = no.toString().trim().toUpperCase();
  const sheet  = getSheet_(SHEETS.PERMITS);
  if (!sheet) throw new Error('Permits sheet not found — please run Setup first.');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const cell = (data[i][0] || '').toString().trim().toUpperCase();
    if (cell === target) return r2o_(data[i], i + 1);
  }
  return null;
}

// Search permits by partial number — used by scanner for fuzzy lookup & diagnostics
function searchPermits_(query) {
  const sheet = getSheet_(SHEETS.PERMITS);
  if (!sheet) throw new Error('Permits sheet not found — please run Setup first.');
  const data = sheet.getDataRange().getValues();
  const q    = (query || '').toString().trim().toUpperCase();
  const hits = [];
  for (let i = 1; i < data.length; i++) {
    const cell = (data[i][0] || '').toString().trim();
    if (!cell) continue;
    if (!q || cell.toUpperCase().includes(q)) {
      hits.push({
        permitNo: cell,
        status:   (data[i][2] || '').toString(),
        type:     (data[i][1] || '').toString(),
        jobDesc:  (data[i][3] || '').toString()
      });
    }
    if (hits.length >= 10) break; // cap at 10
  }
  return { hits, total: data.length - 1, sheetName: sheet.getName() };
}

// Return all permits currently actionable via the scanner
function getActivePermitsForScanner_() {
  const sheet = getSheet_(SHEETS.PERMITS);
  if (!sheet) throw new Error('Permits sheet not found — please run Setup first.');
  const data  = sheet.getDataRange().getValues();
  const valid = [
    STATUS.ACTIVE,
    STATUS.PENDING_WORKER_ACK,   // Pending Worker Acknowledgement
    STATUS.PENDING_ACCEPTOR,     // Pending Acceptor
    'Pending Duty Officer'
  ];
  return data.slice(1)
    .filter(r => r[0] && valid.includes((r[2]||'').toString().trim()))
    .map(r => ({
      permitNo:       (r[0]||'').toString().trim(),
      type:           (r[1]||'').toString(),
      status:         (r[2]||'').toString().trim(),
      jobDescription: (r[3]||'').toString(),
      workArea:       (r[4]||'').toString(),
      originatorName: (r[5]||'').toString()
    }));
}
function getDashboardStats_() {
  const all=getAllPermits_(), now=new Date();
  return {
    total:all.length,
    active:all.filter(p=>p.status===STATUS.ACTIVE).length,
    pending:all.filter(p=>[STATUS.PENDING_ACCEPTOR,STATUS.PENDING_SAFETY].includes(p.status)).length,
    pendingClosure:all.filter(p=>p.status===STATUS.PENDING_CLOSURE).length,
    closed:all.filter(p=>p.status===STATUS.CLOSED).length,
    cancelled:all.filter(p=>p.status===STATUS.CANCELLED).length,
    expiringSoon:all.filter(p=>{
      if(p.status!==STATUS.ACTIVE) return false;
      const d=(new Date(p.validTo)-now)/86400000; return d>=0&&d<=2;
    }).length,
    recent:all.slice(-20).reverse()
  };
}

// Approve — comments saved to Approvals sheet AND appended to extras.approvalComments
function approvePermit_(p, userEmail) {
  const user=getUser_(userEmail), sheet=getSheet_(SHEETS.PERMITS);
  const data=sheet.getDataRange().getValues(), now=new Date();
  const { permitNo, role, comments } = p;
  // ── Duty Officer routing is now AUTOMATIC ──────────────────
  // If Safety Officer approves after 17:15, the permit is
  // automatically routed to Duty Officer — no manual flag needed.
  const _h = now.getHours(), _m = now.getMinutes();
  const requireDutyOfficer = (_h > 17) || (_h === 17 && _m > 15);
  // ──────────────────────────────────────────────────────────
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==permitNo) continue;
    const row=i+1;
    const extras=tp_((data[i][29]||''),{});

    if (role==='Acceptor'&&data[i][2]===STATUS.PENDING_ACCEPTOR) {
      // Hard guard: every worker in the permit MUST have scanned their QR
      const allWorkers = (extras.workEntries||[]).flatMap(e=>e.workers||[]);
      if (allWorkers.length > 0) {
        const unacked = allWorkers.filter(w => !w.acked);
        if (unacked.length > 0) {
          throw new Error(
            'Cannot approve: ' + unacked.length + ' worker(s) have not yet signed via QR scan — ' +
            unacked.map(w => w.name || w.certNo || '?').join(', ') +
            '. All listed workers must acknowledge the permit by scanning their induction QR code before Acceptor approval.'
          );
        }
      }
      sheet.getRange(row,21).setValue(now);
      sheet.getRange(row,3).setValue(STATUS.PENDING_SAFETY);
      sheet.getRange(row,29).setValue(now);
      _appendComment_(sheet,row,data[i],user,'Acceptor Approved',comments);
      log_(permitNo,'Acceptor',user,'Approved',comments||'');
      notify_(permitNo,data[i][11],data[i][10],'pending_safety',user.name,data[i][3],data[i][4],null,user);
      return { newStatus:STATUS.PENDING_SAFETY };
    }
    if (role==='Safety Officer'&&data[i][2]===STATUS.PENDING_SAFETY) {
      // Check if outside standard hours → route to Duty Officer
      if (requireDutyOfficer) {
        sheet.getRange(row,22).setValue(now);
        sheet.getRange(row,3).setValue('Pending Duty Officer');
        sheet.getRange(row,29).setValue(now);
        extras.dutyOfficerRequired=true;
        sheet.getRange(row,30).setValue(JSON.stringify(extras));
        _appendComment_(sheet,row,data[i],user,'Safety Approved – Pending Duty Officer',comments);
        log_(permitNo,'Safety Officer',user,'Approved – Routed to Duty Officer',comments||'');
        notify_(permitNo,data[i][6],data[i][5],'pending_duty',user.name,data[i][3],data[i][4],null,user);
        return { newStatus:'Pending Duty Officer' };
      }
      sheet.getRange(row,22).setValue(now);
      sheet.getRange(row,3).setValue(STATUS.ACTIVE);
      sheet.getRange(row,29).setValue(now);
      // ── 7-day validity window starts at activation ───────────
      const _expAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      extras.activatedAt = now.toISOString();
      extras.expiresAt   = _expAt.toISOString();
      if (!Array.isArray(extras.dailyEntries)) extras.dailyEntries = [];
      sheet.getRange(row,30).setValue(JSON.stringify(extras));
      // ─────────────────────────────────────────────────────────
      _appendComment_(sheet,row,data[i],user,'Safety Approved',comments);
      log_(permitNo,'Safety Officer',user,'Approved – Permit Active (7-day validity until '+_expAt.toDateString()+')',comments||'');
      notify_(permitNo,data[i][6],data[i][5],'active',user.name,data[i][3],data[i][4],null,user);
      return { newStatus:STATUS.ACTIVE, activatedAt:extras.activatedAt, expiresAt:extras.expiresAt };
    }
    if (role==='Duty Officer'&&data[i][2]==='Pending Duty Officer') {
      extras.dutyOfficerSignTime=now.toISOString();
      extras.dutyOfficerName=user.name;
      // ── 7-day validity window starts at Duty Officer activation ─
      const _expDuty = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      extras.activatedAt = now.toISOString();
      extras.expiresAt   = _expDuty.toISOString();
      if (!Array.isArray(extras.dailyEntries)) extras.dailyEntries = [];
      // ────────────────────────────────────────────────────────────
      sheet.getRange(row,30).setValue(JSON.stringify(extras));
      sheet.getRange(row,3).setValue(STATUS.ACTIVE);
      sheet.getRange(row,29).setValue(now);
      _appendComment_(sheet,row,data[i],user,'Duty Officer Approved',comments);
      log_(permitNo,'Duty Officer',user,'Approved – Permit Active',comments||'');
      notify_(permitNo,data[i][6],data[i][5],'active',user.name,data[i][3],data[i][4],null,user);
      return { newStatus:STATUS.ACTIVE };
    }
    throw new Error('Cannot approve at this stage. Current status: '+data[i][2]);
  }
  throw new Error('Permit not found.');
}

// Reject — comments saved
function rejectPermit_(p, userEmail) {
  const user=getUser_(userEmail), sheet=getSheet_(SHEETS.PERMITS);
  const data=sheet.getDataRange().getValues(), now=new Date();
  const { permitNo, role, comments } = p;
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==permitNo) continue;
    const reason = comments||'No reason provided';
    sheet.getRange(i+1,3).setValue(STATUS.CANCELLED);
    sheet.getRange(i+1,20).setValue('REJECTED by '+role+': '+reason);
    sheet.getRange(i+1,29).setValue(now);
    _appendComment_(sheet,i+1,data[i],user,'Rejected',reason);
    log_(permitNo,role,user,'Rejected',reason);
    notify_(permitNo,data[i][6],data[i][5],'rejected',user.name,data[i][3],data[i][4],reason,user);
    return { ok:true };
  }
  throw new Error('Permit not found.');
}

// Cancel — comments saved

function cancelPermit_(payload, userEmail) {
  const user  = getUser_(userEmail);
  const sheet = getSheet_(SHEETS.PERMITS);
  const data  = sheet.getDataRange().getValues();
  const { permitNo, reason } = payload;
  if (!reason || !reason.trim()) throw new Error('Cancellation reason is required.');
  const canCancel = user.roles.includes('Admin') || user.roles.includes('Safety Officer') || user.roles.includes('Acceptor');
  if (!canCancel) throw new Error('Only Safety Officer or Permit Acceptor can cancel a permit.');
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==permitNo) continue;
    if (['Closed','Cancelled'].includes(data[i][2])) throw new Error('Permit is already '+data[i][2]+'.');
    sheet.getRange(i+1,3).setValue('Cancelled');
    sheet.getRange(i+1,29).setValue(new Date());
    log_(permitNo,user.role,user,'Cancelled',reason);
    // Notify originator
    const origEmail = data[i][6]||'';
    const origName  = data[i][5]||'';
    notify_(permitNo, origEmail, origName, 'cancelled', nameWithDesig_(user), data[i][3], data[i][4], reason, user);
    return { ok:true };
  }
  throw new Error('Permit not found.');
}

function cancelPermit_(p, userEmail) {
  const user=getUser_(userEmail), sheet=getSheet_(SHEETS.PERMITS);
  const data=sheet.getDataRange().getValues(), now=new Date();
  const { permitNo, comments } = p;
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==permitNo) continue;
    const reason=comments||'No reason provided';
    sheet.getRange(i+1,3).setValue(STATUS.CANCELLED);
    sheet.getRange(i+1,20).setValue('CANCELLED by '+user.name+': '+reason);
    sheet.getRange(i+1,29).setValue(now);
    _appendComment_(sheet,i+1,data[i],user,'Cancelled',reason);
    log_(permitNo,user.role,user,'Cancelled',reason);
    return { ok:true };
  }
  throw new Error('Permit not found.');
}

function jobPerformerSign_(p, userEmail) {
  const user=getUser_(userEmail), sheet=getSheet_(SHEETS.PERMITS);
  const data=sheet.getDataRange().getValues(), now=new Date();
  const { permitNo, action } = p;
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==permitNo) continue;
    const row=i+1;
    if (action==='start') {
      sheet.getRange(row,23).setValue(now);
      log_(permitNo,'Job Performer',user,'Job Started','');
    } else {
      sheet.getRange(row,24).setValue(now);
      sheet.getRange(row,3).setValue(STATUS.PENDING_CLOSURE);
      log_(permitNo,'Job Performer',user,'Job Stopped – Awaiting Closure','');
      notify_(permitNo,data[i][6],data[i][5],'pending_closure',user.name,data[i][3],data[i][4],null,user);
    }
    sheet.getRange(row,29).setValue(now);
    return { ok:true };
  }
  throw new Error('Permit not found.');
}

function closePermit_(p, userEmail) {
  const user=getUser_(userEmail), sheet=getSheet_(SHEETS.PERMITS);
  const data=sheet.getDataRange().getValues(), now=new Date();
  const { permitNo, comments } = p;
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==permitNo) continue;
    sheet.getRange(i+1,3).setValue(STATUS.CLOSED);
    sheet.getRange(i+1,20).setValue(comments||'');
    sheet.getRange(i+1,29).setValue(now);
    _appendComment_(sheet,i+1,data[i],user,'Permit Closed',comments||'');
    log_(permitNo,user.role,user,'Permit Closed',comments||'');
    notify_(permitNo,data[i][9],data[i][8],'closed',user.name,data[i][3],data[i][4],null,user);
    return { ok:true };
  }
  throw new Error('Permit not found.');
}

// Helper: append comment to extras.approvalComments JSON and save back to col 30
function _appendComment_(sheet, row, rowData, user, action, comments) {
  if (!comments && action!=='Acceptor Approved' && action!=='Safety Approved') return;
  try {
    const extras = tp_(rowData[29],{});
    if (!Array.isArray(extras.approvalComments)) extras.approvalComments=[];
    extras.approvalComments.push({
      action, by:user.name, role:user.role,
      comments:comments||'', time:new Date().toISOString()
    });
    sheet.getRange(row,30).setValue(JSON.stringify(extras));
  } catch(e) { console.error('Comment save err:'+e.message); }
}

function addGasTest_(p, userEmail) {
  const user=getUser_(userEmail);
  getSheet_(SHEETS.GAS_TESTS).appendRow([p.permitNo, p.day, p.o2, p.hc, p.toxic, user.name, new Date()]);
  return { ok:true };
}
function getGasTests_(no) {
  const s=getSheet_(SHEETS.GAS_TESTS);
  if (s.getLastRow()<=1) return [];
  return s.getDataRange().getValues().filter((r,i)=>i>0&&r[0]===no)
    .map(r=>({ day:r[1],o2:r[2],hc:r[3],toxic:r[4],by:r[5],time:r[6]?r[6].toString():'' }));
}


function updatePermit_(fd, userEmail) {
  const user  = getUser_(userEmail);
  const sheet = getSheet_(SHEETS.PERMITS);
  const data  = sheet.getDataRange().getValues();
  const no    = fd.permitNo;
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==no) continue;
    if (data[i][2]!==STATUS.PENDING_ACCEPTOR) throw new Error('Permit can only be edited when Pending Acceptor.');
    if (data[i][6].toLowerCase()!==userEmail.toLowerCase() && user.role!=='Admin')
      throw new Error('Only the originator can edit this permit.');
    const now=new Date(), row=i+1;
    sheet.getRange(row,4).setValue(fd.jobDescription||data[i][3]);
    sheet.getRange(row,5).setValue(fd.workArea||data[i][4]);
    sheet.getRange(row,14).setValue(JSON.stringify(fd.hazards||[]));
    sheet.getRange(row,15).setValue(JSON.stringify(fd.ppeControls||[]));
    // Update extras
    const extras=tp_((data[i][29]||''),{});
    if (fd.durationDays)   extras.durationDays   = fd.durationDays;
    if (fd.durationFrom)   extras.durationFrom   = fd.durationFrom;
    if (fd.durationTo)     extras.durationTo     = fd.durationTo;
    if (fd.tbt)            extras.tbt            = fd.tbt;
    if (fd.workEntries)    extras.workEntries     = fd.workEntries;
    if (fd.contractorDetails) sheet.getRange(row,13).setValue(fd.contractorDetails);
    sheet.getRange(row,29).setValue(now);
    sheet.getRange(row,30).setValue(JSON.stringify(extras));
    log_(no,user.role,user,'Permit Edited','');
    return { permitNo:no };
  }
  throw new Error('Permit not found.');
}


function recordWorkerAck_(payload, userEmail) {
  // Mandatory QR acknowledgement — worker must be listed in the permit.
  // Marks the individual worker record in workEntries as acked so the
  // Section 07 display can show per-worker signing status.
  const sheet  = getSheet_(SHEETS.PERMITS);
  const wSheet = getSheet_('WorkerScans');
  const data   = sheet.getDataRange().getValues();
  const { permitNo, certNo, workerName, contractor } = payload;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== permitNo) continue;
    if (data[i][2] !== STATUS.PENDING_WORKER_ACK)
      throw new Error('Permit is not in "Pending Worker Acknowledgement" stage. Current status: ' + data[i][2]);

    const extras  = tp_((data[i][29] || ''), {});
    const entries = extras.workEntries || [];

    // ── Find this worker in the permit's workEntries by certNo or idNo ──
    let matchedWorker = null;
    for (const entry of entries) {
      const w = (entry.workers || []).find(w =>
        (w.certNo && w.certNo.toString().trim() === certNo.toString().trim()) ||
        (w.idNo   && w.idNo.toString().trim()   === certNo.toString().trim())
      );
      if (w) { matchedWorker = w; break; }
    }

    if (!matchedWorker)
      throw new Error(
        'Certificate ' + certNo + ' does not match any worker listed in this permit. ' +
        'Only workers added by the Originator can sign. Please contact the Permit Originator.'
      );

    if (matchedWorker.acked)
      return {
        ok: true, alreadyAcked: true,
        ackedCount: entries.flatMap(e => e.workers||[]).filter(w => w.acked).length,
        totalWorkers: entries.flatMap(e => e.workers||[]).length
      };

    // ── Mark this specific worker as acknowledged ──────────────────────
    matchedWorker.acked    = true;
    matchedWorker.ackTime  = new Date().toISOString();
    matchedWorker.ackName  = workerName || matchedWorker.name;

    // ── Recount from workEntries flags (source of truth) ──────────────
    const allWorkers   = entries.flatMap(e => e.workers || []);
    const ackedCount   = allWorkers.filter(w => w.acked).length;
    const totalWorkers = allWorkers.length;
    extras.workerAckCount = ackedCount;
    extras.workerAckTotal = totalWorkers;
    sheet.getRange(i + 1, 30).setValue(JSON.stringify(extras));

    // ── Log scan in WorkerScans sheet ──────────────────────────────────
    if (wSheet) wSheet.appendRow([
      permitNo, certNo, workerName || matchedWorker.name,
      contractor || matchedWorker.contractor || '',
      'Acknowledgement', new Date(), userEmail || 'scanner@guest'
    ]);

    // ── If all workers acked → advance to Pending Acceptor ────────────
    if (totalWorkers > 0 && ackedCount >= totalWorkers) {
      sheet.getRange(i + 1, 3).setValue(STATUS.PENDING_ACCEPTOR);
      sheet.getRange(i + 1, 29).setValue(new Date());
      const fromName = data[i][5] || 'Originator';
      log_(permitNo, 'System', { name:'System', email:'', role:'System' },
           'All ' + totalWorkers + ' workers acknowledged — advanced to Pending Acceptor', '');
      notify_(permitNo, data[i][9], data[i][8], 'pending_acceptor', fromName, data[i][3], data[i][4]);
      return { ok: true, advanced: true, status: STATUS.PENDING_ACCEPTOR, ackedCount, totalWorkers };
    }

    return { ok: true, advanced: false, ackedCount, totalWorkers };
  }
  throw new Error('Permit not found: ' + permitNo);
}

function addPermitItems_(payload, userEmail) {
  const user  = getUser_(userEmail);
  const sheet = getSheet_(SHEETS.PERMITS);
  const data  = sheet.getDataRange().getValues();
  const { permitNo, type, items } = payload;
  if (!items || !items.length) throw new Error('No items provided.');
  // Only Acceptor and Safety Officer (and Admin) are permitted to add items
  const canAdd = user.roles.includes('Admin') ||
                 user.roles.includes('Acceptor') ||
                 user.roles.includes('Safety Officer');
  if (!canAdd) throw new Error('Only Acceptor or Safety Officer can add items to a permit.');
  for (let i=1;i<data.length;i++) {
    if (data[i][0]!==permitNo) continue;
    const extras = tp_(data[i][29],{});
    const key = type==='hazards' ? 'addedHazards' : 'addedPPE';
    if (!Array.isArray(extras[key])) extras[key]=[];
    const now=new Date().toISOString();
    for (const item of items) {
      if (!extras[key].find(x=>x.item===item)) {
        extras[key].push({ item, addedBy:user.name, role:user.role, addedAt:now });
      }
    }
    sheet.getRange(i+1,30).setValue(JSON.stringify(extras));
    sheet.getRange(i+1,29).setValue(new Date());
    log_(permitNo,user.role,user,'Added '+items.length+' item(s) to §'+type,'');
    return { ok:true, added:items.length };
  }
  throw new Error('Permit not found.');
}

function getApprovalLog_(no) {
  const s=getSheet_(SHEETS.APPROVALS);
  if (s.getLastRow()<=1) return [];
  return s.getDataRange().getValues().filter((r,i)=>i>0&&r[0]===no)
    .map(r=>({ role:r[1],name:r[2],email:r[3],action:r[4],comments:r[5],time:r[6]?r[6].toString():'' }));
}

function r2o_(r, rowNum) {
  return {
    rowNum, permitNo:r[0], type:r[1], status:r[2], jobDescription:r[3], workArea:r[4],
    originatorName:r[5], originatorEmail:r[6], originatorDept:r[7],
    extras: tp_((r[29]||''),{}),
    acceptorName:r[8], acceptorEmail:r[9], safetyName:r[10], safetyEmail:r[11],
    contractorDetails:r[12],
    hazards:tp_(r[13],[]), ppeControls:tp_(r[14],[]), supporting:tp_(r[15],{}),
    validFrom:r[16]?r[16].toString():'', validTo:r[17]?r[17].toString():'',
    originatorSignTime:r[18]?r[18].toString():'', remarks:r[19],
    acceptorSignTime:r[20]?r[20].toString():'', safetySignTime:r[21]?r[21].toString():'',
    jobStartTime:r[22]?r[22].toString():'', jobStopTime:r[23]?r[23].toString():'',
    confinedSpaceNo:r[24], excavationNo:r[25], isolationNo:r[26],
    createdAt:r[27]?r[27].toString():'', updatedAt:r[28]?r[28].toString():'',
    extras:tp_(r[29],{})
  };
}

function log_(no, role, user, action, comments) {
  getSheet_(SHEETS.APPROVALS).appendRow([no, role, nameWithDesig_(user), user.email, action, comments, new Date()]);
}

// ── Email + Notification ──────────────────────────────────────
function notify_(no, toEmail, toName, stage, fromName, jobDesc, area, extra, fromUser) {
  if (!toEmail) return;
  const displayFrom = fromUser ? nameWithDesig_(fromUser) : (fromName||'—');
  const map = {
    pending_acceptor:{label:'Action Required — Permit Acceptor',badge:'#f59e0b',msg:`${displayFrom} submitted permit ${no} for your sign-off as Permit Acceptor.`},
    pending_safety:  {label:'Action Required — Safety In-Charge',badge:'#f59e0b',msg:`Permit ${no} needs Safety Department sign-off.`},
    active:          {label:'Permit Now ACTIVE ✅',badge:'#10b981',msg:`Permit ${no} is fully authorised. Work may now commence safely.`},
    pending_duty:    {label:'Action Required — Duty Officer',badge:'#8b5cf6',msg:`Permit ${no} needs Duty Officer sign-off for after-hours work.`},
    cancelled: {label:'Permit Cancelled',badge:'#ef4444',msg:`Permit ${no} has been CANCELLED. Reason: ${extra||'No reason given'}.`},
    pending_closure: {label:'Closure Required',badge:'#6366f1',msg:`Job Performer marked work complete on ${no}. Please close the permit.`},
    rejected:        {label:'Permit Rejected',badge:'#ef4444',msg:`Permit ${no} was rejected. Reason: ${extra||'Not specified'}`},
    closed:          {label:'Permit Closed',badge:'#94a3b8',msg:`Permit ${no} has been closed.`}
  };
  const s=map[stage]; if (!s) return;
  pushNotif_(toEmail, no, stage, s.msg);
  const subj = {
    pending_acceptor:`[PTW] ${no} – Approval Required`,
    pending_safety:`[PTW] ${no} – Safety Approval Required`,
    active:`[PTW] ${no} – Now ACTIVE ✅`,
    pending_duty:`[PTW] ${no} – Duty Officer Approval Required`,
    cancelled:`[PTW] ${no} – PERMIT CANCELLED`,
    pending_closure:`[PTW] ${no} – Closure Required`,
    rejected:`[PTW] ${no} – Rejected`,
    closed:`[PTW] ${no} – Closed`
  };
  const html=`<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
<div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:20px 26px;border-radius:10px 10px 0 0">
<h2 style="margin:0;color:#fff;font-size:17px">HLL Lifecare Limited</h2>
<p style="margin:3px 0 0;color:#93c5fd;font-size:12px">Peroorkada Factory – Permit to Work System</p></div>
<div style="border:1px solid #e2e8f0;border-top:none;padding:24px;background:#fff;border-radius:0 0 10px 10px">
<p>Dear <strong>${toName||toEmail}</strong>,</p>
<div style="background:#f8fafc;border-left:4px solid ${s.badge};padding:12px 16px;margin:14px 0;border-radius:0 6px 6px 0"><strong>${s.label}</strong></div>
<p>${s.msg}</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;border-radius:8px;overflow:hidden">
<tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;width:36%">Permit No</td><td style="padding:9px 13px;border:1px solid #e2e8f0"><strong>${no}</strong></td></tr>
<tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Raised By</td><td style="padding:9px 13px;border:1px solid #e2e8f0">${fromUser?nameWithDesig_(fromUser):fromName||'—'}</td></tr>
<tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Job Description</td><td style="padding:9px 13px;border:1px solid #e2e8f0">${jobDesc||'—'}</td></tr>
<tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Work Area</td><td style="padding:9px 13px;border:1px solid #e2e8f0">${area||'—'}</td></tr>
</table>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
<p style="font-size:11px;color:#94a3b8;text-align:center">HLL PTW System | Emergency FIRE/MEDICAL: <strong>555</strong></p>
</div></div>`;
  sendEmail_(toEmail, subj[stage]||'[PTW] Notification', html);
}

function sendEmail_(to, subject, html) {
  try { 
    // Hard check parameters to clean up syntax structures before sending
    var recipient = String(to).trim();
    var emailSubject = String(subject).trim();
    var htmlContent = String(html);
    var fallbackBody = 'Please view this message in an HTML-compatible email client.';
    
    var options = { 
      htmlBody: htmlContent, 
      name: 'HLL PTW System' 
    };
    
    // Explicitly uses exactly 4 parameters as required by Google's strict signature contract
    GmailApp.sendEmail(recipient, emailSubject, fallbackBody, options); 
  }
  catch(e) { 
    console.error('Email failed implementation loop. Error text: ' + e.toString()); 
  }
}

// ============================================================
// Substitute Acceptor Approval
// When the designated Permit Acceptor is unavailable for a
// Day 2–7 daily entry, any other user from the SAME department
// as the original acceptor can approve on their behalf.
// ============================================================

// Search a permit and validate the requesting user's eligibility
function getPermitForSubApproval_(payload, userEmail) {
  const user     = getUser_(userEmail);
  const { permitNo } = payload;
  if (!permitNo) throw new Error('Permit number is required.');

  const p = getPermitByNo_(permitNo);
  if (!p) throw new Error('Permit "' + permitNo + '" not found.');
  if (p.status !== STATUS.ACTIVE)
    throw new Error('Permit is not Active (Status: ' + p.status + '). Substitute approval is only available for Active permits.');

  // Look up the original acceptor to get their department
  let acceptorDept = '', acceptorDesig = '';
  try {
    const accUser  = getUser_(p.acceptorEmail);
    acceptorDept   = accUser.department  || '';
    acceptorDesig  = accUser.designation || '';
  } catch(e) {
    throw new Error('Could not retrieve original acceptor details for ' + p.acceptorEmail + '. ' + e.message);
  }

  // Validate the requesting user is from the same department
  const userDept = user.department || '';
  const isAdmin  = user.roles.includes('Admin');
  if (!isAdmin && userDept.trim().toLowerCase() !== acceptorDept.trim().toLowerCase())
    throw new Error(
      'Access denied. You are in the "' + userDept + '" department.\n' +
      'Only colleagues from the "' + acceptorDept + '" department (same as Permit Acceptor ' +
      p.acceptorName + ') can provide substitute approval.'
    );

  // Collect daily entries that are awaiting Acceptor approval
  const dailyEntries   = (p.extras || {}).dailyEntries || [];
  const pendingEntries = dailyEntries.filter(e => e.status === STATUS.PENDING_ACCEPTOR);

  if (!pendingEntries.length)
    throw new Error('No daily entries are currently pending Acceptor approval for permit ' + permitNo + '.');

  return {
    permit: {
      permitNo:     p.permitNo,
      type:         p.type,
      jobDescription: p.jobDescription,
      workArea:     p.workArea,
      originatorName: p.originatorName,
      acceptorName: p.acceptorName,
      acceptorEmail: p.acceptorEmail,
      acceptorDept,
      acceptorDesig,
      activatedAt:  (p.extras || {}).activatedAt  || '',
      expiresAt:    (p.extras || {}).expiresAt    || ''
    },
    pendingEntries,
    eligibleUser: {
      name:        user.name,
      email:       user.email,
      department:  userDept,
      designation: user.designation || ''
    }
  };
}

// Perform substitute acceptor approval or rejection of a daily entry
function substituteAcceptorApprove_(payload, userEmail) {
  const user = getUser_(userEmail);
  const { permitNo, entryId, action, comments } = payload;

  const sheet = getSheet_(SHEETS.PERMITS);
  const data  = sheet.getDataRange().getValues();
  const now   = new Date();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== permitNo) continue;
    if (data[i][2] !== STATUS.ACTIVE)
      throw new Error('Permit is not Active.');

    // Re-validate department match
    let acceptorDept = '';
    try {
      const accUser = getUser_(data[i][9]);
      acceptorDept  = accUser.department || '';
    } catch(e) {
      throw new Error('Cannot verify acceptor department: ' + e.message);
    }

    const userDept = user.department || '';
    if (!user.roles.includes('Admin') &&
        userDept.trim().toLowerCase() !== acceptorDept.trim().toLowerCase())
      throw new Error('You are not from the same department as the original acceptor (' + data[i][8] + ').');

    const extras  = tp_((data[i][29] || ''), {});
    const entry   = (extras.dailyEntries || []).find(e => e.entryId === entryId);
    if (!entry) throw new Error('Daily entry not found.');
    if (entry.status !== STATUS.PENDING_ACCEPTOR)
      throw new Error('This entry is not pending Acceptor approval. Status: ' + entry.status);

    const byLabel = user.name + ' — Substitute (' + userDept + ')';

    // ── Rejection ─────────────────────────────────────────────
    if (action === 'reject') {
      if (!comments || !comments.trim())
        throw new Error('A reason is required when rejecting.');
      entry.status          = 'Rejected';
      entry.rejectedBy      = byLabel;
      entry.rejectedAt      = now.toISOString();
      entry.rejectionReason = comments.trim();
      entry.isSubstituteApproval = true;
      sheet.getRange(i+1, 30).setValue(JSON.stringify(extras));
      sheet.getRange(i+1, 29).setValue(now);
      log_(permitNo, 'Acceptor (Substitute)', user,
           'Daily Entry Day ' + entry.dayNo + ' — Rejected by Substitute from ' + userDept, comments);
      notifyDailyEntry_(permitNo, data[i][6], data[i][5], 'daily_rejected',
        byLabel, data[i][3], data[i][4], entry);
      return { ok: true, newStatus: 'Rejected' };
    }

    // ── Approval ──────────────────────────────────────────────
    entry.acceptorApprovedAt      = now.toISOString();
    entry.acceptorApprovedBy      = byLabel;
    entry.acceptorApprovedByEmail = user.email;
    entry.acceptorComments        = comments || '';
    entry.isSubstituteApproval    = true;
    entry.originalAcceptorName    = data[i][8];
    entry.substituteAcceptorDept  = userDept;
    entry.status                  = STATUS.PENDING_SAFETY;

    log_(permitNo, 'Acceptor (Substitute)', user,
         'Daily Entry Day ' + entry.dayNo + ' — Approved by Substitute from ' + userDept, comments || '');

    // Notify Safety Officer
    notifyDailyEntry_(permitNo, data[i][11], data[i][10], 'daily_pending_safety',
      byLabel, data[i][3], data[i][4], entry);

    // Inform the original acceptor that a substitute acted
    const subMsg = user.name + ' (' + userDept + ' Dept.) has substitute-approved Day ' +
                   entry.dayNo + ' on Permit ' + permitNo + ' on your behalf.';
    pushNotif_(data[i][9], permitNo, 'sub_acceptor_action', subMsg);

    sheet.getRange(i+1, 30).setValue(JSON.stringify(extras));
    sheet.getRange(i+1, 29).setValue(now);
    return { ok: true, newStatus: STATUS.PENDING_SAFETY };
  }
  throw new Error('Permit not found: ' + permitNo);
}
// ── FIX: Appended Missing Notification Framework for Day 2-7 Daily Loops ──
function notifyDailyEntry_(permitNo, toEmail, toName, stage, fromName, jobDesc, area, entry) {
  if (!toEmail) return;
  
  const stageMap = {
    'daily_pending_acceptor': {
      label: 'Action Required — Daily Entry Acceptor Approval',
      badge: '#f59e0b',
      msg: `A new daily work entry for Day ${entry.dayNo || '?'} has been submitted for Permit ${permitNo} by ${fromName}. Your signature is required.`
    },
    'daily_pending_safety': {
      label: 'Action Required — Daily Entry Safety Check',
      badge: '#8b5cf6',
      msg: `Permit ${permitNo} Day ${entry.dayNo || '?'} has been approved by the Acceptor/Substitute and is now awaiting Safety Department confirmation.`
    },
    'daily_active': {
      label: 'Daily Work Authorized ✅',
      badge: '#10b981',
      msg: `Daily entry for Day ${entry.dayNo || '?'} on Permit ${permitNo} is fully signed. Work may proceed for this shift.`
    },
    'daily_rejected': {
      label: 'Daily Entry Rejected ❌',
      badge: '#ef4444',
      msg: `The daily work entry for Day ${entry.dayNo || '?'} on Permit ${permitNo} was rejected. Reason: ${entry.rejectionReason || 'Not specified'}.`
    }
  };

  const s = stageMap[stage];
  if (!s) return;

  // Push alert notice to standard app panel logs
  pushNotif_(toEmail, permitNo, stage, s.msg);

  const subject = `[PTW Daily] ${permitNo} (Day ${entry.dayNo || '?'}) – ${s.label}`;
  
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:20px 26px;border-radius:10px 10px 0 0">
        <h2 style="margin:0;color:#fff;font-size:17px">HLL Lifecare Limited</h2>
        <p style="margin:3px 0 0;color:#93c5fd;font-size:12px">Peroorkada Factory – Daily Permit Extension</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;background:#fff;border-radius:0 0 10px 10px">
        <p>Dear <strong>${toName || toEmail}</strong>,</p>
        <div style="background:#f8fafc;border-left:4px solid ${s.badge};padding:12px 16px;margin:14px 0;border-radius:0 6px 6px 0">
          <strong>${s.label}</strong>
        </div>
        <p>${s.msg}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;border-radius:8px;overflow:hidden">
          <tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;width:36%">Permit Reference</td><td style="padding:9px 13px;border:1px solid #e2e8f0"><strong>${permitNo}</strong></td></tr>
          <tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Shift Date</td><td style="padding:9px 13px;border:1px solid #e2e8f0">${entry.date || '—'}</td></tr>
          <tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Job Profile</td><td style="padding:9px 13px;border:1px solid #e2e8f0">${jobDesc || '—'}</td></tr>
          <tr><td style="padding:9px 13px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600">Operational Zone</td><td style="padding:9px 13px;border:1px solid #e2e8f0">${area || '—'}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:11px;color:#94a3b8;text-align:center">HLL PTW System | Emergency Control: <strong>555</strong></p>
      </div>
    </div>
  `;

  // ── FIX: Cleaned up to pass exactly 3 parameters to match your sendEmail_ signature ──
  sendEmail_(toEmail, subject, html);
}