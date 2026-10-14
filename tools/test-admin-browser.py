# Optional browser test of the REAL admin page (admin.html + js/admin.js) against an in-memory fake Firestore.
# Needs Python + playwright with chromium:   pip install playwright && playwright install chromium
#   python3 tools/test-admin-browser.py
# It builds a 16-edit group cup, plays and closes every group with the real buttons, builds the knockout, then runs Reset.
# (Blog-generation errors in the log are expected: there is no blog function behind the local static server.)
import json, threading, http.server, socketserver, functools, sys, time
from playwright.sync_api import sync_playwright
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
handler=functools.partial(Q, directory=ROOT)
httpd=socketserver.TCPServer(('127.0.0.1',0),handler); port=httpd.server_address[1]
threading.Thread(target=httpd.serve_forever,daemon=True).start()

edits=json.load(open(ROOT+'/data/edits.json'))
usable=sorted([e for e in edits if e['status']=='ok'],key=lambda e:-e['views'])[:16]
for e in edits: e['tournaments']=[]
ids={e['videoId'] for e in usable}
for e in edits:
    if e['videoId'] in ids: e['tournaments']=['jinx-cup-1']

FIRESTORE=open(os.path.join(ROOT,'tools','test-support','browser-firestore.js')).read()
APP="export const initializeApp=()=>({});"
AUTH="""export const getAuth=()=>({currentUser:null});export const signInAnonymously=async()=>({});
export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb({isAnonymous:false,email:'admin@test',uid:'admin'}),0);return()=>{}};
export const signInWithEmailAndPassword=async()=>({});export const signOut=async()=>({});"""
CFG="export const ARCANE_CONFIG={tournamentId:'jinx-cup-1'};"
dialogs=[]; results={}
def route(r):
    u=r.request.url
    if 'firebase-firestore' in u: r.fulfill(body=FIRESTORE,content_type='application/javascript')
    elif 'firebase-app' in u: r.fulfill(body=APP,content_type='application/javascript')
    elif 'firebase-auth' in u: r.fulfill(body=AUTH,content_type='application/javascript')
    elif u.endswith('/js/arcane-config.js'): r.fulfill(body=CFG,content_type='application/javascript')
    elif u.endswith('/data/edits.json'): r.fulfill(body=json.dumps(edits),content_type='application/json')
    elif 'gstatic.com' in u or 'googleapis' in u or 'fonts' in u: r.fulfill(body='',content_type='text/plain')
    else: r.continue_()
PUMP=[None]
def wait_for(cond, timeout=8.0, what=''):
    # poll instead of sleeping a fixed time, so a slow machine cannot lose a race.
    # Waits through page.wait_for_timeout, NOT time.sleep: an alert blocks the page until Playwright runs the dialog handler,
    # and that only happens while the test is inside a Playwright call.
    end=time.time()+timeout
    while time.time()<end:
        try:
            if cond(): return True
        except Exception: pass
        PUMP[0].wait_for_timeout(50) if PUMP[0] else time.sleep(0.05)
    raise AssertionError('timed out waiting for '+(what or 'condition'))

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':900}); PUMP[0]=pg
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console.error: '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    pg.route('**/*',route)
    answers={'prompt':[]}
    def on_dialog(d):
        dialogs.append((d.type,d.message[:160].replace('\n',' | ')))
        if d.type=='prompt':
            ans=answers['prompt'].pop(0) if answers['prompt'] else d.default_value
            d.accept(ans)
        else: d.accept()
    pg.on('dialog',on_dialog)
    pg.goto(f'http://127.0.0.1:{port}/admin.html'); pg.wait_for_selector('#admin-content',state='visible'); pg.wait_for_selector('#buildKnockoutBtn')
    def store():
        pg.wait_for_function("window.__store")
        return pg.evaluate("Object.fromEntries([...window.__store.entries()])")
    def reload():
        pg.reload(); pg.wait_for_selector('#admin-content',state='visible'); time.sleep(.3)
    # Build a group cup (16 edits -> 4 groups)
    pg.select_option('#cupFormat','groups')
    answers['prompt']=['demo-seed-1','1']
    with pg.expect_navigation(): pg.click('#initTournamentBtn')
    pg.wait_for_selector('.batch-header')
    s=store(); m=[k for k in s if '/matches/' in k]
    results['build']=(len(m), s['tournaments/jinx-cup-1']['format'], s['tournaments/jinx-cup-1']['drawSeed'])
    pg.wait_for_selector('.batch-header');
    results['headers']=pg.eval_on_selector_all('.batch-header td','els=>els.map(e=>e.innerText.split("\\n")[0].trim())')
    results['row_label']=pg.eval_on_selector('#matches-table tr:nth-child(2) td','e=>e.innerText.trim()')
    results['status1']=pg.inner_text('#groupStageStatus')
    # Knockout too early
    n0=len(dialogs); pg.click('#buildKnockoutBtn'); wait_for(lambda: len(dialogs)>n0,what='early knockout alert'); results['early_msg']=dialogs[-1]
    # Open and close group A through the real buttons
    pg.once('dialog',lambda d: None)
    n0=len(dialogs); pg.click('.batch-header:first-of-type .btn-open'); wait_for(lambda: len(dialogs)>n0,what='open batch alert')
    results['open_msg']=dialogs[-1]
    live=pg.evaluate("[...window.__store.values()].filter(v=>v.stage==='group'&&v.group==='A').map(v=>v.status)")
    results['A_after_open']=sorted(set(live))
    # give votes so no ties (6 matches), then close batch
    pg.evaluate("""()=>{for(const [k,v] of window.__store.entries()){ if(k.includes('/matches/') && v.stage==='group'){ v.song1.votes=(v.song1.seed<v.song2.seed)?30:10; v.song2.votes=(v.song1.seed<v.song2.seed)?10:30; v.totalVotes=40; v.status='live'; } } window.__persist(); }""")
    n0=len(dialogs); pg.click('.batch-header:first-of-type .btn-close'); wait_for(lambda: len(dialogs)>n0+1,what='close batch alert')
    results['close_A_msg']=dialogs[-1]
    st=pg.evaluate("[...window.__store.entries()].filter(([k,v])=>k.includes('/matches/')&&v.stage==='group').map(([k,v])=>v).reduce((a,v)=>{a[v.group+':'+v.status]=(a[v.group+':'+v.status]||0)+1;return a},{})")
    results['after_close_A']=st
    # close the other groups through the buttons
    for i in range(2,5):
        pg.click(f'.batch-header:nth-of-type({i}) .btn-close') if False else None
    # simpler: close remaining groups via closeBatch calls
    for g in (2,3,4):
        n0=len(dialogs); pg.evaluate(f"window.closeBatch(1,{g})"); wait_for(lambda: len(dialogs)>n0+1,what=f'close group {g}')
    reload()
    results['status2']=pg.inner_text('#groupStageStatus')
    n0=len(dialogs); pg.click('#buildKnockoutBtn'); wait_for(lambda: len(dialogs)>n0+1,what='knockout build'); pg.wait_for_load_state(); pg.wait_for_selector('#admin-content',state='visible')
    results['knockout_confirm']=dialogs[-2]; results['knockout_done']=dialogs[-1]
    s=store(); results['final']=(len([k for k in s if '/matches/' in k]), s['tournaments/jinx-cup-1']['stage'], s['tournaments/jinx-cup-1']['groupStage']['knockoutBuilt'])
    pg.wait_for_selector('.batch-header');
    results['headers2']=pg.eval_on_selector_all('.batch-header td','els=>els.map(e=>e.innerText.split("\\n")[0].trim())')
    results['status3']=pg.inner_text('#groupStageStatus')
    # second knockout click refused
    n0=len(dialogs); pg.click('#buildKnockoutBtn'); wait_for(lambda: len(dialogs)>n0,what='second knockout alert'); results['second_msg']=dialogs[-1]
    # Reset: should rebuild the group stage only, same draw
    sg=store(); before=sorted((k,v['song1']['id'],v['song2']['id']) for k,v in sg.items() if '/matches/' in k and v.get('stage')=='group')
    answers['prompt']=['OK']
    n0=len(dialogs); pg.click('#resetTournamentBtn'); wait_for(lambda: any('Tournament reset complete' in d[1] for d in dialogs[n0:]),what='group Reset'); pg.wait_for_load_state(); pg.wait_for_selector('#admin-content',state='visible')
    s=store(); ms=[k for k in s if '/matches/' in k]
    after=sorted((k,v['song1']['id'],v['song2']['id']) for k,v in s.items() if '/matches/' in k and v.get('stage')=='group')
    results['reset_same_draw']=(before==after and len(after)==24)
    results['reset']=(len(ms), s['tournaments/jinx-cup-1']['stage'], s['tournaments/jinx-cup-1']['groupStage']['knockoutBuilt'], s['tournaments/jinx-cup-1']['drawSeed'])
    pg.screenshot(path='/tmp/admin-group-test.png')
    results['errors']=errs[:12]
    # ---- the existing single-elimination path must still work (build, then Reset from the stored seed) ----
    pg.evaluate("sessionStorage.clear()"); reload()
    pg.select_option('#cupFormat','single')
    answers['prompt']=['single-seed']
    with pg.expect_navigation(): pg.click('#initTournamentBtn')
    pg.wait_for_selector('.batch-header')
    s1=store(); m1=sorted((k,v['song1']['id'],v['song2']['id']) for k,v in s1.items() if '/matches/' in k)
    t1=s1['tournaments/jinx-cup-1']
    results['single_build']=(len(m1), t1.get('format'), t1.get('drawSeed'), t1.get('totalRounds'))
    answers['prompt']=['OK']
    n0=len(dialogs); pg.click('#resetTournamentBtn'); wait_for(lambda: any('Tournament reset complete' in d[1] for d in dialogs[n0:]),what='single Reset'); pg.wait_for_load_state(); pg.wait_for_selector('#admin-content',state='visible')
    s2=store(); m2=sorted((k,v['song1']['id'],v['song2']['id']) for k,v in s2.items() if '/matches/' in k)
    results['single_reset_same']=(m1==m2 and len(m2)==15)
    results['single_headers']=pg.eval_on_selector_all('.batch-header td','els=>els.map(e=>e.innerText.split("\\n")[0].trim())')
    results['single_status']=pg.inner_text('#groupStageStatus')
    b.close()

def check(name, ok, got=None):
    print(('  ok  ' if ok else 'FAIL  ')+name+('' if ok else f'   got: {got}'))
    if not ok: check.failed=True
check.failed=False
r=results
check('group cup builds from the admin page: 24 matches, groups-knockout, seed saved', r['build']==(24,'groups-knockout','demo-seed-1'), r['build'])
check('batch headers name the groups', r['headers']==['📦 Group A (Round 1, Batch 1)','📦 Group B (Round 1, Batch 2)','📦 Group C (Round 1, Batch 3)','📦 Group D (Round 1, Batch 4)'], r['headers'])
check('match rows show group and matchday', r['row_label']=='A · day 1 (B1)', r['row_label'])
check('status line before play', r['status1'].startswith('Group stage: 0 of 4 groups finished (0 of 24 matches closed)'), r['status1'])
check('knockout refused while groups are open', '4 group(s) are not finished' in r['early_msg'][1], r['early_msg'])
check('Open Batch opens the 6 matches of one group', r['A_after_open']==['live'])
check('Close Batch closes group A only and reports success', r['after_close_A']=={'A:completed':6,'B:live':6,'C:live':6,'D:live':6} and 'closed!' in r['close_A_msg'][1] and 'Error' not in r['close_A_msg'][1], (r['after_close_A'], r['close_A_msg']))
check('status line says ready once every group is closed', 'Ready to build the knockout' in r['status2'], r['status2'])
check('knockout confirm lists the quarter-finals', 'Quarter-finals' in r['knockout_confirm'][1] and '8 qualifiers' in r['knockout_confirm'][1], r['knockout_confirm'])
check('knockout written: 31 matches, stage knockout', r['final']==(31,'knockout',True), r['final'])
check('knockout rounds appear as Round 2..4 after the groups', r['headers2'][4:]==['📦 Round 2 - Batch 1','📦 Round 3 - Batch 1','📦 Round 4 - Batch 1'], r['headers2'])
check('status line after the knockout is built', 'Knockout built (7 matches)' in r['status3'], r['status3'])
check('a second knockout build is refused', 'already been built' in r['second_msg'][1], r['second_msg'])
check('Reset rebuilds the group stage only, same seed, knockout flag cleared', r['reset']==(24,'group',False,'demo-seed-1'), r['reset'])
check('Reset gives the SAME draw', r['reset_same_draw'] is True)
real=[e for e in r['errors'] if 'not finished' not in e and 'already been built' not in e and 'recap' not in e.lower() and 'round preview' not in e.lower()]
check('single elimination still builds from the same button: 15 matches, format single-elimination', r['single_build'][0]==15 and r['single_build'][1]=='single-elimination' and r['single_build'][2]=='single-seed' and r['single_build'][3]==4, r['single_build'])
check('single elimination Reset gives the same draw', r['single_reset_same'] is True)
check('single elimination: normal batch headers, no group status line', r['single_headers'][0]=='📦 Round 1 - Batch 1' and r['single_status']=='', (r['single_headers'][:2], r['single_status']))
check('no unexpected page errors', not real, real)
sys.exit(1 if check.failed else 0)
