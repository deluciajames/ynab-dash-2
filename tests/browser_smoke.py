"""Browser integration and screenshot checks against fictional YNAB responses.
Run a dev server first, then: python tests/browser_smoke.py
Requires Playwright's Python package and Chromium; no real YNAB credential is used.
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'tests/fixtures/budget.json').read_text())
MONTHS = [f'{2025 if i < 3 else 2026}-{(i+9)%12+1:02}-01' for i in range(12)]
ARTIFACTS = Path(os.environ.get('SCREENSHOT_DIR', '/tmp/budget-clarity-screenshots'))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5000')
settings = {'incomeInput': '12000', 'annualReserve': 6000, 'overrides': {}}
metadata = []
for c in DATA['categories']:
    settings['overrides'][c['id']] = {k:c[k] for k in ['fundingType','oneOff','billAmount','saved','dueDate','expectedAnnual','savingsMonthly']}
    settings['overrides'][c['id']]['fixedBill'] = c['name'] == 'Rent'
    group = next(g for g in DATA['groups'] if g['id'] == c['groupId'])
    metadata.append({'id':c['id'],'name':c['name'],'category_group_id':group['id'],'category_group_name':group['name'],
        'hidden':False,'deleted':False,'budgeted':0,'activity':0,'balance':300000,
        'goal_type':'MF' if c['fundingType']=='savings' else 'NEED', 'goal_target':c['current']*1000,
        'goal_cadence':1,'goal_cadence_frequency':1,'goal_months_to_budget':None})

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,
        args=['--no-sandbox','--disable-dev-shm-usage'],env={'XDG_CONFIG_HOME':'/tmp/budget-browser-config','XDG_CACHE_HOME':'/tmp/budget-browser-cache'})
    page = browser.new_page(viewport={'width':1440,'height':1250})
    page.clock.install(time=datetime(2026,10,2,12,tzinfo=timezone.utc))
    errors=[]
    writes=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def api(route):
        request=route.request
        if request.method != 'GET': writes.append(request.method)
        path=request.url.split('/v1')[1]
        if path=='/budgets':
            result={'budgets':[{'id':'mock-budget','name':'Personal budget'},{'id':'other-budget','name':'Other budget'}]}
        elif path.endswith('/categories'):
            result={'category_groups':[{**g,'hidden':False,'deleted':False,'categories':[c for c in metadata if c['category_group_id']==g['id']]} for g in DATA['groups']]}
        elif path.endswith('/months'):
            result={'months':[{'month':month} for month in MONTHS]}
        elif '/months/' in path:
            month=path.split('/')[-1]
            index=MONTHS.index(month)
            result={'month':{'month':month,'income':12000000,'budgeted':0,'activity':0,
                'categories':[{**c,'activity':-DATA['categories'][i]['months'][index]*1000} for i,c in enumerate(metadata)]}}
        else: raise AssertionError(path)
        route.fulfill(json={'data':result})
    page.route('https://api.ynab.com/v1/**',api)
    seed=json.dumps(settings)
    page.add_init_script(f"""if(!sessionStorage.getItem('fixture-seeded')){{
      localStorage.setItem('ynab_api_token','fictional-test-token');
      localStorage.setItem('ynab_selected_budget','mock-budget');
      localStorage.setItem('ynab_plan_mock-budget',JSON.stringify({seed}));
      sessionStorage.setItem('fixture-seeded','yes');
    }}""")
    page.goto(BASE,wait_until='networkidle')
    expect(page.locator('#total')).to_have_text('$11,325')
    expect(page.locator('#remaining')).to_have_text('$675')
    assert page.locator('.tablebox tr.group').count()==10
    assert page.locator('.group-alert').count()==0
    reference = browser.new_page(viewport={'width':1440,'height':1250})
    reference.set_content((ROOT / 'docs/approved-design.html').read_text())
    for selector in ['h1','.summary','.card','.card.room','.tablebox','th','.groupbutton','.oneoff-section']:
        for prop in ['fontSize','color','backgroundColor','borderRadius']:
            actual=page.locator(selector).first.evaluate('(el,p)=>getComputedStyle(el)[p]',prop)
            expected=reference.locator(selector).first.evaluate('(el,p)=>getComputedStyle(el)[p]',prop)
            assert actual == expected,(selector,prop,actual,expected)
    reference.close()
    page.get_by_role('button',name='Toggle Future expenses',exact=True).click()
    page.screenshot(path=str(ARTIFACTS/'application-overview.png'),full_page=True)
    page.get_by_role('button',name='Annual insurance',exact=True).click()
    expect(page.get_by_role('combobox',name='How should we plan for this?',exact=True)).to_have_value('annual')
    assert '$150' in page.locator('.dialogstats').inner_text()
    page.locator('dialog').screenshot(path=str(ARTIFACTS/'application-annual.png'))
    page.get_by_label('Bill due date',exact=True).fill('2026-09-30')
    expect(page.get_by_role('status').filter(has_text='already due')).to_be_visible()
    page.get_by_label('Bill due date',exact=True).fill('2027-03-31')
    page.get_by_role('button',name='Close',exact=True).click()
    page.get_by_role('button',name='Toggle Food & dining',exact=True).click()
    page.get_by_role('button',name='Groceries',exact=True).click()
    page.locator('#planning-controls summary').click()
    page.locator('#month-choices').get_by_role('button',name='Exclude Dec 2025 in planning',exact=True).click()
    assert '11 of 12 months included' in page.locator('#planning-controls summary').inner_text()
    assert '$167' in page.locator('.dialogstats').inner_text()
    assert '$100' in page.locator('.dialogstats').inner_text()
    assert page.locator('.bar-amount').count()==12
    expect(page.locator('#total')).to_have_text('$11,325')
    page.get_by_role('textbox',name='Reason for excluding Dec 2025',exact=True).fill('One-time travel expense')
    page.locator('dialog').screenshot(path=str(ARTIFACTS/'application-exclusion.png'))
    page.locator('dialog').get_by_role('button',name='Apply recommendation for Groceries',exact=True).click()
    expect(page.locator('#total')).to_have_text('$11,275')
    page.get_by_role('button',name='Close',exact=True).click()
    page.reload(wait_until='networkidle')
    expect(page.locator('#total')).to_have_text('$11,275')
    page.get_by_role('button',name='Toggle Food & dining',exact=True).click()
    page.get_by_role('button',name='Groceries',exact=True).click()
    page.locator('#planning-controls summary').click()
    expect(page.get_by_role('textbox',name='Reason for excluding Dec 2025',exact=True)).to_have_value('One-time travel expense')
    page.get_by_role('button',name='Close',exact=True).click()
    page.get_by_role('combobox',name='Plan type for Groceries',exact=True).select_option('oneoff')
    expect(page.locator('#total')).to_have_text('$11,175')
    page.locator('.off-table').get_by_role('button',name='Groceries',exact=True).click()
    assert page.locator('.bar-amount').count()==12
    page.get_by_role('button',name='Close',exact=True).click()
    page.locator('.off-table').get_by_role('combobox',name='Plan type for Groceries',exact=True).select_option('ongoing')
    expect(page.locator('#total')).to_have_text('$11,275')
    page.locator('.tablebox').get_by_role('combobox',name='Plan type for Food & dining',exact=True).select_option('oneoff')
    expect(page.locator('#total')).to_have_text('$9,680')
    page.locator('.off-table').get_by_role('combobox',name='Plan type for Food & dining',exact=True).select_option('ongoing')
    expect(page.locator('#total')).to_have_text('$11,275')
    page.get_by_role('button',name='Needs attention',exact=True).click()
    expect(page.locator('#total')).to_have_text('$11,275')
    page.get_by_role('button',name='All',exact=True).click()
    page.get_by_role('button',name='Apply recommendations for Food & dining',exact=True).click()
    page.get_by_role('button',name='Reset proposed targets',exact=True).click()
    expect(page.locator('#total')).to_have_text('$11,325')
    page.get_by_role('spinbutton',name='Choose your yearly reserve',exact=True).fill('12000')
    page.get_by_role('spinbutton',name='Choose your yearly reserve',exact=True).press('Tab')
    expect(page.locator('#total')).to_have_text('$11,825')
    page.locator('#income').fill('10000')
    expect(page.locator('#remaining')).to_have_text('$1,825')
    assert 'Over your income' in page.locator('.summary').inner_text()
    page.get_by_role('button',name='Reports',exact=True).click()
    assert 'unfunded amount' in page.locator('.report-warning').inner_text()
    page.get_by_role('button',name='Budget',exact=True).click()
    page.get_by_role('combobox',name='Budget',exact=True).select_option('other-budget')
    page.wait_for_load_state('networkidle')
    expect(page.locator('#remaining')).to_have_text('—')
    expect(page.locator('#income')).to_have_value('')
    expect(page.get_by_role('spinbutton',name='Choose your yearly reserve',exact=True)).to_have_value('0')
    page.get_by_role('combobox',name='Budget',exact=True).select_option('mock-budget')
    page.wait_for_load_state('networkidle')
    expect(page.locator('#income')).to_have_value('10000')
    expect(page.get_by_role('spinbutton',name='Choose your yearly reserve',exact=True)).to_have_value('12000')
    page.get_by_role('button',name='Toggle Health',exact=True).click()
    page.get_by_role('button',name='Appointments',exact=True).click()
    expect(page.locator('#spending-chart svg')).to_have_attribute('data-max','20')
    page.locator('dialog').screenshot(path=str(ARTIFACTS/'application-appointments.png'))
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('dialog').screenshot(path=str(ARTIFACTS/'application-mobile-popup.png'))
    page.keyboard.press('Escape')
    expect(page.locator('dialog')).to_have_count(0)
    page.get_by_role('button',name='Collapse all',exact=True).click()
    page.screenshot(path=str(ARTIFACTS/'application-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # Credits remain negative net spending, with valid below-zero bars.
    sample=next(c for c in DATA['categories'] if c['name']=='Groceries')
    sample['months'][0]=-200
    page.set_viewport_size({'width':1440,'height':1250})
    page.get_by_role('button',name='Refresh',exact=True).click()
    page.wait_for_load_state('networkidle')
    page.get_by_role('searchbox',name='Search categories or groups',exact=True).fill('Groceries')
    page.get_by_role('button',name='Groceries',exact=True).click()
    expect(page.locator('.bar-amount').first).to_have_text('-$200')
    assert page.locator('.chart-bar').first.evaluate('(el)=>Number(el.getAttribute("height"))>0')
    page.get_by_role('button',name='Close',exact=True).click()
    # Unknown contributions cannot masquerade as a balanced, complete plan.
    item=next(c for c in metadata if c['name']=='Storage')
    item['goal_type']=None
    item['goal_target']=None
    page.get_by_role('button',name='Refresh',exact=True).click()
    page.wait_for_load_state('networkidle')
    expect(page.locator('#remaining')).to_have_text('—')
    assert 'Plan incomplete' in page.locator('.summary').inner_text()
    assert page.locator('#total').inner_text().startswith('At least ')
    assert not errors,errors
    assert not writes,writes
    print('Browser checks passed: 103 categories, annual funding, chart scales/labels, persisted exclusions/reasons, one-off moves/restores, group recommendations, reset, reserve, income warnings, reports, budget isolation, mobile and keyboard dialog close. No YNAB writes.')
    browser.close()
